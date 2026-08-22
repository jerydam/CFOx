// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/CFOxGovernance.sol";
import "../src/CFOxTreasury.sol";
import "../src/CFOxPolicy.sol";

/// @notice Deploy the full CFOx CFO contract suite.
///
///         Deployment order:
///         1. CFOxGovernance  (needs founder + agentAddress)
///         2. CFOxTreasury    (needs governance address)
///         3. CFOxPolicy      (needs governance address + spending limits)
///         4. governance.initialize(treasury, policy)
///         5. treasury.setAllowedToken(USDC)
contract Deploy is Script {
    function run() external {
        address founder      = vm.envAddress("FOUNDER_ADDRESS");
        address agentWallet  = vm.envAddress("AGENT_ADDRESS");
        address usdcAddress  = vm.envAddress("USDC_ADDRESS");
        string memory founderName = vm.envOr("FOUNDER_NAME", string("Founder"));

        // Spending limits (USDC has 6 decimals)
        uint256 perTxLimit  = vm.envOr("PER_TX_LIMIT",  uint256(100e6));   // $100
        uint256 dailyLimit  = vm.envOr("DAILY_LIMIT",   uint256(500e6));   // $500
        uint256 weeklyLimit = vm.envOr("WEEKLY_LIMIT",  uint256(2_000e6)); // $2,000

        vm.startBroadcast();

        // 1. Deploy governance
        CFOxGovernance gov = new CFOxGovernance(
            founder,
            founderName,
            agentWallet
        );
        console.log("CFOxGovernance:", address(gov));

        // 2. Deploy treasury (governance is the only authority)
        CFOxTreasury treas = new CFOxTreasury(address(gov));
        console.log("CFOxTreasury:  ", address(treas));

        // 3. Deploy policy
        CFOxPolicy pol = new CFOxPolicy(
            address(gov),
            perTxLimit,
            dailyLimit,
            weeklyLimit
        );
        console.log("CFOxPolicy:    ", address(pol));

        // 4. Wire them together
        gov.initialize(address(treas), address(pol));
        console.log("Initialized.");

        // 5. Allow USDC
        // Treasury.setAllowedToken must be called via governance proposal in production.
        // For initial deploy, governance calls it directly during setup.
        // Workaround: have governance call treasury directly in initialize().
        // NOTE: In the MVP we allow the deployer (who is the founder) to call this
        // through governance by passing a proposal — or use a setup helper:
        // treas.setAllowedToken(usdcAddress, true); // This would require treasury to allow deployer
        // Correct approach: governance executes setAllowedToken via a self-proposal.
        // For hackathon: add a one-time setup function to Treasury guarded by deployer:
        console.log("USDC must be enabled via governance proposal:", usdcAddress);
        console.log("Or add a setupAllowedToken() one-shot in Treasury for MVP.");

        vm.stopBroadcast();

        // Print summary
        console.log("\n=== CFOx CFO Deployment ===");
        console.log("Governance:  ", address(gov));
        console.log("Treasury:    ", address(treas));
        console.log("Policy:      ", address(pol));
        console.log("Founder:     ", founder);
        console.log("Agent:       ", agentWallet);
        console.log("USDC:        ", usdcAddress);
        console.log("Per-tx limit:", perTxLimit);
        console.log("Daily limit: ", dailyLimit);
        console.log("Weekly limit:", weeklyLimit);
    }
}
