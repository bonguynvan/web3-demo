// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVault} from "../interfaces/IVault.sol";
import {IPLP} from "../interfaces/IPLP.sol";
import {PriceMath} from "../libraries/PriceMath.sol";
import {Constants} from "../libraries/Constants.sol";

/// @title Vault — USDC liquidity pool for the Perp DEX
/// @notice LPs deposit USDC and receive PLP tokens proportional to their share of the pool.
///         The PositionManager draws from / adds to the pool when positions are opened/closed.
/// @dev Security: ReentrancyGuard on all external state-changing functions.
///      Pausable for emergency shutdown. Only authorized PositionManager can modify pool state.
contract Vault is IVault, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // --- Immutables ---

    /// @notice USDC token address
    IERC20 public immutable usdc;

    /// @notice PLP (LP token) address
    IPLP public immutable plpToken;

    // --- State ---

    /// @notice Total USDC in the pool (6 decimals)
    uint256 public poolAmount;

    /// @notice USDC reserved for open positions — cannot be withdrawn by LPs (6 decimals)
    uint256 public reservedAmount;

    /// @notice Address authorized to call pool accounting functions (PositionManager)
    address public positionManager;

    // --- Errors ---

    error Vault__ZeroAmount();
    error Vault__OnlyPositionManager();
    error Vault__InsufficientLiquidity(uint256 available, uint256 requested);
    error Vault__UtilizationExceeded(uint256 reservedAfter, uint256 maxReserved);

    event ReservedAmountClamped(uint256 requested, uint256 actual);
    event PositionManagerUpdated(address indexed positionManager);

    // --- Modifiers ---

    modifier onlyPositionManager() {
        if (msg.sender != positionManager) revert Vault__OnlyPositionManager();
        _;
    }

    constructor(address usdcAddress, address plpAddress, address initialOwner) Ownable(initialOwner) {
        usdc = IERC20(usdcAddress);
        plpToken = IPLP(plpAddress);
    }

    // --- Admin ---

    /// @notice Set the PositionManager address (only authorized caller for pool ops)
    function setPositionManager(address pm) external onlyOwner {
        if (pm == address(0)) revert Vault__ZeroAmount(); // reuse error for zero-address
        positionManager = pm;
        emit PositionManagerUpdated(pm);
    }

    /// @notice Pause deposits/withdrawals (emergency)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause
    function unpause() external onlyOwner {
        _unpause();
    }

    // --- LP Operations ---

    /// @inheritdoc IVault
    /// @notice Deposit USDC into the pool, receive PLP tokens
    /// @param usdcAmount Amount of USDC to deposit (6 decimals)
    /// @return plpAmount Amount of PLP tokens minted
    function deposit(uint256 usdcAmount) external override nonReentrant whenNotPaused returns (uint256 plpAmount) {
        if (usdcAmount == 0) revert Vault__ZeroAmount();

        // Calculate PLP to mint BEFORE transferring USDC (prevents inflation attack)
        uint256 totalPlp = plpToken.totalSupply();

        if (totalPlp == 0 || poolAmount == 0) {
            // First deposit: 1 USDC = 1 PLP (both 6 decimals for simplicity)
            plpAmount = usdcAmount;
        } else {
            // Proportional: plpAmount = usdcAmount * totalPLP / poolAmount
            plpAmount = (usdcAmount * totalPlp) / poolAmount;
        }

        // Transfer USDC from depositor to Vault
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Update pool and mint PLP
        poolAmount += usdcAmount;
        plpToken.mint(msg.sender, plpAmount);

        emit Deposit(msg.sender, usdcAmount, plpAmount);
        emit PoolAmountUpdated(poolAmount);
    }

    /// @inheritdoc IVault
    /// @notice Burn PLP tokens and withdraw USDC from the pool
    /// @param plpAmount Amount of PLP tokens to burn
    /// @return usdcAmount Amount of USDC returned
    function withdraw(uint256 plpAmount) external override nonReentrant whenNotPaused returns (uint256 usdcAmount) {
        if (plpAmount == 0) revert Vault__ZeroAmount();

        uint256 totalPlp = plpToken.totalSupply();

        // Calculate USDC to return: usdcAmount = plpAmount * poolAmount / totalPLP
        usdcAmount = (plpAmount * poolAmount) / totalPlp;

        // Check there's enough unreserved liquidity
        uint256 available = poolAmount - reservedAmount;
        if (usdcAmount > available) {
            revert Vault__InsufficientLiquidity(available, usdcAmount);
        }

        // Burn PLP first (checks-effects-interactions)
        plpToken.burn(msg.sender, plpAmount);
        poolAmount -= usdcAmount;

        // Transfer USDC to withdrawer
        usdc.safeTransfer(msg.sender, usdcAmount);

        emit Withdraw(msg.sender, plpAmount, usdcAmount);
        emit PoolAmountUpdated(poolAmount);
    }

    // --- Pool Accounting (called by PositionManager) ---

    /// @inheritdoc IVault
    /// @notice Add USDC to the pool (e.g. from trader losses or fees)
    function increasePoolAmount(uint256 amount) external override onlyPositionManager {
        poolAmount += amount;
        emit PoolAmountUpdated(poolAmount);
    }

    /// @inheritdoc IVault
    /// @notice Remove USDC from the pool (e.g. for trader profits)
    function decreasePoolAmount(uint256 amount) external override onlyPositionManager {
        if (amount > poolAmount) revert Vault__InsufficientLiquidity(poolAmount, amount);
        poolAmount -= amount;
        emit PoolAmountUpdated(poolAmount);
    }

    /// @inheritdoc IVault
    /// @notice Reserve USDC for an open position's collateral
    function increaseReserved(uint256 amount) external override onlyPositionManager {
        uint256 newReserved = reservedAmount + amount;
        uint256 maxReserved = (poolAmount * Constants.MAX_UTILIZATION_BPS) / Constants.BASIS_POINTS_DIVISOR;
        if (newReserved > maxReserved) {
            revert Vault__UtilizationExceeded(newReserved, maxReserved);
        }
        reservedAmount = newReserved;
    }

    /// @inheritdoc IVault
    /// @notice Release reserved USDC when a position is closed
    function decreaseReserved(uint256 amount) external override onlyPositionManager {
        if (amount > reservedAmount) {
            emit ReservedAmountClamped(amount, reservedAmount);
            reservedAmount = 0;
        } else {
            reservedAmount -= amount;
        }
    }

    /// @inheritdoc IVault
    /// @notice Transfer USDC out (for trader payouts on profitable closes)
    function transferOut(address recipient, uint256 usdcAmount) external override onlyPositionManager {
        usdc.safeTransfer(recipient, usdcAmount);
    }

    // --- Read ---

    /// @inheritdoc IVault
    function getPoolAmount() external view override returns (uint256) {
        return poolAmount;
    }

    /// @inheritdoc IVault
    function getReservedAmount() external view override returns (uint256) {
        return reservedAmount;
    }

    /// @inheritdoc IVault
    function getAvailableLiquidity() external view override returns (uint256) {
        return poolAmount - reservedAmount;
    }

    /// @inheritdoc IVault
    /// @notice Get total Assets Under Management (for PLP pricing)
    /// @dev For MVP, AUM = poolAmount. In production, add unrealized PnL of all positions.
    function getAum() external view override returns (uint256) {
        return poolAmount;
    }
}
