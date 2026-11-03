// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title TopPay
/// @notice Native USDC payments, requests and escrow for Arc Mainnet (chain ID 5042).
/// @dev All amounts use native 18-decimal units: 1 USDC = 1e18, not the
///      6-decimal ERC-20 view. Only open escrows retain funds. No fees, admin,
///      recovery, receive or fallback exist; forcibly delivered funds stay locked.
contract TopPay {
    /// @notice Version identifier for frontend verification.
    /// @dev The tag is frozen at "ArcSend.v2", the contract's original name, so a contract deployed
    ///      from the earlier ArcSend source is still recognized by the app. Do not change it.
    bytes32 public constant IDENTIFIER = keccak256("ArcSend.v2");
    /// @notice Maximum number of recipients in one batch.
    uint256 public constant MAX_BATCH = 100;
    /// @notice Minimum gas allowance per best-effort recipient.
    uint256 public constant MIN_RECIPIENT_GAS = 30_000;
    /// @notice Maximum gas allowance per best-effort recipient.
    uint256 public constant MAX_RECIPIENT_GAS = 500_000;
    /// @notice Gas reserved beyond each best-effort recipient's allowance.
    uint256 public constant SETTLEMENT_GAS_RESERVE = 60_000;
    /// @notice Minimum escrow duration in seconds.
    uint256 public constant MIN_ESCROW_DURATION = 1 hours;
    /// @notice Maximum escrow duration in seconds.
    uint256 public constant MAX_ESCROW_DURATION = 365 days;

    uint8 private constant OPEN = 1;
    uint8 private constant PAID = 2;
    uint8 private constant CANCELLED = 3;
    uint8 private constant RELEASED = 2;
    uint8 private constant REFUNDED = 3;
    uint8 private constant RECLAIMED = 4;

    struct Request {
        address payee;
        uint8 status; // None = 0, Open = 1, Paid = 2, Cancelled = 3.
        uint64 expiry;
        address payer;
        uint96 amount;
        bytes32 memo;
    }

    struct Escrow {
        address payer;
        uint8 status; // None = 0, Open = 1, Released = 2, Refunded = 3, Reclaimed = 4.
        uint64 deadline;
        address payee;
        uint96 amount;
        bytes32 memo;
        address refundTo;
    }

    uint256 private _lock = 1;
    /// @notice ID that will be assigned to the next request.
    uint256 public nextRequestId = 1;
    /// @notice Stored requests; nonexistent IDs have status None (0).
    mapping(uint256 => Request) public requests;
    /// @notice ID that will be assigned to the next escrow.
    uint256 public nextEscrowId = 1;
    /// @notice Stored escrows; nonexistent IDs have status None (0).
    mapping(uint256 => Escrow) public escrows;

    error ZeroAddress();
    error SelfTarget();
    error ZeroAmount();
    error TransferFailed(address recipient, uint256 amount);
    error ReentrantCall();
    error LengthMismatch(uint256 tos, uint256 amounts, uint256 memos);
    error EmptyBatch();
    error BatchTooLarge(uint256 count);
    error InvalidGasLimit(uint256 gasPerRecipient);
    error InsufficientGas(uint256 gasLeft, uint256 required);
    error IncorrectValue(uint256 supplied, uint256 expected);
    error AmountTooLarge(uint256 amount);
    error InvalidExpiry(uint64 expiry);
    error RequestNotOpen(uint256 id);
    error RequestExpired(uint256 id, uint64 expiry);
    error NotPayer(uint256 id, address caller);
    error NotPayee(uint256 id, address caller);
    error InvalidDeadline(uint64 deadline);
    error EscrowNotOpen(uint256 id);
    error DeadlineNotPassed(uint256 id, uint64 deadline);

    event Payment(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed memo
    );
    event PaymentSkipped(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed memo
    );
    event BatchSent(address indexed from, uint256 total, uint256 count);
    event RequestCreated(
        uint256 indexed id, address indexed payee, address indexed payer,
        uint256 amount, uint64 expiry, bytes32 memo
    );
    event RequestPaid(
        uint256 indexed id, address indexed payer, address indexed payee, uint256 amount
    );
    event RequestCancelled(uint256 indexed id, address indexed payee);
    event EscrowCreated(
        uint256 indexed id, address indexed payer, address indexed payee,
        uint256 amount, uint64 deadline, bytes32 memo
    );
    event EscrowReleased(uint256 indexed id, address indexed payee, uint256 amount);
    event EscrowRefunded(uint256 indexed id, address indexed payer, uint256 amount, address refundTo);
    event EscrowReclaimed(uint256 indexed id, address indexed payer, uint256 amount, address refundTo);
    event EscrowRefundAddressSet(uint256 indexed id, address indexed refundTo);

    modifier nonReentrant() {
        if (_lock == 2) revert ReentrantCall();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Forward native USDC and emit a payment receipt.
    /// @param to Recipient of the full native value.
    /// @param memo Application-defined receipt reference.
    /// @dev msg.value is in native 18-decimal units (1 USDC = 1e18); reentrancy is blocked.
    ///      A recipient must not call back into TopPay from its receive hook: the
    ///      callback reverts with ReentrantCall. If propagated, the payment fails
    ///      safely and funds stay with the sender.
    function send(address payable to, bytes32 memo) external payable nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (to == address(this)) revert SelfTarget();
        if (msg.value == 0) revert ZeroAmount();

        // Emit before the external call; a failed transfer also rolls back the log.
        emit Payment(msg.sender, to, msg.value, memo);
        _transfer(to, msg.value);
    }

    /// @notice Atomically forward exact amounts to between 1 and 100 recipients.
    /// @param tos Recipients, excluding the zero address and this contract.
    /// @param amounts Nonzero amounts in native 18-decimal units.
    /// @param memos Application-defined receipt references, one per recipient.
    /// @dev msg.value must exactly equal the checked sum; any failure reverts all sends.
    ///      Reentrancy is blocked throughout the batch. A recipient must not call
    ///      back into TopPay from its receive hook: the callback reverts with
    ///      ReentrantCall. If propagated, the payment fails safely and all batch
    ///      funds stay with the sender.
    ///      On Arc, USDC restrictions (blocklist, zero address) can reject a
    ///      recipient even if it is an EOA, reverting the entire atomic batch.
    ///      Callers who must tolerate recipient rejection should use sendBatchBestEffort;
    ///      zero-address entries remain invalid in both batch methods.
    function sendBatch(
        address payable[] calldata tos,
        uint256[] calldata amounts,
        bytes32[] calldata memos
    ) external payable nonReentrant {
        uint256 total = _validateBatch(tos, amounts, memos);
        if (msg.value != total) revert IncorrectValue(msg.value, total);

        for (uint256 i; i < tos.length; ) {
            emit Payment(msg.sender, tos[i], amounts[i], memos[i]);
            _transfer(tos[i], amounts[i]);
            // i < tos.length <= MAX_BATCH (100), so incrementing i cannot overflow.
            unchecked { ++i; }
        }
        emit BatchSent(msg.sender, total, tos.length);
    }

    /// @notice Attempt each payment and refund amounts whose recipient calls fail.
    /// @param tos Between 1 and 100 recipients, excluding zero and this contract.
    /// @param amounts Nonzero amounts in native 18-decimal units.
    /// @param memos Application-defined receipt references, one per recipient.
    /// @param gasPerRecipient Recipient call gas allowance, from 30_000 to 500_000 inclusive.
    /// @return refunded Total failed-payment value returned to the caller.
    /// @dev Arrays must have equal lengths and msg.value must equal the checked sum.
    ///      All entries are validated before calls. Reentrancy is blocked. Payment is
    ///      emitted only after success; failed calls emit PaymentSkipped instead.
    ///      Each recipient call uses gasPerRecipient; exhausting the allowance skips
    ///      that payment and adds its amount to the refund. Before each call, gasleft()
    ///      must cover gasPerRecipient + SETTLEMENT_GAS_RESERVE or InsufficientGas
    ///      reverts the entire batch instead of falsely skipping a payment.
    ///      A recipient must not call back into TopPay from its receive hook: the
    ///      callback reverts with ReentrantCall. If propagated, the payment fails
    ///      safely and its funds are refunded to the sender.
    ///      Failed amounts are refunded via a full-gas, revert-on-failure transfer: a failed
    ///      refund rolls back the entire batch. No supplied value is retained and the
    ///      pre-call balance is preserved, excluding any forcibly delivered funds.
    ///      BatchSent reports only the successfully sent total and recipient count.
    function sendBatchBestEffort(
        address payable[] calldata tos,
        uint256[] calldata amounts,
        bytes32[] calldata memos,
        uint256 gasPerRecipient
    ) external payable nonReentrant returns (uint256 refunded) {
        if (gasPerRecipient < MIN_RECIPIENT_GAS || gasPerRecipient > MAX_RECIPIENT_GAS) revert InvalidGasLimit(gasPerRecipient);
        uint256 total = _validateBatch(tos, amounts, memos);
        if (msg.value != total) revert IncorrectValue(msg.value, total);

        uint256 successCount = 0;
        for (uint256 i; i < tos.length; ) {
            if (_sendBestEffort(tos[i], amounts[i], memos[i], gasPerRecipient)) {
                ++successCount;
            } else {
                refunded += amounts[i];
            }
            // i < tos.length <= MAX_BATCH (100), so incrementing i cannot overflow.
            unchecked { ++i; }
        }
        if (refunded > 0) _transfer(msg.sender, refunded);
        emit BatchSent(msg.sender, total - refunded, successCount);
    }

    /// @notice Create a single-use payment request payable to the caller.
    /// @param payer Restricted payer, or zero to allow anyone to pay.
    /// @param amount Requested native 18-decimal amount, fitting uint96 and nonzero.
    /// @param expiry Unix timestamp, or zero for no expiry; cannot be in the past.
    /// @param memo Application-defined receipt reference.
    /// @return id Newly created request ID.
    function createRequest(address payer, uint256 amount, uint64 expiry, bytes32 memo)
        external nonReentrant returns (uint256 id)
    {
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint96).max) revert AmountTooLarge(amount);
        if (expiry != 0 && expiry < block.timestamp) revert InvalidExpiry(expiry);
        if (payer == msg.sender) revert SelfTarget();

        id = nextRequestId++;
        requests[id] = Request(msg.sender, OPEN, expiry, payer, uint96(amount), memo);
        emit RequestCreated(id, msg.sender, payer, amount, expiry, memo);
    }

    /// @notice Pay an open, unexpired request exactly once with its exact amount.
    /// @param id Request ID to pay.
    /// @dev Marks the request Paid before forwarding; expiry is inclusive.
    function payRequest(uint256 id) external payable nonReentrant {
        Request storage request = requests[id];
        if (request.status != OPEN) revert RequestNotOpen(id);
        if (request.expiry != 0 && block.timestamp > request.expiry) revert RequestExpired(id, request.expiry);
        if (request.payer != address(0) && msg.sender != request.payer) revert NotPayer(id, msg.sender);
        uint256 amount = request.amount;
        if (msg.value != amount) revert IncorrectValue(msg.value, amount);

        request.status = PAID;
        emit RequestPaid(id, msg.sender, request.payee, amount);
        emit Payment(msg.sender, request.payee, amount, request.memo);
        _transfer(request.payee, amount);
    }

    /// @notice Cancel the caller's open request, including an expired open request.
    /// @param id Request ID to cancel.
    function cancelRequest(uint256 id) external nonReentrant {
        Request storage request = requests[id];
        if (request.status != OPEN) revert RequestNotOpen(id);
        if (msg.sender != request.payee) revert NotPayee(id, msg.sender);

        request.status = CANCELLED;
        emit RequestCancelled(id, msg.sender);
    }

    /// @notice Hold msg.value in a new escrow with the caller as payer.
    /// @param payee Recipient, excluding zero, the caller and this contract.
    /// @param deadline Unix timestamp in the inclusive range now + 1 hour to now + 365 days.
    /// @param memo Application-defined receipt reference.
    /// @return id Newly created escrow ID.
    /// @dev Value must be nonzero and fit uint96, in native 18-decimal units.
    ///      Refunds default to the payer, who can redirect them to an address that can receive funds.
    function createEscrow(address payee, uint64 deadline, bytes32 memo)
        external payable nonReentrant returns (uint256 id)
    {
        if (msg.value == 0) revert ZeroAmount();
        if (msg.value > type(uint96).max) revert AmountTooLarge(msg.value);
        if (payee == address(0)) revert ZeroAddress();
        if (payee == msg.sender || payee == address(this)) revert SelfTarget();
        if (
            deadline < block.timestamp + MIN_ESCROW_DURATION ||
            deadline > block.timestamp + MAX_ESCROW_DURATION
        ) revert InvalidDeadline(deadline);

        id = nextEscrowId++;
        escrows[id] = Escrow(msg.sender, OPEN, deadline, payee, uint96(msg.value), memo, msg.sender);
        emit EscrowCreated(id, msg.sender, payee, msg.value, deadline, memo);
    }

    /// @notice Redirect refunds of the caller's open escrow to an address that can receive funds.
    /// @param id Escrow ID whose refund destination is updated.
    /// @param newRefundTo Refund recipient, excluding zero and this contract.
    /// @dev Only the payer can update; payee-initiated refunds also use this destination.
    function setEscrowRefundAddress(uint256 id, address newRefundTo) external nonReentrant {
        Escrow storage escrow = escrows[id];
        if (escrow.status != OPEN) revert EscrowNotOpen(id);
        if (msg.sender != escrow.payer) revert NotPayer(id, msg.sender);
        if (newRefundTo == address(0)) revert ZeroAddress();
        if (newRefundTo == address(this)) revert SelfTarget();

        escrow.refundTo = newRefundTo;
        emit EscrowRefundAddressSet(id, newRefundTo);
    }

    /// @notice Release the caller's open escrow to its payee, even after its deadline.
    /// @param id Escrow ID to release.
    /// @dev The escrow becomes Released before the transfer; failure rolls back all effects.
    function releaseEscrow(uint256 id) external nonReentrant {
        Escrow storage escrow = escrows[id];
        if (escrow.status != OPEN) revert EscrowNotOpen(id);
        if (msg.sender != escrow.payer) revert NotPayer(id, msg.sender);
        uint256 amount = escrow.amount;

        escrow.status = RELEASED;
        emit EscrowReleased(id, escrow.payee, amount);
        emit Payment(escrow.payer, escrow.payee, amount, escrow.memo);
        _transfer(escrow.payee, amount);
    }

    /// @notice As the named payee, voluntarily refund an open escrow to the payer's refund address.
    /// @param id Escrow ID to refund, either before or after its deadline.
    /// @dev The escrow becomes Refunded before the transfer; no Payment receipt is emitted.
    function refundEscrow(uint256 id) external nonReentrant {
        Escrow storage escrow = escrows[id];
        if (escrow.status != OPEN) revert EscrowNotOpen(id);
        if (msg.sender != escrow.payee) revert NotPayee(id, msg.sender);
        uint256 amount = escrow.amount;

        escrow.status = REFUNDED;
        emit EscrowRefunded(id, escrow.payer, amount, escrow.refundTo);
        _transfer(escrow.refundTo, amount);
    }

    /// @notice Reclaim the caller's open escrow to its refund address strictly after its deadline.
    /// @param id Escrow ID to reclaim.
    /// @dev The escrow becomes Reclaimed before the transfer; no Payment receipt is emitted.
    function reclaimEscrow(uint256 id) external nonReentrant {
        Escrow storage escrow = escrows[id];
        if (escrow.status != OPEN) revert EscrowNotOpen(id);
        if (msg.sender != escrow.payer) revert NotPayer(id, msg.sender);
        if (block.timestamp <= escrow.deadline) revert DeadlineNotPassed(id, escrow.deadline);
        uint256 amount = escrow.amount;

        escrow.status = RECLAIMED;
        emit EscrowReclaimed(id, escrow.payer, amount, escrow.refundTo);
        _transfer(escrow.refundTo, amount);
    }

    /// @notice Read the full request record; nonexistent IDs return a zeroed record.
    /// @param id Request ID to read.
    /// @return request Stored request, with status None (0) if nonexistent.
    function getRequest(uint256 id) external view returns (Request memory request) {
        return requests[id];
    }

    /// @notice Read the full escrow record; nonexistent IDs return a zeroed record.
    /// @param id Escrow ID to read.
    /// @return escrow Stored escrow, with status None (0) if nonexistent.
    function getEscrow(uint256 id) external view returns (Escrow memory escrow) {
        return escrows[id];
    }

    /// @notice Return the public version identifier for frontend verification.
    /// @return Version hash keccak256("ArcSend.v2") (frozen tag, see IDENTIFIER).
    function identifier() external pure returns (bytes32) {
        return IDENTIFIER;
    }

    function _validateBatch(
        address payable[] calldata tos,
        uint256[] calldata amounts,
        bytes32[] calldata memos
    ) private view returns (uint256 total) {
        uint256 count = tos.length;
        if (count != amounts.length || count != memos.length) revert LengthMismatch(count, amounts.length, memos.length);
        if (count == 0) revert EmptyBatch();
        if (count > MAX_BATCH) revert BatchTooLarge(count);

        for (uint256 i; i < count; ) {
            if (tos[i] == address(0)) revert ZeroAddress();
            if (tos[i] == address(this)) revert SelfTarget();
            if (amounts[i] == 0) revert ZeroAmount();
            total += amounts[i];
            // i < count <= MAX_BATCH (100), so incrementing i cannot overflow.
            unchecked { ++i; }
        }
    }

    function _sendBestEffort(
        address to,
        uint256 amount,
        bytes32 memo,
        uint256 gasPerRecipient
    ) private returns (bool ok) {
        uint256 required = gasPerRecipient + SETTLEMENT_GAS_RESERVE;
        uint256 gasLeft = gasleft();
        if (gasLeft < required) revert InsufficientGas(gasLeft, required);
        (ok, ) = to.call{value: amount, gas: gasPerRecipient}("");
        if (ok) {
            emit Payment(msg.sender, to, amount, memo);
        } else {
            emit PaymentSkipped(msg.sender, to, amount, memo);
        }
    }

    function _transfer(address recipient, uint256 amount) private {
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert TransferFailed(recipient, amount);
    }
}
