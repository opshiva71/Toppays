// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ArcSend
/// @notice Optional, stateless payment-receipt helper for Arc Mainnet (chain ID 5042).
/// @dev The app's normal send path is a plain native transfer, not this helper.
///      Amounts use native 18-decimal units: 1 USDC = 1e18, not the 6-decimal
///      ERC-20 view. Successful sends forward the full msg.value; direct plain
///      transfers revert. Forcibly delivered native funds cannot be prevented
///      or recovered by this stateless contract.
contract ArcSend {
    bytes32 public constant IDENTIFIER = keccak256("ArcSend.v1");

    error ZeroAddress();
    error SelfTarget();
    error ZeroAmount();
    error TransferFailed(address recipient, uint256 amount);

    event Payment(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed memo
    );

    /// @notice Forward native USDC and emit a payment receipt.
    /// @param to Recipient of the full native value.
    /// @param memo Application-defined receipt reference.
    /// @dev msg.value is in native 18-decimal units (1 USDC = 1e18).
    function send(address payable to, bytes32 memo) external payable {
        if (to == address(0)) revert ZeroAddress();
        if (to == address(this)) revert SelfTarget();
        if (msg.value == 0) revert ZeroAmount();

        // Emit before the external call so a re-entering recipient cannot reorder receipts.
        // If the transfer fails, the revert discards this event.
        emit Payment(msg.sender, to, msg.value, memo);

        (bool success, ) = to.call{value: msg.value}("");
        if (!success) revert TransferFailed(to, msg.value);
    }

    /// @notice Return the public version identifier for frontend verification.
    function identifier() external pure returns (bytes32) {
        return IDENTIFIER;
    }
}
