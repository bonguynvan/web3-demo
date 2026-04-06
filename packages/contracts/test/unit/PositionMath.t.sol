// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PositionMath} from "../../src/libraries/PositionMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract PositionMathTest is Test {
    uint256 constant PRICE_PRECISION = Constants.PRICE_PRECISION;

    // ============================================================
    //                        getDelta
    // ============================================================

    function test_getDelta_longProfit() public pure {
        // Long ETH at $3000, price goes to $3300 (+10%)
        uint256 size = 30_000 * PRICE_PRECISION;  // $30,000 position
        uint256 avgPrice = 3000 * PRICE_PRECISION;
        uint256 markPrice = 3300 * PRICE_PRECISION;

        (bool hasProfit, uint256 delta) = PositionMath.getDelta(true, size, avgPrice, markPrice);

        assertTrue(hasProfit);
        assertEq(delta, 3000 * PRICE_PRECISION); // $3,000 profit (10% of $30k)
    }

    function test_getDelta_longLoss() public pure {
        // Long ETH at $3000, price drops to $2700 (-10%)
        uint256 size = 30_000 * PRICE_PRECISION;
        uint256 avgPrice = 3000 * PRICE_PRECISION;
        uint256 markPrice = 2700 * PRICE_PRECISION;

        (bool hasProfit, uint256 delta) = PositionMath.getDelta(true, size, avgPrice, markPrice);

        assertFalse(hasProfit);
        assertEq(delta, 3000 * PRICE_PRECISION); // $3,000 loss
    }

    function test_getDelta_shortProfit() public pure {
        // Short BTC at $65000, price drops to $60000
        uint256 size = 65_000 * PRICE_PRECISION;
        uint256 avgPrice = 65_000 * PRICE_PRECISION;
        uint256 markPrice = 60_000 * PRICE_PRECISION;

        (bool hasProfit, uint256 delta) = PositionMath.getDelta(false, size, avgPrice, markPrice);

        assertTrue(hasProfit);
        assertEq(delta, 5000 * PRICE_PRECISION); // $5,000 profit
    }

    function test_getDelta_shortLoss() public pure {
        // Short BTC at $65000, price rises to $70000
        uint256 size = 65_000 * PRICE_PRECISION;
        uint256 avgPrice = 65_000 * PRICE_PRECISION;
        uint256 markPrice = 70_000 * PRICE_PRECISION;

        (bool hasProfit, uint256 delta) = PositionMath.getDelta(false, size, avgPrice, markPrice);

        assertFalse(hasProfit);
        assertEq(delta, 5000 * PRICE_PRECISION);
    }

    function test_getDelta_zeroSize() public pure {
        (bool hasProfit, uint256 delta) = PositionMath.getDelta(true, 0, 3000 * PRICE_PRECISION, 3300 * PRICE_PRECISION);
        assertFalse(hasProfit);
        assertEq(delta, 0);
    }

    function test_getDelta_revertsOnZeroAvgPrice() public {
        vm.expectRevert("PositionMath: zero avg price");
        this.externalGetDelta(true, 1000 * PRICE_PRECISION, 0, 3000 * PRICE_PRECISION);
    }

    /// @dev External wrapper to make library revert testable via expectRevert
    function externalGetDelta(bool isLong, uint256 size, uint256 avgPrice, uint256 markPrice) external pure returns (bool, uint256) {
        return PositionMath.getDelta(isLong, size, avgPrice, markPrice);
    }

    function test_getDelta_samePrice() public pure {
        (bool hasProfit, uint256 delta) = PositionMath.getDelta(true, 30_000 * PRICE_PRECISION, 3000 * PRICE_PRECISION, 3000 * PRICE_PRECISION);
        assertFalse(hasProfit);
        assertEq(delta, 0);
    }

    // ============================================================
    //                   getNextAveragePrice
    // ============================================================

    function test_getNextAveragePrice_newPosition() public pure {
        uint256 nextAvg = PositionMath.getNextAveragePrice(0, 0, 10_000 * PRICE_PRECISION, 3000 * PRICE_PRECISION);
        assertEq(nextAvg, 3000 * PRICE_PRECISION);
    }

    function test_getNextAveragePrice_equalSizeAddition() public pure {
        // Existing: $10k at $3000, Adding: $10k at $3200
        // Expected: ($10k * $3000 + $10k * $3200) / $20k = $3100
        uint256 nextAvg = PositionMath.getNextAveragePrice(
            10_000 * PRICE_PRECISION,
            3000 * PRICE_PRECISION,
            10_000 * PRICE_PRECISION,
            3200 * PRICE_PRECISION
        );
        assertEq(nextAvg, 3100 * PRICE_PRECISION);
    }

    function test_getNextAveragePrice_weightedCorrectly() public pure {
        // Existing: $30k at $3000, Adding: $10k at $3400
        // Expected: ($30k * 3000 + $10k * 3400) / $40k = $3100
        uint256 nextAvg = PositionMath.getNextAveragePrice(
            30_000 * PRICE_PRECISION,
            3000 * PRICE_PRECISION,
            10_000 * PRICE_PRECISION,
            3400 * PRICE_PRECISION
        );
        assertEq(nextAvg, 3100 * PRICE_PRECISION);
    }

    // ============================================================
    //                      getMarginFee
    // ============================================================

    function test_getMarginFee() public pure {
        // $30,000 position, 0.1% fee (10 bps) = $30
        uint256 fee = PositionMath.getMarginFee(30_000 * PRICE_PRECISION, 10);
        assertEq(fee, 30 * PRICE_PRECISION);
    }

    // ============================================================
    //                    validateLeverage
    // ============================================================

    function test_validateLeverage_valid10x() public pure {
        // $30,000 size / $3,000 collateral = 10x
        assertTrue(PositionMath.validateLeverage(30_000 * PRICE_PRECISION, 3_000 * PRICE_PRECISION));
    }

    function test_validateLeverage_valid20x() public pure {
        // $30,000 size / $1,500 collateral = 20x (exactly MAX_LEVERAGE)
        assertTrue(PositionMath.validateLeverage(30_000 * PRICE_PRECISION, 1_500 * PRICE_PRECISION));
    }

    function test_validateLeverage_invalid21x() public pure {
        // $31,500 size / $1,500 collateral = 21x (exceeds 20x max)
        assertFalse(PositionMath.validateLeverage(31_500 * PRICE_PRECISION, 1_500 * PRICE_PRECISION));
    }

    function test_validateLeverage_zeroCollateral() public pure {
        assertFalse(PositionMath.validateLeverage(1000 * PRICE_PRECISION, 0));
    }

    function test_validateLeverage_valid1x() public pure {
        // $3,000 size / $3,000 collateral = 1x (exactly MIN_LEVERAGE)
        assertTrue(PositionMath.validateLeverage(3_000 * PRICE_PRECISION, 3_000 * PRICE_PRECISION));
    }

    // ============================================================
    //                     isLiquidatable
    // ============================================================

    function test_isLiquidatable_healthyPosition() public pure {
        // $3,000 collateral, $30,000 size (10x), no loss
        assertFalse(PositionMath.isLiquidatable(
            3_000 * PRICE_PRECISION, // collateral
            30_000 * PRICE_PRECISION, // size
            false,                     // no profit
            0,                         // no delta
            30 * PRICE_PRECISION,      // margin fee ($30)
            0                          // no funding fee
        ));
    }

    function test_isLiquidatable_underwaterPosition() public pure {
        // $3,000 collateral, $30,000 size, $2,900 loss
        // Remaining = $3,000 - $2,900 - $30 (fee) - $5 (liq fee) = $65
        // Min margin = $30,000 * 1% = $300
        // $65 < $300 => liquidatable
        assertTrue(PositionMath.isLiquidatable(
            3_000 * PRICE_PRECISION,
            30_000 * PRICE_PRECISION,
            false,
            2_900 * PRICE_PRECISION,
            30 * PRICE_PRECISION,
            0
        ));
    }

    function test_isLiquidatable_lossExceedsCollateral() public pure {
        // Loss > collateral => immediately liquidatable
        assertTrue(PositionMath.isLiquidatable(
            3_000 * PRICE_PRECISION,
            30_000 * PRICE_PRECISION,
            false,
            3_500 * PRICE_PRECISION, // loss exceeds collateral
            0,
            0
        ));
    }

    function test_isLiquidatable_profitableNotLiquidatable() public pure {
        // Profitable position is never liquidatable
        assertFalse(PositionMath.isLiquidatable(
            3_000 * PRICE_PRECISION,
            30_000 * PRICE_PRECISION,
            true,                      // profitable
            1_000 * PRICE_PRECISION,
            30 * PRICE_PRECISION,
            0
        ));
    }

    // ============================================================
    //                  getLiquidationPrice
    // ============================================================

    function test_getLiquidationPrice_long() public pure {
        // Long at $3,000, $3,000 collateral, $30,000 size (10x)
        // Total fees = $30 margin + $5 liq fee = $35
        // Min margin = $30,000 * 1% = $300
        // Max loss = $3,000 - $35 - $300 = $2,665
        // priceDelta = $2,665 * $3,000 / $30,000 = $266.5
        // liqPrice = $3,000 - $266.5 = $2,733.5
        uint256 totalFees = 35 * PRICE_PRECISION;
        uint256 liqPrice = PositionMath.getLiquidationPrice(
            true,
            3_000 * PRICE_PRECISION,
            3_000 * PRICE_PRECISION,
            30_000 * PRICE_PRECISION,
            totalFees
        );

        // $2,733.5 in 30 dec
        assertEq(liqPrice, 2_733_500_000_000_000_000_000_000_000_000_000);
    }

    function test_getLiquidationPrice_short() public pure {
        // Short at $3,000, $3,000 collateral, $30,000 size (10x)
        // Same fees, liqPrice = $3,000 + $266.5 = $3,266.5
        uint256 totalFees = 35 * PRICE_PRECISION;
        uint256 liqPrice = PositionMath.getLiquidationPrice(
            false,
            3_000 * PRICE_PRECISION,
            3_000 * PRICE_PRECISION,
            30_000 * PRICE_PRECISION,
            totalFees
        );

        assertEq(liqPrice, 3_266_500_000_000_000_000_000_000_000_000_000);
    }

    function test_getLiquidationPrice_zeroSize() public pure {
        assertEq(PositionMath.getLiquidationPrice(true, 3000 * PRICE_PRECISION, 3000 * PRICE_PRECISION, 0, 0), 0);
    }
}
