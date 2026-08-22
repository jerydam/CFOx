"""
Web3 Service — connects the FastAPI backend to the deployed CFOx contracts.

This is the layer that was previously missing (all 501s).
Handles:
- Reading onchain state (balances, members, proposals)
- Submitting transactions (agent wallet signs on behalf of the AI)
- Event listening (used by the indexer worker)

The agent wallet has 0% equity — it can only call:
  - governance.createPaymentProposal()
  - governance.execute()  (after threshold is met)
  
It CANNOT approve proposals (that's equity holders only).
"""

import os
import json
from decimal import Decimal
from pathlib import Path
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from eth_account import Account

# ─── ABI loading ─────────────────────────────────────────────────────────────
# In production, load from compiled Foundry artifacts (out/ContractName.sol/ContractName.json)
# For now we define minimal ABIs inline for the functions we call.

GOVERNANCE_ABI = json.loads("""[
  {"type":"function","name":"createPaymentProposal",
   "inputs":[
     {"name":"token","type":"address"},
     {"name":"recipient","type":"address"},
     {"name":"amount","type":"uint256"},
     {"name":"description","type":"string"}
   ],
   "outputs":[{"name":"proposalId","type":"uint256"}],
   "stateMutability":"nonpayable"},

  {"type":"function","name":"approve",
   "inputs":[{"name":"proposalId","type":"uint256"}],
   "outputs":[],"stateMutability":"nonpayable"},

  {"type":"function","name":"execute",
   "inputs":[{"name":"proposalId","type":"uint256"}],
   "outputs":[],"stateMutability":"nonpayable"},

  {"type":"function","name":"getMember",
   "inputs":[{"name":"account","type":"address"}],
   "outputs":[{"components":[
     {"name":"account","type":"address"},
     {"name":"weight","type":"uint256"},
     {"name":"active","type":"bool"},
     {"name":"createdAt","type":"uint256"}
   ],"name":"","type":"tuple"}],
   "stateMutability":"view"},

  {"type":"function","name":"getProposal",
   "inputs":[{"name":"proposalId","type":"uint256"}],
   "outputs":[{"components":[
     {"name":"id","type":"uint256"},
     {"name":"proposer","type":"address"},
     {"name":"proposalType","type":"uint8"},
     {"name":"operationHash","type":"bytes32"},
     {"name":"requiredWeight","type":"uint256"},
     {"name":"approvedWeight","type":"uint256"},
     {"name":"snapshotBlock","type":"uint256"},
     {"name":"createdAt","type":"uint256"},
     {"name":"expiresAt","type":"uint256"},
     {"name":"executed","type":"bool"},
     {"name":"cancelled","type":"bool"},
     {"name":"callData","type":"bytes"}
   ],"name":"","type":"tuple"}],
   "stateMutability":"view"},

  {"type":"function","name":"getMembers",
   "inputs":[],"outputs":[{"name":"","type":"address[]"}],
   "stateMutability":"view"},

  {"type":"function","name":"totalEquity",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"function","name":"proposalCount",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"function","name":"hasSigned",
   "inputs":[
     {"name":"proposalId","type":"uint256"},
     {"name":"member","type":"address"}
   ],
   "outputs":[{"name":"","type":"bool"}],
   "stateMutability":"view"},

  {"type":"function","name":"getSnapshotWeight",
   "inputs":[
     {"name":"proposalId","type":"uint256"},
     {"name":"member","type":"address"}
   ],
   "outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"}
]""")

TREASURY_ABI = json.loads("""[
  {"type":"function","name":"balanceOf",
   "inputs":[{"name":"token","type":"address"}],
   "outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"function","name":"isPaused",
   "inputs":[],"outputs":[{"name":"","type":"bool"}],
   "stateMutability":"view"},

  {"type":"function","name":"pauseReason",
   "inputs":[],"outputs":[{"name":"","type":"string"}],
   "stateMutability":"view"}
]""")

POLICY_ABI = json.loads("""[
  {"type":"function","name":"getPolicy",
   "inputs":[],"outputs":[{"components":[
     {"name":"perTransactionLimit","type":"uint256"},
     {"name":"dailyLimit","type":"uint256"},
     {"name":"weeklyLimit","type":"uint256"},
     {"name":"mediumPaymentThreshold","type":"uint256"},
     {"name":"largePaymentThreshold","type":"uint256"},
     {"name":"largePaymentAmount","type":"uint256"},
     {"name":"recipientWhitelistEnabled","type":"bool"}
   ],"name":"","type":"tuple"}],
   "stateMutability":"view"},

  {"type":"function","name":"getDailySpend",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"function","name":"getWeeklySpend",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"}
]""")

ERC20_ABI = json.loads("""[
  {"type":"function","name":"balanceOf",
   "inputs":[{"name":"account","type":"address"}],
   "outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},
  {"type":"function","name":"decimals",
   "inputs":[],"outputs":[{"name":"","type":"uint8"}],
   "stateMutability":"view"},
  {"type":"function","name":"symbol",
   "inputs":[],"outputs":[{"name":"","type":"string"}],
   "stateMutability":"view"}
]""")


class Web3Service:
    """
    Single entry point for all blockchain interactions.
    Instantiated once at app startup and injected via FastAPI dependency.
    """

    def __init__(self):
        rpc_url = os.getenv("RPC_URL", "https://forno.celo.org")
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        # Celo / BOT Chain use POA — add middleware
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        assert self.w3.is_connected(), f"Cannot connect to RPC: {rpc_url}"

        # Agent wallet (0% equity — only creates/executes proposals)
        agent_key = os.getenv("AGENT_PRIVATE_KEY")
        assert agent_key, "AGENT_PRIVATE_KEY not set"
        self.agent_account = Account.from_key(agent_key)

        # Contract addresses
        self.governance_address  = Web3.to_checksum_address(os.getenv("GOVERNANCE_CONTRACT"))
        self.treasury_address    = Web3.to_checksum_address(os.getenv("TREASURY_CONTRACT"))
        self.policy_address      = Web3.to_checksum_address(os.getenv("POLICY_CONTRACT"))

        # Contract instances
        self.governance = self.w3.eth.contract(
            address=self.governance_address, abi=GOVERNANCE_ABI
        )
        self.treasury = self.w3.eth.contract(
            address=self.treasury_address, abi=TREASURY_ABI
        )
        self.policy = self.w3.eth.contract(
            address=self.policy_address, abi=POLICY_ABI
        )

        # Token registry {symbol: {address, decimals}}
        self.tokens: dict[str, dict] = self._load_token_registry()

    # ─── Treasury reads ───────────────────────────────────────────────────────

    def get_native_balance(self) -> int:
        """Raw balance in wei."""
        return self.w3.eth.get_balance(self.treasury_address)

    def get_token_balance(self, token_symbol: str) -> int:
        """Raw balance in token base units."""
        token = self._get_token(token_symbol)
        erc20 = self.w3.eth.contract(address=token["address"], abi=ERC20_ABI)
        return erc20.functions.balanceOf(self.treasury_address).call()

    def get_all_balances(self) -> list[dict]:
        """Returns list of {symbol, address, raw_balance, decimals}."""
        balances = []
        # Native token
        native_bal = self.get_native_balance()
        balances.append({
            "symbol": "CELO",
            "address": "0x0000000000000000000000000000000000000000",
            "raw_balance": native_bal,
            "decimals": 18,
        })
        # ERC20 tokens
        for symbol, info in self.tokens.items():
            try:
                raw = self.get_token_balance(symbol)
                balances.append({
                    "symbol": symbol,
                    "address": info["address"],
                    "raw_balance": raw,
                    "decimals": info["decimals"],
                })
            except Exception:
                pass
        return balances

    def is_treasury_paused(self) -> bool:
        return self.treasury.functions.isPaused().call()

    # ─── Governance reads ─────────────────────────────────────────────────────

    def get_all_members(self) -> list[dict]:
        """Returns member structs for all addresses ever added."""
        addresses = self.governance.functions.getMembers().call()
        members = []
        for addr in addresses:
            m = self.governance.functions.getMember(addr).call()
            members.append({
                "address": addr,
                "weight": m[1],
                "active": m[2],
                "created_at": m[3],
            })
        return members

    def get_proposal(self, proposal_id: int) -> dict:
        p = self.governance.functions.getProposal(proposal_id).call()
        return {
            "id": p[0],
            "proposer": p[1],
            "proposal_type": p[2],
            "operation_hash": p[3].hex(),
            "required_weight": p[4],
            "approved_weight": p[5],
            "snapshot_block": p[6],
            "created_at": p[7],
            "expires_at": p[8],
            "executed": p[9],
            "cancelled": p[10],
        }

    def get_proposal_count(self) -> int:
        return self.governance.functions.proposalCount().call()

    def has_signed(self, proposal_id: int, member: str) -> bool:
        return self.governance.functions.hasSigned(proposal_id, member).call()

    def get_snapshot_weight(self, proposal_id: int, member: str) -> int:
        return self.governance.functions.getSnapshotWeight(proposal_id, member).call()

    # ─── Policy reads ─────────────────────────────────────────────────────────

    def get_policy(self) -> dict:
        p = self.policy.functions.getPolicy().call()
        return {
            "per_transaction_limit": p[0],
            "daily_limit": p[1],
            "weekly_limit": p[2],
            "medium_payment_threshold": p[3],
            "large_payment_threshold": p[4],
            "large_payment_amount": p[5],
            "recipient_whitelist_enabled": p[6],
            "daily_spent": self.policy.functions.getDailySpend().call(),
            "weekly_spent": self.policy.functions.getWeeklySpend().call(),
        }

    # ─── Transactions (agent wallet submits) ─────────────────────────────────

    def create_payment_proposal(
        self,
        token_symbol: str,
        recipient: str,
        amount_human: Decimal,
        description: str,
    ) -> dict:
        """
        Submit createPaymentProposal() to governance contract.
        Signed by the agent wallet (0% equity).
        Returns {tx_hash, proposal_id}.
        """
        token = self._get_token(token_symbol)
        amount_raw = int(amount_human * Decimal(10 ** token["decimals"]))

        tx = self.governance.functions.createPaymentProposal(
            token["address"],
            Web3.to_checksum_address(recipient),
            amount_raw,
            description,
        ).build_transaction({
            "from": self.agent_account.address,
            "nonce": self.w3.eth.get_transaction_count(self.agent_account.address),
            "gas": 300_000,
            "gasPrice": self._get_gas_price(),
        })

        signed = self.agent_account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        if receipt["status"] != 1:
            raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")

        # Parse ProposalCreated event to get the onchain proposal ID
        proposal_id = self._parse_proposal_created(receipt)

        return {
            "tx_hash": tx_hash.hex(),
            "proposal_id": proposal_id,
            "block": receipt["blockNumber"],
        }

    def execute_proposal(self, proposal_id: int) -> str:
        """
        Submit execute() after threshold is reached.
        Anyone can call this — agent wallet does it for UX convenience.
        Returns tx_hash.
        """
        tx = self.governance.functions.execute(proposal_id).build_transaction({
            "from": self.agent_account.address,
            "nonce": self.w3.eth.get_transaction_count(self.agent_account.address),
            "gas": 300_000,
            "gasPrice": self._get_gas_price(),
        })
        signed = self.agent_account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        return tx_hash.hex()

    # ─── Internal ─────────────────────────────────────────────────────────────

    def _get_token(self, symbol: str) -> dict:
        key = symbol.upper()
        if key not in self.tokens:
            raise ValueError(f"Unknown token: {symbol}. Allowed: {list(self.tokens)}")
        return self.tokens[key]

    def _get_gas_price(self) -> int:
        # Use current network gas price with a small buffer
        return int(self.w3.eth.gas_price * 1.1)

    def _parse_proposal_created(self, receipt) -> int:
        """Extract proposalId from ProposalCreated event logs."""
        # ProposalCreated(uint256 indexed proposalId, ...)
        proposal_created_topic = Web3.keccak(
            text="ProposalCreated(uint256,uint8,bytes32,uint256)"
        )
        for log in receipt.get("logs", []):
            if log["topics"] and log["topics"][0] == proposal_created_topic:
                return int(log["topics"][1].hex(), 16)
        return 0

    def _load_token_registry(self) -> dict:
        """Load allowed tokens from env / config."""
        usdc = os.getenv("USDC_ADDRESS")
        registry = {}
        if usdc:
            registry["USDC"] = {
                "address": Web3.to_checksum_address(usdc),
                "decimals": 6,
            }
        weth = os.getenv("WETH_ADDRESS")
        if weth:
            registry["WETH"] = {
                "address": Web3.to_checksum_address(weth),
                "decimals": 18,
            }
        return registry


# ─── FastAPI dependency ───────────────────────────────────────────────────────

_web3_service: Web3Service | None = None


def get_web3_service() -> Web3Service:
    global _web3_service
    if _web3_service is None:
        _web3_service = Web3Service()
    return _web3_service
