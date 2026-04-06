// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "../test/helpers/MockERC20.sol";
import {MockChainlinkAggregator} from "../test/helpers/MockChainlinkAggregator.sol";
import {PLP} from "../src/tokens/PLP.sol";
import {PriceFeed} from "../src/oracle/PriceFeed.sol";
import {Vault} from "../src/core/Vault.sol";
import {PositionManager} from "../src/core/PositionManager.sol";
import {Router} from "../src/core/Router.sol";
import {IPositionManager} from "../src/interfaces/IPositionManager.sol";
import {Constants} from "../src/libraries/Constants.sol";

/// @title SmokeTest — deploy + end-to-end test in one script
/// @notice Deploys everything, then runs LP deposit → open position → close position → withdraw.
///         forge script script/SmokeTest.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract SmokeTest is Script {
    uint256 constant PP = Constants.PRICE_PRECISION;

    function run() external {
        vm.startBroadcast();

        address deployer = msg.sender;

        // --- Deploy ---
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockERC20 weth = new MockERC20("WETH", "WETH", 18);
        MockChainlinkAggregator ethOracle = new MockChainlinkAggregator(8, "ETH/USD");
        ethOracle.setLatestAnswer(3500e8);

        PLP plp = new PLP(deployer);
        PriceFeed priceFeed = new PriceFeed(deployer);
        priceFeed.setFeed(address(weth), address(ethOracle));
        priceFeed.setSpreadBasisPoints(address(weth), 10);

        Vault vault = new Vault(address(usdc), address(plp), deployer);
        plp.setMinter(address(vault));

        PositionManager pm = new PositionManager(address(usdc), address(vault), address(priceFeed), deployer);
        vault.setPositionManager(address(pm));
        pm.setAllowedToken(address(weth), true);

        Router router = new Router(address(usdc), address(pm), address(vault), address(priceFeed));
        pm.setHandler(address(router), true);
        pm.setHandler(deployer, true);

        usdc.mint(deployer, 1_000_000e6);

        console.log("=== Deploy complete ===");

        // --- Step 1: LP deposit ---
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(50_000e6);
        console.log("Step 1: Deposited $50,000 LP. Pool:", vault.getPoolAmount());

        // --- Step 2: Open 5x long ETH ---
        usdc.approve(address(router), type(uint256).max);
        _openAndClose(router, pm, priceFeed, vault, plp, weth, deployer);
    }

    function _openAndClose(
        Router router,
        PositionManager pm,
        PriceFeed priceFeed,
        Vault vault,
        PLP plp,
        MockERC20 weth,
        address deployer
    ) internal {
        uint256 ethPrice = priceFeed.getLatestPrice(address(weth));
        router.increasePosition(address(weth), 1_000e6, 5_000 * PP, true, ethPrice + ethPrice / 100);

        IPositionManager.Position memory pos = pm.getPosition(deployer, address(weth), true);
        console.log("Step 2: Opened 5x long. Size:", pos.size);
        console.log("  Collateral:", pos.collateral);

        // --- Step 3: Close position ---
        uint256 balBefore = IERC20(address(vault.usdc())).balanceOf(deployer);
        router.decreasePosition(address(weth), 0, 5_000 * PP, true, ethPrice - ethPrice / 100, deployer);
        uint256 balAfter = IERC20(address(vault.usdc())).balanceOf(deployer);
        console.log("Step 3: Closed. USDC received:", balAfter - balBefore);

        pos = pm.getPosition(deployer, address(weth), true);
        require(pos.size == 0, "Position should be closed");

        // --- Step 4: Withdraw LP ---
        uint256 usdcBack = vault.withdraw(plp.balanceOf(deployer));
        console.log("Step 4: Withdrew LP. USDC back:", usdcBack);

        console.log("\n=== SMOKE TEST PASSED ===");
        console.log("Final USDC balance:", IERC20(address(vault.usdc())).balanceOf(deployer));
    }
}
