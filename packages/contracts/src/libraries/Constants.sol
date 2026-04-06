// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Constants — shared protocol constants
/// @dev Using 30-decimal internal precision (GMX convention) to avoid
///      precision loss when multiplying USDC (6 dec) amounts by prices.
library Constants {
    // --- Decimals ---
    uint8 internal constant USDC_DECIMALS = 6;
    uint8 internal constant CHAINLINK_DECIMALS = 8;
    uint8 internal constant PRICE_DECIMALS = 30;

    uint256 internal constant USDC_PRECISION = 10 ** USDC_DECIMALS;           // 1e6
    uint256 internal constant CHAINLINK_PRECISION = 10 ** CHAINLINK_DECIMALS; // 1e8
    uint256 internal constant PRICE_PRECISION = 10 ** PRICE_DECIMALS;         // 1e30

    // --- Basis points ---
    uint256 internal constant BASIS_POINTS_DIVISOR = 10_000;

    // --- Leverage ---
    uint256 internal constant MAX_LEVERAGE = 200_000;  // 20x (in basis points: 20 * 10_000)
    uint256 internal constant MIN_LEVERAGE = 10_000;   // 1x

    // --- Fees ---
    uint256 internal constant DEFAULT_MARGIN_FEE_BPS = 10; // 0.1%
    uint256 internal constant LIQUIDATION_FEE_USD = 5 * PRICE_PRECISION; // $5 in 30-dec

    // --- Pool safety ---
    uint256 internal constant MAX_UTILIZATION_BPS = 8_000; // 80% max pool utilization
    uint256 internal constant MAX_OI_RATIO_BPS = 8_000;    // 80% max OI / pool

    // --- Funding ---
    uint256 internal constant FUNDING_INTERVAL = 1 hours;
    uint256 internal constant FUNDING_RATE_FACTOR = 100; // basis points per interval at 100% utilization

    // --- Oracle ---
    uint256 internal constant PRICE_STALENESS_THRESHOLD = 3600; // 1 hour for Chainlink heartbeat
    uint256 internal constant MAX_PRICE_DEVIATION_BPS = 1_000;  // 10% max deviation between rounds
    uint256 internal constant SEQUENCER_GRACE_PERIOD = 3600;    // 1 hour grace after sequencer comes up

    // --- Liquidation ---
    /// @dev Position is liquidatable when remaining collateral < size / MAX_LEVERAGE
    ///      This ensures the position still meets minimum margin even after losses.
    uint256 internal constant LIQUIDATION_THRESHOLD_BPS = 100; // 1% of position size
}
