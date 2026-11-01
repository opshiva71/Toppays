// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ArcSend} from "../ArcSend.sol";
import {
    ArcSendTestBase, Rejecter, NoReceive, Acceptor, GasBurner, NoRefundSender
} from "./ArcSend.Base.t.sol";

/// sendBatchBestEffort
contract ArcSendBestEffortTest is ArcSendTestBase {
    uint256 internal constant G = 100_000;

    function test_BestEffort_AllSucceed() public {
        uint256 b = bob.balance;
        uint256 c = carol.balance;
        uint256 a = alice.balance;
        vm.prank(alice);
        uint256 refunded =
            arc.sendBatchBestEffort{value: 3 ether}(_t2(bob, carol), _a2(1 ether, 2 ether), _m(2), G);
        assertEq(refunded, 0);
        assertEq(bob.balance, b + 1 ether);
        assertEq(carol.balance, c + 2 ether);
        assertEq(alice.balance, a - 3 ether);
        assertEq(address(arc).balance, 0);
    }

    function test_BestEffort_AllSucceedEvents() public {
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, bob, 1 ether, bytes32(uint256(1)));
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, carol, 2 ether, bytes32(uint256(2)));
        vm.expectEmit(true, false, false, true, address(arc));
        emit ArcSend.BatchSent(alice, 3 ether, 2);
        vm.prank(alice);
        arc.sendBatchBestEffort{value: 3 ether}(_t2(bob, carol), _a2(1 ether, 2 ether), _m(2), G);
    }

    function test_BestEffort_RejectingRecipientSkippedAndRefunded() public {
        Rejecter rej = new Rejecter();
        uint256 b = bob.balance;
        uint256 d = dave.balance;
        uint256 a = alice.balance;

        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, bob, 1 ether, bytes32(uint256(1)));
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.PaymentSkipped(alice, address(rej), 2 ether, bytes32(uint256(2)));
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, dave, 3 ether, bytes32(uint256(3)));
        vm.expectEmit(true, false, false, true, address(arc));
        emit ArcSend.BatchSent(alice, 4 ether, 2);

        vm.prank(alice);
        uint256 refunded = arc.sendBatchBestEffort{value: 6 ether}(
            _t3(bob, address(rej), dave), _a3(1 ether, 2 ether, 3 ether), _m(3), G
        );

        assertEq(refunded, 2 ether);
        assertEq(bob.balance, b + 1 ether);
        assertEq(dave.balance, d + 3 ether);
        assertEq(address(rej).balance, 0);
        assertEq(alice.balance, a - 4 ether, "sender pays only successful amounts");
        assertEq(address(arc).balance, 0);
    }

    function test_BestEffort_NoReceiveRecipientSkipped() public {
        NoReceive nr = new NoReceive();
        uint256 a = alice.balance;
        vm.prank(alice);
        uint256 refunded =
            arc.sendBatchBestEffort{value: 2 ether}(_t2(address(nr), bob), _a2(1 ether, 1 ether), _m(2), G);
        assertEq(refunded, 1 ether);
        assertEq(alice.balance, a - 1 ether);
    }

    function test_BestEffort_AllFailingFullRefund() public {
        Rejecter r1 = new Rejecter();
        Rejecter r2 = new Rejecter();
        uint256 a = alice.balance;

        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.PaymentSkipped(alice, address(r1), 1 ether, bytes32(uint256(1)));
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.PaymentSkipped(alice, address(r2), 2 ether, bytes32(uint256(2)));
        vm.expectEmit(true, false, false, true, address(arc));
        emit ArcSend.BatchSent(alice, 0, 0);

        vm.prank(alice);
        uint256 refunded =
            arc.sendBatchBestEffort{value: 3 ether}(_t2(address(r1), address(r2)), _a2(1 ether, 2 ether), _m(2), G);
        assertEq(refunded, 3 ether);
        assertEq(alice.balance, a);
        assertEq(address(arc).balance, 0);
    }

    function test_BestEffort_NoPaymentEventForSkipped() public {
        Rejecter rej = new Rejecter();
        vm.recordLogs();
        vm.prank(alice);
        arc.sendBatchBestEffort{value: 1 ether}(_t1(address(rej)), _a1(1 ether), _m(1), G);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2); // PaymentSkipped + BatchSent
        assertEq(logs[0].topics[0], ArcSend.PaymentSkipped.selector);
        assertEq(logs[1].topics[0], ArcSend.BatchSent.selector);
    }

    // ---------- gas bounds ----------

    function test_BestEffort_InvalidGasLimitTooLow() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidGasLimit.selector, 29_999));
        arc.sendBatchBestEffort{value: 1 ether}(_t1(bob), _a1(1 ether), _m(1), 29_999);
    }

    function test_BestEffort_InvalidGasLimitTooHigh() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidGasLimit.selector, 500_001));
        arc.sendBatchBestEffort{value: 1 ether}(_t1(bob), _a1(1 ether), _m(1), 500_001);
    }

    function test_BestEffort_InvalidGasLimitZero() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidGasLimit.selector, 0));
        arc.sendBatchBestEffort{value: 1 ether}(_t1(bob), _a1(1 ether), _m(1), 0);
    }

    function test_BestEffort_GasLimitBoundsInclusive() public {
        uint256 b = bob.balance;
        vm.prank(alice);
        arc.sendBatchBestEffort{value: 1 ether}(_t1(bob), _a1(1 ether), _m(1), 30_000);
        vm.prank(alice);
        arc.sendBatchBestEffort{value: 1 ether}(_t1(bob), _a1(1 ether), _m(1), 500_000);
        assertEq(bob.balance, b + 2 ether);
    }

    function test_BestEffort_InsufficientGasReverts() public {
        uint256 a = alice.balance;
        vm.prank(alice);
        vm.expectPartialRevert(ArcSend.InsufficientGas.selector);
        arc.sendBatchBestEffort{value: 1 ether, gas: 60_000}(_t1(bob), _a1(1 ether), _m(1), 30_000);
        assertEq(alice.balance, a);
    }

    function test_BestEffort_InsufficientGasForLargeAllowance() public {
        vm.prank(alice);
        vm.expectPartialRevert(ArcSend.InsufficientGas.selector);
        arc.sendBatchBestEffort{value: 1 ether, gas: 400_000}(_t1(bob), _a1(1 ether), _m(1), 500_000);
    }

    function test_BestEffort_EnoughGasSucceeds() public {
        uint256 b = bob.balance;
        vm.prank(alice);
        arc.sendBatchBestEffort{value: 1 ether, gas: 300_000}(_t1(bob), _a1(1 ether), _m(1), 30_000);
        assertEq(bob.balance, b + 1 ether);
    }

    function test_BestEffort_GasBurnerSkippedBatchCompletes() public {
        GasBurner burner = new GasBurner();
        uint256 b = bob.balance;
        uint256 c = carol.balance;
        uint256 a = alice.balance;

        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.PaymentSkipped(alice, address(burner), 2 ether, bytes32(uint256(2)));

        vm.prank(alice);
        uint256 refunded = arc.sendBatchBestEffort{value: 6 ether}(
            _t3(bob, address(burner), carol), _a3(1 ether, 2 ether, 3 ether), _m(3), 30_000
        );
        assertEq(refunded, 2 ether);
        assertEq(bob.balance, b + 1 ether);
        assertEq(carol.balance, c + 3 ether);
        assertEq(address(burner).balance, 0);
        assertEq(alice.balance, a - 4 ether);
        assertEq(address(arc).balance, 0);
    }

    // ---------- validation ----------

    function test_BestEffort_RevertsIncorrectValue() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.IncorrectValue.selector, 2 ether, 3 ether));
        arc.sendBatchBestEffort{value: 2 ether}(_t2(bob, carol), _a2(1 ether, 2 ether), _m(2), G);
    }

    function test_BestEffort_RevertsLengthMismatch() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.LengthMismatch.selector, 2, 1, 2));
        arc.sendBatchBestEffort{value: 1 ether}(_t2(bob, carol), _a1(1 ether), _m(2), G);
    }

    function test_BestEffort_RevertsEmptyBatch() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.EmptyBatch.selector);
        arc.sendBatchBestEffort(new address payable[](0), new uint256[](0), new bytes32[](0), G);
    }

    function test_BestEffort_RevertsBatchTooLarge() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.BatchTooLarge.selector, 101));
        arc.sendBatchBestEffort{value: 101 ether}(_fresh(101), _same(101, 1 ether), _m(101), G);
    }

    function test_BestEffort_Max100Succeeds() public {
        address payable[] memory tos = _fresh(100);
        vm.prank(alice);
        uint256 refunded = arc.sendBatchBestEffort{value: 100 ether}(tos, _same(100, 1 ether), _m(100), 30_000);
        assertEq(refunded, 0);
        assertEq(tos[99].balance, 1 ether);
        assertEq(address(arc).balance, 0);
    }

    function test_BestEffort_RevertsZeroAddressItem() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAddress.selector);
        arc.sendBatchBestEffort{value: 2 ether}(_t2(bob, address(0)), _a2(1 ether, 1 ether), _m(2), G);
    }

    function test_BestEffort_RevertsSelfTargetItem() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.SelfTarget.selector);
        arc.sendBatchBestEffort{value: 2 ether}(_t2(bob, address(arc)), _a2(1 ether, 1 ether), _m(2), G);
    }

    function test_BestEffort_RevertsZeroAmountItem() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAmount.selector);
        arc.sendBatchBestEffort{value: 1 ether}(_t2(bob, carol), _a2(1 ether, 0), _m(2), G);
    }

    // ---------- refund failure ----------

    function test_BestEffort_SenderThatCannotReceiveRefundRevertsEverything() public {
        NoRefundSender s = new NoRefundSender();
        Rejecter rej = new Rejecter();
        vm.deal(address(s), 10 ether);
        uint256 b = bob.balance;
        uint256 sBal = address(s).balance;

        vm.recordLogs();
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(s), 2 ether));
        s.go{value: 3 ether}(arc, _t2(bob, address(rej)), _a2(1 ether, 2 ether), _m(2), G);

        assertEq(bob.balance, b, "earlier success rolled back");
        assertEq(address(s).balance, sBal);
        assertEq(address(arc).balance, 0);
    }

    function test_BestEffort_NoRefundSenderFineWhenNothingToRefund() public {
        NoRefundSender s = new NoRefundSender();
        uint256 b = bob.balance;
        s.go{value: 1 ether}(arc, _t1(bob), _a1(1 ether), _m(1), G);
        assertEq(bob.balance, b + 1 ether);
    }

    // ---------- balance preservation ----------

    function test_BestEffort_ContractBalanceUnchanged() public {
        Rejecter rej = new Rejecter();
        vm.deal(address(arc), 5 wei); // forced funds
        vm.prank(alice);
        arc.sendBatchBestEffort{value: 3 ether}(_t3(bob, address(rej), carol), _a3(1 ether, 1 ether, 1 ether), _m(3), G);
        assertEq(address(arc).balance, 5 wei);
    }
}
