// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../test/helpers/MockERC20.sol";
import {MockChainlinkAggregator} from "../test/helpers/MockChainlinkAggregator.sol";
import {PLP} from "../src/tokens/PLP.sol";
import {PriceFeed} from "../src/oracle/PriceFeed.sol";
import {Vault} from "../src/core/Vault.sol";
import {PositionManager} from "../src/core/PositionManager.sol";
import {Router} from "../src/core/Router.sol";

/// @title DeployLocal — deploy the full Perp DEX stack to Anvil
/// @notice Uses mock tokens and oracles for local development.
///         Run: forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract DeployLocal is Script {
    // Anvil default deployer (account 0)
    address constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    // Initial oracle prices (8 decimals, Chainlink format)
    int256 constant ETH_PRICE = 3500e8;
    int256 constant BTC_PRICE = 65000e8;

    function run() external {
        vm.startBroadcast();

        // ---- 1. Mock Tokens ----
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        MockERC20 weth = new MockERC20("Wrapped Ether", "WETH", 18);
        MockERC20 wbtc = new MockERC20("Wrapped Bitcoin", "WBTC", 8);

        console.log("USDC:", address(usdc));
        console.log("WETH:", address(weth));
        console.log("WBTC:", address(wbtc));

        // ---- 2. Mock Oracles ----
        MockChainlinkAggregator ethOracle = new MockChainlinkAggregator(8, "ETH / USD");
        MockChainlinkAggregator btcOracle = new MockChainlinkAggregator(8, "BTC / USD");

        ethOracle.setLatestAnswer(ETH_PRICE);
        btcOracle.setLatestAnswer(BTC_PRICE);

        console.log("ETH Oracle:", address(ethOracle));
        console.log("BTC Oracle:", address(btcOracle));

        // ---- 3. PLP Token ----
        PLP plp = new PLP(DEPLOYER);
        console.log("PLP:", address(plp));

        // ---- 4. PriceFeed ----
        PriceFeed priceFeed = new PriceFeed(DEPLOYER);
        priceFeed.setFeed(address(weth), address(ethOracle));
        priceFeed.setFeed(address(wbtc), address(btcOracle));
        // Set small spread for anti-sandwich (0.1%)
        priceFeed.setSpreadBasisPoints(address(weth), 10);
        priceFeed.setSpreadBasisPoints(address(wbtc), 10);

        console.log("PriceFeed:", address(priceFeed));

        // ---- 5. Vault ----
        Vault vault = new Vault(address(usdc), address(plp), DEPLOYER);
        plp.setMinter(address(vault));

        console.log("Vault:", address(vault));

        // ---- 6. PositionManager ----
        PositionManager positionManager = new PositionManager(
            address(usdc),
            address(vault),
            address(priceFeed),
            DEPLOYER
        );

        // Wire permissions
        vault.setPositionManager(address(positionManager));
        positionManager.setAllowedToken(address(weth), true);
        positionManager.setAllowedToken(address(wbtc), true);

        console.log("PositionManager:", address(positionManager));

        // ---- 7. Router ----
        Router router = new Router(
            address(usdc),
            address(positionManager),
            address(vault),
            address(priceFeed)
        );

        // Authorize Router as handler on PositionManager
        positionManager.setHandler(address(router), true);
        // Also authorize deployer as handler (for keeper/admin operations)
        positionManager.setHandler(DEPLOYER, true);

        console.log("Router:", address(router));

        // ---- 8. Seed deployer with USDC for testing ----
        usdc.mint(DEPLOYER, 1_000_000e6); // $1M USDC

        // Also seed Anvil accounts 1-3
        address[3] memory testAccounts = [
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8, // account 1
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, // account 2
            0x90F79bf6EB2c4f870365E785982E1f101E93b906  // account 3
        ];

        for (uint256 i = 0; i < testAccounts.length; i++) {
            usdc.mint(testAccounts[i], 100_000e6); // $100k each
        }

        vm.stopBroadcast();

        // ---- Print deployment summary ----
        console.log("");
        console.log("=== Perp DEX Local Deployment Complete ===");
        console.log("Network: Anvil (localhost:8545)");
        console.log("");
        console.log("--- Addresses ---");
        console.log("USDC:            ", address(usdc));
        console.log("WETH:            ", address(weth));
        console.log("WBTC:            ", address(wbtc));
        console.log("ETH Oracle:      ", address(ethOracle));
        console.log("BTC Oracle:      ", address(btcOracle));
        console.log("PLP:             ", address(plp));
        console.log("PriceFeed:       ", address(priceFeed));
        console.log("Vault:           ", address(vault));
        console.log("PositionManager: ", address(positionManager));
        console.log("Router:          ", address(router));
        console.log("");
        console.log("Deployer USDC balance: 1,000,000");
        console.log("Test accounts (1-3) USDC: 100,000 each");
    }
}
