// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestSetup} from "../helpers/TestSetup.sol";
import {Vault} from "../../src/core/Vault.sol";
import {PLP} from "../../src/tokens/PLP.sol";
import {Constants} from "../../src/libraries/Constants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VaultTest is TestSetup {
    Vault internal vault;
    PLP internal plp;

    function setUp() public {
        _setUp();

        vm.startPrank(admin);

        // Deploy PLP and Vault
        plp = new PLP(admin);
        vault = new Vault(address(usdc), address(plp), admin);

        // Transfer minter to Vault
        plp.setMinter(address(vault));

        // Set a fake position manager for pool accounting tests
        vault.setPositionManager(keeper);

        vm.stopPrank();

        // Approve vault to spend USDC for alice and bob
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);

        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ============================================================
    //                   deposit — first deposit 1:1
    // ============================================================

    function test_deposit_firstDeposit_1to1() public {
        uint256 amount = 10_000e6; // $10,000

        vm.prank(alice);
        uint256 plpAmount = vault.deposit(amount);

        assertEq(plpAmount, amount, "first deposit should be 1:1");
        assertEq(plp.balanceOf(alice), amount);
        assertEq(vault.poolAmount(), amount);
        assertEq(usdc.balanceOf(address(vault)), amount);
    }

    // ============================================================
    //                   deposit — proportional
    // ============================================================

    function test_deposit_proportional() public {
        // Alice deposits first
        vm.prank(alice);
        vault.deposit(10_000e6);

        // Bob deposits same amount → should get same PLP
        vm.prank(bob);
        uint256 plpAmount = vault.deposit(10_000e6);

        assertEq(plpAmount, 10_000e6);
        assertEq(plp.balanceOf(bob), 10_000e6);
        assertEq(vault.poolAmount(), 20_000e6);
    }

    function test_deposit_proportional_afterPoolGrowth() public {
        // Alice deposits $10,000
        vm.prank(alice);
        vault.deposit(10_000e6);

        // Pool grows (trader losses): poolAmount increases without new PLP minted
        // Simulate actual USDC arriving (e.g. from position close)
        usdc.mint(address(vault), 5_000e6);
        vm.prank(keeper);
        vault.increasePoolAmount(5_000e6);
        // Pool = $15,000, total PLP = 10,000

        // Bob deposits $15,000
        vm.prank(bob);
        uint256 plpAmount = vault.deposit(15_000e6);

        // plpAmount = 15,000e6 * 10,000e6 / 15,000e6 = 10,000e6
        assertEq(plpAmount, 10_000e6, "Bob should get proportional PLP");
        assertEq(vault.poolAmount(), 30_000e6);
    }

    // ============================================================
    //                   deposit — zero amount reverts
    // ============================================================

    function test_deposit_zeroAmount_reverts() public {
        vm.prank(alice);
        vm.expectRevert(Vault.Vault__ZeroAmount.selector);
        vault.deposit(0);
    }

    // ============================================================
    //                   withdraw — proportional
    // ============================================================

    function test_withdraw_fullWithdraw() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        uint256 balBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        uint256 usdcOut = vault.withdraw(10_000e6);

        assertEq(usdcOut, 10_000e6);
        assertEq(usdc.balanceOf(alice), balBefore + 10_000e6);
        assertEq(plp.balanceOf(alice), 0);
        assertEq(vault.poolAmount(), 0);
    }

    function test_withdraw_afterPoolGrowth() public {
        // Alice deposits $10,000
        vm.prank(alice);
        vault.deposit(10_000e6);

        // Pool grows $5,000 (trader losses) — mint USDC to vault to back it
        usdc.mint(address(vault), 5_000e6);
        vm.prank(keeper);
        vault.increasePoolAmount(5_000e6);

        // Alice withdraws all PLP — should get $15,000
        vm.prank(alice);
        uint256 usdcOut = vault.withdraw(10_000e6);

        assertEq(usdcOut, 15_000e6, "Alice should receive pool growth");
    }

    function test_withdraw_afterPoolShrink() public {
        // Alice deposits $10,000
        vm.prank(alice);
        vault.deposit(10_000e6);

        // Pool shrinks $3,000 (trader profits)
        vm.prank(keeper);
        vault.decreasePoolAmount(3_000e6);

        // Alice withdraws — should get $7,000
        vm.prank(alice);
        uint256 usdcOut = vault.withdraw(10_000e6);

        assertEq(usdcOut, 7_000e6, "Alice bears trader profit losses");
    }

    // ============================================================
    //                   withdraw — zero amount reverts
    // ============================================================

    function test_withdraw_zeroAmount_reverts() public {
        vm.prank(alice);
        vm.expectRevert(Vault.Vault__ZeroAmount.selector);
        vault.withdraw(0);
    }

    // ============================================================
    //                   withdraw — insufficient liquidity
    // ============================================================

    function test_withdraw_insufficientLiquidity_reverts() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        // Reserve 9,000 USDC
        vm.prank(keeper);
        vault.increaseReserved(8_000e6); // 80% utilization

        // Try to withdraw all — only 2,000 available
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Vault.Vault__InsufficientLiquidity.selector, uint256(2_000e6), uint256(10_000e6))
        );
        vault.withdraw(10_000e6);
    }

    // ============================================================
    //                   multi-LP share fairness
    // ============================================================

    function test_multiLP_fairShares() public {
        // Alice deposits $10,000
        vm.prank(alice);
        vault.deposit(10_000e6);

        // Bob deposits $10,000
        vm.prank(bob);
        vault.deposit(10_000e6);

        // Pool grows $4,000 (trader losses) — mint USDC to vault to back it
        usdc.mint(address(vault), 4_000e6);
        vm.prank(keeper);
        vault.increasePoolAmount(4_000e6);

        // Pool = $24,000, each has 10,000 PLP out of 20,000 total = 50%
        // Each should get $12,000

        vm.prank(alice);
        uint256 aliceOut = vault.withdraw(10_000e6);

        vm.prank(bob);
        uint256 bobOut = vault.withdraw(10_000e6);

        assertEq(aliceOut, 12_000e6, "Alice gets fair share");
        assertEq(bobOut, 12_000e6, "Bob gets fair share");
        assertEq(vault.poolAmount(), 0);
    }

    // ============================================================
    //                   pause / unpause
    // ============================================================

    function test_deposit_whenPaused_reverts() public {
        vm.prank(admin);
        vault.pause();

        vm.prank(alice);
        vm.expectRevert();
        vault.deposit(1_000e6);
    }

    function test_withdraw_whenPaused_reverts() public {
        vm.prank(alice);
        vault.deposit(1_000e6);

        vm.prank(admin);
        vault.pause();

        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(1_000e6);
    }

    function test_depositWithdraw_afterUnpause_succeeds() public {
        vm.prank(admin);
        vault.pause();

        vm.prank(admin);
        vault.unpause();

        vm.prank(alice);
        vault.deposit(1_000e6);

        vm.prank(alice);
        vault.withdraw(1_000e6);
    }

    // ============================================================
    //                   pool accounting — onlyPositionManager
    // ============================================================

    function test_increasePoolAmount_onlyPositionManager() public {
        vm.prank(alice);
        vm.expectRevert(Vault.Vault__OnlyPositionManager.selector);
        vault.increasePoolAmount(1_000e6);
    }

    function test_decreasePoolAmount_onlyPositionManager() public {
        vm.prank(alice);
        vm.expectRevert(Vault.Vault__OnlyPositionManager.selector);
        vault.decreasePoolAmount(1_000e6);
    }

    function test_increaseReserved_onlyPositionManager() public {
        vm.prank(alice);
        vm.expectRevert(Vault.Vault__OnlyPositionManager.selector);
        vault.increaseReserved(1_000e6);
    }

    function test_decreaseReserved_onlyPositionManager() public {
        vm.prank(alice);
        vm.expectRevert(Vault.Vault__OnlyPositionManager.selector);
        vault.decreaseReserved(1_000e6);
    }

    // ============================================================
    //                   reserved / utilization
    // ============================================================

    function test_increaseReserved_withinUtilization() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        // 80% of 10,000 = 8,000 max reserved
        vm.prank(keeper);
        vault.increaseReserved(8_000e6);

        assertEq(vault.reservedAmount(), 8_000e6);
    }

    function test_increaseReserved_exceedsUtilization_reverts() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        // Try to reserve 8,001 — exceeds 80% of 10,000
        vm.prank(keeper);
        uint256 maxReserved = (10_000e6 * Constants.MAX_UTILIZATION_BPS) / Constants.BASIS_POINTS_DIVISOR;
        vm.expectRevert(
            abi.encodeWithSelector(
                Vault.Vault__UtilizationExceeded.selector,
                uint256(8_001e6),
                maxReserved
            )
        );
        vault.increaseReserved(8_001e6);
    }

    function test_decreaseReserved_partial() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        vm.prank(keeper);
        vault.increaseReserved(5_000e6);

        vm.prank(keeper);
        vault.decreaseReserved(3_000e6);

        assertEq(vault.reservedAmount(), 2_000e6);
    }

    function test_decreaseReserved_exceedsBalance_setsZero() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        vm.prank(keeper);
        vault.increaseReserved(5_000e6);

        // Decrease more than reserved → should clamp to 0
        vm.prank(keeper);
        vault.decreaseReserved(10_000e6);

        assertEq(vault.reservedAmount(), 0);
    }

    // ============================================================
    //                   decreasePoolAmount — insufficient
    // ============================================================

    function test_decreasePoolAmount_exceedsPool_reverts() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(Vault.Vault__InsufficientLiquidity.selector, uint256(10_000e6), uint256(20_000e6))
        );
        vault.decreasePoolAmount(20_000e6);
    }

    // ============================================================
    //                   read functions
    // ============================================================

    function test_getAvailableLiquidity() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        vm.prank(keeper);
        vault.increaseReserved(3_000e6);

        assertEq(vault.getAvailableLiquidity(), 7_000e6);
    }

    function test_getAum() public {
        vm.prank(alice);
        vault.deposit(10_000e6);

        assertEq(vault.getAum(), 10_000e6);
    }

    // ============================================================
    //                   admin — setPositionManager
    // ============================================================

    function test_setPositionManager_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setPositionManager(alice);
    }

    function test_setPositionManager() public {
        vm.prank(admin);
        vault.setPositionManager(bob);
        assertEq(vault.positionManager(), bob);
    }

    // ============================================================
    //                   PLP token — minter access
    // ============================================================

    function test_plpMint_onlyVault() public {
        vm.prank(alice);
        vm.expectRevert();
        plp.mint(alice, 1_000e6);
    }

    function test_plpBurn_onlyVault() public {
        vm.prank(alice);
        vm.expectRevert();
        plp.burn(alice, 1_000e6);
    }
}
