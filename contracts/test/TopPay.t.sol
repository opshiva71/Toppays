// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {TopPay} from "../TopPay.sol";
import {TopPayTestBase, Acceptor, Rejecter, NoReceive} from "./TopPay.Base.t.sol";

/// send(), constants/getters, and "no receive/fallback".
contract TopPayTest is TopPayTestBase {
    // ---------------- constants / getters ----------------

    function test_Identifier() public view {
        // The tag is frozen at the contract's original name so earlier deployments stay recognized.
        assertEq(arc.identifier(), keccak256("ArcSend.v2"));
        assertEq(arc.IDENTIFIER(), keccak256("ArcSend.v2"));
    }

    function test_Constants() public view {
        assertEq(arc.MAX_BATCH(), 100);
        assertEq(arc.MIN_RECIPIENT_GAS(), 30_000);
        assertEq(arc.MAX_RECIPIENT_GAS(), 500_000);
        assertEq(arc.SETTLEMENT_GAS_RESERVE(), 60_000);
        assertEq(arc.MIN_ESCROW_DURATION(), 1 hours);
        assertEq(arc.MAX_ESCROW_DURATION(), 365 days);
        assertEq(arc.nextRequestId(), 1);
        assertEq(arc.nextEscrowId(), 1);
    }

    function test_GetRequestZeroedForUnknownId() public view {
        TopPay.Request memory r = arc.getRequest(12345);
        assertEq(r.payee, address(0));
        assertEq(r.status, 0);
        assertEq(r.expiry, 0);
        assertEq(r.payer, address(0));
        assertEq(r.amount, 0);
        assertEq(r.memo, bytes32(0));
        TopPay.Request memory r0 = arc.getRequest(0);
        assertEq(r0.status, 0);
    }

    function test_GetEscrowZeroedForUnknownId() public view {
        TopPay.Escrow memory e = arc.getEscrow(12345);
        assertEq(e.payer, address(0));
        assertEq(e.status, 0);
        assertEq(e.deadline, 0);
        assertEq(e.payee, address(0));
        assertEq(e.amount, 0);
        assertEq(e.memo, bytes32(0));
        assertEq(e.refundTo, address(0));
        assertEq(arc.getEscrow(0).status, 0);
    }

    // ---------------- no receive / fallback ----------------

    function test_PlainTransferReverts() public {
        vm.prank(alice);
        (bool ok,) = address(arc).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(arc).balance, 0);
    }

    function test_PlainZeroValueCallReverts() public {
        vm.prank(alice);
        (bool ok,) = address(arc).call("");
        assertFalse(ok);
    }

    function test_UnknownCalldataReverts() public {
        vm.prank(alice);
        (bool ok,) = address(arc).call{value: 1 ether}(hex"deadbeef");
        assertFalse(ok);
        vm.prank(alice);
        (ok,) = address(arc).call(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(arc).balance, 0);
    }

    // ---------------- send: happy path ----------------

    function test_Send_ForwardsExactAmountAndKeepsNothing() public {
        uint256 bobBefore = bob.balance;
        uint256 aliceBefore = alice.balance;

        vm.prank(alice);
        arc.send{value: 5 ether}(payable(bob), MEMO);

        assertEq(bob.balance, bobBefore + 5 ether);
        assertEq(alice.balance, aliceBefore - 5 ether);
        assertEq(address(arc).balance, 0);
    }

    function test_Send_EmitsPaymentWithIndexedFields() public {
        vm.expectEmit(true, true, true, true, address(arc));
        emit TopPay.Payment(alice, bob, 3 ether, MEMO);
        vm.prank(alice);
        arc.send{value: 3 ether}(payable(bob), MEMO);
    }

    function test_Send_PaymentLogShape() public {
        vm.recordLogs();
        vm.prank(alice);
        arc.send{value: 3 ether}(payable(bob), MEMO);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(arc));
        assertEq(logs[0].topics.length, 4);
        assertEq(logs[0].topics[0], TopPay.Payment.selector);
        assertEq(logs[0].topics[1], bytes32(uint256(uint160(alice))));
        assertEq(logs[0].topics[2], bytes32(uint256(uint160(bob))));
        assertEq(logs[0].topics[3], MEMO);
        assertEq(abi.decode(logs[0].data, (uint256)), 3 ether);
    }

    function test_Send_OneWei() public {
        uint256 before = bob.balance;
        vm.prank(alice);
        arc.send{value: 1}(payable(bob), bytes32(0));
        assertEq(bob.balance, before + 1);
    }

    function test_Send_ToAcceptingContract() public {
        Acceptor acc = new Acceptor();
        vm.prank(alice);
        arc.send{value: 2 ether}(payable(address(acc)), MEMO);
        assertEq(address(acc).balance, 2 ether);
        assertEq(address(arc).balance, 0);
    }

    // ---------------- send: reverts ----------------

    function test_Send_RevertsZeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(TopPay.ZeroAddress.selector);
        arc.send{value: 1 ether}(payable(address(0)), MEMO);
    }

    function test_Send_RevertsSelfTarget() public {
        vm.prank(alice);
        vm.expectRevert(TopPay.SelfTarget.selector);
        arc.send{value: 1 ether}(payable(address(arc)), MEMO);
    }

    function test_Send_RevertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TopPay.ZeroAmount.selector);
        arc.send{value: 0}(payable(bob), MEMO);
    }

    function test_Send_RevertsRejectingRecipient() public {
        Rejecter rej = new Rejecter();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(rej), 1 ether));
        arc.send{value: 1 ether}(payable(address(rej)), MEMO);
    }

    function test_Send_RevertsNoReceiveRecipient() public {
        NoReceive nr = new NoReceive();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(nr), 2 ether));
        arc.send{value: 2 ether}(payable(address(nr)), MEMO);
    }

    /// A failed send reverts as a whole: the Payment log is rolled back with it and nothing is debited.
    function test_Send_FailedSendEmitsNoPaymentAndDebitsNothing() public {
        Rejecter rej = new Rejecter();
        uint256 aliceBefore = alice.balance;

        vm.prank(alice);
        (bool ok, bytes memory ret) = address(arc).call{value: 1 ether}(
            abi.encodeCall(TopPay.send, (payable(address(rej)), MEMO))
        );
        // Whole call reverted => EVM discards the Payment log emitted before the transfer.
        assertFalse(ok);
        assertEq(
            ret, abi.encodeWithSelector(TopPay.TransferFailed.selector, address(rej), 1 ether)
        );
        assertEq(alice.balance, aliceBefore, "nothing debited");
        assertEq(address(rej).balance, 0);
        assertEq(address(arc).balance, 0);
    }
}
