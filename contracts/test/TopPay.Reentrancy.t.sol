// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TopPay} from "../TopPay.sol";
import {TopPayTestBase, Reentrant} from "./TopPay.Base.t.sol";

/// A malicious recipient re-enters TopPay from its receive hook.
contract TopPayReentrancyTest is TopPayTestBase {
    Reentrant internal evil;

    function setUp() public override {
        super.setUp();
        evil = new Reentrant();
    }

    function _arm(bytes memory data, uint256 value, bool propagate) internal {
        evil.configure(address(arc), data, value, propagate);
        vm.deal(address(evil), value);
    }

    function _assertBlocked() internal view {
        assertTrue(evil.entered(), "hook ran");
        assertFalse(evil.innerOk(), "inner call must fail");
        assertEq(evil.innerRet(), abi.encodeWithSelector(TopPay.ReentrantCall.selector));
    }

    // ---------- send ----------

    function test_Reentrancy_SendIntoSend_Propagated() public {
        _arm(abi.encodeCall(TopPay.send, (payable(bob), MEMO)), 1 ether, true);
        uint256 a = alice.balance;
        uint256 b = bob.balance;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(evil), 2 ether));
        arc.send{value: 2 ether}(payable(address(evil)), MEMO);
        assertEq(alice.balance, a);
        assertEq(bob.balance, b);
        assertEq(address(arc).balance, 0);
    }

    function test_Reentrancy_SendIntoSend_Swallowed() public {
        _arm(abi.encodeCall(TopPay.send, (payable(bob), MEMO)), 1 ether, false);
        uint256 b = bob.balance;
        vm.prank(alice);
        arc.send{value: 2 ether}(payable(address(evil)), MEMO);
        _assertBlocked();
        assertEq(bob.balance, b, "inner payment never happened");
        assertEq(address(evil).balance, 3 ether);
        assertEq(address(arc).balance, 0);
    }

    function test_Reentrancy_SendIntoSendBatch() public {
        _arm(
            abi.encodeCall(TopPay.sendBatch, (_t1(bob), _a1(1 ether), _m(1))), 1 ether, true
        );
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(evil), 2 ether));
        arc.send{value: 2 ether}(payable(address(evil)), MEMO);
    }

    // ---------- sendBatch ----------

    function test_Reentrancy_SendBatchIntoSendBatch_Propagated() public {
        _arm(abi.encodeCall(TopPay.sendBatch, (_t1(bob), _a1(1 ether), _m(1))), 1 ether, true);
        uint256 b = bob.balance;
        uint256 c = carol.balance;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(evil), 2 ether));
        arc.sendBatch{value: 3 ether}(_t2(carol, address(evil)), _a2(1 ether, 2 ether), _m(2));
        assertEq(bob.balance, b);
        assertEq(carol.balance, c, "earlier batch payment rolled back");
        assertEq(address(arc).balance, 0);
    }

    function test_Reentrancy_SendBatchIntoSend_Swallowed() public {
        _arm(abi.encodeCall(TopPay.send, (payable(bob), MEMO)), 1 ether, false);
        uint256 b = bob.balance;
        vm.prank(alice);
        arc.sendBatch{value: 2 ether}(_t1(address(evil)), _a1(2 ether), _m(1));
        _assertBlocked();
        assertEq(bob.balance, b);
    }

    // ---------- sendBatchBestEffort ----------

    function test_Reentrancy_BestEffort_PropagatedIsSkippedAndRefunded() public {
        _arm(abi.encodeCall(TopPay.send, (payable(bob), MEMO)), 1 ether, true);
        uint256 a = alice.balance;
        uint256 b = bob.balance;
        vm.expectEmit(true, true, true, true, address(arc));
        emit TopPay.PaymentSkipped(alice, address(evil), 2 ether, bytes32(uint256(1)));
        vm.prank(alice);
        uint256 refunded =
            arc.sendBatchBestEffort{value: 2 ether}(_t1(address(evil)), _a1(2 ether), _m(1), 200_000);
        assertEq(refunded, 2 ether);
        assertEq(alice.balance, a);
        assertEq(bob.balance, b);
        assertEq(address(evil).balance, 1 ether);
        assertEq(address(arc).balance, 0);
    }

    function test_Reentrancy_BestEffort_SwallowedPaymentDelivered() public {
        _arm(abi.encodeCall(TopPay.send, (payable(bob), MEMO)), 1 ether, false);
        uint256 b = bob.balance;
        vm.prank(alice);
        uint256 refunded =
            arc.sendBatchBestEffort{value: 2 ether}(_t1(address(evil)), _a1(2 ether), _m(1), 300_000);
        assertEq(refunded, 0);
        _assertBlocked();
        assertEq(bob.balance, b);
    }

    // ---------- payRequest ----------

    function test_Reentrancy_PayRequest_Propagated_RequestStaysOpen() public {
        uint256 id = _mkRequest(address(evil), address(0), 1 ether, 0);
        _arm(abi.encodeCall(TopPay.payRequest, (id)), 1 ether, true);
        uint256 b = bob.balance;
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(evil), 1 ether));
        arc.payRequest{value: 1 ether}(id);
        assertEq(arc.getRequest(id).status, 1);
        assertEq(bob.balance, b);
        assertEq(address(evil).balance, 1 ether);
    }

    function test_Reentrancy_PayRequest_Swallowed_PaidExactlyOnce() public {
        uint256 id = _mkRequest(address(evil), address(0), 1 ether, 0);
        _arm(abi.encodeCall(TopPay.payRequest, (id)), 1 ether, false);
        vm.prank(bob);
        arc.payRequest{value: 1 ether}(id);
        _assertBlocked();
        assertEq(arc.getRequest(id).status, 2);
        assertEq(address(evil).balance, 2 ether, "1 dealt + exactly 1 paid");
        assertEq(address(arc).balance, 0);
    }

    // ---------- escrow ----------

    function test_Reentrancy_Release_IntoRelease_Propagated() public {
        uint256 id = _mkEscrow(alice, address(evil), 3 ether, 1 days);
        _arm(abi.encodeCall(TopPay.releaseEscrow, (id)), 0, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(evil), 3 ether));
        arc.releaseEscrow(id);
        assertEq(arc.getEscrow(id).status, 1);
        assertEq(address(arc).balance, 3 ether);
    }

    function test_Reentrancy_Release_IntoRelease_Swallowed_PaidOnce() public {
        uint256 id = _mkEscrow(alice, address(evil), 3 ether, 1 days);
        _arm(abi.encodeCall(TopPay.releaseEscrow, (id)), 0, false);
        vm.prank(alice);
        arc.releaseEscrow(id);
        _assertBlocked();
        assertEq(arc.getEscrow(id).status, 2);
        assertEq(address(evil).balance, 3 ether);
        assertEq(address(arc).balance, 0);
    }

    function test_Reentrancy_Release_IntoCreateEscrow() public {
        uint256 id = _mkEscrow(alice, address(evil), 3 ether, 1 days);
        _arm(abi.encodeCall(TopPay.createEscrow, (bob, uint64(T0 + 2 days), MEMO)), 1 ether, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(evil), 3 ether));
        arc.releaseEscrow(id);
        assertEq(arc.nextEscrowId(), 2, "no new escrow created");
        assertEq(address(arc).balance, 3 ether);
    }

    function test_Reentrancy_Release_IntoCreateEscrow_Swallowed() public {
        uint256 id = _mkEscrow(alice, address(evil), 3 ether, 1 days);
        _arm(abi.encodeCall(TopPay.createEscrow, (bob, uint64(T0 + 2 days), MEMO)), 1 ether, false);
        vm.prank(alice);
        arc.releaseEscrow(id);
        _assertBlocked();
        assertEq(arc.nextEscrowId(), 2);
        assertEq(address(arc).balance, 0);
    }

    function test_Reentrancy_Refund_PayerContractReenters() public {
        // evil is the payer: it receives the refund
        evil.exec{value: 3 ether}(
            address(arc), abi.encodeCall(TopPay.createEscrow, (bob, uint64(T0 + 1 days), MEMO))
        );
        _arm(abi.encodeCall(TopPay.releaseEscrow, (1)), 0, true);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(evil), 3 ether));
        arc.refundEscrow(1);
        assertEq(arc.getEscrow(1).status, 1);

        _arm(abi.encodeCall(TopPay.releaseEscrow, (1)), 0, false);
        vm.prank(bob);
        arc.refundEscrow(1);
        _assertBlocked();
        assertEq(arc.getEscrow(1).status, 3);
        assertEq(address(evil).balance, 3 ether);
        assertEq(address(arc).balance, 0);
    }

    function test_Reentrancy_Reclaim_PayerContractReenters() public {
        evil.exec{value: 3 ether}(
            address(arc), abi.encodeCall(TopPay.createEscrow, (bob, uint64(T0 + 1 days), MEMO))
        );
        vm.warp(T0 + 1 days + 1);

        _arm(abi.encodeCall(TopPay.reclaimEscrow, (1)), 0, true);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(evil), 3 ether));
        evil.exec(address(arc), abi.encodeCall(TopPay.reclaimEscrow, (1)));
        assertEq(arc.getEscrow(1).status, 1);

        _arm(abi.encodeCall(TopPay.reclaimEscrow, (1)), 0, false);
        evil.exec(address(arc), abi.encodeCall(TopPay.reclaimEscrow, (1)));
        _assertBlocked();
        assertEq(arc.getEscrow(1).status, 4);
        assertEq(address(evil).balance, 3 ether, "reclaimed exactly once");
        assertEq(address(arc).balance, 0);
    }
}
