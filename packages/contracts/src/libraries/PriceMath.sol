// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Constants} from "./Constants.sol";

/// @title PriceMath — decimal conversion between USDC (6), Chainlink (8), and internal (30)
/// @dev Rounding rules: round DOWN for user payouts, round UP for fees/debits.
///      This ensures the protocol never pays out more than it should.
library PriceMath {
    /// @notice Scale USDC amount (6 dec) to internal precision (30 dec)
    function usdcToInternal(uint256 usdcAmount) internal pure returns (uint256) {
        return usdcAmount * (Constants.PRICE_PRECISION / Constants.USDC_PRECISION);
    }

    /// @notice Scale internal amount (30 dec) to USDC (6 dec), rounding DOWN
    function internalToUsdc(uint256 internalAmount) internal pure returns (uint256) {
        return internalAmount / (Constants.PRICE_PRECISION / Constants.USDC_PRECISION);
    }

    /// @notice Scale internal amount (30 dec) to USDC (6 dec), rounding UP
    /// @dev Used for fee calculations — always round against the user
    function internalToUsdcRoundUp(uint256 internalAmount) internal pure returns (uint256) {
        uint256 divisor = Constants.PRICE_PRECISION / Constants.USDC_PRECISION;
        return (internalAmount + divisor - 1) / divisor;
    }

    /// @notice Convert Chainlink answer (8 dec, int256) to internal (30 dec, uint256)
    /// @dev Reverts on zero or negative price, or unsupported decimal range
    function chainlinkToInternal(int256 answer, uint8 decimals) internal pure returns (uint256) {
        require(answer > 0, "PriceMath: invalid price");
        require(decimals >= 6 && decimals <= 18, "PriceMath: unsupported decimals");
        return uint256(answer) * (Constants.PRICE_PRECISION / (10 ** uint256(decimals)));
    }
}
