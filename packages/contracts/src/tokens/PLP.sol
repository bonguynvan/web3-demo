// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPLP} from "../interfaces/IPLP.sol";

/// @title PLP — Perp Liquidity Provider token
/// @notice ERC20 token representing shares of the Vault liquidity pool.
///         Only the Vault (minter) can mint and burn PLP tokens.
contract PLP is ERC20, IPLP {
    address public minter;

    error PLP__OnlyMinter();
    error PLP__ZeroAddress();

    event MinterUpdated(address indexed newMinter);

    modifier onlyMinter() {
        if (msg.sender != minter) revert PLP__OnlyMinter();
        _;
    }

    constructor(address _minter) ERC20("Perp Liquidity Provider", "PLP") {
        if (_minter == address(0)) revert PLP__ZeroAddress();
        minter = _minter;
    }

    /// @notice Transfer minter role (only current minter)
    function setMinter(address newMinter) external onlyMinter {
        if (newMinter == address(0)) revert PLP__ZeroAddress();
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    /// @inheritdoc IPLP
    function mint(address to, uint256 amount) external override onlyMinter {
        _mint(to, amount);
    }

    /// @inheritdoc IPLP
    function burn(address from, uint256 amount) external override onlyMinter {
        _burn(from, amount);
    }
}
