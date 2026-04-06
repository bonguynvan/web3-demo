// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Chainlink AggregatorV3Interface
/// @dev Minimal interface — avoids pulling the entire Chainlink repo as dependency.
///      Matches https://github.com/smartcontractkit/chainlink/blob/develop/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol
interface IChainlinkAggregator {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
