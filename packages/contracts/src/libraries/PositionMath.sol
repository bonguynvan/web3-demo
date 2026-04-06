// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Constants} from "./Constants.sol";

/// @title PositionMath — pure functions for perpetual position calculations
/// @dev All amounts use 30-decimal internal precision unless noted otherwise.
///      This library is the security-critical math foundation of the protocol.
library PositionMath {
    /// @notice Calculate unrealized PnL for a position
    /// @param isLong True for long, false for short
    /// @param size Position size in USD (30 dec)
    /// @param averagePrice Entry price (30 dec)
    /// @param markPrice Current mark price (30 dec)
    /// @return hasProfit Whether the position is profitable
    /// @return delta Absolute PnL amount (30 dec)
    function getDelta(
        bool isLong,
        uint256 size,
        uint256 averagePrice,
        uint256 markPrice
    ) internal pure returns (bool hasProfit, uint256 delta) {
        require(averagePrice > 0, "PositionMath: zero avg price");
        if (size == 0) return (false, 0);

        if (isLong) {
            hasProfit = markPrice > averagePrice;
            uint256 priceDelta = hasProfit
                ? markPrice - averagePrice
                : averagePrice - markPrice;
            delta = (size * priceDelta) / averagePrice;
        } else {
            hasProfit = averagePrice > markPrice;
            uint256 priceDelta = hasProfit
                ? averagePrice - markPrice
                : markPrice - averagePrice;
            delta = (size * priceDelta) / averagePrice;
        }
    }

    /// @notice Calculate the new average entry price when increasing a position
    /// @param currentSize Existing position size (30 dec)
    /// @param currentAvgPrice Existing average price (30 dec)
    /// @param sizeDelta Additional size being added (30 dec)
    /// @param newPrice Price of the new addition (30 dec)
    /// @return nextAvgPrice Weighted average price (30 dec)
    function getNextAveragePrice(
        uint256 currentSize,
        uint256 currentAvgPrice,
        uint256 sizeDelta,
        uint256 newPrice
    ) internal pure returns (uint256 nextAvgPrice) {
        if (currentSize == 0) return newPrice;
        // Weighted average: (currentSize * currentAvgPrice + sizeDelta * newPrice) / (currentSize + sizeDelta)
        // To avoid overflow, we compute: nextSize * newPrice / (nextSize + adjustment)
        // GMX approach: use the dollar-weighted method
        uint256 nextSize = currentSize + sizeDelta;
        nextAvgPrice = (currentAvgPrice * currentSize + newPrice * sizeDelta) / nextSize;
    }

    /// @notice Calculate the margin fee for a position size change
    /// @param sizeDelta Size being opened/closed (30 dec)
    /// @param marginFeeBps Fee rate in basis points
    /// @return fee Fee amount (30 dec)
    function getMarginFee(
        uint256 sizeDelta,
        uint256 marginFeeBps
    ) internal pure returns (uint256 fee) {
        return (sizeDelta * marginFeeBps) / Constants.BASIS_POINTS_DIVISOR;
    }

    /// @notice Validate that leverage is within allowed bounds
    /// @param size Total position size (30 dec)
    /// @param collateral Total collateral (30 dec)
    /// @return True if leverage is valid (between MIN and MAX)
    function validateLeverage(
        uint256 size,
        uint256 collateral
    ) internal pure returns (bool) {
        if (collateral == 0) return false;
        // leverage = size / collateral (in basis points)
        uint256 leverageBps = (size * Constants.BASIS_POINTS_DIVISOR) / collateral;
        return leverageBps >= Constants.MIN_LEVERAGE && leverageBps <= Constants.MAX_LEVERAGE;
    }

    /// @notice Check if a position can be liquidated
    /// @param collateral Remaining collateral (30 dec)
    /// @param size Position size (30 dec)
    /// @param hasProfit Whether position is profitable
    /// @param delta Absolute PnL (30 dec)
    /// @param marginFee Pending margin fee (30 dec)
    /// @param fundingFee Accumulated funding fee (30 dec)
    /// @return True if position is liquidatable
    function isLiquidatable(
        uint256 collateral,
        uint256 size,
        bool hasProfit,
        uint256 delta,
        uint256 marginFee,
        uint256 fundingFee
    ) internal pure returns (bool) {
        // Remaining collateral after fees and PnL
        uint256 remainingCollateral = collateral;

        // Deduct losses
        if (!hasProfit) {
            if (delta >= remainingCollateral) return true;
            remainingCollateral -= delta;
        }

        // Deduct fees
        uint256 totalFees = marginFee + fundingFee + Constants.LIQUIDATION_FEE_USD;
        if (totalFees >= remainingCollateral) return true;
        remainingCollateral -= totalFees;

        // Check minimum margin: remaining must cover at least LIQUIDATION_THRESHOLD_BPS of size
        uint256 minMargin = (size * Constants.LIQUIDATION_THRESHOLD_BPS) / Constants.BASIS_POINTS_DIVISOR;
        return remainingCollateral < minMargin;
    }

    /// @notice Calculate the liquidation price for a position
    /// @dev Useful for displaying to users. Returns 0 if position cannot be liquidated.
    /// @param isLong Position direction
    /// @param averagePrice Entry price (30 dec)
    /// @param collateral Position collateral (30 dec)
    /// @param size Position size (30 dec)
    /// @param totalFees Accumulated fees (margin + funding + liquidation) (30 dec)
    /// @return liqPrice The price at which position becomes liquidatable (30 dec)
    function getLiquidationPrice(
        bool isLong,
        uint256 averagePrice,
        uint256 collateral,
        uint256 size,
        uint256 totalFees
    ) internal pure returns (uint256 liqPrice) {
        if (size == 0 || averagePrice == 0) return 0;

        uint256 minMargin = (size * Constants.LIQUIDATION_THRESHOLD_BPS) / Constants.BASIS_POINTS_DIVISOR;

        // The max loss the collateral can absorb before liquidation
        // remainingCollateral = collateral - loss - totalFees
        // liquidation when: remainingCollateral < minMargin
        // => loss > collateral - totalFees - minMargin
        if (collateral <= totalFees + minMargin) {
            // Already underwater or at boundary — liquidatable at current price
            return averagePrice;
        }
        uint256 maxLoss = collateral - totalFees - minMargin;

        // loss = size * |priceDelta| / averagePrice
        // => |priceDelta| = maxLoss * averagePrice / size
        uint256 priceDelta = (maxLoss * averagePrice) / size;

        if (isLong) {
            // Longs lose when price drops: liqPrice = averagePrice - priceDelta
            liqPrice = priceDelta >= averagePrice ? 0 : averagePrice - priceDelta;
        } else {
            // Shorts lose when price rises: liqPrice = averagePrice + priceDelta
            liqPrice = averagePrice + priceDelta;
        }
    }
}
