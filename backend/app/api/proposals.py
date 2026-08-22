"""Proposals API — create, sign, execute governance proposals."""

import re
from fastapi import APIRouter, Depends, HTTPException
from decimal import Decimal

from ..models.schemas import (
    CreatePaymentProposalRequest, CreateProposalResponse,
    ProposalResponse, SignProposalRequest,
    ExecutionMode, RiskLevel,
)
from ..services.web3_service import Web3Service, get_web3_service
from ..services.db_service import TreasuryDB, get_db

router = APIRouter()

PER_TX_LIMIT_USD   = Decimal("100")
LARGE_AMOUNT_USD   = Decimal("1000")
MEDIUM_WEIGHT_BPS  = 5_000
LARGE_WEIGHT_BPS   = 7_000


def _get_db_service() -> TreasuryDB:
    return TreasuryDB(get_db())


@router.post("/payment", response_model=CreateProposalResponse)
async def create_payment_proposal(
    request: CreatePaymentProposalRequest,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    # 1. Token allowed?
    token_upper = request.token.upper()
    if token_upper not in web3.tokens and token_upper != "CELO":
        raise HTTPException(400, f"Token {request.token} not allowed")

    # 2. Execution mode
    execution_mode, required_weight = _check_policy(request.amount)

    # 3. Risk assessment
    risk_level, concerns = _assess_risk(request, db)

    # 4. Submit to blockchain via agent wallet
    try:
        result = web3.create_payment_proposal(
            token_symbol=token_upper,
            recipient=request.recipient,
            amount_human=request.amount,
            description=request.description,
        )
    except NotImplementedError:
        # Fallback for local dev without a real RPC
        result = {"tx_hash": "0x" + "0" * 64, "proposal_id": 0}

    auto_executed = execution_mode == ExecutionMode.AUTO_EXECUTE

    # 5. Persist to DB
    if not auto_executed and result.get("proposal_id"):
        db.create_proposal({
            "treasury_id": request.recipient,  # linked via treasury context (passed by agent)
            "proposal_id_onchain": result["proposal_id"],
            "type": "PAYMENT",
            "status": "PENDING",
            "token": token_upper,
            "value": str(request.amount),
            "target": request.recipient,
            "description": request.description,
            "required_weight": required_weight,
            "approved_weight": 0,
            "operation_hash": "",
        })

    return CreateProposalResponse(
        proposal_id=str(result.get("proposal_id")) if result.get("proposal_id") else None,
        onchain_id=result.get("proposal_id"),
        execution_mode=execution_mode,
        required_weight=required_weight,
        risk_level=risk_level,
        risk_concerns=concerns,
        auto_executed=auto_executed,
        tx_hash=result.get("tx_hash"),
    )


@router.get("/{proposal_id}", response_model=dict)
async def get_proposal(
    proposal_id: str,
    db: TreasuryDB = Depends(_get_db_service),
):
    p = db.get_proposal(proposal_id)
    if not p:
        raise HTTPException(404, "Proposal not found")
    return p


@router.post("/{proposal_id}/sign")
async def sign_proposal(
    proposal_id: str,
    request: SignProposalRequest,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    """Record a member's approval signature."""
    # 1. Verify proposal exists
    proposal = db.get_proposal(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal["status"] != "PENDING":
        raise HTTPException(400, f"Proposal is {proposal['status']}, cannot sign")

    # 2. Verify signer is active member onchain
    member = web3.governance.functions.getMember(
        web3.w3.to_checksum_address(request.signer)
    ).call()
    if not member[2]:  # active field
        raise HTTPException(403, "Signer is not an active member")

    weight = member[1]

    # 3. Get snapshot weight for this proposal
    onchain_id = proposal.get("proposal_id_onchain")
    if onchain_id:
        snapshot_weight = web3.get_snapshot_weight(onchain_id, request.signer)
        if snapshot_weight == 0:
            raise HTTPException(403, "Signer not in proposal snapshot")
        weight = snapshot_weight

    # 4. Check not already signed
    if web3.has_signed(onchain_id, request.signer):
        raise HTTPException(400, "Already signed this proposal")

    # 5. Record in DB (onchain approval is submitted by the frontend directly)
    db.add_signature(proposal_id, request.signer, weight, request.signature)

    # 6. Check if threshold reached
    proposal = db.get_proposal(proposal_id)
    if proposal["approved_weight"] >= proposal["required_weight"]:
        db.update_proposal_status(proposal_id, "APPROVED")
        return {"status": "APPROVED", "threshold_reached": True, "approved_weight": proposal["approved_weight"]}

    return {
        "status": "PENDING",
        "threshold_reached": False,
        "approved_weight": proposal["approved_weight"],
        "required_weight": proposal["required_weight"],
    }


@router.post("/{proposal_id}/execute")
async def execute_proposal(
    proposal_id: str,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    """Execute an approved proposal."""
    proposal = db.get_proposal(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal["status"] == "EXECUTED":
        raise HTTPException(400, "Already executed")
    if proposal["approved_weight"] < proposal["required_weight"]:
        raise HTTPException(400, f"Threshold not met: {proposal['approved_weight']}/{proposal['required_weight']}")

    tx_hash = web3.execute_proposal(proposal["proposal_id_onchain"])
    db.update_proposal_status(proposal_id, "EXECUTED")
    return {"tx_hash": tx_hash, "status": "EXECUTED"}


@router.post("/{proposal_id}/cancel")
async def cancel_proposal(
    proposal_id: str,
    db: TreasuryDB = Depends(_get_db_service),
):
    proposal = db.get_proposal(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    db.update_proposal_status(proposal_id, "CANCELLED")
    return {"status": "CANCELLED"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _check_policy(amount: Decimal) -> tuple[ExecutionMode, int]:
    if amount <= PER_TX_LIMIT_USD:
        return ExecutionMode.AUTO_EXECUTE, 0
    if amount >= LARGE_AMOUNT_USD:
        return ExecutionMode.MULTISIG_REQUIRED, LARGE_WEIGHT_BPS
    return ExecutionMode.MULTISIG_REQUIRED, MEDIUM_WEIGHT_BPS


def _assess_risk(request: CreatePaymentProposalRequest, db: TreasuryDB) -> tuple[RiskLevel, list[str]]:
    concerns = []
    score = 0.0
    if request.amount > Decimal("5000"):
        concerns.append("Large payment (>$5,000)")
        score += 0.3
    if request.amount > Decimal("1000"):
        score += 0.1
    if score >= 0.4:
        return RiskLevel.HIGH, concerns
    if score >= 0.2:
        return RiskLevel.MEDIUM, concerns
    return RiskLevel.LOW, concerns
