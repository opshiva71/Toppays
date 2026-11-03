// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TopPay} from "../TopPay.sol";
import {TopPayTestBase, Rejecter, NoReceive} from "./TopPay.Base.t.sol";

/// createRequest / payRequest / cancelRequest
contract TopPayRequestTest is TopPayTestBase {
    uint8 internal constant OPEN = 1;
    uint8 internal constant PAID = 2;
    uint8 internal constant CANCELLED = 3;

    // ---------- createRequest ----------

    function test_CreateRequest_StoresRecordAndIncrementsId() public {
        uint64 exp = uint64(T0 + 1 days);
        vm.prank(alice);
        uint256 id = arc.createRequest(bob, 5 ether, exp, MEMO);
        assertEq(id, 1);
        assertEq(arc.nextRequestId(), 2);

        TopPay.Request memory r = arc.getRequest(id);
        assertEq(r.payee, alice);
        assertEq(r.payer, bob);
        assertEq(r.amount, 5 ether);
        assertEq(r.expiry, exp);
        assertEq(r.status, OPEN);
        assertEq(r.memo, MEMO);

        vm.prank(alice);
        assertEq(arc.createRequest(address(0), 1, 0, MEMO), 2);
    }

    function test_CreateRequest_EmitsRequestCreated() public {
        uint64 exp = uint64(T0 + 1 days);
        vm.expectEmit(true, true, true, true, address(arc));
        emit TopPay.RequestCreated(1, alice, bob, 5 ether, exp, MEMO);
        vm.prank(alice);
        arc.createRequest(bob, 5 ether, exp, MEMO);
    }

    function test_CreateRequest_ZeroPayerAndZeroExpiryAllowed() public {
        uint256 id = _mkRequest(alice, address(0), 1 ether, 0);
        TopPay.Request memory r = arc.getRequest(id);
        assertEq(r.payer, address(0));
        assertEq(r.expiry, 0);
    }

    function test_CreateRequest_RevertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TopPay.ZeroAmount.selector);
        arc.createRequest(bob, 0, 0, MEMO);
    }

    function test_CreateRequest_RevertsAmountTooLarge() public {
        uint256 tooBig = uint256(type(uint96).max) + 1;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.AmountTooLarge.selector, tooBig));
        arc.createRequest(bob, tooBig, 0, MEMO);
    }

    function test_CreateRequest_MaxUint96Allowed() public {
        uint256 id = _mkRequest(alice, bob, type(uint96).max, 0);
        assertEq(arc.getRequest(id).amount, type(uint96).max);
    }

    function test_CreateRequest_RevertsInvalidExpiryPast() public {
        uint64 past = uint64(T0 - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.InvalidExpiry.selector, past));
        arc.createRequest(bob, 1 ether, past, MEMO);
    }

    function test_CreateRequest_ExpiryEqualToNowAllowed() public {
        uint256 id = _mkRequest(alice, bob, 1 ether, uint64(T0));
        assertEq(arc.getRequest(id).status, OPEN);
    }

    function test_CreateRequest_RevertsSelfPayer() public {
        vm.prank(alice);
        vm.expectRevert(TopPay.SelfTarget.selector);
        arc.createRequest(alice, 1 ether, 0, MEMO);
    }

    // ---------- payRequest ----------

    function test_PayRequest_AnyonePaysUnrestricted() public {
        uint256 id = _mkRequest(alice, address(0), 4 ether, 0);
        uint256 a = alice.balance;
        uint256 c = carol.balance;
        vm.prank(carol);
        arc.payRequest{value: 4 ether}(id);
        assertEq(alice.balance, a + 4 ether);
        assertEq(carol.balance, c - 4 ether);
        assertEq(arc.getRequest(id).status, PAID);
        assertEq(address(arc).balance, 0);
    }

    function test_PayRequest_RestrictedPayerPays() public {
        uint256 id = _mkRequest(alice, bob, 4 ether, 0);
        uint256 a = alice.balance;
        vm.prank(bob);
        arc.payRequest{value: 4 ether}(id);
        assertEq(alice.balance, a + 4 ether);
        assertEq(arc.getRequest(id).status, PAID);
    }

    function test_PayRequest_EmitsRequestPaidThenPayment() public {
        uint256 id = _mkRequest(alice, bob, 4 ether, 0);
        vm.expectEmit(true, true, true, true, address(arc));
        emit TopPay.RequestPaid(id, bob, alice, 4 ether);
        vm.expectEmit(true, true, true, true, address(arc));
        emit TopPay.Payment(bob, alice, 4 ether, MEMO);
        vm.prank(bob);
        arc.payRequest{value: 4 ether}(id);
    }

    function test_PayRequest_RevertsNotPayer() public {
        uint256 id = _mkRequest(alice, bob, 4 ether, 0);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(TopPay.NotPayer.selector, id, carol));
        arc.payRequest{value: 4 ether}(id);
        assertEq(arc.getRequest(id).status, OPEN);
    }

    function test_PayRequest_RevertsIncorrectValueLow() public {
        uint256 id = _mkRequest(alice, address(0), 4 ether, 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.IncorrectValue.selector, 4 ether - 1, 4 ether));
        arc.payRequest{value: 4 ether - 1}(id);
    }

    function test_PayRequest_RevertsIncorrectValueHigh() public {
        uint256 id = _mkRequest(alice, address(0), 4 ether, 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.IncorrectValue.selector, 4 ether + 1, 4 ether));
        arc.payRequest{value: 4 ether + 1}(id);
    }

    function test_PayRequest_ExpiryBoundaryInclusive() public {
        uint64 exp = uint64(T0 + 1 hours);
        uint256 id = _mkRequest(alice, address(0), 1 ether, exp);
        vm.warp(exp); // exactly at expiry: still payable
        vm.prank(bob);
        arc.payRequest{value: 1 ether}(id);
        assertEq(arc.getRequest(id).status, PAID);
    }

    function test_PayRequest_RevertsOneSecondAfterExpiry() public {
        uint64 exp = uint64(T0 + 1 hours);
        uint256 id = _mkRequest(alice, address(0), 1 ether, exp);
        vm.warp(uint256(exp) + 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.RequestExpired.selector, id, exp));
        arc.payRequest{value: 1 ether}(id);
    }

    function test_PayRequest_NoExpiryPayableMuchLater() public {
        uint256 id = _mkRequest(alice, address(0), 1 ether, 0);
        vm.warp(T0 + 5000 days);
        vm.prank(bob);
        arc.payRequest{value: 1 ether}(id);
        assertEq(arc.getRequest(id).status, PAID);
    }

    function test_PayRequest_TwiceRevertsNotOpen() public {
        uint256 id = _mkRequest(alice, address(0), 1 ether, 0);
        vm.prank(bob);
        arc.payRequest{value: 1 ether}(id);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.RequestNotOpen.selector, id));
        arc.payRequest{value: 1 ether}(id);
    }

    function test_PayRequest_UnknownIdRevertsNotOpen() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.RequestNotOpen.selector, 99));
        arc.payRequest{value: 1 ether}(99);
    }

    function test_PayRequest_PayeeRejectingFundsLeavesRequestOpen() public {
        Rejecter rej = new Rejecter();
        uint256 id = _mkRequest(address(rej), address(0), 1 ether, 0);
        uint256 b = bob.balance;
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(rej), 1 ether));
        arc.payRequest{value: 1 ether}(id);
        assertEq(arc.getRequest(id).status, OPEN);
        assertEq(bob.balance, b);
        assertEq(address(arc).balance, 0);
    }

    function test_PayRequest_NoReceivePayeeLeavesRequestOpen() public {
        NoReceive nr = new NoReceive();
        uint256 id = _mkRequest(address(nr), address(0), 1 ether, 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.TransferFailed.selector, address(nr), 1 ether));
        arc.payRequest{value: 1 ether}(id);
        assertEq(arc.getRequest(id).status, OPEN);
    }

    // ---------- cancelRequest ----------

    function test_CancelRequest_ByPayee() public {
        uint256 id = _mkRequest(alice, bob, 1 ether, 0);
        vm.expectEmit(true, true, false, false, address(arc));
        emit TopPay.RequestCancelled(id, alice);
        vm.prank(alice);
        arc.cancelRequest(id);
        assertEq(arc.getRequest(id).status, CANCELLED);
    }

    function test_CancelRequest_RevertsNotPayee() public {
        uint256 id = _mkRequest(alice, bob, 1 ether, 0);
        vm.prank(bob); // the payer is not the payee
        vm.expectRevert(abi.encodeWithSelector(TopPay.NotPayee.selector, id, bob));
        arc.cancelRequest(id);
        assertEq(arc.getRequest(id).status, OPEN);
    }

    function test_CancelRequest_RevertsWhenAlreadyCancelled() public {
        uint256 id = _mkRequest(alice, bob, 1 ether, 0);
        vm.prank(alice);
        arc.cancelRequest(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.RequestNotOpen.selector, id));
        arc.cancelRequest(id);
    }

    function test_CancelRequest_RevertsWhenPaid() public {
        uint256 id = _mkRequest(alice, address(0), 1 ether, 0);
        vm.prank(bob);
        arc.payRequest{value: 1 ether}(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.RequestNotOpen.selector, id));
        arc.cancelRequest(id);
    }

    function test_CancelRequest_UnknownId() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TopPay.RequestNotOpen.selector, 42));
        arc.cancelRequest(42);
    }

    function test_CancelRequest_ExpiredOpenRequestCanBeCancelled() public {
        uint64 exp = uint64(T0 + 1 hours);
        uint256 id = _mkRequest(alice, address(0), 1 ether, exp);
        vm.warp(uint256(exp) + 10);
        vm.prank(alice);
        arc.cancelRequest(id);
        assertEq(arc.getRequest(id).status, CANCELLED);
    }

    function test_PayRequest_AfterCancelReverts() public {
        uint256 id = _mkRequest(alice, address(0), 1 ether, 0);
        vm.prank(alice);
        arc.cancelRequest(id);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TopPay.RequestNotOpen.selector, id));
        arc.payRequest{value: 1 ether}(id);
    }
}
