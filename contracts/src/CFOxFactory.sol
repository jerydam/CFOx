// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./CFOxGovernance.sol";
import "./CFOxTreasury.sol";
import "./CFOxPolicy.sol";

/// @title CFOxFactory
/// @notice Deploys an isolated (Governance, Treasury, Policy) triple for each founder.
///         Each founder gets their own independent CFO instance.
contract CFOxFactory {

    // ─── Types ────────────────────────────────────────────────────────────────

    struct CFOxInstance {
        address governance;
        address treasury;
        address policy;
        address founder;
        uint256 deployedAt;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice founder address → their deployed instance
    mapping(address => CFOxInstance) public instances;

    /// @notice All governance addresses ever deployed (for enumeration)
    address[] public allInstances;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CFOxDeployed(
        address indexed founder,
        address governance,
        address treasury,
        address policy
    );

    // ─── Deploy ───────────────────────────────────────────────────────────────

    /// @notice Deploy a full CFOx suite for the caller.
    /// @param founderName  Display name stored on the governance contract.
    /// @param agentWallet  AI agent address that can create proposals (0 equity).
    /// @param usdcAddress  Initial ERC20 token to whitelist in the treasury.
    /// @param perTxLimit   Max amount auto-executed without multisig (6-decimal USDC).
    /// @param dailyLimit   Daily autonomous spend cap.
    /// @param weeklyLimit  Weekly autonomous spend cap.
    function deploy(
        string calldata founderName,
        address agentWallet,
        address usdcAddress,
        uint256 perTxLimit,
        uint256 dailyLimit,
        uint256 weeklyLimit
    ) external returns (address governance, address treasury, address policy) {
        require(
            instances[msg.sender].governance == address(0),
            "CFOxFactory: already deployed"
        );
        require(agentWallet != address(0), "CFOxFactory: zero agent");
        require(usdcAddress != address(0), "CFOxFactory: zero token");

        // 1. Governance — founder is msg.sender
        CFOxGovernance gov = new CFOxGovernance(
            msg.sender,
            founderName,
            agentWallet
        );

        // 2. Treasury — factory address passed so setupAllowedToken works
        CFOxTreasury treas = new CFOxTreasury(address(gov), address(this));

        // 3. Policy
        CFOxPolicy pol = new CFOxPolicy(
            address(gov),
            perTxLimit,
            dailyLimit,
            weeklyLimit
        );

        // 4. Wire governance → treasury + policy
        gov.initialize(address(treas), address(pol));

        // 5. Whitelist the initial token (one-shot, factory-only)
        treas.setupAllowedToken(usdcAddress);

        // 6. Store
        instances[msg.sender] = CFOxInstance({
            governance:  address(gov),
            treasury:    address(treas),
            policy:      address(pol),
            founder:     msg.sender,
            deployedAt:  block.timestamp
        });
        allInstances.push(address(gov));

        emit CFOxDeployed(msg.sender, address(gov), address(treas), address(pol));
        return (address(gov), address(treas), address(pol));
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getInstance(address founder) external view returns (CFOxInstance memory) {
        return instances[founder];
    }

    function totalDeployed() external view returns (uint256) {
        return allInstances.length;
    }

    function hasInstance(address founder) external view returns (bool) {
        return instances[founder].governance != address(0);
    }
}
