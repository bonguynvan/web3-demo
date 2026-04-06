// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPLP} from "./IPLP.sol";

/// @title IVault — liquidity pool interface
interface IVault {
    // --- LP operations ---
    function deposit(uint256 usdcAmount) external returns (uint256 plpAmount);
    function withdraw(uint256 plpAmount) external returns (uint256 usdcAmount);

    // --- Pool accounting (called by PositionManager) ---
    function increasePoolAmount(uint256 amount) external;
    function decreasePoolAmount(uint256 amount) external;
    function increaseReserved(uint256 amount) external;
    function decreaseReserved(uint256 amount) external;

    /// @notice Transfer USDC out of the vault (for trader payouts)
    function transferOut(address recipient, uint256 usdcAmount) external;

    // --- Read ---
    function plpToken() external view returns (IPLP);
    function getPoolAmount() external view returns (uint256);
    function getReservedAmount() external view returns (uint256);
    function getAvailableLiquidity() external view returns (uint256);
    function getAum() external view returns (uint256);

    // --- Events ---
    event Deposit(address indexed account, uint256 usdcAmount, uint256 plpAmount);
    event Withdraw(address indexed account, uint256 plpAmount, uint256 usdcAmount);
    event PoolAmountUpdated(uint256 poolAmount);
}
