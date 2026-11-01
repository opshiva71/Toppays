// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArcSend} from "../ArcSend.sol";
import {ArcSendTestBase, Rejecter} from "./ArcSend.Base.t.sol";

/// @dev Generic caller that can act as payer but has no receive(): rejects any payout.
contract RejectingPayer {
    function exec(address t, bytes calldata d) external payable {
        (bool ok, bytes memory ret) = t.call{value: msg.value}(d);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}

contract ArcSendRefundAddressTest is ArcSendTestBase {
    uint8 internal constant OPEN = 1;
    uint8 internal constant REFUNDED = 3;
    uint8 internal constant RECLAIMED = 4;

    function _setRefund(address payer, uint256 id, address to) internal {
        vm.prank(payer);
        arc.setEscrowRefundAddress(id, to);
    }

    /// @dev Escrow whose payer is a contract that cannot receive funds.
    function _mkRejectingPayerEscrow(uint256 amount, uint256 duration)
        internal
        returns (RejectingPayer rp, uint256 id)
    {
        rp = new RejectingPayer();
        // exec forwards this test contract's msg.value; rp itself ends with zero balance.
        id = arc.nextEscrowId();
        rp.exec{value: amount}(
            address(arc), abi.encodeCall(ArcSend.createEscrow, (bob, uint64(block.timestamp + duration), MEMO))
        );
    }

    // ---------- default ----------

    function test_Default_RefundToIsPayer() public {
        uint256 id = _mkEscrow(alice, bob, 2 ether, 1 days);
        assertEq(arc.getEscrow(id).refundTo, alice);
        (,,,,,, address r) = arc.escrows(id);
        assertEq(r, alice);
    }

    function test_Default_RefundToIsPayerPerEscrow() public {
        uint256 a = _mkEscrow(alice, bob, 1 ether, 1 days);
        uint256 c = _mkEscrow(carol, dave, 1 ether, 1 days);
        assertEq(arc.getEscrow(a).refundTo, alice);
        assertEq(arc.getEscrow(c).refundTo, carol);
    }

    function test_Default_RefundGoesToPayer() public {
        uint256 id = _mkEscrow(alice, bob, 2 ether, 1 days);
        uint256 a = alice.balance;
        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowRefunded(id, alice, 2 ether, alice);
        vm.prank(bob);
        arc.refundEscrow(id);
        assertEq(alice.balance, a + 2 ether);
    }

    // ---------- setEscrowRefundAddress ----------

    function test_Set_ByPayerUpdatesAndEmits() public {
        uint256 id = _mkEscrow(alice, bob, 2 ether, 1 days);
        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowRefundAddressSet(id, carol);
        _setRefund(alice, id, carol);
        ArcSend.Escrow memory e = arc.getEscrow(id);
        assertEq(e.refundTo, carol);
        assertEq(e.payer, alice, "payer unchanged");
        assertEq(e.payee, bob, "payee unchanged");
        assertEq(e.amount, 2 ether);
        assertEq(e.status, OPEN);
        assertEq(address(arc).balance, 2 ether);
    }

    function test_Set_CanBeChangedRepeatedlyAndBackToPayer() public {
        uint256 id = _mkEscrow(alice, bob, 2 ether, 1 days);
        _setRefund(alice, id, carol);
        _setRefund(alice, id, dave);
        assertEq(arc.getEscrow(id).refundTo, dave);
        _setRefund(alice, id, alice);
        assertEq(arc.getEscrow(id).refundTo, alice);
    }

    function test_Set_OnlyAffectsThatEscrow() public {
        uint256 a = _mkEscrow(alice, bob, 1 ether, 1 days);
        uint256 b = _mkEscrow(alice, bob, 1 ether, 1 days);
        _setRefund(alice, a, carol);
        assertEq(arc.getEscrow(a).refundTo, carol);
        assertEq(arc.getEscrow(b).refundTo, alice);
    }

    function test_Set_PayeeAndStrangerRevertNotPayer() public {
        uint256 id = _mkEscrow(alice, bob, 2 ether, 1 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, bob));
        arc.setEscrowRefundAddress(id, bob);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, carol));
        arc.setEscrowRefundAddress(id, carol);
        assertEq(arc.getEscrow(id).refundTo, alice);
    }

    function test_Set_RevertsEscrowNotOpen_Released() public {
        uint256 id = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.prank(alice);
        arc.releaseEscrow(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.EscrowNotOpen.selector, id));
        arc.setEscrowRefundAddress(id, carol);
    }

    function test_Set_RevertsEscrowNotOpen_Refunded() public {
        uint256 id = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.prank(bob);
        arc.refundEscrow(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.EscrowNotOpen.selector, id));
        arc.setEscrowRefundAddress(id, carol);
        assertEq(arc.getEscrow(id).refundTo, alice);
    }

    function test_Set_RevertsEscrowNotOpen_Reclaimed() public {
        uint256 id = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.warp(T0 + 2 days);
        vm.prank(alice);
        arc.reclaimEscrow(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.EscrowNotOpen.selector, id));
        arc.setEscrowRefundAddress(id, carol);
    }

    function test_Set_RevertsEscrowNotOpen_UnknownId() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.EscrowNotOpen.selector, 99));
        arc.setEscrowRefundAddress(99, carol);
    }

    function test_Set_NonPayerOnSettledEscrowRevertsNotOpenFirst() public {
        uint256 id = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.prank(alice);
        arc.releaseEscrow(id);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.EscrowNotOpen.selector, id));
        arc.setEscrowRefundAddress(id, carol);
    }

    function test_Set_RevertsZeroAddress() public {
        uint256 id = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAddress.selector);
        arc.setEscrowRefundAddress(id, address(0));
        assertEq(arc.getEscrow(id).refundTo, alice);
    }

    function test_Set_RevertsSelfTarget() public {
        uint256 id = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.prank(alice);
        vm.expectRevert(ArcSend.SelfTarget.selector);
        arc.setEscrowRefundAddress(id, address(arc));
        assertEq(arc.getEscrow(id).refundTo, alice);
    }

    function test_Set_AllowedAfterDeadlineWhileOpen() public {
        uint256 id = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.warp(T0 + 5 days);
        _setRefund(alice, id, carol);
        assertEq(arc.getEscrow(id).refundTo, carol);
    }

    // ---------- redirect + refundEscrow ----------

    function test_Refund_PaysRedirectedAddressNotPayer() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        _setRefund(alice, id, carol);
        uint256 a = alice.balance;
        uint256 c = carol.balance;
        uint256 b = bob.balance;

        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowRefunded(id, alice, 3 ether, carol);
        vm.recordLogs();
        vm.prank(bob);
        arc.refundEscrow(id);

        assertEq(carol.balance, c + 3 ether);
        assertEq(alice.balance, a, "payer gets nothing");
        assertEq(bob.balance, b, "payee gets nothing");
        assertEq(arc.getEscrow(id).status, REFUNDED);
        assertEq(address(arc).balance, 0);
    }

    function test_Refund_RedirectedEmitsOnlyOneLog() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        _setRefund(alice, id, carol);
        vm.recordLogs();
        vm.prank(bob);
        arc.refundEscrow(id);
        assertEq(vm.getRecordedLogs().length, 1);
    }

    function test_Refund_RejectingPayerCanRedirectThenPayeeRefundSucceeds() public {
        (RejectingPayer rp, uint256 id) = _mkRejectingPayerEscrow(3 ether, 1 days);
        assertEq(arc.getEscrow(id).payer, address(rp));
        assertEq(arc.getEscrow(id).refundTo, address(rp));

        // Default destination cannot receive: refund reverts and escrow stays open.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(rp), 3 ether));
        arc.refundEscrow(id);
        assertEq(arc.getEscrow(id).status, OPEN);
        assertEq(address(arc).balance, 3 ether);

        // Payer contract redirects to an EOA it controls.
        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowRefundAddressSet(id, carol);
        rp.exec(address(arc), abi.encodeCall(ArcSend.setEscrowRefundAddress, (id, carol)));

        uint256 c = carol.balance;
        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowRefunded(id, address(rp), 3 ether, carol);
        vm.prank(bob);
        arc.refundEscrow(id);

        assertEq(carol.balance, c + 3 ether);
        assertEq(address(rp).balance, 0);
        assertEq(arc.getEscrow(id).status, REFUNDED);
        assertEq(address(arc).balance, 0);
    }

    function test_Refund_RedirectToRejectingContractRevertsAndCanBeFixed() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        Rejecter rej = new Rejecter();
        _setRefund(alice, id, address(rej));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(rej), 3 ether));
        arc.refundEscrow(id);
        assertEq(arc.getEscrow(id).status, OPEN);

        _setRefund(alice, id, dave);
        uint256 d = dave.balance;
        vm.prank(bob);
        arc.refundEscrow(id);
        assertEq(dave.balance, d + 3 ether);
    }

    // ---------- redirect + reclaimEscrow ----------

    function test_Reclaim_AfterDeadlinePaysRedirectedAddress() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        _setRefund(alice, id, carol);
        vm.warp(T0 + 1 days + 1);
        uint256 a = alice.balance;
        uint256 c = carol.balance;

        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowReclaimed(id, alice, 3 ether, carol);
        vm.prank(alice);
        arc.reclaimEscrow(id);

        assertEq(carol.balance, c + 3 ether);
        assertEq(alice.balance, a, "payer wallet untouched");
        assertEq(arc.getEscrow(id).status, RECLAIMED);
        assertEq(address(arc).balance, 0);
    }

    function test_Reclaim_StillStrictlyAfterDeadlineWhenRedirected() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        _setRefund(alice, id, carol);
        vm.warp(T0 + 1 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.DeadlineNotPassed.selector, id, uint64(T0 + 1 days)));
        arc.reclaimEscrow(id);
    }

    function test_Reclaim_OnlyPayerEvenWhenRedirected() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        _setRefund(alice, id, carol);
        vm.warp(T0 + 2 days);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, carol));
        arc.reclaimEscrow(id);
    }

    function test_Reclaim_RejectingPayerRedirectsThenReclaims() public {
        (RejectingPayer rp, uint256 id) = _mkRejectingPayerEscrow(2 ether, 1 days);
        vm.warp(T0 + 1 days + 1);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(rp), 2 ether));
        rp.exec(address(arc), abi.encodeCall(ArcSend.reclaimEscrow, (id)));

        rp.exec(address(arc), abi.encodeCall(ArcSend.setEscrowRefundAddress, (id, dave)));
        uint256 d = dave.balance;
        rp.exec(address(arc), abi.encodeCall(ArcSend.reclaimEscrow, (id)));
        assertEq(dave.balance, d + 2 ether);
        assertEq(arc.getEscrow(id).status, RECLAIMED);
        assertEq(address(arc).balance, 0);
    }

    // ---------- redirect + release ----------

    function test_Release_AfterRedirectStillPaysPayee() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        _setRefund(alice, id, carol);
        uint256 b = bob.balance;
        uint256 c = carol.balance;
        uint256 a = alice.balance;

        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowReleased(id, bob, 3 ether);
        vm.prank(alice);
        arc.releaseEscrow(id);

        assertEq(bob.balance, b + 3 ether);
        assertEq(carol.balance, c, "refund address gets nothing on release");
        assertEq(alice.balance, a);
        assertEq(address(arc).balance, 0);
    }

    function test_Release_RejectingPayerWithRedirectStillPaysPayee() public {
        (RejectingPayer rp, uint256 id) = _mkRejectingPayerEscrow(2 ether, 1 days);
        rp.exec(address(arc), abi.encodeCall(ArcSend.setEscrowRefundAddress, (id, carol)));
        uint256 b = bob.balance;
        rp.exec(address(arc), abi.encodeCall(ArcSend.releaseEscrow, (id)));
        assertEq(bob.balance, b + 2 ether);
        assertEq(address(arc).balance, 0);
    }

    // ---------- accounting ----------

    function test_Balance_EqualsSumOfOpenEscrowsThroughoutWithRedirects() public {
        uint256 e1 = _mkEscrow(alice, bob, 1 ether, 1 days);
        uint256 e2 = _mkEscrow(carol, dave, 2 ether, 2 days);
        uint256 e3 = _mkEscrow(bob, alice, 4 ether, 3 days);
        uint256 e4 = _mkEscrow(dave, carol, 8 ether, 4 days);
        assertEq(address(arc).balance, 15 ether);

        _setRefund(alice, e1, dave);
        _setRefund(carol, e2, alice);
        _setRefund(bob, e3, carol);
        assertEq(address(arc).balance, 15 ether, "redirects move no funds");

        vm.prank(alice);
        arc.releaseEscrow(e1);
        assertEq(address(arc).balance, 14 ether);

        vm.prank(dave);
        arc.refundEscrow(e2);
        assertEq(address(arc).balance, 12 ether);

        vm.warp(T0 + 3 days + 1);
        vm.prank(bob);
        arc.reclaimEscrow(e3);
        assertEq(address(arc).balance, 8 ether);

        vm.prank(carol);
        arc.refundEscrow(e4);
        assertEq(address(arc).balance, 0);
    }

    function test_Funds_ConservedAcrossRedirectedRefund() public {
        uint256 total = alice.balance + bob.balance + carol.balance + dave.balance;
        uint256 id = _mkEscrow(alice, bob, 5 ether, 1 days);
        _setRefund(alice, id, dave);
        vm.prank(bob);
        arc.refundEscrow(id);
        assertEq(alice.balance + bob.balance + carol.balance + dave.balance + address(arc).balance, total);
        assertEq(dave.balance, 1_000 ether + 5 ether);
        assertEq(alice.balance, 1_000 ether - 5 ether);
    }
}
