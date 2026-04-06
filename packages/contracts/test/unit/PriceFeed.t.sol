// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestSetup} from "../helpers/TestSetup.sol";
import {MockChainlinkAggregator} from "../helpers/MockChainlinkAggregator.sol";
import {PriceFeed} from "../../src/oracle/PriceFeed.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {PriceMath} from "../../src/libraries/PriceMath.sol";

contract PriceFeedTest is TestSetup {
    PriceFeed internal priceFeed;

    function setUp() public {
        _setUp();

        vm.startPrank(admin);
        priceFeed = new PriceFeed(admin);
        priceFeed.setFeed(address(weth), address(ethOracle));
        priceFeed.setFeed(address(wbtc), address(btcOracle));
        vm.stopPrank();
    }

    // ============================================================
    //                   getLatestPrice — happy path
    // ============================================================

    function test_getLatestPrice_eth() public view {
        uint256 price = priceFeed.getLatestPrice(address(weth));
        // ETH_PRICE = 3500e8, internal = 3500e8 * 1e22 = 3500e30
        assertEq(price, 3500 * Constants.PRICE_PRECISION);
    }

    function test_getLatestPrice_btc() public view {
        uint256 price = priceFeed.getLatestPrice(address(wbtc));
        assertEq(price, 65000 * Constants.PRICE_PRECISION);
    }

    // ============================================================
    //                   getPrice — spread pricing
    // ============================================================

    function test_getPrice_noSpread() public view {
        uint256 priceMax = priceFeed.getPrice(address(weth), true);
        uint256 priceMin = priceFeed.getPrice(address(weth), false);
        // No spread set → both equal mid
        assertEq(priceMax, priceMin);
    }

    function test_getPrice_withSpread() public {
        vm.prank(admin);
        priceFeed.setSpreadBasisPoints(address(weth), 30); // 0.3%

        uint256 mid = 3500 * Constants.PRICE_PRECISION;
        uint256 priceMax = priceFeed.getPrice(address(weth), true);
        uint256 priceMin = priceFeed.getPrice(address(weth), false);

        uint256 spreadAmount = (mid * 30) / Constants.BASIS_POINTS_DIVISOR;
        assertEq(priceMax, mid + spreadAmount);
        assertEq(priceMin, mid - spreadAmount);
        assertGt(priceMax, priceMin);
    }

    // ============================================================
    //                   no feed → revert
    // ============================================================

    function test_getLatestPrice_noFeed_reverts() public {
        address unknown = makeAddr("unknown_token");
        vm.expectRevert(abi.encodeWithSelector(PriceFeed.PriceFeed__NoFeed.selector, unknown));
        priceFeed.getLatestPrice(unknown);
    }

    // ============================================================
    //                   zero / negative price → revert
    // ============================================================

    function test_getLatestPrice_zeroPrice_reverts() public {
        ethOracle.setLatestAnswer(0);
        vm.expectRevert(
            abi.encodeWithSelector(PriceFeed.PriceFeed__InvalidPrice.selector, address(weth), int256(0))
        );
        priceFeed.getLatestPrice(address(weth));
    }

    function test_getLatestPrice_negativePrice_reverts() public {
        ethOracle.setLatestAnswer(-100);
        vm.expectRevert(
            abi.encodeWithSelector(PriceFeed.PriceFeed__InvalidPrice.selector, address(weth), int256(-100))
        );
        priceFeed.getLatestPrice(address(weth));
    }

    // ============================================================
    //                   staleness → revert
    // ============================================================

    function test_getLatestPrice_stalePrice_reverts() public {
        // Warp to a reasonable timestamp (Foundry starts at 1)
        vm.warp(100_000);
        uint256 staleTime = block.timestamp - Constants.PRICE_STALENESS_THRESHOLD - 1;
        ethOracle.setLatestAnswerWithTimestamp(ETH_PRICE, staleTime);

        vm.expectRevert(
            abi.encodeWithSelector(
                PriceFeed.PriceFeed__StalePrice.selector,
                address(weth),
                staleTime,
                Constants.PRICE_STALENESS_THRESHOLD
            )
        );
        priceFeed.getLatestPrice(address(weth));
    }

    function test_getLatestPrice_freshPrice_doesNotRevert() public view {
        // Price set in setUp is fresh (block.timestamp)
        priceFeed.getLatestPrice(address(weth));
    }

    // ============================================================
    //                   deviation → revert
    // ============================================================

    function test_getLatestPrice_excessiveDeviation_reverts() public {
        // Set a normal price first
        ethOracle.setLatestAnswer(3500e8);

        // Now set a price that's >10% different (e.g. 50% jump)
        ethOracle.setLatestAnswer(5250e8); // 50% increase

        vm.expectRevert(
            abi.encodeWithSelector(
                PriceFeed.PriceFeed__ExcessiveDeviation.selector,
                address(weth),
                int256(5250e8),
                int256(3500e8)
            )
        );
        priceFeed.getLatestPrice(address(weth));
    }

    function test_getLatestPrice_withinDeviation_doesNotRevert() public {
        ethOracle.setLatestAnswer(3500e8);
        // 5% increase — within 10% threshold
        ethOracle.setLatestAnswer(3675e8);
        uint256 price = priceFeed.getLatestPrice(address(weth));
        assertEq(price, 3675 * Constants.PRICE_PRECISION);
    }

    // ============================================================
    //                   sequencer uptime feed
    // ============================================================

    function test_getLatestPrice_sequencerDown_reverts() public {
        // Deploy a mock for sequencer feed
        MockChainlinkAggregator seqFeed = new MockChainlinkAggregator(0, "Sequencer Uptime");

        vm.prank(admin);
        priceFeed.setSequencerUptimeFeed(address(seqFeed));

        // answer = 1 means sequencer is DOWN
        seqFeed.setLatestAnswer(1);

        vm.expectRevert(PriceFeed.PriceFeed__SequencerDown.selector);
        priceFeed.getLatestPrice(address(weth));
    }

    function test_getLatestPrice_sequencerGracePeriod_reverts() public {
        vm.warp(100_000);
        MockChainlinkAggregator seqFeed = new MockChainlinkAggregator(0, "Sequencer Uptime");

        vm.prank(admin);
        priceFeed.setSequencerUptimeFeed(address(seqFeed));

        // Sequencer is UP (answer=0), but just came back up (startedAt = now - 10 seconds)
        seqFeed.setLatestAnswerWithTimestamp(0, block.timestamp - 10);

        vm.expectRevert(
            abi.encodeWithSelector(PriceFeed.PriceFeed__SequencerGracePeriod.selector, uint256(10))
        );
        priceFeed.getLatestPrice(address(weth));
    }

    function test_getLatestPrice_sequencerUp_afterGracePeriod_succeeds() public {
        vm.warp(100_000);
        // Re-set ETH price so updatedAt is fresh after warp
        ethOracle.setLatestAnswer(ETH_PRICE);

        MockChainlinkAggregator seqFeed = new MockChainlinkAggregator(0, "Sequencer Uptime");

        vm.prank(admin);
        priceFeed.setSequencerUptimeFeed(address(seqFeed));

        // Sequencer up for > grace period
        seqFeed.setLatestAnswerWithTimestamp(0, block.timestamp - Constants.SEQUENCER_GRACE_PERIOD - 1);

        // Should succeed
        uint256 price = priceFeed.getLatestPrice(address(weth));
        assertEq(price, 3500 * Constants.PRICE_PRECISION);
    }

    function test_getLatestPrice_noSequencerFeed_succeeds() public view {
        // No sequencer feed set (default address(0)) → skip check
        priceFeed.getLatestPrice(address(weth));
    }

    // ============================================================
    //                   admin functions
    // ============================================================

    function test_setFeed_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        priceFeed.setFeed(address(weth), address(ethOracle));
    }

    function test_setSpreadBasisPoints_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        priceFeed.setSpreadBasisPoints(address(weth), 30);
    }

    function test_setStalenessThreshold() public {
        vm.prank(admin);
        priceFeed.setStalenessThreshold(7200);
        assertEq(priceFeed.stalenessThreshold(), 7200);
    }

    // ============================================================
    //                   price update flow
    // ============================================================

    function test_priceUpdatesCorrectly() public {
        // Initial ETH price
        assertEq(priceFeed.getLatestPrice(address(weth)), 3500 * Constants.PRICE_PRECISION);

        // Update within deviation
        ethOracle.setLatestAnswer(3600e8);
        assertEq(priceFeed.getLatestPrice(address(weth)), 3600 * Constants.PRICE_PRECISION);

        // Another update
        ethOracle.setLatestAnswer(3550e8);
        assertEq(priceFeed.getLatestPrice(address(weth)), 3550 * Constants.PRICE_PRECISION);
    }
}
