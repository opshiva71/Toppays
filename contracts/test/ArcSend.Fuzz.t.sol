// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArcSend} from "../ArcSend.sol";
import {ArcSendTestBase, Rejecter} from "./ArcSend.Base.t.sol";

contract ArcSendFuzzTest is ArcSendTestBase {
    /// @dev Reject precompiles, cheatcode/console addresses, contracts and the actors.
    function _eoa(address a) internal view returns (address) {
        uint256 v = bound(uint256(uint160(a)), 0x100000, type(uint160).max);
        address r = address(uint160(v));
        vm.assume(r.code.length == 0);
        vm.assume(r != address(arc) && r != address(this) && r != address(vm));
        vm.assume(r != alice && r != bob && r != carol && r != dave);
        vm.assume(r != 0x000000000000000000636F6e736F6c652e6c6f67);
        return r;
    }

    // ---------- send ----------

    function testFuzz_Send_ForwardsExactly(address to, uint256 amount, bytes32 memo) public {
        to = _eoa(to);
        amount = bound(amount, 1, 500 ether);
        uint256 toBefore = to.balance;
        uint256 aBefore = alice.balance;

        vm.expectEmit(true, true, true, true, address(arc));
        emit ArcSend.Payment(alice, to, amount, memo);
        vm.prank(alice);
        arc.send{value: amount}(payable(to), memo);

        assertEq(to.balance, toBefore + amount);
        assertEq(alice.balance, aBefore - amount);
        assertEq(address(arc).balance, 0);
    }

    function testFuzz_Send_RejectingRecipientAlwaysReverts(uint256 amount) public {
        amount = bound(amount, 1, 500 ether);
        Rejecter rej = new Rejecter();
        uint256 aBefore = alice.balance;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(rej), amount));
        arc.send{value: amount}(payable(address(rej)), MEMO);
        assertEq(alice.balance, aBefore);
    }

    // ---------- batches ----------

    function testFuzz_SendBatch_SumsAndDelivers(uint256 n, uint256 seed) public {
        n = bound(n, 1, 100);
        address payable[] memory tos = _fresh(n);
        uint256[] memory amts = new uint256[](n);
        uint256 total;
        for (uint256 i; i < n; i++) {
            amts[i] = bound(uint256(keccak256(abi.encode(seed, i))), 1, 1 ether);
            total += amts[i];
        }
        uint256 aBefore = alice.balance;

        vm.expectEmit(true, false, false, true, address(arc));
        emit ArcSend.BatchSent(alice, total, n);
        vm.prank(alice);
        arc.sendBatch{value: total}(tos, amts, _m(n));

        uint256 received;
        for (uint256 i; i < n; i++) {
            received += tos[i].balance;
        }
        assertEq(received, total);
        assertEq(alice.balance, aBefore - total);
        assertEq(address(arc).balance, 0);
    }

    function testFuzz_SendBatch_WrongValueReverts(uint256 n, uint256 delta) public {
        n = bound(n, 1, 20);
        delta = bound(delta, 1, 10 ether);
        uint256 total = n * 1 ether;
        // either under- or over-pay
        uint256 supplied = delta % 2 == 0 ? total + delta : total - (delta % total);
        vm.assume(supplied != total);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.IncorrectValue.selector, supplied, total));
        arc.sendBatch{value: supplied}(_fresh(n), _same(n, 1 ether), _m(n));
    }

    function _mixed(uint256 n, uint256 mask, uint256 seed, address rej)
        internal
        pure
        returns (address payable[] memory tos, uint256[] memory amts, uint256 total, uint256 expectedRefund)
    {
        tos = _fresh(n);
        amts = new uint256[](n);
        for (uint256 i; i < n; i++) {
            amts[i] = bound(uint256(keccak256(abi.encode(seed, i))), 1, 1 ether);
            total += amts[i];
            if ((mask >> i) & 1 == 1) {
                tos[i] = payable(rej);
                expectedRefund += amts[i];
            }
        }
    }

    function _popcount(uint256 mask, uint256 n) internal pure returns (uint256 c) {
        for (uint256 i; i < n; i++) {
            c += (mask >> i) & 1;
        }
    }

    function testFuzz_BestEffort_RefundEqualsRejectedSum(uint256 n, uint256 mask, uint256 seed) public {
        n = bound(n, 1, 12);
        Rejecter rej = new Rejecter();
        (address payable[] memory tos, uint256[] memory amts, uint256 total, uint256 expectedRefund) =
            _mixed(n, mask, seed, address(rej));
        uint256 aBefore = alice.balance;

        vm.expectEmit(true, false, false, true, address(arc));
        emit ArcSend.BatchSent(alice, total - expectedRefund, n - _popcount(mask, n));
        vm.prank(alice);
        uint256 refunded = arc.sendBatchBestEffort{value: total}(tos, amts, _m(n), 50_000);

        assertEq(refunded, expectedRefund);
        assertEq(alice.balance, aBefore - (total - expectedRefund));
        assertEq(address(rej).balance, 0);
        assertEq(address(arc).balance, 0);
    }

    function testFuzz_BestEffort_GasLimitValidity(uint256 g) public {
        vm.prank(alice);
        if (g < 30_000 || g > 500_000) {
            vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidGasLimit.selector, g));
        }
        arc.sendBatchBestEffort{value: 1 ether}(_t1(bob), _a1(1 ether), _m(1), g);
    }

    // ---------- escrow ----------

    function testFuzz_Escrow_DeadlineBounds(uint256 delta) public {
        delta = bound(delta, 0, 800 days);
        uint64 deadline = uint64(T0 + delta);
        vm.prank(alice);
        if (delta < 1 hours || delta > 365 days) {
            vm.expectRevert(abi.encodeWithSelector(ArcSend.InvalidDeadline.selector, deadline));
            arc.createEscrow{value: 1 ether}(bob, deadline, MEMO);
        } else {
            uint256 id = arc.createEscrow{value: 1 ether}(bob, deadline, MEMO);
            assertEq(arc.getEscrow(id).deadline, deadline);
            assertEq(arc.getEscrow(id).status, 1);
        }
    }

    function testFuzz_Escrow_ReclaimOnlyStrictlyAfterDeadline(uint256 delta, uint256 warpTo) public {
        delta = bound(delta, 1 hours, 365 days);
        uint256 id = _mkEscrow(alice, bob, 2 ether, delta);
        uint256 deadline = T0 + delta;
        warpTo = bound(warpTo, T0, deadline + 10 days);
        vm.warp(warpTo);
        vm.prank(alice);
        if (warpTo <= deadline) {
            vm.expectRevert(abi.encodeWithSelector(ArcSend.DeadlineNotPassed.selector, id, uint64(deadline)));
            arc.reclaimEscrow(id);
            assertEq(address(arc).balance, 2 ether);
        } else {
            uint256 aBefore = alice.balance;
            arc.reclaimEscrow(id);
            assertEq(alice.balance, aBefore + 2 ether);
            assertEq(address(arc).balance, 0);
        }
    }

    function testFuzz_Escrow_AmountRoundTrips(uint256 amount) public {
        amount = bound(amount, 1, 500 ether);
        uint256 id = _mkEscrow(alice, bob, amount, 1 days);
        assertEq(address(arc).balance, amount);
        uint256 bBefore = bob.balance;
        vm.prank(alice);
        arc.releaseEscrow(id);
        assertEq(bob.balance, bBefore + amount);
        assertEq(address(arc).balance, 0);
    }

    function testFuzz_Escrow_AmountBounds(uint256 amount) public {
        amount = bound(amount, 0, uint256(type(uint96).max) + 1000);
        vm.deal(alice, amount);
        vm.prank(alice);
        if (amount == 0) {
            vm.expectRevert(ArcSend.ZeroAmount.selector);
        } else if (amount > type(uint96).max) {
            vm.expectRevert(abi.encodeWithSelector(ArcSend.AmountTooLarge.selector, amount));
        }
        arc.createEscrow{value: amount}(bob, uint64(T0 + 1 days), MEMO);
    }

    // ---------- escrow refund destination ----------

    function testFuzz_Escrow_RefundDestination(address dest, uint256 amount, uint256 mode) public {
        dest = _eoa(dest);
        amount = bound(amount, 1, 500 ether);
        mode = bound(mode, 0, 2);
        uint256 id = _mkEscrow(alice, bob, amount, 1 days);

        vm.expectEmit(true, true, false, true, address(arc));
        emit ArcSend.EscrowRefundAddressSet(id, dest);
        vm.prank(alice);
        arc.setEscrowRefundAddress(id, dest);
        assertEq(arc.getEscrow(id).refundTo, dest);
        assertEq(address(arc).balance, amount);

        uint256 dBefore = dest.balance;
        uint256 aBefore = alice.balance;
        uint256 bBefore = bob.balance;

        if (mode == 0) {
            // payee-initiated refund
            vm.expectEmit(true, true, false, true, address(arc));
            emit ArcSend.EscrowRefunded(id, alice, amount, dest);
            vm.prank(bob);
            arc.refundEscrow(id);
            assertEq(dest.balance, dBefore + amount);
            assertEq(alice.balance, aBefore);
            assertEq(bob.balance, bBefore);
            assertEq(arc.getEscrow(id).status, 3);
        } else if (mode == 1) {
            // payer reclaim after deadline
            vm.warp(T0 + 1 days + 1);
            vm.expectEmit(true, true, false, true, address(arc));
            emit ArcSend.EscrowReclaimed(id, alice, amount, dest);
            vm.prank(alice);
            arc.reclaimEscrow(id);
            assertEq(dest.balance, dBefore + amount);
            assertEq(alice.balance, aBefore);
            assertEq(arc.getEscrow(id).status, 4);
        } else {
            // release ignores the refund address
            vm.prank(alice);
            arc.releaseEscrow(id);
            assertEq(dest.balance, dBefore);
            assertEq(bob.balance, bBefore + amount);
            assertEq(arc.getEscrow(id).status, 2);
        }
        assertEq(address(arc).balance, 0);
    }

    function testFuzz_Escrow_SetRefundAddressValidation(address dest, address caller) public {
        uint256 id = _mkEscrow(alice, bob, 1 ether, 1 days);
        vm.assume(caller != address(vm));
        vm.prank(caller);
        if (caller != alice) {
            vm.expectRevert(abi.encodeWithSelector(ArcSend.NotPayer.selector, id, caller));
        } else if (dest == address(0)) {
            vm.expectRevert(ArcSend.ZeroAddress.selector);
        } else if (dest == address(arc)) {
            vm.expectRevert(ArcSend.SelfTarget.selector);
        }
        arc.setEscrowRefundAddress(id, dest);
        if (caller == alice && dest != address(0) && dest != address(arc)) {
            assertEq(arc.getEscrow(id).refundTo, dest);
        } else {
            assertEq(arc.getEscrow(id).refundTo, alice);
        }
    }

    // ---------- requests ----------

    function testFuzz_Request_AmountValidation(uint256 amount) public {
        // bias toward boundaries as well as full range
        if (amount % 3 == 0) amount = bound(amount, 0, uint256(type(uint96).max) + 5);
        vm.prank(alice);
        if (amount == 0) {
            vm.expectRevert(ArcSend.ZeroAmount.selector);
        } else if (amount > type(uint96).max) {
            vm.expectRevert(abi.encodeWithSelector(ArcSend.AmountTooLarge.selector, amount));
        }
        arc.createRequest(bob, amount, 0, MEMO);
    }

    function testFuzz_Request_PayExactAmountOnly(uint256 amount, uint256 supplied) public {
        amount = bound(amount, 1, 500 ether);
        supplied = bound(supplied, 0, 600 ether);
        uint256 id = _mkRequest(alice, address(0), amount, 0);
        uint256 aBefore = alice.balance;
        vm.prank(bob);
        if (supplied != amount) {
            vm.expectRevert(abi.encodeWithSelector(ArcSend.IncorrectValue.selector, supplied, amount));
            arc.payRequest{value: supplied}(id);
            assertEq(arc.getRequest(id).status, 1);
        } else {
            arc.payRequest{value: supplied}(id);
            assertEq(alice.balance, aBefore + amount);
            assertEq(arc.getRequest(id).status, 2);
        }
        assertEq(address(arc).balance, 0);
    }

    function testFuzz_Request_ExpiryBoundary(uint256 expiryDelta, uint256 payDelta) public {
        expiryDelta = bound(expiryDelta, 0, 30 days);
        payDelta = bound(payDelta, 0, 60 days);
        uint64 exp = uint64(T0 + expiryDelta);
        uint256 id = _mkRequest(alice, address(0), 1 ether, exp);
        vm.warp(T0 + payDelta);
        vm.prank(bob);
        if (T0 + payDelta > exp) {
            vm.expectRevert(abi.encodeWithSelector(ArcSend.RequestExpired.selector, id, exp));
        }
        arc.payRequest{value: 1 ether}(id);
    }
}
