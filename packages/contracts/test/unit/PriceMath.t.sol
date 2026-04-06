// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PriceMath} from "../../src/libraries/PriceMath.sol";
import {Constants} from "../../src/libraries/Constants.sol";

contract PriceMathTest is Test {
    uint256 constant PRICE_PRECISION = Constants.PRICE_PRECISION;

    // ============================================================
    //                     usdcToInternal
    // ============================================================

    function test_usdcToInternal_oneDollar() public pure {
        // 1 USDC = 1e6, internal = 1e30
        assertEq(PriceMath.usdcToInternal(1e6), PRICE_PRECISION);
    }

    function test_usdcToInternal_fractional() public pure {
        // 0.50 USDC = 500_000, internal = 0.5e30
        assertEq(PriceMath.usdcToInternal(500_000), PRICE_PRECISION / 2);
    }

    function test_usdcToInternal_large() public pure {
        // $100,000 USDC = 100_000e6
        assertEq(PriceMath.usdcToInternal(100_000e6), 100_000 * PRICE_PRECISION);
    }

    function test_usdcToInternal_zero() public pure {
        assertEq(PriceMath.usdcToInternal(0), 0);
    }

    // ============================================================
    //                     internalToUsdc
    // ============================================================

    function test_internalToUsdc_oneDollar() public pure {
        assertEq(PriceMath.internalToUsdc(PRICE_PRECISION), 1e6);
    }

    function test_internalToUsdc_roundsDown() public pure {
        // $1.999999 in internal should round down to $1.999999 USDC (1_999_999)
        uint256 internal_ = PRICE_PRECISION + (PRICE_PRECISION - 1);
        uint256 usdc = PriceMath.internalToUsdc(internal_);
        // 2e30 - 1 in internal, divide by 1e24, should be < 2e6
        assertEq(usdc, 1_999_999);
    }

    // ============================================================
    //                   internalToUsdcRoundUp
    // ============================================================

    function test_internalToUsdcRoundUp_exact() public pure {
        // Exact amounts should not change
        assertEq(PriceMath.internalToUsdcRoundUp(PRICE_PRECISION), 1e6);
    }

    function test_internalToUsdcRoundUp_roundsUp() public pure {
        // Anything slightly over $1 should round up to 2 USDC units (1_000_001)
        uint256 internal_ = PRICE_PRECISION + 1;
        uint256 usdc = PriceMath.internalToUsdcRoundUp(internal_);
        assertEq(usdc, 1_000_001);
    }

    // ============================================================
    //                   chainlinkToInternal
    // ============================================================

    function test_chainlinkToInternal_ethPrice() public pure {
        // ETH = $3500 from Chainlink (8 dec) = 3500_00000000
        uint256 internal_ = PriceMath.chainlinkToInternal(3500e8, 8);
        assertEq(internal_, 3500 * PRICE_PRECISION);
    }

    function test_chainlinkToInternal_btcPrice() public pure {
        // BTC = $65000 from Chainlink (8 dec)
        uint256 internal_ = PriceMath.chainlinkToInternal(65000e8, 8);
        assertEq(internal_, 65000 * PRICE_PRECISION);
    }

    function test_chainlinkToInternal_fractionalPrice() public pure {
        // Token at $0.50 from Chainlink = 50_000_000 (8 dec)
        uint256 internal_ = PriceMath.chainlinkToInternal(50_000_000, 8);
        assertEq(internal_, PRICE_PRECISION / 2);
    }

    function test_chainlinkToInternal_revertsOnZero() public {
        vm.expectRevert("PriceMath: invalid price");
        this.externalChainlinkToInternal(0, 8);
    }

    function test_chainlinkToInternal_revertsOnNegative() public {
        vm.expectRevert("PriceMath: invalid price");
        this.externalChainlinkToInternal(-1, 8);
    }

    /// @dev External wrapper to make library revert testable
    function externalChainlinkToInternal(int256 answer, uint8 decimals_) external pure returns (uint256) {
        return PriceMath.chainlinkToInternal(answer, decimals_);
    }

    // ============================================================
    //                  Roundtrip consistency
    // ============================================================

    function test_roundtrip_usdcToInternalToUsdc() public pure {
        // Converting USDC -> internal -> USDC should be lossless
        uint256 original = 12_345_678; // $12.345678
        uint256 internal_ = PriceMath.usdcToInternal(original);
        uint256 recovered = PriceMath.internalToUsdc(internal_);
        assertEq(recovered, original);
    }
}
