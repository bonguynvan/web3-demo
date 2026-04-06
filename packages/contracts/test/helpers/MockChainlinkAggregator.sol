// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IChainlinkAggregator} from "../../src/interfaces/IChainlinkAggregator.sol";

/// @title MockChainlinkAggregator — controllable oracle for testing
/// @dev Allows setting price, updatedAt, and round data for staleness/deviation tests
contract MockChainlinkAggregator is IChainlinkAggregator {
    uint8 private immutable _decimals;
    string private _description;

    int256 private _latestAnswer;
    uint256 private _latestUpdatedAt;
    uint80 private _latestRoundId;

    // Historical rounds for deviation testing
    mapping(uint80 => int256) private _roundAnswers;
    mapping(uint80 => uint256) private _roundUpdatedAt;

    constructor(uint8 decimals_, string memory description_) {
        _decimals = decimals_;
        _description = description_;
        _latestRoundId = 1;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external pure override returns (uint256) {
        return 4;
    }

    /// @notice Set the latest price and automatically advance the round
    function setLatestAnswer(int256 answer) external {
        _latestRoundId++;
        _latestAnswer = answer;
        _latestUpdatedAt = block.timestamp;
        _roundAnswers[_latestRoundId] = answer;
        _roundUpdatedAt[_latestRoundId] = block.timestamp;
    }

    /// @notice Set price with a specific updatedAt (for staleness testing)
    function setLatestAnswerWithTimestamp(int256 answer, uint256 updatedAt) external {
        _latestRoundId++;
        _latestAnswer = answer;
        _latestUpdatedAt = updatedAt;
        _roundAnswers[_latestRoundId] = answer;
        _roundUpdatedAt[_latestRoundId] = updatedAt;
    }

    /// @notice Set a specific historical round (for deviation testing)
    function setRoundData(uint80 roundId, int256 answer, uint256 updatedAt) external {
        _roundAnswers[roundId] = answer;
        _roundUpdatedAt[roundId] = updatedAt;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (
            _latestRoundId,
            _latestAnswer,
            _latestUpdatedAt,   // startedAt
            _latestUpdatedAt,   // updatedAt
            _latestRoundId      // answeredInRound
        );
    }

    function getRoundData(uint80 roundId)
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (
            roundId,
            _roundAnswers[roundId],
            _roundUpdatedAt[roundId],
            _roundUpdatedAt[roundId],
            roundId
        );
    }
}
