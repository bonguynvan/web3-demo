// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPositionManager — perpetual position management interface
interface IPositionManager {
    struct Position {
        uint256 size;           // Position size in USD (30 dec)
        uint256 collateral;     // Collateral in USD (30 dec)
        uint256 averagePrice;   // Weighted average entry price (30 dec)
        uint256 entryFundingRate; // Cumulative funding rate at entry
        uint256 lastUpdatedTime;  // Timestamp of last update
    }

    // --- Position operations (called by Router) ---
    function increasePosition(
        address account,
        address indexToken,
        uint256 collateralDelta,  // USDC amount (6 dec) to add as collateral
        uint256 sizeDelta,        // Position size increase in USD (30 dec)
        bool isLong
    ) external;

    function decreasePosition(
        address account,
        address indexToken,
        uint256 collateralDelta,  // Collateral to withdraw in USD (30 dec)
        uint256 sizeDelta,        // Position size decrease in USD (30 dec)
        bool isLong,
        address receiver          // Where to send withdrawn funds
    ) external returns (uint256 usdcOut);

    function liquidatePosition(
        address account,
        address indexToken,
        bool isLong,
        address feeReceiver       // Keeper receives liquidation fee
    ) external;

    // --- Read ---
    function getPosition(
        address account,
        address indexToken,
        bool isLong
    ) external view returns (Position memory);

    function getPositionKey(
        address account,
        address indexToken,
        bool isLong
    ) external pure returns (bytes32);

    // --- Events ---
    event IncreasePosition(
        address indexed account,
        address indexed indexToken,
        bool isLong,
        uint256 sizeDelta,
        uint256 collateralDelta,
        uint256 price,
        uint256 fee
    );

    event DecreasePosition(
        address indexed account,
        address indexed indexToken,
        bool isLong,
        uint256 sizeDelta,
        uint256 collateralDelta,
        uint256 price,
        uint256 fee,
        uint256 usdcOut
    );

    event LiquidatePosition(
        address indexed account,
        address indexed indexToken,
        bool isLong,
        uint256 size,
        uint256 collateral,
        uint256 markPrice,
        address feeReceiver,
        uint256 liquidationFee
    );
}
