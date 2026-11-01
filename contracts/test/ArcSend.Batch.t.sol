// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {stdError} from "forge-std/StdError.sol";
import {ArcSend} from "../ArcSend.sol";
import {ArcSendTestBase, Rejecter, NoReceive, Acceptor} from "./ArcSend.Base.t.sol";

/// sendBatch (atomic)
contract ArcSendBatchTest is ArcSendTestBase {
    function test_SendBatch_HappyPath() public {
        uint256 b = bob.balance;
        uint256 c = carol.balance;
        uint256 d = dave.balance;
        vm.prank(alice);
        arc.sendBatch{value: 6 ether}(_t3(bob, carol, dave), _a3(1 ether, 2 ether, 3 ether), _m(3));
        assertEq(bob.balance, b + 1 ether);
        assertEq(carol.balance, c + 2 ether);
        assertEq(dave.balance, d + 3 ether);
        assertEq(address(arc).balance, 0);
    }

    function test_SendBatch_EmitsPerRecipientPaymentsAndBatchSent() public {
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, bob, 1 ether, bytes32(uint256(1)));
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, carol, 2 ether, bytes32(uint256(2)));
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, dave, 3 ether, bytes32(uint256(3)));
        vm.expectEmit(true, false, false, true, address(arc));
        emit ArcSend.BatchSent(alice, 6 ether, 3);
        vm.prank(alice);
        arc.sendBatch{value: 6 ether}(_t3(bob, carol, dave), _a3(1 ether, 2 ether, 3 ether), _m(3));
    }

    function test_SendBatch_SingleEntry() public {
        uint256 b = bob.balance;
        vm.prank(alice);
        arc.sendBatch{value: 1 wei}(_t1(bob), _a1(1), _m(1));
        assertEq(bob.balance, b + 1);
    }

    function test_SendBatch_DuplicateRecipientsEachPaid() public {
        uint256 b = bob.balance;
        vm.prank(alice);
        arc.sendBatch{value: 3 ether}(_t2(bob, bob), _a2(1 ether, 2 ether), _m(2));
        assertEq(bob.balance, b + 3 ether);
    }

    function test_SendBatch_RevertsIncorrectValueTooLittle() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.IncorrectValue.selector, 2 ether, 3 ether));
        arc.sendBatch{value: 2 ether}(_t2(bob, carol), _a2(1 ether, 2 ether), _m(2));
    }

    function test_SendBatch_RevertsIncorrectValueTooMuch() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.IncorrectValue.selector, 4 ether, 3 ether));
        arc.sendBatch{value: 4 ether}(_t2(bob, carol), _a2(1 ether, 2 ether), _m(2));
    }

    function test_SendBatch_RevertsIncorrectValueZero() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.IncorrectValue.selector, 0, 3 ether));
        arc.sendBatch(_t2(bob, carol), _a2(1 ether, 2 ether), _m(2));
    }

    function test_SendBatch_RevertsLengthMismatchAmounts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.LengthMismatch.selector, 2, 3, 2));
        arc.sendBatch{value: 6 ether}(_t2(bob, carol), _a3(1 ether, 2 ether, 3 ether), _m(2));
    }

    function test_SendBatch_RevertsLengthMismatchMemos() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.LengthMismatch.selector, 2, 2, 3));
        arc.sendBatch{value: 3 ether}(_t2(bob, carol), _a2(1 ether, 2 ether), _m(3));
    }

    function test_SendBatch_RevertsEmptyBatch() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.EmptyBatch.selector);
        arc.sendBatch(new address payable[](0), new uint256[](0), new bytes32[](0));
    }

    function test_SendBatch_RevertsBatchTooLarge101() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.BatchTooLarge.selector, 101));
        arc.sendBatch{value: 101 ether}(_fresh(101), _same(101, 1 ether), _m(101));
    }

    function test_SendBatch_MaxBatch100Succeeds() public {
        address payable[] memory tos = _fresh(100);
        vm.prank(alice);
        arc.sendBatch{value: 100 ether}(tos, _same(100, 1 ether), _m(100));
        for (uint256 i; i < 100; i++) {
            assertEq(tos[i].balance, 1 ether);
        }
        assertEq(address(arc).balance, 0);
    }

    function test_SendBatch_RevertsZeroAddressItem() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAddress.selector);
        arc.sendBatch{value: 3 ether}(_t3(bob, address(0), carol), _a3(1 ether, 1 ether, 1 ether), _m(3));
    }

    function test_SendBatch_RevertsSelfTargetItem() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.SelfTarget.selector);
        arc.sendBatch{value: 3 ether}(_t3(bob, address(arc), carol), _a3(1 ether, 1 ether, 1 ether), _m(3));
    }

    function test_SendBatch_RevertsZeroAmountItem() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAmount.selector);
        arc.sendBatch{value: 2 ether}(_t3(bob, carol, dave), _a3(1 ether, 0, 1 ether), _m(3));
    }

    function test_SendBatch_RevertsOnAmountSumOverflow() public {
        vm.prank(alice);
        vm.expectRevert(stdError.arithmeticError);
        arc.sendBatch(_t2(bob, carol), _a2(type(uint256).max, 1), _m(2));
    }

    function test_SendBatch_AtomicWhenOneRecipientRejects() public {
        Rejecter rej = new Rejecter();
        uint256 b = bob.balance;
        uint256 d = dave.balance;
        uint256 a = alice.balance;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(rej), 2 ether));
        arc.sendBatch{value: 6 ether}(_t3(bob, address(rej), dave), _a3(1 ether, 2 ether, 3 ether), _m(3));
        assertEq(bob.balance, b);
        assertEq(dave.balance, d);
        assertEq(alice.balance, a);
        assertEq(address(arc).balance, 0);
    }

    function test_SendBatch_AtomicWhenLastRecipientRejects() public {
        NoReceive nr = new NoReceive();
        uint256 b = bob.balance;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(nr), 3 ether));
        arc.sendBatch{value: 4 ether}(_t2(bob, address(nr)), _a2(1 ether, 3 ether), _m(2));
        assertEq(bob.balance, b);
        assertEq(address(arc).balance, 0);
    }

    function test_SendBatch_PreservesPreexistingBalance() public {
        vm.deal(address(arc), 7 wei); // forced funds
        vm.prank(alice);
        arc.sendBatch{value: 3 ether}(_t2(bob, carol), _a2(1 ether, 2 ether), _m(2));
        assertEq(address(arc).balance, 7 wei);
    }
}
