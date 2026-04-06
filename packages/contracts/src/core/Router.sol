// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRouter} from "../interfaces/IRouter.sol";
import {IPositionManager} from "../interfaces/IPositionManager.sol";
import {IVault} from "../interfaces/IVault.sol";
import {IPriceFeed} from "../interfaces/IPriceFeed.sol";
import {PriceMath} from "../libraries/PriceMath.sol";

/// @title Router — user-facing entry point for the Perp DEX
/// @notice Handles slippage protection, USDC transfers, and delegates to PositionManager/Vault.
///         Users interact with the Router; they never call PositionManager directly.
contract Router is IRouter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IPositionManager public immutable positionManager;
    IVault public immutable vault;
    IPriceFeed public immutable priceFeed;

    // --- Errors ---

    error Router__SlippageExceeded(uint256 markPrice, uint256 acceptablePrice);
    error Router__ZeroAmount();

    constructor(
        address _usdc,
        address _positionManager,
        address _vault,
        address _priceFeed
    ) {
        usdc = IERC20(_usdc);
        positionManager = IPositionManager(_positionManager);
        vault = IVault(_vault);
        priceFeed = IPriceFeed(_priceFeed);
    }

    // --- Trading ---

    /// @inheritdoc IRouter
    function increasePosition(
        address indexToken,
        uint256 collateralAmount, // USDC 6 dec
        uint256 sizeDelta,        // USD 30 dec
        bool isLong,
        uint256 acceptablePrice   // USD 30 dec
    ) external override nonReentrant {
        if (collateralAmount == 0) revert Router__ZeroAmount();

        // Slippage check: longs want price <= acceptable, shorts want price >= acceptable
        uint256 markPrice = priceFeed.getPrice(indexToken, isLong);
        if (isLong) {
            if (markPrice > acceptablePrice) {
                revert Router__SlippageExceeded(markPrice, acceptablePrice);
            }
        } else {
            if (markPrice < acceptablePrice) {
                revert Router__SlippageExceeded(markPrice, acceptablePrice);
            }
        }

        // Transfer USDC from user to PositionManager
        usdc.safeTransferFrom(msg.sender, address(positionManager), collateralAmount);

        // Delegate to PositionManager
        positionManager.increasePosition(
            msg.sender,
            indexToken,
            collateralAmount,
            sizeDelta,
            isLong
        );
    }

    /// @inheritdoc IRouter
    function decreasePosition(
        address indexToken,
        uint256 collateralDelta, // USD 30 dec
        uint256 sizeDelta,       // USD 30 dec
        bool isLong,
        uint256 acceptablePrice, // USD 30 dec
        address receiver
    ) external override nonReentrant {
        // Slippage check: closing longs want price >= acceptable, closing shorts want price <= acceptable
        uint256 markPrice = priceFeed.getPrice(indexToken, !isLong);
        if (isLong) {
            if (markPrice < acceptablePrice) {
                revert Router__SlippageExceeded(markPrice, acceptablePrice);
            }
        } else {
            if (markPrice > acceptablePrice) {
                revert Router__SlippageExceeded(markPrice, acceptablePrice);
            }
        }

        positionManager.decreasePosition(
            msg.sender,
            indexToken,
            collateralDelta,
            sizeDelta,
            isLong,
            receiver
        );
    }

    // --- LP Operations ---

    /// @inheritdoc IRouter
    function depositToVault(uint256 usdcAmount) external override nonReentrant returns (uint256 plpAmount) {
        if (usdcAmount == 0) revert Router__ZeroAmount();

        // Transfer USDC from user to this contract, then approve vault
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        usdc.forceApprove(address(vault), usdcAmount);

        plpAmount = vault.deposit(usdcAmount);

        // Vault mints PLP to msg.sender (this contract) — transfer to actual user
        IERC20(address(vault.plpToken())).safeTransfer(msg.sender, plpAmount);
    }

    /// @inheritdoc IRouter
    function withdrawFromVault(uint256 plpAmount) external override nonReentrant returns (uint256 usdcAmount) {
        if (plpAmount == 0) revert Router__ZeroAmount();

        // Pull PLP from user, then burn via vault.withdraw
        IERC20(address(vault.plpToken())).safeTransferFrom(msg.sender, address(this), plpAmount);
        usdcAmount = vault.withdraw(plpAmount);

        // Transfer USDC to user
        usdc.safeTransfer(msg.sender, usdcAmount);
    }
}
