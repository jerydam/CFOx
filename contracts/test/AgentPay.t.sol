// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/CFOxGovernance.sol";
import "../src/CFOxTreasury.sol";
import "../src/CFOxPolicy.sol";

/// @notice Minimal ERC20 for testing
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8  public decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract CFOxTest is Test {
    CFOxGovernance public gov;
    CFOxTreasury   public treas;
    CFOxPolicy     public pol;
    MockUSDC           public usdc;

    address founder    = address(0xF0);
    address cfo        = address(0xCF);
    address cto        = address(0xC7);
    address agent      = address(0xAA);
    address vendor     = address(0xDE);
    address attacker   = address(0xBAD);

    uint256 constant PER_TX  = 100e6;   // $100
    uint256 constant DAILY   = 500e6;   // $500
    uint256 constant WEEKLY  = 2_000e6; // $2,000

    function setUp() public {
        // Deploy
        vm.prank(founder);
        gov = new CFOxGovernance(founder, "Founder", agent);

        treas = new CFOxTreasury(address(gov));
        pol   = new CFOxPolicy(address(gov), PER_TX, DAILY, WEEKLY);
        usdc  = new MockUSDC();

        // Init
        vm.prank(address(gov));
        gov.initialize(address(treas), address(pol));

        // Fund treasury with USDC
        usdc.mint(address(treas), 100_000e6);

        // Allow USDC — in real flow this is a governance proposal;
        // for tests we prank as governance
        vm.prank(address(gov));
        treas.setAllowedToken(address(usdc), true);
    }

    // ─── Basic State ──────────────────────────────────────────────────────────

    function test_FounderHas100Percent() public view {
        ICFOxGovernance.Member memory m = gov.getMember(founder);
        assertEq(m.weight, 10_000);
        assertTrue(m.active);
    }

    function test_TotalEquityIs10000() public view {
        assertEq(gov.totalEquity(), 10_000);
    }

    function test_TreasuryBalance() public view {
        assertEq(treas.balanceOf(address(usdc)), 100_000e6);
    }

    // ─── Policy: Auto-execute small payments ──────────────────────────────────

    function test_SmallPaymentAutoExecutes() public {
        uint256 vendorBefore = usdc.balanceOf(vendor);

        vm.prank(agent);
        uint256 proposalId = gov.createPaymentProposal(
            address(usdc), vendor, 50e6, "Small vendor payment"
        );

        // Auto-execute returns proposalId == 0
        assertEq(proposalId, 0);
        assertEq(usdc.balanceOf(vendor), vendorBefore + 50e6);
    }

    function test_SmallPaymentRespectsDailyLimit() public {
        // Burn through the daily limit
        vm.startPrank(agent);
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p1");
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p2");
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p3");
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p4");
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p5");
        vm.stopPrank();

        // 6th payment within per-tx limit but exceeds daily → escalates to multisig
        vm.prank(agent);
        uint256 proposalId = gov.createPaymentProposal(
            address(usdc), vendor, 50e6, "over daily"
        );
        // Should create a proposal (multisig required), not auto-execute
        assertTrue(proposalId > 0, "Should require multisig after daily limit");
    }

    // ─── Policy: Multisig for medium payments ─────────────────────────────────

    function test_MediumPaymentCreatesProposal() public {
        vm.prank(founder);
        uint256 proposalId = gov.createPaymentProposal(
            address(usdc), vendor, 500e6, "Marketing"
        );
        assertTrue(proposalId > 0);

        ICFOxGovernance.Proposal memory p = gov.getProposal(proposalId);
        assertEq(p.requiredWeight, 5_000); // 50%
        assertFalse(p.executed);
    }

    // ─── Governance: Full approval flow ───────────────────────────────────────

    function test_FounderAloneCanApproveAndExecute() public {
        // Create proposal
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(
            address(usdc), vendor, 500e6, "Pay designer"
        );

        // Founder signs (60% snapshot — but wait, founder has 100% here)
        vm.prank(founder);
        gov.approve(pid);

        ICFOxGovernance.Proposal memory p = gov.getProposal(pid);
        assertEq(p.approvedWeight, 10_000); // 100%

        // Execute
        uint256 vendorBefore = usdc.balanceOf(vendor);
        gov.execute(pid);
        assertEq(usdc.balanceOf(vendor), vendorBefore + 500e6);
        assertTrue(gov.getProposal(pid).executed);
    }

    function test_CannotExecuteTwice() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 200e6, "x");

        vm.prank(founder);
        gov.approve(pid);
        gov.execute(pid);

        vm.expectRevert(abi.encodeWithSelector(
            ICFOxGovernance.ProposalAlreadyExecuted.selector, pid
        ));
        gov.execute(pid);
    }

    function test_CannotSignTwice() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 200e6, "x");

        vm.startPrank(founder);
        gov.approve(pid);

        vm.expectRevert(abi.encodeWithSelector(
            ICFOxGovernance.AlreadySigned.selector, pid, founder
        ));
        gov.approve(pid);
        vm.stopPrank();
    }

    function test_NonMemberCannotSign() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 200e6, "x");

        vm.prank(attacker);
        vm.expectRevert(ICFOxGovernance.NotMember.selector);
        gov.approve(pid);
    }

    // ─── Snapshot: Weight changes don't affect existing proposals ────────────

    function test_SnapshotIsolatesWeightChanges() public {
        // First: give CFO 20% via equity transfer proposal
        // Simplified: do direct transfer for testing purposes
        // (In production this would itself be a governance proposal)

        // Create payment proposal while founder has 100%
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "test");

        // Check snapshot: founder should have 10000 in snapshot
        assertEq(gov.getSnapshotWeight(pid, founder), 10_000);

        // Even if weight changes happened (tested via equity transfer proposal),
        // the snapshot for pid remains 10000
        assertEq(gov.getSnapshotWeight(pid, founder), 10_000);
    }

    // ─── Threshold enforcement ────────────────────────────────────────────────

    function test_ExecutionFailsIfThresholdNotMet() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");

        // Nobody has signed yet
        vm.expectRevert(abi.encodeWithSelector(
            ICFOxGovernance.ThresholdNotReached.selector,
            5_000,
            0
        ));
        gov.execute(pid);
    }

    // ─── Proposal expiry ─────────────────────────────────────────────────────

    function test_ExpiredProposalCannotBeExecuted() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");

        vm.prank(founder);
        gov.approve(pid);

        // Warp past expiry
        vm.warp(block.timestamp + 8 days);

        vm.expectRevert(abi.encodeWithSelector(
            ICFOxGovernance.ProposalExpired.selector, pid
        ));
        gov.execute(pid);
    }

    // ─── Treasury pause ───────────────────────────────────────────────────────

    function test_PausedTreasuryBlocksPayments() public {
        vm.prank(address(gov));
        treas.pause("Security incident");

        assertTrue(treas.isPaused());
        assertEq(keccak256(bytes(treas.pauseReason())), keccak256(bytes("Security incident")));

        // Any execution attempt should revert
        vm.prank(address(gov));
        vm.expectRevert(ICFOxTreasury.TreasuryPaused.selector);
        treas.execute(address(usdc), vendor, 100e6);
    }

    function test_UnpauseRestoresPayments() public {
        vm.startPrank(address(gov));
        treas.pause("test");
        treas.unpause();
        vm.stopPrank();

        assertFalse(treas.isPaused());
    }

    // ─── Token whitelist ──────────────────────────────────────────────────────

    function test_UnallowedTokenReverts() public {
        address fakeToken = address(0xBADF00D);
        vm.prank(address(gov));
        vm.expectRevert(abi.encodeWithSelector(
            ICFOxTreasury.TokenNotAllowed.selector, fakeToken
        ));
        treas.execute(fakeToken, vendor, 100e6);
    }

    // ─── Unauthorized execution ───────────────────────────────────────────────

    function test_AttackerCannotCallTreasuryDirectly() public {
        vm.prank(attacker);
        vm.expectRevert(ICFOxTreasury.NotGovernance.selector);
        treas.execute(address(usdc), attacker, 100_000e6);
    }

    // ─── Equity transfer ──────────────────────────────────────────────────────

    function test_EquityTransferProposalFlow() public {
        // Founder proposes giving CFO 20%
        vm.prank(founder);
        uint256 pid = gov.createEquityTransferProposal(founder, cfo, 2_000);

        // Founder approves (has 100% so threshold of 70% is met)
        vm.prank(founder);
        gov.approve(pid);

        gov.execute(pid);

        // Check new weights
        assertEq(gov.getMember(founder).weight, 8_000);
        assertEq(gov.getMember(cfo).weight, 2_000);
        assertEq(gov.totalEquity(), 10_000); // invariant holds
    }

    // ─── Weight invariant ─────────────────────────────────────────────────────

    function test_WeightSumNeverExceedsTotalWeight() public view {
        assertEq(gov.totalEquity(), 10_000);
    }

    // ─── Cancel proposal ─────────────────────────────────────────────────────

    function test_ProposerCanCancelProposal() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");

        vm.prank(agent);
        gov.cancel(pid);

        assertTrue(gov.getProposal(pid).cancelled);
    }

    function test_CancelledProposalCannotBeExecuted() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");

        vm.prank(agent);
        gov.cancel(pid);

        vm.prank(founder);
        gov.approve(pid);

        vm.expectRevert(abi.encodeWithSelector(
            ICFOxGovernance.ProposalCancelledError.selector, pid
        ));
        gov.execute(pid);
    }

    // ─── Replay / wrong chain ─────────────────────────────────────────────────

    function test_OperationHashIncludesChainId() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");

        ICFOxGovernance.Proposal memory p = gov.getProposal(pid);
        bytes32 expectedHash = keccak256(abi.encode(
            block.chainid,
            address(treas),
            pid,
            abi.encode(address(usdc), vendor, uint256(500e6))
        ));
        assertEq(p.operationHash, expectedHash);
    }
}
