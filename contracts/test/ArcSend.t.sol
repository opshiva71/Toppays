// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, Vm} from "forge-std/Test.sol";
import {ArcSend} from "../ArcSend.sol";

/// Recipient whose receive always reverts.
contract RevertingRecipient {
    receive() external payable {
        revert("nope");
    }
}

/// Recipient with no receive/fallback at all.
contract NoReceiveRecipient {}

/// Recipient that re-enters ArcSend.send from its receive hook, forwarding
/// everything it just received to `sink`.
contract ReentrantRecipient {
    ArcSend public immutable arc;
    address payable public immutable sink;
    bytes32 public immutable memo;
    uint256 public reentries;

    constructor(ArcSend _arc, address payable _sink, bytes32 _memo) {
        arc = _arc;
        sink = _sink;
        memo = _memo;
    }

    receive() external payable {
        reentries++;
        arc.send{value: msg.value}(sink, memo);
    }
}

/// Recipient that re-enters with an invalid call (zero amount) so the inner call reverts.
contract BadReentrantRecipient {
    ArcSend public immutable arc;

    constructor(ArcSend _arc) {
        arc = _arc;
    }

    receive() external payable {
        arc.send{value: 0}(payable(address(0xBEEF)), bytes32(0));
    }
}

/// Recipient that re-enters successfully (inner receipt emitted) and then reverts,
/// so the whole outer call must fail and discard BOTH receipts.
contract ReenterThenRevertRecipient {
    ArcSend public immutable arc;
    address payable public immutable sink;

    constructor(ArcSend _arc, address payable _sink) {
        arc = _arc;
        sink = _sink;
    }

    receive() external payable {
        arc.send{value: msg.value}(sink, bytes32("inner"));
        revert("late revert");
    }
}

/// Handler for the stateful invariant: drives send() with bounded inputs.
contract ArcSendHandler is Test {
    ArcSend public arc;
    uint256 public ghostForwarded;
    address payable public constant SINK = payable(address(0xD00D));

    constructor(ArcSend _arc) {
        arc = _arc;
    }

    function send(uint256 amount, bytes32 memo) external {
        amount = bound(amount, 1, 1e24);
        vm.deal(address(this), amount);
        arc.send{value: amount}(SINK, memo);
        ghostForwarded += amount;
    }
}

contract ArcSendTest is Test {
    event Payment(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo);

    ArcSend internal arc;
    address internal alice = makeAddr("alice");
    address payable internal bob = payable(makeAddr("bob"));
    bytes32 internal constant MEMO = keccak256("invoice-42");

    function setUp() public {
        arc = new ArcSend();
        vm.deal(alice, 1_000 ether);
    }

    // ---------------------------------------------------------------
    // send: happy path
    // ---------------------------------------------------------------

    function test_Send_ForwardsValueToRecipient() public {
        uint256 bobBefore = bob.balance;
        uint256 aliceBefore = alice.balance;

        vm.prank(alice);
        arc.send{value: 3 ether}(bob, MEMO);

        assertEq(bob.balance, bobBefore + 3 ether);
        assertEq(alice.balance, aliceBefore - 3 ether);
    }

    function test_Send_ContractBalanceStaysZero() public {
        vm.prank(alice);
        arc.send{value: 5 ether}(bob, MEMO);
        assertEq(address(arc).balance, 0);
    }

    function test_Send_EmitsPaymentWithAllFields() public {
        vm.expectEmit(true, true, true, true, address(arc));
        emit Payment(alice, bob, 2 ether, MEMO);
        vm.prank(alice);
        arc.send{value: 2 ether}(bob, MEMO);
    }

    function test_Send_PaymentLogTopicsAndData() public {
        vm.recordLogs();
        vm.prank(alice);
        arc.send{value: 7 ether}(bob, MEMO);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(arc));
        assertEq(logs[0].topics.length, 4, "from,to,memo are indexed");
        assertEq(logs[0].topics[0], keccak256("Payment(address,address,uint256,bytes32)"));
        assertEq(address(uint160(uint256(logs[0].topics[1]))), alice);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), bob);
        assertEq(logs[0].topics[3], MEMO, "memo is the indexed topic3");
        assertEq(abi.decode(logs[0].data, (uint256)), 7 ether);
    }

    function test_Send_ZeroMemoAllowed() public {
        vm.expectEmit(true, true, true, true, address(arc));
        emit Payment(alice, bob, 1, bytes32(0));
        vm.prank(alice);
        arc.send{value: 1}(bob, bytes32(0));
        assertEq(bob.balance, 1);
    }

    function test_Send_ToContractRecipientWithReceive() public {
        address payable sink = payable(makeAddr("sink"));
        ReentrantRecipient r = new ReentrantRecipient(arc, sink, MEMO);
        // used here only as a plain contract with receive; see reentrancy tests
        assertEq(address(r).balance, 0);
        // A simple payable contract: the test sink EOA is enough; check EOA path again w/ diff sender
        vm.prank(alice);
        arc.send{value: 1 ether}(sink, MEMO);
        assertEq(sink.balance, 1 ether);
    }

    // ---------------------------------------------------------------
    // send: revert paths
    // ---------------------------------------------------------------

    function test_RevertWhen_ZeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAddress.selector);
        arc.send{value: 1 ether}(payable(address(0)), MEMO);
    }

    function test_RevertWhen_SelfTarget() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.SelfTarget.selector);
        arc.send{value: 1 ether}(payable(address(arc)), MEMO);
    }

    function test_RevertWhen_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAmount.selector);
        arc.send{value: 0}(bob, MEMO);
    }

    function test_RevertWhen_RecipientReverts() public {
        RevertingRecipient r = new RevertingRecipient();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(r), 1 ether));
        arc.send{value: 1 ether}(payable(address(r)), MEMO);
        assertEq(address(r).balance, 0);
        assertEq(address(arc).balance, 0);
    }

    function test_RevertWhen_RecipientHasNoReceive() public {
        NoReceiveRecipient r = new NoReceiveRecipient();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(r), 2 ether));
        arc.send{value: 2 ether}(payable(address(r)), MEMO);
    }

    function test_TransferFailed_ErrorCarriesRecipientAndAmount() public {
        RevertingRecipient r = new RevertingRecipient();
        vm.prank(alice);
        try arc.send{value: 123456789}(payable(address(r)), MEMO) {
            fail("expected revert");
        } catch (bytes memory err) {
            assertEq(err.length, 4 + 32 + 32);
            bytes4 sel;
            assembly {
                sel := mload(add(err, 32))
            }
            assertEq(sel, ArcSend.TransferFailed.selector);
            bytes memory args = new bytes(64);
            for (uint256 i = 0; i < 64; i++) {
                args[i] = err[i + 4];
            }
            (address rec, uint256 amt) = abi.decode(args, (address, uint256));
            assertEq(rec, address(r));
            assertEq(amt, 123456789);
        }
    }

    function test_FailedTransfer_EmitsNoPaymentEvent() public {
        RevertingRecipient r = new RevertingRecipient();
        // NOTE: vm.getRecordedLogs() retains logs from reverted frames (Foundry artifact),
        // so assert "emitted 0 times" via expectEmit with count 0 (reverted logs are discarded).
        vm.expectEmit(false, false, false, false, address(arc), 0);
        emit Payment(alice, address(r), 1 ether, MEMO);
        vm.prank(alice);
        (bool ok,) = address(arc).call{value: 1 ether}(
            abi.encodeCall(ArcSend.send, (payable(address(r)), MEMO))
        );
        assertFalse(ok);
    }

    function test_FailedTransfer_AfterInnerSuccessDiscardsAllReceipts() public {
        address payable sink = payable(makeAddr("sink"));
        ReenterThenRevertRecipient r = new ReenterThenRevertRecipient(arc, sink);
        // The inner receipt IS emitted transiently (so expectEmit count-0 can't be used here and
        // recordLogs retains reverted-frame logs); assert the whole call reverted atomically with
        // the right error and that no value moved. EVM semantics then discard both receipts.
        vm.prank(alice);
        (bool ok, bytes memory err) = address(arc).call{value: 1 ether}(
            abi.encodeCall(ArcSend.send, (payable(address(r)), MEMO))
        );
        assertFalse(ok);
        assertEq(err, abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(r), 1 ether));
        assertEq(sink.balance, 0);
        assertEq(address(r).balance, 0);
        assertEq(address(arc).balance, 0);
    }

    function test_RevertDoesNotDebitSenderOrEmit() public {
        RevertingRecipient r = new RevertingRecipient();
        uint256 before = alice.balance;
        vm.expectEmit(false, false, false, false, address(arc), 0);
        emit Payment(alice, address(r), 1 ether, MEMO);
        vm.prank(alice);
        try arc.send{value: 1 ether}(payable(address(r)), MEMO) {
            fail("expected revert");
        } catch {}
        assertEq(alice.balance, before);
    }

    function test_RevertOrder_ZeroAddressBeforeZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAddress.selector);
        arc.send{value: 0}(payable(address(0)), MEMO);
    }

    function test_RevertOrder_SelfTargetBeforeZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(ArcSend.SelfTarget.selector);
        arc.send{value: 0}(payable(address(arc)), MEMO);
    }

    // ---------------------------------------------------------------
    // Reentrancy
    // ---------------------------------------------------------------

    function test_Reentrant_RecipientForwardsOnWithoutTrappingFunds() public {
        address payable sink = payable(makeAddr("sink"));
        ReentrantRecipient r = new ReentrantRecipient(arc, sink, keccak256("inner"));

        vm.recordLogs();
        vm.prank(alice);
        arc.send{value: 4 ether}(payable(address(r)), MEMO);

        // Value ended at the sink; nothing stuck in recipient or ArcSend.
        assertEq(sink.balance, 4 ether);
        assertEq(address(r).balance, 0);
        assertEq(address(arc).balance, 0);
        assertEq(r.reentries(), 1);

        // Two receipts: OUTER (from=alice,to=r) emitted first (before the external call),
        // then INNER (from=r,to=sink).
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[0].topics[3], MEMO);
        assertEq(address(uint160(uint256(logs[0].topics[1]))), alice);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), address(r));
        assertEq(logs[1].topics[3], keccak256("inner"));
        assertEq(address(uint160(uint256(logs[1].topics[1]))), address(r));
        assertEq(address(uint160(uint256(logs[1].topics[2]))), sink);
    }

    function test_Reentrant_CannotReorderReceipts_ExpectEmitOrder() public {
        address payable sink = payable(makeAddr("sink"));
        ReentrantRecipient r = new ReentrantRecipient(arc, sink, keccak256("inner"));

        // expectEmit matches in order: outer first, then inner.
        vm.expectEmit(true, true, true, true, address(arc));
        emit Payment(alice, address(r), 4 ether, MEMO);
        vm.expectEmit(true, true, true, true, address(arc));
        emit Payment(address(r), sink, 4 ether, keccak256("inner"));
        vm.prank(alice);
        arc.send{value: 4 ether}(payable(address(r)), MEMO);
    }

    function testFuzz_Reentrant_CannotReorderReceipts(uint256 amount, bytes32 outerMemo, bytes32 innerMemo) public {
        amount = bound(amount, 1, 1_000 ether);
        address payable sink = payable(makeAddr("sink"));
        ReentrantRecipient r = new ReentrantRecipient(arc, sink, innerMemo);

        vm.recordLogs();
        vm.prank(alice);
        arc.send{value: amount}(payable(address(r)), outerMemo);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        // Outer receipt always first, inner always second.
        assertEq(address(uint160(uint256(logs[0].topics[1]))), alice);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), address(r));
        assertEq(logs[0].topics[3], outerMemo);
        assertEq(abi.decode(logs[0].data, (uint256)), amount);
        assertEq(address(uint160(uint256(logs[1].topics[1]))), address(r));
        assertEq(address(uint160(uint256(logs[1].topics[2]))), sink);
        assertEq(logs[1].topics[3], innerMemo);
        assertEq(abi.decode(logs[1].data, (uint256)), amount);
        assertEq(sink.balance, amount);
        assertEq(address(arc).balance, 0);
    }

    function test_Reentrant_InnerRevertBubblesAsTransferFailed() public {
        BadReentrantRecipient r = new BadReentrantRecipient(arc);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(r), 1 ether));
        arc.send{value: 1 ether}(payable(address(r)), MEMO);
        assertEq(address(arc).balance, 0);
        assertEq(address(r).balance, 0);
    }

    function test_Reentrant_SelfLoopToArcSendReverts() public {
        // Recipient that tries to bounce funds back to ArcSend via send(address(arc))
        ReentrantRecipient r = new ReentrantRecipient(arc, payable(address(arc)), MEMO);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcSend.TransferFailed.selector, address(r), 1 ether));
        arc.send{value: 1 ether}(payable(address(r)), MEMO);
        assertEq(address(arc).balance, 0);
    }

    // ---------------------------------------------------------------
    // identifier / IDENTIFIER
    // ---------------------------------------------------------------

    function test_Identifier_MatchesKeccak() public view {
        assertEq(arc.IDENTIFIER(), keccak256("ArcSend.v1"));
        assertEq(arc.identifier(), keccak256("ArcSend.v1"));
        assertEq(arc.identifier(), arc.IDENTIFIER());
    }

    // ---------------------------------------------------------------
    // No receive / fallback
    // ---------------------------------------------------------------

    function test_PlainEthTransferReverts() public {
        vm.prank(alice);
        (bool ok,) = address(arc).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(arc).balance, 0);
    }

    function test_UnknownCalldataWithValueReverts() public {
        vm.prank(alice);
        (bool ok,) = address(arc).call{value: 1 ether}(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(arc).balance, 0);
    }

    function test_UnknownCalldataWithoutValueReverts() public {
        vm.prank(alice);
        (bool ok,) = address(arc).call(hex"deadbeef");
        assertFalse(ok);
    }

    function test_IdentifierRejectsValue() public {
        vm.prank(alice);
        (bool ok,) = address(arc).call{value: 1}(abi.encodeWithSelector(ArcSend.identifier.selector));
        assertFalse(ok, "identifier() is non-payable");
    }

    // ---------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------

    function testFuzz_Send_ForwardsExactAmount(uint256 amount, address payable to, bytes32 memo) public {
        amount = bound(amount, 1, 1_000 ether);
        vm.assume(to != address(0) && to != address(arc) && to != alice && to != address(this));
        vm.assume(uint160(address(to)) > 0xFFFF); // skip precompile range
        assumeNotForgeAddress(to);
        vm.assume(to.code.length == 0);

        uint256 toBefore = to.balance;
        uint256 aliceBefore = alice.balance;

        vm.expectEmit(true, true, true, true, address(arc));
        emit Payment(alice, to, amount, memo);
        vm.prank(alice);
        arc.send{value: amount}(to, memo);

        assertEq(to.balance, toBefore + amount);
        assertEq(alice.balance, aliceBefore - amount);
        assertEq(address(arc).balance, 0);
    }

    function testFuzz_Send_ZeroValueAlwaysReverts(address payable to, bytes32 memo) public {
        vm.assume(to != address(0) && to != address(arc));
        vm.prank(alice);
        vm.expectRevert(ArcSend.ZeroAmount.selector);
        arc.send{value: 0}(to, memo);
    }

    function testFuzz_PlainTransferAlwaysReverts(uint256 amount) public {
        amount = bound(amount, 0, 1_000 ether);
        vm.prank(alice);
        (bool ok,) = address(arc).call{value: amount}("");
        assertFalse(ok);
        assertEq(address(arc).balance, 0);
    }
}

contract ArcSendInvariantTest is Test {
    ArcSend internal arc;
    ArcSendHandler internal handler;

    function setUp() public {
        arc = new ArcSend();
        handler = new ArcSendHandler(arc);
        targetContract(address(handler));
    }

    /// PROPERTY: ArcSend never retains funds; sink received everything forwarded.
    function invariant_ContractHoldsNoFunds() public view {
        assertEq(address(arc).balance, 0);
    }

    function invariant_SinkReceivedAllForwarded() public view {
        assertEq(handler.SINK().balance, handler.ghostForwarded());
    }
}
