// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MockERC20} from "./MockERC20.sol";
import {MockChainlinkAggregator} from "./MockChainlinkAggregator.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @title TestSetup — base test contract with common fixtures
/// @dev Inherit from this to get pre-deployed mocks and helper functions.
///      Tests should call _setUp() in their own setUp().
abstract contract TestSetup is Test {
    // --- Actors ---
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal keeper = makeAddr("keeper");
    address internal admin = makeAddr("admin");

    // --- Mock tokens ---
    MockERC20 internal usdc;
    MockERC20 internal weth;  // Index token for ETH-PERP (not actually traded, just address)
    MockERC20 internal wbtc;  // Index token for BTC-PERP

    // --- Mock oracles ---
    MockChainlinkAggregator internal ethOracle;
    MockChainlinkAggregator internal btcOracle;

    // --- Common prices (Chainlink 8 dec) ---
    int256 internal constant ETH_PRICE = 3500e8;  // $3,500
    int256 internal constant BTC_PRICE = 65000e8;  // $65,000

    function _setUp() internal {
        vm.startPrank(admin);

        // Deploy mock tokens
        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        wbtc = new MockERC20("Wrapped Bitcoin", "WBTC", 8);

        // Deploy mock oracles
        ethOracle = new MockChainlinkAggregator(8, "ETH / USD");
        btcOracle = new MockChainlinkAggregator(8, "BTC / USD");

        // Set initial prices
        ethOracle.setLatestAnswer(ETH_PRICE);
        btcOracle.setLatestAnswer(BTC_PRICE);

        vm.stopPrank();

        // Fund test accounts with USDC
        _mintUsdc(alice, 100_000e6);   // $100,000
        _mintUsdc(bob, 100_000e6);
        _mintUsdc(keeper, 1_000e6);
    }

    // --- Helpers ---

    function _mintUsdc(address to, uint256 amount) internal {
        usdc.mint(to, amount);
    }

    /// @dev Convert a dollar amount to 30-decimal internal precision
    function _usd(uint256 dollars) internal pure returns (uint256) {
        return dollars * Constants.PRICE_PRECISION;
    }

    /// @dev Convert a USDC amount (6 dec) to internal precision (30 dec)
    function _usdcToInternal(uint256 usdcAmount) internal pure returns (uint256) {
        return usdcAmount * (Constants.PRICE_PRECISION / Constants.USDC_PRECISION);
    }

    /// @dev Set ETH price in the mock oracle
    function _setEthPrice(int256 price) internal {
        ethOracle.setLatestAnswer(price);
    }

    /// @dev Set BTC price in the mock oracle
    function _setBtcPrice(int256 price) internal {
        btcOracle.setLatestAnswer(price);
    }
}
