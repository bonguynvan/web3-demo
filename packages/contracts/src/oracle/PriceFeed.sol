// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChainlinkAggregator} from "../interfaces/IChainlinkAggregator.sol";
import {IPriceFeed} from "../interfaces/IPriceFeed.sol";
import {PriceMath} from "../libraries/PriceMath.sol";
import {Constants} from "../libraries/Constants.sol";

/// @title PriceFeed — Chainlink oracle wrapper with safety checks
/// @notice Provides manipulation-resistant prices for the protocol.
/// @dev Safety layers:
///   1. Staleness check — revert if oracle data is too old
///   2. Deviation check — revert if price moved too much between rounds
///   3. Sequencer uptime check — revert if Arbitrum L2 sequencer is down or just restarted
///   4. Spread pricing — different prices for opening vs closing (anti-sandwich)
contract PriceFeed is IPriceFeed, Ownable {
    // --- Storage ---

    /// @notice Chainlink feed per index token (e.g. WETH => ETH/USD feed)
    mapping(address => address) public feeds;

    /// @notice Price spread per token in basis points (applied +/- to mid price)
    mapping(address => uint256) public spreadBasisPoints;

    /// @notice L2 sequencer uptime feed (Arbitrum-specific, address(0) to disable)
    IChainlinkAggregator public sequencerUptimeFeed;

    /// @notice Maximum allowed staleness (seconds)
    uint256 public stalenessThreshold;

    /// @notice Maximum allowed deviation between consecutive rounds (basis points)
    uint256 public maxDeviationBps;

    /// @notice Grace period after sequencer comes back up (seconds)
    uint256 public sequencerGracePeriod;

    // --- Events ---

    event FeedUpdated(address indexed token, address indexed feed);
    event SpreadUpdated(address indexed token, uint256 spreadBps);
    event SequencerFeedUpdated(address indexed feed);
    event StalenessThresholdUpdated(uint256 threshold);

    // --- Errors ---

    error PriceFeed__NoFeed(address token);
    error PriceFeed__StalePrice(address token, uint256 updatedAt, uint256 threshold);
    error PriceFeed__InvalidPrice(address token, int256 answer);
    error PriceFeed__ExcessiveDeviation(address token, int256 currentPrice, int256 previousPrice);
    error PriceFeed__SequencerDown();
    error PriceFeed__SequencerGracePeriod(uint256 timeSinceUp);
    error PriceFeed__ZeroAddress();
    error PriceFeed__SpreadTooHigh(uint256 spreadBps, uint256 maxBps);

    uint256 public constant MAX_SPREAD_BPS = 200; // 2% max spread

    constructor(address initialOwner) Ownable(initialOwner) {
        stalenessThreshold = Constants.PRICE_STALENESS_THRESHOLD;
        maxDeviationBps = Constants.MAX_PRICE_DEVIATION_BPS;
        sequencerGracePeriod = Constants.SEQUENCER_GRACE_PERIOD;
    }

    // --- Admin ---

    /// @notice Set Chainlink feed for a token
    function setFeed(address token, address feed) external onlyOwner {
        if (token == address(0) || feed == address(0)) revert PriceFeed__ZeroAddress();
        feeds[token] = feed;
        emit FeedUpdated(token, feed);
    }

    /// @notice Set price spread for a token (basis points, applied +/- to mid)
    function setSpreadBasisPoints(address token, uint256 spreadBps) external onlyOwner {
        if (spreadBps > MAX_SPREAD_BPS) revert PriceFeed__SpreadTooHigh(spreadBps, MAX_SPREAD_BPS);
        spreadBasisPoints[token] = spreadBps;
        emit SpreadUpdated(token, spreadBps);
    }

    /// @notice Set the L2 sequencer uptime feed (set to address(0) to disable)
    function setSequencerUptimeFeed(address feed) external onlyOwner {
        sequencerUptimeFeed = IChainlinkAggregator(feed);
        emit SequencerFeedUpdated(feed);
    }

    /// @notice Update staleness threshold
    function setStalenessThreshold(uint256 threshold) external onlyOwner {
        stalenessThreshold = threshold;
        emit StalenessThresholdUpdated(threshold);
    }

    // --- IPriceFeed ---

    /// @inheritdoc IPriceFeed
    function getPrice(address token, bool maximise) external view override returns (uint256 price) {
        _checkSequencer();
        price = _getValidatedPrice(token);

        uint256 spread = spreadBasisPoints[token];
        if (spread > 0) {
            if (maximise) {
                price = price + (price * spread) / Constants.BASIS_POINTS_DIVISOR;
            } else {
                price = price - (price * spread) / Constants.BASIS_POINTS_DIVISOR;
            }
        }
    }

    /// @inheritdoc IPriceFeed
    function getLatestPrice(address token) external view override returns (uint256 price) {
        _checkSequencer();
        price = _getValidatedPrice(token);
    }

    // --- Internal ---

    /// @dev Read and validate price from Chainlink feed
    function _getValidatedPrice(address token) internal view returns (uint256) {
        address feedAddr = feeds[token];
        if (feedAddr == address(0)) revert PriceFeed__NoFeed(token);

        IChainlinkAggregator feed = IChainlinkAggregator(feedAddr);
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
        ) = feed.latestRoundData();

        // Check 1: Valid price (positive)
        if (answer <= 0) revert PriceFeed__InvalidPrice(token, answer);

        // Check 2: Staleness
        if (block.timestamp - updatedAt > stalenessThreshold) {
            revert PriceFeed__StalePrice(token, updatedAt, stalenessThreshold);
        }

        // Check 3: Deviation from previous round (skip on phase boundary)
        // Chainlink roundId encodes (phaseId << 64 | aggregatorRoundId).
        // Only compare within the same phase to avoid cross-phase contamination.
        uint64 aggregatorRoundId = uint64(roundId);
        if (aggregatorRoundId > 1) {
            (
                ,
                int256 prevAnswer,
                ,
                ,
            ) = feed.getRoundData(roundId - 1);

            if (prevAnswer > 0) {
                uint256 deviation = _calculateDeviation(answer, prevAnswer);
                if (deviation > maxDeviationBps) {
                    revert PriceFeed__ExcessiveDeviation(token, answer, prevAnswer);
                }
            }
        }

        uint8 decimals = feed.decimals();
        return PriceMath.chainlinkToInternal(answer, decimals);
    }

    /// @dev Check Arbitrum L2 sequencer status
    function _checkSequencer() internal view {
        if (address(sequencerUptimeFeed) == address(0)) return;

        (
            ,
            int256 answer,
            uint256 startedAt,
            ,
        ) = sequencerUptimeFeed.latestRoundData();

        // answer == 0 means sequencer is up, answer == 1 means down
        if (answer != 0) revert PriceFeed__SequencerDown();

        // Enforce grace period after sequencer comes back up
        uint256 timeSinceUp = block.timestamp - startedAt;
        if (timeSinceUp < sequencerGracePeriod) {
            revert PriceFeed__SequencerGracePeriod(timeSinceUp);
        }
    }

    /// @dev Calculate percentage deviation between two prices in basis points
    function _calculateDeviation(int256 price1, int256 price2) internal pure returns (uint256) {
        uint256 p1 = uint256(price1);
        uint256 p2 = uint256(price2);

        uint256 diff = p1 > p2 ? p1 - p2 : p2 - p1;
        uint256 base = p1 < p2 ? p1 : p2; // use smaller as base (conservative)

        if (base == 0) return type(uint256).max;
        return (diff * Constants.BASIS_POINTS_DIVISOR) / base;
    }
}
