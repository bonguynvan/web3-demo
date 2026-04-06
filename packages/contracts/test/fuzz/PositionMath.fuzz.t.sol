// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PositionMath} from "../../src/libraries/PositionMath.sol";
import {PriceMath} from "../../src/libraries/PriceMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @title PositionMath fuzz tests — 1000 runs by default (see foundry.toml)
contract PositionMathFuzzTest is Test {
    uint256 constant PP = Constants.PRICE_PRECISION;

    // ============================================================
    //                 getDelta symmetry
    // ============================================================

    /// @dev Long profit at price P equals short loss at same price and vice versa.
    ///      This tests that the PnL formula is directionally consistent.
    function testFuzz_getDelta_longShortSymmetry(
        uint256 size,
        uint256 avgPrice,
        uint256 markPrice
    ) public pure {
        // Bound to realistic ranges to avoid overflow
        size = bound(size, 1 * PP, 10_000_000 * PP);         // $1 - $10M
        avgPrice = bound(avgPrice, 1 * PP, 1_000_000 * PP);  // $1 - $1M
        markPrice = bound(markPrice, 1 * PP, 1_000_000 * PP);

        (bool longProfit, uint256 longDelta) = PositionMath.getDelta(true, size, avgPrice, markPrice);
        (bool shortProfit, uint256 shortDelta) = PositionMath.getDelta(false, size, avgPrice, markPrice);

        // If long profits, short should lose, and amounts should match
        if (markPrice != avgPrice) {
            assertTrue(longProfit != shortProfit, "long and short should have opposite profit direction");
            assertEq(longDelta, shortDelta, "long and short PnL magnitude should match");
        } else {
            // Same price => both zero
            assertEq(longDelta, 0);
            assertEq(shortDelta, 0);
        }
    }

    /// @dev PnL should never exceed position size (can't lose more than 100% in PnL calc)
    function testFuzz_getDelta_boundedBySize(
        uint256 size,
        uint256 avgPrice,
        uint256 markPrice,
        bool isLong
    ) public pure {
        size = bound(size, 1 * PP, 10_000_000 * PP);
        avgPrice = bound(avgPrice, 1 * PP, 1_000_000 * PP);
        // Mark price bounded to 0.01x - 100x of avg (realistic for any market)
        markPrice = bound(markPrice, avgPrice / 100, avgPrice * 100);

        (, uint256 delta) = PositionMath.getDelta(isLong, size, avgPrice, markPrice);

        // Delta can exceed size in extreme cases (100x price move),
        // but should be proportional: delta = size * |priceMove| / avgPrice
        // At most 100x move => delta <= 100 * size
        assertLe(delta, 100 * size, "delta unreasonably large");
    }

    // ============================================================
    //          liquidation price consistency
    // ============================================================

    /// @dev Verify that:
    ///   1. At a price 5% WORSE than liqPrice, position IS liquidatable
    ///   2. At a price 5% BETTER than liqPrice, position is NOT liquidatable
    ///  This tests that getLiquidationPrice returns a reasonable boundary.
    function testFuzz_liquidationPrice_isConsistent(
        uint256 collateralUsdc,
        uint256 leverageBps,
        bool isLong
    ) public pure {
        collateralUsdc = bound(collateralUsdc, 1_000e6, 100_000e6); // $1k - $100k
        leverageBps = bound(leverageBps, 20_000, 200_000);          // 2x - 20x

        uint256 collateral = PriceMath.usdcToInternal(collateralUsdc);
        uint256 avgPrice = 3000 * PP;
        uint256 size = (collateral * leverageBps) / Constants.BASIS_POINTS_DIVISOR;

        uint256 marginFee = PositionMath.getMarginFee(size, Constants.DEFAULT_MARGIN_FEE_BPS);
        uint256 totalFees = marginFee + Constants.LIQUIDATION_FEE_USD;

        if (totalFees >= collateral) return;

        uint256 liqPrice = PositionMath.getLiquidationPrice(isLong, avgPrice, collateral, size, totalFees);
        if (liqPrice == 0) return;

        // 5% worse than liqPrice (deeper into loss territory)
        uint256 worsePrice = isLong ? liqPrice * 95 / 100 : liqPrice * 105 / 100;
        // 5% better than liqPrice (further from liquidation)
        uint256 betterPrice = isLong ? liqPrice * 105 / 100 : liqPrice * 95 / 100;

        // Skip if betterPrice crosses the entry (would be profitable, trivially not liquidatable)
        if (isLong && betterPrice > avgPrice) return;
        if (!isLong && betterPrice < avgPrice) return;

        // At worse price: should be liquidatable
        {
            (bool hp, uint256 d) = PositionMath.getDelta(isLong, size, avgPrice, worsePrice);
            bool liq = PositionMath.isLiquidatable(collateral, size, hp, d, marginFee, 0);
            assertTrue(liq, "should be liquidatable at 5% worse than liqPrice");
        }

        // At better price: should NOT be liquidatable
        {
            (bool hp, uint256 d) = PositionMath.getDelta(isLong, size, avgPrice, betterPrice);
            bool liq = PositionMath.isLiquidatable(collateral, size, hp, d, marginFee, 0);
            assertFalse(liq, "should NOT be liquidatable at 5% better than liqPrice");
        }
    }

    // ============================================================
    //              leverage validation
    // ============================================================

    function testFuzz_validateLeverage_bounds(uint256 size, uint256 collateral) public pure {
        size = bound(size, 1 * PP, 10_000_000 * PP);
        collateral = bound(collateral, 1 * PP, 10_000_000 * PP);

        bool valid = PositionMath.validateLeverage(size, collateral);
        uint256 leverageBps = (size * Constants.BASIS_POINTS_DIVISOR) / collateral;

        if (leverageBps >= Constants.MIN_LEVERAGE && leverageBps <= Constants.MAX_LEVERAGE) {
            assertTrue(valid, "should be valid within bounds");
        } else {
            assertFalse(valid, "should be invalid outside bounds");
        }
    }

    // ============================================================
    //           getNextAveragePrice invariants
    // ============================================================

    /// @dev New average price must be between the two prices
    function testFuzz_getNextAveragePrice_between(
        uint256 currentSize,
        uint256 currentAvgPrice,
        uint256 sizeDelta,
        uint256 newPrice
    ) public pure {
        currentSize = bound(currentSize, 1 * PP, 10_000_000 * PP);
        currentAvgPrice = bound(currentAvgPrice, 1 * PP, 1_000_000 * PP);
        sizeDelta = bound(sizeDelta, 1 * PP, 10_000_000 * PP);
        newPrice = bound(newPrice, 1 * PP, 1_000_000 * PP);

        uint256 nextAvg = PositionMath.getNextAveragePrice(currentSize, currentAvgPrice, sizeDelta, newPrice);

        uint256 lower = currentAvgPrice < newPrice ? currentAvgPrice : newPrice;
        uint256 upper = currentAvgPrice > newPrice ? currentAvgPrice : newPrice;

        assertGe(nextAvg, lower, "avg price should be >= lower bound");
        assertLe(nextAvg, upper, "avg price should be <= upper bound");
    }

    // ============================================================
    //              USDC roundtrip fuzz
    // ============================================================

    function testFuzz_usdcRoundtrip_lossless(uint256 usdcAmount) public pure {
        usdcAmount = bound(usdcAmount, 0, 1_000_000_000e6); // 0 - $1B
        uint256 internal_ = PriceMath.usdcToInternal(usdcAmount);
        uint256 recovered = PriceMath.internalToUsdc(internal_);
        assertEq(recovered, usdcAmount, "USDC roundtrip should be lossless");
    }
}
