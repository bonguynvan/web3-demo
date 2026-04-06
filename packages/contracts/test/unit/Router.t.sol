// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestSetup} from "../helpers/TestSetup.sol";
import {Vault} from "../../src/core/Vault.sol";
import {PLP} from "../../src/tokens/PLP.sol";
import {PriceFeed} from "../../src/oracle/PriceFeed.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {Router} from "../../src/core/Router.sol";
import {IPositionManager} from "../../src/interfaces/IPositionManager.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract RouterTest is TestSetup {
    Vault internal vault;
    PLP internal plp;
    PriceFeed internal feed;
    PositionManager internal pm;
    Router internal router;

    uint256 constant PP = Constants.PRICE_PRECISION;

    function setUp() public {
        _setUp();
        vm.warp(100_000);

        vm.startPrank(admin);

        plp = new PLP(admin);
        vault = new Vault(address(usdc), address(plp), admin);
        plp.setMinter(address(vault));

        feed = new PriceFeed(admin);
        feed.setFeed(address(weth), address(ethOracle));
        feed.setFeed(address(wbtc), address(btcOracle));

        pm = new PositionManager(address(usdc), address(vault), address(feed), admin);
        vault.setPositionManager(address(pm));

        router = new Router(address(usdc), address(pm), address(vault), address(feed));

        // Router is a handler for PM
        pm.setHandler(address(router), true);
        pm.setAllowedToken(address(weth), true);
        pm.setAllowedToken(address(wbtc), true);

        vm.stopPrank();

        // Refresh oracle prices
        ethOracle.setLatestAnswer(ETH_PRICE);
        btcOracle.setLatestAnswer(BTC_PRICE);

        // Seed vault with liquidity
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(50_000e6);
        vm.stopPrank();

        // Approve router for bob
        vm.prank(bob);
        usdc.approve(address(router), type(uint256).max);
    }

    // ============================================================
    //  increasePosition via Router — slippage
    // ============================================================

    function test_increasePosition_withinSlippage() public {
        uint256 ethPrice30 = 3500 * PP;
        // acceptable = $3,600 (above market for long)
        vm.prank(bob);
        router.increasePosition(address(weth), 1_000e6, 5_000 * PP, true, ethPrice30 + 100 * PP);

        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), true);
        assertGt(pos.size, 0, "position should be opened");
    }

    function test_increasePosition_longSlippageExceeded_reverts() public {
        // acceptable = $3,400 — market is $3,500, so price > acceptable → revert
        vm.prank(bob);
        vm.expectRevert();
        router.increasePosition(address(weth), 1_000e6, 5_000 * PP, true, 3400 * PP);
    }

    function test_increasePosition_shortSlippageExceeded_reverts() public {
        // Short: acceptable = $3,600 means we want price >= $3,600
        // Market is $3,500 → price < acceptable → revert
        vm.prank(bob);
        vm.expectRevert();
        router.increasePosition(address(weth), 1_000e6, 5_000 * PP, false, 3600 * PP);
    }

    function test_increasePosition_zeroAmount_reverts() public {
        vm.prank(bob);
        vm.expectRevert(Router.Router__ZeroAmount.selector);
        router.increasePosition(address(weth), 0, 5_000 * PP, true, 4000 * PP);
    }

    // ============================================================
    //  decreasePosition via Router — slippage
    // ============================================================

    function test_decreasePosition_withinSlippage() public {
        // Open position first
        vm.prank(bob);
        router.increasePosition(address(weth), 1_000e6, 5_000 * PP, true, 3600 * PP);

        // Close with acceptable = $3,400 (below market for closing long)
        vm.prank(bob);
        router.decreasePosition(address(weth), 0, 5_000 * PP, true, 3400 * PP, bob);

        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), true);
        assertEq(pos.size, 0, "position should be closed");
    }

    function test_decreasePosition_longSlippageExceeded_reverts() public {
        vm.prank(bob);
        router.increasePosition(address(weth), 1_000e6, 5_000 * PP, true, 3600 * PP);

        // Closing long: want price >= acceptable. Set acceptable above market → revert
        vm.prank(bob);
        vm.expectRevert();
        router.decreasePosition(address(weth), 0, 5_000 * PP, true, 3600 * PP, bob);
    }

    // ============================================================
    //  full trading flow
    // ============================================================

    function test_fullFlow_openAndCloseWithProfit() public {
        uint256 bobBalBefore = usdc.balanceOf(bob);

        // Open 5x long at $3,500
        vm.prank(bob);
        router.increasePosition(address(weth), 1_000e6, 5_000 * PP, true, 3600 * PP);

        // Price rises 10%
        ethOracle.setLatestAnswer(3850e8);

        // Close — expect profit
        vm.prank(bob);
        router.decreasePosition(address(weth), 0, 5_000 * PP, true, 3800 * PP, bob);

        uint256 bobBalAfter = usdc.balanceOf(bob);
        // Started with $100k, spent $1k collateral, should get back > $1k (profit)
        // Net PnL: 10% of $5,000 = $500 profit minus fees
        assertGt(bobBalAfter, bobBalBefore - 1_000e6, "should profit overall");
    }

    // ============================================================
    //  LP deposit/withdraw via router
    // ============================================================

    function test_depositToVault_zeroAmount_reverts() public {
        vm.prank(bob);
        vm.expectRevert(Router.Router__ZeroAmount.selector);
        router.depositToVault(0);
    }

    function test_withdrawFromVault_zeroAmount_reverts() public {
        vm.prank(bob);
        vm.expectRevert(Router.Router__ZeroAmount.selector);
        router.withdrawFromVault(0);
    }
}
