// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArcSend} from "../ArcSend.sol";
import {ArcSendTestBase, Rejecter} from "./ArcSend.Base.t.sol";

/// @dev Generic caller with no receive(): can create escrows but never take payouts.
contract NoReceiveCaller {
    function exec(address t, bytes calldata d) external payable {
        (bool ok, bytes memory ret) = t.call{value: msg.value}(d);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}

contract ArcSendEscrowTest is ArcSendTestBase {
    uint8 internal constant OPEN = 1;
    uint8 internal constant RELEASED = 2;
    uint8 internal constant REFUNDED = 3;
    uint8 internal constant RECLAIMED = 4;

    // ---------- createEscrow ----------

    function test_CreateEscrow_StoresRecordHoldsFunds() public {
        uint64 dl = uint64(T0 + 1 days);
        vm.prank(alice);
        uint256 id = arc.createEscrow{value: 5 ether}(bob, dl, MEMO);
        assertEq(id, 1);
        assertEq(arc.nextEscrowId(), 2);
        ArcSend.Escrow memory e = arc.getEscrow(id);
        assertEq(e.payer, alice);
        assertEq(e.payee, bob);
        assertEq(e.amount, 5 ether);
        assertEq(e.deadline, dl);
        assertEq(e.status, OPEN);
        assertEq(e.memo, MEMO);
        assertEq(e.refundTo, alice);
        assertEq(address(arc).balance, 5 ether);
    }

    function test_CreateEscrow_EmitsEscrowCreated() public {
        uint64 dl = uint64(T0 + 1 days);
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.EscrowCreated(1, alice, bob, 5 ether, dl, MEMO);
        vm.prank(alice);
        arc.createEscrow{value: 5 ether}(bob, dl, MEMO);
    }

    function test_CreateEscrow_MinDurationBoundary() public {
        vm.prank(alice);
        uint256 id = arc.createEscrow{value: 1 ether}(bob, uint64(T0 + 1 hours), MEMO);
        assertEq(arc.getEscrow(id).status, OPEN);

        uint64 bad = uint64(T0 + 1 hours - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidDeadline.selector, bad));
        arc.createEscrow{value: 1 ether}(bob, bad, MEMO);
    }

    function test_CreateEscrow_MaxDurationBoundary() public {
        vm.prank(alice);
        uint256 id = arc.createEscrow{value: 1 ether}(bob, uint64(T0 + 365 days), MEMO);
        assertEq(arc.getEscrow(id).status, OPEN);

        uint64 bad = uint64(T0 + 365 days + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidDeadline.selector, bad));
        arc.createEscrow{value: 1 ether}(bob, bad, MEMO);
    }

    function test_CreateEscrow_RevertsDeadlineInPastAndZero() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidDeadline.selector, uint64(0)));
        arc.createEscrow{value: 1 ether}(bob, 0, MEMO);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidDeadline.selector, uint64(T0 - 1)));
        arc.createEscrow{value: 1 ether}(bob, uint64(T0 - 1), MEMO);
    }

    function test_CreateEscrow_RevertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAmount.selector);
        arc.createEscrow{value: 0}(bob, uint64(T0 + 1 days), MEMO);
    }

    function test_CreateEscrow_RevertsAmountTooLarge() public {
        uint256 tooBig = uint256(type(uint96).max) + 1;
        vm.deal(alice, tooBig);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.AmountTooLarge.selector, tooBig));
        arc.createEscrow{value: tooBig}(bob, uint64(T0 + 1 days), MEMO);
    }

    function test_CreateEscrow_MaxUint96Allowed() public {
        vm.deal(alice, type(uint96).max);
        vm.prank(alice);
        uint256 id = arc.createEscrow{value: type(uint96).max}(bob, uint64(T0 + 1 days), MEMO);
        assertEq(arc.getEscrow(id).amount, type(uint96).max);
    }

    function test_CreateEscrow_RevertsZeroPayee() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAddress.selector);
        arc.createEscrow{value: 1 ether}(address(0), uint64(T0 + 1 days), MEMO);
    }

    function test_CreateEscrow_RevertsSelfPayee() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.SelfTarget.selector);
        arc.createEscrow{value: 1 ether}(alice, uint64(T0 + 1 days), MEMO);
    }

    function test_CreateEscrow_RevertsContractAsPayee() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.SelfTarget.selector);
        arc.createEscrow{value: 1 ether}(address(arc), uint64(T0 + 1 days), MEMO);
    }

    // ---------- release ----------

    function test_Release_ByPayerPaysPayee() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        uint256 b = bob.balance;
        vm.prank(alice);
        arc.releaseEscrow(id);
        assertEq(bob.balance, b + 3 ether);
        assertEq(arc.getEscrow(id).status, RELEASED);
        assertEq(address(arc).balance, 0);
    }

    function test_Release_EmitsEscrowReleasedThenPayment() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowReleased(id, bob, 3 ether);
        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, bob, 3 ether, MEMO);
        vm.prank(alice);
        arc.releaseEscrow(id);
    }

    function test_Release_AllowedAfterDeadline() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.warp(T0 + 30 days);
        uint256 b = bob.balance;
        vm.prank(alice);
        arc.releaseEscrow(id);
        assertEq(bob.balance, b + 3 ether);
    }

    function test_Release_AllowedAtDeadline() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.warp(T0 + 1 days);
        vm.prank(alice);
        arc.releaseEscrow(id);
        assertEq(arc.getEscrow(id).status, RELEASED);
    }

    function test_Release_RevertsForPayeeAndStranger() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, bob));
        arc.releaseEscrow(id);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, carol));
        arc.releaseEscrow(id);
        assertEq(arc.getEscrow(id).status, OPEN);
    }

    function test_Release_UnknownIdRevertsNotOpen() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.EscrowNotOpen.selector, 7));
        arc.releaseEscrow(7);
    }

    function test_Release_RejectingPayeeRevertsAndEscrowStaysOpen() public {
        Rejecter rej = new Rejecter();
        uint256 id = _mkEscrow(alice, address(rej), 3 ether, 1 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(rej), 3 ether));
        arc.releaseEscrow(id);
        assertEq(arc.getEscrow(id).status, OPEN);
        assertEq(address(arc).balance, 3 ether);

        // payer can still recover after the deadline
        vm.warp(T0 + 1 days + 1);
        uint256 a = alice.balance;
        vm.prank(alice);
        arc.reclaimEscrow(id);
        assertEq(alice.balance, a + 3 ether);
    }

    // ---------- refund ----------

    function test_Refund_ByPayeeReturnsToPayer() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        uint256 a = alice.balance;
        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowRefunded(id, alice, 3 ether, alice);
        vm.prank(bob);
        arc.refundEscrow(id);
        assertEq(alice.balance, a + 3 ether);
        assertEq(arc.getEscrow(id).status, REFUNDED);
        assertEq(address(arc).balance, 0);
    }

    function test_Refund_EmitsNoPayment() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.recordLogs();
        vm.prank(bob);
        arc.refundEscrow(id);
        assertEq(vm.getRecordedLogs().length, 1);
    }

    function test_Refund_AllowedAfterDeadline() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.warp(T0 + 100 days);
        vm.prank(bob);
        arc.refundEscrow(id);
        assertEq(arc.getEscrow(id).status, REFUNDED);
    }

    function test_Refund_RevertsForPayerAndStranger() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayee.selector, id, alice));
        arc.refundEscrow(id);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayee.selector, id, carol));
        arc.refundEscrow(id);
    }

    function test_Refund_PayerThatCannotReceiveRevertsAndStaysOpen() public {
        NoReceiveCaller npc = new NoReceiveCaller();
        vm.deal(address(npc), 5 ether);
        npc.exec{value: 3 ether}(
            address(arc), abi.encodeCall(ArcSend.createEscrow, (bob, uint64(T0 + 1 days), MEMO))
        );
        assertEq(arc.getEscrow(1).payer, address(npc));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(npc), 3 ether));
        arc.refundEscrow(1);
        assertEq(arc.getEscrow(1).status, OPEN);
        assertEq(address(arc).balance, 3 ether);
    }

    // ---------- reclaim ----------

    function test_Reclaim_StrictlyAfterDeadline() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        uint64 dl = uint64(T0 + 1 days);
        vm.warp(dl + 1);
        uint256 a = alice.balance;
        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowReclaimed(id, alice, 3 ether, alice);
        vm.prank(alice);
        arc.reclaimEscrow(id);
        assertEq(alice.balance, a + 3 ether);
        assertEq(arc.getEscrow(id).status, RECLAIMED);
        assertEq(address(arc).balance, 0);
    }

    function test_Reclaim_RevertsAtExactlyDeadline() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        uint64 dl = uint64(T0 + 1 days);
        vm.warp(dl);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.DeadlineNotPassed.selector, id, dl));
        arc.reclaimEscrow(id);
    }

    function test_Reclaim_RevertsBeforeDeadline() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.DeadlineNotPassed.selector, id, uint64(T0 + 1 days)));
        arc.reclaimEscrow(id);
    }

    function test_Reclaim_RevertsForPayeeAndStranger() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.warp(T0 + 2 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, bob));
        arc.reclaimEscrow(id);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, carol));
        arc.reclaimEscrow(id);
    }

    function test_Reclaim_WrongCallerBeforeDeadlineIsNotPayer() public {
        uint256 id = _mkEscrow(alice, bob, 3 ether, 1 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, bob));
        arc.reclaimEscrow(id);
    }

    // ---------- single settlement ----------

    function test_DoubleSettle_AllCombinationsRevertEscrowNotOpen() public {
        // released
        uint256 r = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.prank(alice);
        arc.releaseEscrow(r);
        // refunded
        uint256 f = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.prank(bob);
        arc.refundEscrow(f);
        // reclaimed
        uint256 c = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.warp(T0 + 2 days);
        vm.prank(alice);
        arc.reclaimEscrow(c);

        uint256[3] memory ids = [r, f, c];
        for (uint256 i; i < 3; i++) {
            bytes memory err = abi.encodeWithSelector(ArcSend.EscrowNotOpen.selector, ids[i]);
            vm.prank(alice);
            vm.expectRevert(err);
            arc.releaseEscrow(ids[i]);
            vm.prank(bob);
            vm.expectRevert(err);
            arc.refundEscrow(ids[i]);
            vm.prank(alice);
            vm.expectRevert(err);
            arc.reclaimEscrow(ids[i]);
        }
        assertEq(address(arc).balance, 0);
    }

    // ---------- accounting ----------

    function test_BalanceEqualsSumOfOpenEscrowsThroughout() public {
        uint256 e1 = _mkEscrow(alice, bob, 1 ether, 1 days);
        assertEq(address(arc).balance, 1 ether);
        uint256 e2 = _mkEscrow(carol, dave, 2 ether, 2 days);
        assertEq(address(arc).balance, 3 ether);
        uint256 e3 = _mkEscrow(bob, alice, 4 ether, 3 days);
        assertEq(address(arc).balance, 7 ether);

        vm.prank(alice);
        arc.releaseEscrow(e1);
        assertEq(address(arc).balance, 6 ether);

        vm.prank(dave);
        arc.refundEscrow(e2);
        assertEq(address(arc).balance, 4 ether);

        vm.warp(T0 + 3 days + 1);
        vm.prank(bob);
        arc.reclaimEscrow(e3);
        assertEq(address(arc).balance, 0);
    }

    function test_NonEscrowFlowsDoNotTouchEscrowFunds() public {
        _mkEscrow(alice, bob, 5 ether, 1 days);
        vm.prank(carol);
        arc.send{value: 1 ether}(payable(dave), MEMO);
        vm.prank(carol);
        arc.sendBatch{value: 3 ether}(_t2(bob, dave), _a2(1 ether, 2 ether), _m(2));
        vm.prank(carol);
        arc.sendBatchBestEffort{value: 2 ether}(_t1(bob), _a1(2 ether), _m(1), 50_000);
        assertEq(address(arc).balance, 5 ether);
    }
}
