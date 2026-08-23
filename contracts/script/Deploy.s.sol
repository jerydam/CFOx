// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/CFOxFactory.sol";

/// @notice Deploy the full CFOx suite via the factory (recommended path).
///
///         The factory handles deployment order and wiring:
///           1. CFOxGovernance
///           2. CFOxTreasury  (factory addr stored for one-shot token setup)
///           3. CFOxPolicy
///           4. governance.initialize(treasury, policy)
///           5. treasury.setupAllowedToken(usdcAddress)  ← done atomically in factory
///
///         Required env vars:
///           FOUNDER_ADDRESS   — initial 100 % equity holder
///           AGENT_ADDRESS     — AI agent wallet (creates proposals, weight = 0)
///           USDC_ADDRESS      — ERC-20 token to whitelist at deploy time
///
///         Optional env vars (defaults shown):
///           FOUNDER_NAME      — "Founder"
///           PER_TX_LIMIT      — 100_000_000  ($100 USDC, 6 decimals)
///           DAILY_LIMIT       — 500_000_000  ($500 USDC)
///           WEEKLY_LIMIT      — 2_000_000_000 ($2,000 USDC)
contract Deploy is Script {
    function run() external {
        // ── Env ───────────────────────────────────────────────────────────────
        address founder     = vm.envAddress("FOUNDER_ADDRESS");
        address agentWallet = vm.envAddress("AGENT_ADDRESS");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        string memory founderName = vm.envOr("FOUNDER_NAME", string("Founder"));

        // Spending limits (USDC has 6 decimals)
        uint256 perTxLimit  = vm.envOr("PER_TX_LIMIT",  uint256(100e6));    // $100
        uint256 dailyLimit  = vm.envOr("DAILY_LIMIT",   uint256(500e6));    // $500
        uint256 weeklyLimit = vm.envOr("WEEKLY_LIMIT",  uint256(2_000e6));  // $2,000

        // ── Deploy ────────────────────────────────────────────────────────────
        vm.startBroadcast();

        CFOxFactory factory = new CFOxFactory();
        console.log("CFOxFactory:   ", address(factory));

        (address governance, address treasury, address policy) = factory.deploy(
            founderName,
            agentWallet,
            usdcAddress,
            perTxLimit,
            dailyLimit,
            weeklyLimit
        );

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────
        console.log("\n=== CFOx Deployment Summary ===");
        console.log("Factory:      ", address(factory));
        console.log("Governance:   ", governance);
        console.log("Treasury:     ", treasury);
        console.log("Policy:       ", policy);
        console.log("Founder:      ", founder);
        console.log("Agent:        ", agentWallet);
        console.log("USDC:         ", usdcAddress);
        console.log("Per-tx limit: ", perTxLimit);
        console.log("Daily limit:  ", dailyLimit);
        console.log("Weekly limit: ", weeklyLimit);
    }
}
