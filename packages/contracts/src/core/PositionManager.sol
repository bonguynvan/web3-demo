// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPositionManager} from "../interfaces/IPositionManager.sol";
import {IVault} from "../interfaces/IVault.sol";
import {IPriceFeed} from "../interfaces/IPriceFeed.sol";
import {PositionMath} from "../libraries/PositionMath.sol";
import {PriceMath} from "../libraries/PriceMath.sol";
import {Constants} from "../libraries/Constants.sol";

/// @title PositionManager — core perpetual position engine
/// @notice Manages leveraged long/short positions against the Vault liquidity pool.
/// @dev Only the Router (or authorized handler) can invoke position operations.
///      All internal accounting uses 30-decimal precision. USDC transfers use 6 decimals.
contract PositionManager is IPositionManager, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // --- Immutables ---

    IERC20 public immutable usdc;
    IVault public immutable vault;
    IPriceFeed public immutable priceFeed;

    // --- State ---

    mapping(bytes32 => Position) public positions;
    mapping(address => bool) public isHandler;
    mapping(address => bool) public allowedTokens;

    uint256 public marginFeeBps;
    uint256 public feeReserves; // 6 dec USDC

    // --- Errors ---

    error PM__OnlyHandler();
    error PM__TokenNotAllowed(address token);
    error PM__ZeroSize();
    error PM__InvalidLeverage(uint256 size, uint256 collateral);
    error PM__InsufficientCollateral();
    error PM__PositionNotFound();
    error PM__NotLiquidatable();
    error PM__ZeroAddress();
    error PM__FeeExceedsMax(uint256 feeBps, uint256 maxBps);

    uint256 public constant MAX_MARGIN_FEE_BPS = 200; // 2% cap

    event HandlerSet(address indexed handler, bool active);
    event TokenAllowed(address indexed token, bool allowed);
    event MarginFeeUpdated(uint256 feeBps);

    // --- Modifiers ---

    modifier onlyHandler() {
        if (!isHandler[msg.sender]) revert PM__OnlyHandler();
        _;
    }

    constructor(
        address _usdc,
        address _vault,
        address _priceFeed,
        address _initialOwner
    ) Ownable(_initialOwner) {
        usdc = IERC20(_usdc);
        vault = IVault(_vault);
        priceFeed = IPriceFeed(_priceFeed);
        marginFeeBps = Constants.DEFAULT_MARGIN_FEE_BPS;
    }

    // --- Admin ---

    function setHandler(address handler, bool active) external onlyOwner {
        if (handler == address(0)) revert PM__ZeroAddress();
        isHandler[handler] = active;
        emit HandlerSet(handler, active);
    }

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert PM__ZeroAddress();
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    function setMarginFeeBps(uint256 feeBps) external onlyOwner {
        if (feeBps > MAX_MARGIN_FEE_BPS) revert PM__FeeExceedsMax(feeBps, MAX_MARGIN_FEE_BPS);
        marginFeeBps = feeBps;
        emit MarginFeeUpdated(feeBps);
    }

    function withdrawFees(address recipient) external onlyOwner {
        if (recipient == address(0)) revert PM__ZeroAddress();
        uint256 amount = feeReserves;
        feeReserves = 0;
        usdc.safeTransfer(recipient, amount);
    }

    // --- Position Operations ---

    /// @inheritdoc IPositionManager
    function increasePosition(
        address account,
        address indexToken,
        uint256 collateralDelta, // USDC 6 dec
        uint256 sizeDelta,       // USD 30 dec
        bool isLong
    ) external override nonReentrant onlyHandler {
        if (!allowedTokens[indexToken]) revert PM__TokenNotAllowed(indexToken);
        if (sizeDelta == 0) revert PM__ZeroSize();

        uint256 markPrice = priceFeed.getPrice(indexToken, isLong);
        uint256 fee = PositionMath.getMarginFee(sizeDelta, marginFeeBps);
        uint256 feeUsdc = PriceMath.internalToUsdcRoundUp(fee);
        uint256 collateralInternal = PriceMath.usdcToInternal(collateralDelta);

        if (collateralInternal <= fee) revert PM__InsufficientCollateral();

        bytes32 key = _getPositionKey(account, indexToken, isLong);
        Position storage position = positions[key];

        if (position.size == 0) {
            position.averagePrice = markPrice;
        } else {
            position.averagePrice = PositionMath.getNextAveragePrice(
                position.size, position.averagePrice, sizeDelta, markPrice
            );
        }

        position.size += sizeDelta;
        position.collateral += (collateralInternal - fee);
        position.lastUpdatedTime = block.timestamp;

        if (!PositionMath.validateLeverage(position.size, position.collateral)) {
            revert PM__InvalidLeverage(position.size, position.collateral);
        }

        feeReserves += feeUsdc;

        vault.increaseReserved(PriceMath.internalToUsdc(sizeDelta));

        // Transfer collateral (minus fee kept by PM) to vault
        uint256 toVault = collateralDelta - feeUsdc;
        usdc.safeTransfer(address(vault), toVault);
        vault.increasePoolAmount(toVault);

        emit IncreasePosition(
            account, indexToken, isLong,
            sizeDelta, collateralInternal, markPrice, fee
        );
    }

    /// @inheritdoc IPositionManager
    function decreasePosition(
        address account,
        address indexToken,
        uint256 collateralDelta, // USD 30 dec
        uint256 sizeDelta,       // USD 30 dec
        bool isLong,
        address receiver
    ) external override nonReentrant onlyHandler returns (uint256 usdcOut) {
        if (receiver == address(0)) revert PM__ZeroAddress();
        bytes32 key = _getPositionKey(account, indexToken, isLong);
        Position storage position = positions[key];
        if (position.size == 0) revert PM__PositionNotFound();
        if (sizeDelta > position.size) revert PM__ZeroSize();

        uint256 markPrice = priceFeed.getPrice(indexToken, !isLong);
        uint256 fee = PositionMath.getMarginFee(sizeDelta, marginFeeBps);

        usdcOut = _settleDecrease(position, collateralDelta, sizeDelta, fee, markPrice, isLong);

        // If position still open, validate leverage
        if (position.size > 0) {
            if (position.collateral == 0) revert PM__InsufficientCollateral();
            if (!PositionMath.validateLeverage(position.size, position.collateral)) {
                revert PM__InvalidLeverage(position.size, position.collateral);
            }
        }

        // Transfer USDC to receiver via vault
        if (usdcOut > 0) {
            vault.transferOut(receiver, usdcOut);
        }

        // Clean up closed positions
        if (position.size == 0) {
            delete positions[key];
        }

        emit DecreasePosition(
            account, indexToken, isLong,
            sizeDelta, collateralDelta, markPrice, fee, usdcOut
        );
    }

    /// @inheritdoc IPositionManager
    function liquidatePosition(
        address account,
        address indexToken,
        bool isLong,
        address feeReceiver
    ) external override nonReentrant onlyHandler {
        bytes32 key = _getPositionKey(account, indexToken, isLong);
        Position storage position = positions[key];
        if (position.size == 0) revert PM__PositionNotFound();

        uint256 markPrice = priceFeed.getPrice(indexToken, !isLong);

        (bool hasProfit, uint256 delta) = PositionMath.getDelta(
            isLong, position.size, position.averagePrice, markPrice
        );

        uint256 marginFee = PositionMath.getMarginFee(position.size, marginFeeBps);

        if (!PositionMath.isLiquidatable(
            position.collateral, position.size, hasProfit, delta, marginFee, 0
        )) {
            revert PM__NotLiquidatable();
        }

        uint256 size = position.size;
        uint256 collateral = position.collateral;

        _settleLiquidation(size, collateral, hasProfit, delta, feeReceiver);

        delete positions[key];

        emit LiquidatePosition(
            account, indexToken, isLong,
            size, collateral, markPrice,
            feeReceiver, Constants.LIQUIDATION_FEE_USD
        );
    }

    // --- Read ---

    /// @inheritdoc IPositionManager
    function getPosition(
        address account,
        address indexToken,
        bool isLong
    ) external view override returns (Position memory) {
        return positions[_getPositionKey(account, indexToken, isLong)];
    }

    /// @inheritdoc IPositionManager
    function getPositionKey(
        address account,
        address indexToken,
        bool isLong
    ) external pure override returns (bytes32) {
        return _getPositionKey(account, indexToken, isLong);
    }

    // --- Internal ---

    /// @dev Settle a decrease: update position, settle with vault, return USDC output (6 dec)
    function _settleDecrease(
        Position storage position,
        uint256 collateralDelta,
        uint256 sizeDelta,
        uint256 fee,
        uint256 markPrice,
        bool isLong
    ) internal returns (uint256 usdcOut) {
        (bool hasProfit, uint256 delta) = PositionMath.getDelta(
            isLong, position.size, position.averagePrice, markPrice
        );

        // Scale PnL proportionally
        uint256 adjustedDelta = (delta * sizeDelta) / position.size;

        // If closing the entire position, auto-withdraw remaining collateral
        bool isFullClose = sizeDelta == position.size;
        uint256 effectiveCollateralDelta = collateralDelta;
        if (isFullClose && collateralDelta == 0) {
            effectiveCollateralDelta = position.collateral;
        }

        // Build output: profit + collateral withdrawal - loss - fee
        uint256 outInternal;
        if (hasProfit) {
            outInternal = adjustedDelta;
        }
        outInternal += effectiveCollateralDelta;

        // Deduct loss
        if (!hasProfit) {
            outInternal -= _min(adjustedDelta, outInternal);
        }
        // Deduct fee
        outInternal -= _min(fee, outInternal);

        // Update position collateral
        position.collateral -= _min(effectiveCollateralDelta, position.collateral);
        if (!hasProfit) {
            position.collateral -= _min(adjustedDelta, position.collateral);
        }
        position.collateral -= _min(fee, position.collateral);
        position.size -= sizeDelta;
        position.lastUpdatedTime = block.timestamp;

        // Vault accounting: release reserves
        vault.decreaseReserved(PriceMath.internalToUsdc(sizeDelta));

        // Settle PnL with pool
        if (hasProfit && adjustedDelta > 0) {
            vault.decreasePoolAmount(PriceMath.internalToUsdc(adjustedDelta));
        }
        if (!hasProfit && adjustedDelta > 0) {
            vault.increasePoolAmount(PriceMath.internalToUsdc(adjustedDelta));
        }

        // Remove withdrawn collateral from pool
        if (effectiveCollateralDelta > 0) {
            uint256 collUsdc = PriceMath.internalToUsdc(effectiveCollateralDelta);
            vault.decreasePoolAmount(_min(collUsdc, vault.getPoolAmount()));
        }

        // Fee handling: decrease pool for fee, transfer to PM
        uint256 feeUsdc = PriceMath.internalToUsdcRoundUp(fee);
        feeReserves += feeUsdc;
        if (feeUsdc > 0) {
            vault.decreasePoolAmount(_min(feeUsdc, vault.getPoolAmount()));
            vault.transferOut(address(this), feeUsdc);
        }

        usdcOut = PriceMath.internalToUsdc(outInternal);
    }

    /// @dev Settle a liquidation: release reserves, settle PnL, pay keeper
    function _settleLiquidation(
        uint256 size,
        uint256 collateral,
        bool hasProfit,
        uint256 delta,
        address feeReceiver
    ) internal {
        vault.decreaseReserved(PriceMath.internalToUsdc(size));

        uint256 collateralUsdc = PriceMath.internalToUsdc(collateral);

        if (!hasProfit) {
            uint256 lossUsdc = PriceMath.internalToUsdc(_min(delta, collateral));
            if (lossUsdc > 0) {
                vault.increasePoolAmount(lossUsdc);
            }
        }

        vault.decreasePoolAmount(_min(collateralUsdc, vault.getPoolAmount()));

        uint256 liqFeeUsdc = PriceMath.internalToUsdc(Constants.LIQUIDATION_FEE_USD);
        if (liqFeeUsdc > 0 && liqFeeUsdc <= collateralUsdc) {
            vault.transferOut(feeReceiver, liqFeeUsdc);
        }

        // Remaining after liq fee goes to fee reserves
        uint256 remainingUsdc;
        if (!hasProfit && delta < collateral) {
            uint256 afterLoss = collateralUsdc - PriceMath.internalToUsdc(delta);
            if (afterLoss > liqFeeUsdc) {
                remainingUsdc = afterLoss - liqFeeUsdc;
            }
        } else if (hasProfit) {
            if (collateralUsdc > liqFeeUsdc) {
                remainingUsdc = collateralUsdc - liqFeeUsdc;
            }
        }
        if (remainingUsdc > 0) {
            vault.transferOut(address(this), remainingUsdc);
            feeReserves += remainingUsdc;
        }
    }

    function _getPositionKey(
        address account,
        address indexToken,
        bool isLong
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(account, indexToken, isLong));
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
