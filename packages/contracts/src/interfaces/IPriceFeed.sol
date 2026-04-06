// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPriceFeed — oracle price feed interface
interface IPriceFeed {
    /// @notice Get the current price for a token with spread applied
    /// @param token The index token address (e.g. WETH, WBTC)
    /// @param maximise True = return higher price (for opening longs / closing shorts)
    /// @return price Price in 30-decimal precision
    function getPrice(address token, bool maximise) external view returns (uint256 price);

    /// @notice Get the latest price without spread (for display/read-only)
    /// @param token The index token address
    /// @return price Price in 30-decimal precision
    function getLatestPrice(address token) external view returns (uint256 price);
}
