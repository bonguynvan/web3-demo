// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRouter — user-facing entry point for trading
interface IRouter {
    /// @notice Open or increase a leveraged position
    /// @param indexToken The market (e.g. WETH address for ETH-PERP)
    /// @param collateralAmount USDC amount to deposit as collateral (6 dec)
    /// @param sizeDelta Position size to add in USD (30 dec)
    /// @param isLong True for long, false for short
    /// @param acceptablePrice Max price for longs, min price for shorts (30 dec, slippage protection)
    function increasePosition(
        address indexToken,
        uint256 collateralAmount,
        uint256 sizeDelta,
        bool isLong,
        uint256 acceptablePrice
    ) external;

    /// @notice Close or reduce a leveraged position
    /// @param indexToken The market
    /// @param collateralDelta Collateral to withdraw in USD (30 dec)
    /// @param sizeDelta Position size to reduce in USD (30 dec)
    /// @param isLong Position direction
    /// @param acceptablePrice Min price for longs, max price for shorts (30 dec)
    /// @param receiver Where to send the USDC payout
    function decreasePosition(
        address indexToken,
        uint256 collateralDelta,
        uint256 sizeDelta,
        bool isLong,
        uint256 acceptablePrice,
        address receiver
    ) external;

    /// @notice Deposit USDC to the liquidity pool, receive PLP tokens
    function depositToVault(uint256 usdcAmount) external returns (uint256 plpAmount);

    /// @notice Withdraw from the liquidity pool by burning PLP tokens
    function withdrawFromVault(uint256 plpAmount) external returns (uint256 usdcAmount);
}
