// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcSend} from "../ArcSend.sol";

/// Drives bounded random actions against ArcSend and tracks ghost accounting.
contract ArcSendHandler is Test {
    ArcSend public arc;

    address[] public actors; // fund-holding participants (EOAs)
    address[] public sinks; // pure recipients of send/sendBatch

    uint256 public ghostOpenEscrow; // sum of amounts of escrows currently open
    uint256 public ghostForced; // value forcibly added to the contract
    uint256 public ghostForwarded; // value forwarded by send/sendBatch/sendBatchBestEffort/payRequest to sinks
    uint256 public ghostRequestPaidCount;
    uint256 public ghostRequestSettledTwice; // must stay 0
    uint256 public ghostRedirects; // number of refund-address updates performed

    uint256[] public requestIds;
    mapping(uint256 => bool) public paidSeen;

    constructor(ArcSend _arc) {
        arc = _arc;
        for (uint256 i; i < 5; i++) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            vm.deal(a, 1_000_000 ether);
        }
        for (uint256 i; i < 4; i++) {
            sinks.push(makeAddr(string.concat("sink", vm.toString(i))));
        }
    }

    function actorsTotal() external view returns (uint256 t) {
        for (uint256 i; i < actors.length; i++) {
            t += actors[i].balance;
        }
    }

    function sinksTotal() external view returns (uint256 t) {
        for (uint256 i; i < sinks.length; i++) {
            t += sinks[i].balance;
        }
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function _sink(uint256 s) internal view returns (address) {
        return sinks[s % sinks.length];
    }

    // ---- stateless flows ----

    function send(uint256 who, uint256 to, uint256 amount) external {
        amount = bound(amount, 1, 1_000 ether);
        address from = _actor(who);
        vm.prank(from);
        arc.send{value: amount}(payable(_sink(to)), bytes32(amount));
        ghostForwarded += amount;
    }

    function sendBatch(uint256 who, uint256 n, uint256 seed) external {
        n = bound(n, 1, 20);
        address payable[] memory tos = new address payable[](n);
        uint256[] memory amts = new uint256[](n);
        bytes32[] memory memos = new bytes32[](n);
        uint256 total;
        for (uint256 i; i < n; i++) {
            tos[i] = payable(_sink(uint256(keccak256(abi.encode(seed, i, "t")))));
            amts[i] = bound(uint256(keccak256(abi.encode(seed, i))), 1, 100 ether);
            memos[i] = bytes32(i);
            total += amts[i];
        }
        vm.prank(_actor(who));
        arc.sendBatch{value: total}(tos, amts, memos);
        ghostForwarded += total;
    }

    function sendBatchBestEffort(uint256 who, uint256 n, uint256 seed) external {
        n = bound(n, 1, 20);
        address payable[] memory tos = new address payable[](n);
        uint256[] memory amts = new uint256[](n);
        bytes32[] memory memos = new bytes32[](n);
        uint256 total;
        for (uint256 i; i < n; i++) {
            tos[i] = payable(_sink(uint256(keccak256(abi.encode(seed, i, "t")))));
            amts[i] = bound(uint256(keccak256(abi.encode(seed, i))), 1, 100 ether);
            memos[i] = bytes32(i);
            total += amts[i];
        }
        vm.prank(_actor(who));
        uint256 refunded = arc.sendBatchBestEffort{value: total}(tos, amts, memos, 50_000);
        ghostForwarded += total - refunded;
    }

    // ---- requests ----

    function createRequest(uint256 who, uint256 amount) external {
        amount = bound(amount, 1, 1_000 ether);
        vm.prank(_actor(who));
        uint256 id = arc.createRequest(address(0), amount, 0, bytes32(amount));
        requestIds.push(id);
    }

    function payRequest(uint256 who, uint256 idSeed) external {
        if (requestIds.length == 0) return;
        uint256 id = requestIds[idSeed % requestIds.length];
        ArcSend.Request memory r = arc.getRequest(id);
        address payer = _actor(who);
        if (payer == r.payee) payer = _actor(who + 1);
        if (r.status != 1) {
            // must revert: settled twice would be a bug
            vm.prank(payer);
            try arc.payRequest{value: r.amount}(id) {
                ghostRequestSettledTwice++;
            } catch {}
            return;
        }
        vm.prank(payer);
        arc.payRequest{value: r.amount}(id);
        if (paidSeen[id]) ghostRequestSettledTwice++;
        paidSeen[id] = true;
        ghostRequestPaidCount++;
    }

    function cancelRequest(uint256 idSeed) external {
        if (requestIds.length == 0) return;
        uint256 id = requestIds[idSeed % requestIds.length];
        ArcSend.Request memory r = arc.getRequest(id);
        if (r.status != 1) return;
        vm.prank(r.payee);
        arc.cancelRequest(id);
    }

    // ---- escrows ----

    function createEscrow(uint256 who, uint256 to, uint256 amount, uint256 dur) external {
        amount = bound(amount, 1, 1_000 ether);
        dur = bound(dur, 1 hours, 365 days);
        address payer = _actor(who);
        address payee = _actor(to);
        if (payee == payer) payee = _actor(to + 1);
        vm.prank(payer);
        arc.createEscrow{value: amount}(payee, uint64(block.timestamp + dur), bytes32(amount));
        ghostOpenEscrow += amount;
    }

    function _openEscrow(uint256 idSeed) internal view returns (bool ok, uint256 id, ArcSend.Escrow memory e) {
        uint256 next = arc.nextEscrowId();
        if (next == 1) return (false, 0, e);
        id = bound(idSeed, 1, next - 1);
        e = arc.getEscrow(id);
        ok = e.status == 1;
    }

    /// Payer redirects the refund to another participant (actors only, so sink accounting stays exact).
    function setEscrowRefundAddress(uint256 idSeed, uint256 to) external {
        (bool ok, uint256 id, ArcSend.Escrow memory e) = _openEscrow(idSeed);
        if (!ok) return;
        address dest = _actor(to);
        vm.prank(e.payer);
        arc.setEscrowRefundAddress(id, dest);
        ghostRedirects++;
        require(arc.getEscrow(id).refundTo == dest, "refundTo not set");
    }

    function releaseEscrow(uint256 idSeed) external {
        (bool ok, uint256 id, ArcSend.Escrow memory e) = _openEscrow(idSeed);
        if (!ok) return;
        vm.prank(e.payer);
        arc.releaseEscrow(id);
        ghostOpenEscrow -= e.amount;
    }

    function refundEscrow(uint256 idSeed) external {
        (bool ok, uint256 id, ArcSend.Escrow memory e) = _openEscrow(idSeed);
        if (!ok) return;
        vm.prank(e.payee);
        arc.refundEscrow(id);
        ghostOpenEscrow -= e.amount;
    }

    function reclaimEscrow(uint256 idSeed) external {
        (bool ok, uint256 id, ArcSend.Escrow memory e) = _openEscrow(idSeed);
        if (!ok || block.timestamp <= e.deadline) return;
        vm.prank(e.payer);
        arc.reclaimEscrow(id);
        ghostOpenEscrow -= e.amount;
    }

    function warp(uint256 secs) external {
        secs = bound(secs, 0, 30 days);
        vm.warp(block.timestamp + secs);
    }

    function forceFunds(uint256 amount) external {
        amount = bound(amount, 1, 10 ether);
        vm.deal(address(arc), address(arc).balance + amount);
        ghostForced += amount;
    }
}

contract ArcSendInvariantTest is Test {
    ArcSend internal arc;
    ArcSendHandler internal handler;
    uint256 internal initialActorTotal;

    function setUp() public {
        vm.warp(1_700_000_000);
        arc = new ArcSend();
        handler = new ArcSendHandler(arc);
        initialActorTotal = handler.actorsTotal();
        // Fuzzed callers must never be the funded participants (forge resets/uses sender accounts).
        for (uint256 i; i < 5; i++) excludeSender(handler.actors(i));
        for (uint256 i; i < 4; i++) excludeSender(handler.sinks(i));
        excludeSender(address(arc));
        targetContract(address(handler));
    }

    function _onChainOpenSum() internal view returns (uint256 s) {
        uint256 next = arc.nextEscrowId();
        for (uint256 id = 1; id < next; id++) {
            ArcSend.Escrow memory e = arc.getEscrow(id);
            if (e.status == 1) s += e.amount;
        }
    }

    /// Contract balance always covers every open escrow.
    function invariant_BalanceCoversOpenEscrows() public view {
        assertGe(address(arc).balance, _onChainOpenSum());
    }

    /// Balance equals open escrows plus whatever was forcibly sent.
    function invariant_BalanceEqualsOpenEscrowsPlusForced() public view {
        assertEq(address(arc).balance, _onChainOpenSum() + handler.ghostForced());
    }

    /// Handler bookkeeping agrees with on-chain escrow state.
    function invariant_GhostOpenMatchesOnChain() public view {
        assertEq(handler.ghostOpenEscrow(), _onChainOpenSum());
    }

    /// Everything forwarded by send/batch flows was received by the sinks, nothing more, nothing less.
    function invariant_ForwardedEqualsReceivedBySinks() public view {
        // sinks only ever receive from send/sendBatch/sendBatchBestEffort in this handler;
        // payRequest/escrow pay actors, never sinks.
        assertEq(handler.sinksTotal(), handler.ghostForwarded());
    }

    /// Value is conserved: actors + sinks + contract == initial funds + forced funds (no fees, no leaks).
    function invariant_ValueConserved() public view {
        uint256 a;
        string memory per;
        for (uint256 i; i < 5; i++) {
            uint256 bal = handler.actors(i).balance;
            a += bal;
            per = string.concat(per, " ", vm.toString(bal / 1e18));
        }
        assertEq(
            a + handler.sinksTotal() + address(arc).balance,
            initialActorTotal + handler.ghostForced(),
            string.concat("per-actor(eth):", per, " handlerBal=", vm.toString(address(handler).balance), " open=", vm.toString(handler.ghostOpenEscrow() / 1e18))
        );
    }

    /// Every open escrow always has a usable refund destination (never zero, never ArcSend itself).
    function invariant_OpenEscrowsHaveValidRefundTo() public view {
        uint256 next = arc.nextEscrowId();
        for (uint256 id = 1; id < next; id++) {
            ArcSend.Escrow memory e = arc.getEscrow(id);
            if (e.status == 1) {
                assertTrue(e.refundTo != address(0));
                assertTrue(e.refundTo != address(arc));
            }
        }
    }

    /// A request is never paid twice.
    function invariant_RequestsPaidAtMostOnce() public view {
        assertEq(handler.ghostRequestSettledTwice(), 0);
    }
}
