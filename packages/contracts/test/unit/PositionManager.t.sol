// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestSetup} from "../helpers/TestSetup.sol";
import {Vault} from "../../src/core/Vault.sol";
import {PLP} from "../../src/tokens/PLP.sol";
import {PriceFeed} from "../../src/oracle/PriceFeed.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {IPositionManager} from "../../src/interfaces/IPositionManager.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {PriceMath} from "../../src/libraries/PriceMath.sol";

contract PositionManagerTest is TestSetup {
    Vault internal vault;
    PLP internal plp;
    PriceFeed internal feed;
    PositionManager internal pm;

    uint256 constant PP = Constants.PRICE_PRECISION;

    function setUp() public {
        _setUp();
        vm.warp(100_000); // avoid timestamp underflow in oracle checks

        vm.startPrank(admin);

        // Deploy stack
        plp = new PLP(admin);
        vault = new Vault(address(usdc), address(plp), admin);
        plp.setMinter(address(vault));

        feed = new PriceFeed(admin);
        feed.setFeed(address(weth), address(ethOracle));
        feed.setFeed(address(wbtc), address(btcOracle));

        pm = new PositionManager(address(usdc), address(vault), address(feed), admin);

        // Authorize PM as vault's position manager
        vault.setPositionManager(address(pm));

        // Authorize admin as handler (for test convenience) and keeper for liquidations
        pm.setHandler(admin, true);
        pm.setHandler(keeper, true);

        // Allow tokens
        pm.setAllowedToken(address(weth), true);
        pm.setAllowedToken(address(wbtc), true);

        vm.stopPrank();

        // Refresh oracle prices at current timestamp
        ethOracle.setLatestAnswer(ETH_PRICE); // $3,500
        btcOracle.setLatestAnswer(BTC_PRICE); // $65,000

        // Seed vault with liquidity (alice deposits $50,000)
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(50_000e6);
        vm.stopPrank();

        // Give bob USDC and approve PM
        vm.startPrank(bob);
        usdc.approve(address(pm), type(uint256).max);
        vm.stopPrank();
    }

    // ============================================================
    //  Helpers
    // ============================================================

    /// @dev Open a standard long ETH position for bob
    function _openLong(uint256 collateralUsdc, uint256 sizeUsd30) internal {
        // Transfer USDC to PM (simulating router behavior)
        vm.prank(bob);
        usdc.transfer(address(pm), collateralUsdc);

        vm.prank(admin);
        pm.increasePosition(bob, address(weth), collateralUsdc, sizeUsd30, true);
    }

    /// @dev Open a standard short ETH position for bob
    function _openShort(uint256 collateralUsdc, uint256 sizeUsd30) internal {
        vm.prank(bob);
        usdc.transfer(address(pm), collateralUsdc);

        vm.prank(admin);
        pm.increasePosition(bob, address(weth), collateralUsdc, sizeUsd30, false);
    }

    // ============================================================
    //  increasePosition — basic
    // ============================================================

    function test_increasePosition_newLong() public {
        uint256 collateral = 1_000e6; // $1,000 USDC
        uint256 size = 5_000 * PP;    // $5,000 (5x leverage)

        _openLong(collateral, size);

        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), true);
        assertGt(pos.size, 0, "position should exist");
        assertEq(pos.size, size, "size should match");
        assertGt(pos.collateral, 0, "collateral should be set");
        assertEq(pos.averagePrice, 3500 * PP, "avg price should be ETH price");
    }

    function test_increasePosition_newShort() public {
        _openShort(1_000e6, 5_000 * PP);

        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), false);
        assertEq(pos.size, 5_000 * PP);
        assertEq(pos.averagePrice, 3500 * PP);
    }

    function test_increasePosition_addToExisting() public {
        _openLong(1_000e6, 5_000 * PP);

        // Add more collateral and size
        vm.prank(bob);
        usdc.transfer(address(pm), 1_000e6);

        vm.prank(admin);
        pm.increasePosition(bob, address(weth), 1_000e6, 5_000 * PP, true);

        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), true);
        assertEq(pos.size, 10_000 * PP, "size should double");
    }

    // ============================================================
    //  increasePosition — access control
    // ============================================================

    function test_increasePosition_nonHandler_reverts() public {
        vm.prank(bob);
        usdc.transfer(address(pm), 1_000e6);

        vm.prank(bob); // bob is not a handler
        vm.expectRevert(PositionManager.PM__OnlyHandler.selector);
        pm.increasePosition(bob, address(weth), 1_000e6, 5_000 * PP, true);
    }

    function test_increasePosition_disallowedToken_reverts() public {
        vm.prank(bob);
        usdc.transfer(address(pm), 1_000e6);

        address fakeToken = makeAddr("fake");
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PositionManager.PM__TokenNotAllowed.selector, fakeToken));
        pm.increasePosition(bob, fakeToken, 1_000e6, 5_000 * PP, true);
    }

    function test_increasePosition_zeroSize_reverts() public {
        vm.prank(bob);
        usdc.transfer(address(pm), 1_000e6);

        vm.prank(admin);
        vm.expectRevert(PositionManager.PM__ZeroSize.selector);
        pm.increasePosition(bob, address(weth), 1_000e6, 0, true);
    }

    // ============================================================
    //  increasePosition — leverage validation
    // ============================================================

    function test_increasePosition_excessiveLeverage_reverts() public {
        // $100 collateral, $50,000 size = 500x → exceeds 20x max
        vm.prank(bob);
        usdc.transfer(address(pm), 100e6);

        vm.prank(admin);
        vm.expectRevert(); // PM__InvalidLeverage or PM__InsufficientCollateral
        pm.increasePosition(bob, address(weth), 100e6, 50_000 * PP, true);
    }

    // ============================================================
    //  increasePosition — fee collection
    // ============================================================

    function test_increasePosition_collectsFee() public {
        uint256 feesBefore = pm.feeReserves();
        _openLong(1_000e6, 5_000 * PP);
        uint256 feesAfter = pm.feeReserves();

        // Fee = 0.1% of $5,000 = $5 → 5e6 USDC (rounded up)
        assertGt(feesAfter, feesBefore, "fees should increase");
        assertApproxEqAbs(feesAfter - feesBefore, 5e6, 1, "fee should be ~$5");
    }

    // ============================================================
    //  decreasePosition — close with profit
    // ============================================================

    function test_decreasePosition_longProfit() public {
        _openLong(1_000e6, 5_000 * PP);

        // ETH price goes up 10%: $3,500 → $3,850
        ethOracle.setLatestAnswer(3850e8);

        uint256 balBefore = usdc.balanceOf(alice);

        // Close full position, send to alice
        vm.prank(admin);
        uint256 usdcOut = pm.decreasePosition(bob, address(weth), 0, 5_000 * PP, true, alice);

        assertGt(usdcOut, 0, "should receive USDC");
        assertEq(usdc.balanceOf(alice), balBefore + usdcOut, "alice should receive funds");

        // Position should be deleted
        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), true);
        assertEq(pos.size, 0, "position should be closed");
    }

    // ============================================================
    //  decreasePosition — close with loss
    // ============================================================

    function test_decreasePosition_longLoss() public {
        _openLong(1_000e6, 5_000 * PP);

        // ETH price drops 5%: $3,500 → $3,325
        ethOracle.setLatestAnswer(3325e8);

        vm.prank(admin);
        uint256 usdcOut = pm.decreasePosition(bob, address(weth), 0, 5_000 * PP, true, bob);

        // Loss = 5% of $5,000 = $250. Collateral ~$995 - $250 - $5 fee ≈ $740
        // Some goes back to trader
        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), true);
        assertEq(pos.size, 0, "position should be closed");
    }

    // ============================================================
    //  decreasePosition — partial close
    // ============================================================

    function test_decreasePosition_partial() public {
        _openLong(2_000e6, 10_000 * PP);

        // Close half
        vm.prank(admin);
        pm.decreasePosition(bob, address(weth), 0, 5_000 * PP, true, bob);

        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), true);
        assertEq(pos.size, 5_000 * PP, "half should remain");
    }

    // ============================================================
    //  decreasePosition — access control
    // ============================================================

    function test_decreasePosition_nonHandler_reverts() public {
        _openLong(1_000e6, 5_000 * PP);

        vm.prank(bob);
        vm.expectRevert(PositionManager.PM__OnlyHandler.selector);
        pm.decreasePosition(bob, address(weth), 0, 5_000 * PP, true, bob);
    }

    function test_decreasePosition_noPosition_reverts() public {
        vm.prank(admin);
        vm.expectRevert(PositionManager.PM__PositionNotFound.selector);
        pm.decreasePosition(bob, address(weth), 0, 5_000 * PP, true, bob);
    }

    // ============================================================
    //  liquidatePosition
    // ============================================================

    function test_liquidatePosition_success() public {
        // Open a 10x leveraged long: $1,000 collateral, $10,000 size
        _openLong(1_000e6, 10_000 * PP);

        // Step price down gradually to avoid >10% deviation check
        // $3,500 → $3,300 → $3,170
        ethOracle.setLatestAnswer(3300e8);
        ethOracle.setLatestAnswer(3170e8);

        uint256 keeperBalBefore = usdc.balanceOf(keeper);

        vm.prank(keeper);
        pm.liquidatePosition(bob, address(weth), true, keeper);

        // Position should be deleted
        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), true);
        assertEq(pos.size, 0, "position should be liquidated");

        // Keeper should receive liquidation fee ($5)
        uint256 keeperBalAfter = usdc.balanceOf(keeper);
        assertGt(keeperBalAfter, keeperBalBefore, "keeper should receive liq fee");
    }

    function test_liquidatePosition_notLiquidatable_reverts() public {
        // Healthy position: 2x leverage
        _openLong(5_000e6, 10_000 * PP);

        // Small price drop — still healthy
        ethOracle.setLatestAnswer(3400e8);

        vm.prank(keeper);
        vm.expectRevert(PositionManager.PM__NotLiquidatable.selector);
        pm.liquidatePosition(bob, address(weth), true, keeper);
    }

    function test_liquidatePosition_shortPosition() public {
        // 10x short: $1,000 collateral, $10,000 size at $3,500
        _openShort(1_000e6, 10_000 * PP);

        // Step price up gradually to avoid >10% deviation check
        ethOracle.setLatestAnswer(3700e8);
        ethOracle.setLatestAnswer(3830e8);

        vm.prank(keeper);
        pm.liquidatePosition(bob, address(weth), false, keeper);

        IPositionManager.Position memory pos = pm.getPosition(bob, address(weth), false);
        assertEq(pos.size, 0, "short should be liquidated");
    }

    // ============================================================
    //  reserved amount tracking
    // ============================================================

    function test_reservedAmount_trackedCorrectly() public {
        uint256 reservedBefore = vault.getReservedAmount();

        _openLong(1_000e6, 5_000 * PP);

        uint256 reservedAfterOpen = vault.getReservedAmount();
        uint256 expectedReserve = PriceMath.internalToUsdc(5_000 * PP);
        assertEq(reservedAfterOpen - reservedBefore, expectedReserve, "reserve should increase by size");

        // Close position
        vm.prank(admin);
        pm.decreasePosition(bob, address(weth), 0, 5_000 * PP, true, bob);

        uint256 reservedAfterClose = vault.getReservedAmount();
        assertEq(reservedAfterClose, reservedBefore, "reserve should return to original");
    }

    // ============================================================
    //  admin functions
    // ============================================================

    function test_setHandler_onlyOwner() public {
        vm.prank(bob);
        vm.expectRevert();
        pm.setHandler(bob, true);
    }

    function test_setAllowedToken_onlyOwner() public {
        vm.prank(bob);
        vm.expectRevert();
        pm.setAllowedToken(address(weth), false);
    }

    function test_withdrawFees() public {
        _openLong(1_000e6, 5_000 * PP);

        uint256 fees = pm.feeReserves();
        assertGt(fees, 0);

        // Need USDC in PM for withdrawal
        uint256 adminBalBefore = usdc.balanceOf(admin);

        vm.prank(admin);
        pm.withdrawFees(admin);

        assertEq(pm.feeReserves(), 0);
        assertEq(usdc.balanceOf(admin), adminBalBefore + fees);
    }

    // ============================================================
    //  getPositionKey
    // ============================================================

    function test_getPositionKey_deterministic() public view {
        bytes32 key1 = pm.getPositionKey(alice, address(weth), true);
        bytes32 key2 = pm.getPositionKey(alice, address(weth), true);
        assertEq(key1, key2);

        // Different direction = different key
        bytes32 key3 = pm.getPositionKey(alice, address(weth), false);
        assertFalse(key1 == key3);

        // Different token = different key
        bytes32 key4 = pm.getPositionKey(alice, address(wbtc), true);
        assertFalse(key1 == key4);
    }
}
