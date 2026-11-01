/** ABI of contracts/ArcSend.sol (v2). Generated from the forge build artifact; regenerate it if the contract changes. */

export const ARC_SEND_ABI = [
  {
    type: 'function',
    name: 'IDENTIFIER',
    inputs: [],
    outputs: [
      { name: '', type: 'bytes32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MAX_BATCH',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MAX_ESCROW_DURATION',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MAX_RECIPIENT_GAS',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MIN_ESCROW_DURATION',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MIN_RECIPIENT_GAS',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'SETTLEMENT_GAS_RESERVE',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'cancelRequest',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createEscrow',
    inputs: [
      { name: 'payee', type: 'address' },
      { name: 'deadline', type: 'uint64' },
      { name: 'memo', type: 'bytes32' },
    ],
    outputs: [
      { name: 'id', type: 'uint256' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'createRequest',
    inputs: [
      { name: 'payer', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'expiry', type: 'uint64' },
      { name: 'memo', type: 'bytes32' },
    ],
    outputs: [
      { name: 'id', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'escrows',
    inputs: [
      { name: '', type: 'uint256' },
    ],
    outputs: [
      { name: 'payer', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'deadline', type: 'uint64' },
      { name: 'payee', type: 'address' },
      { name: 'amount', type: 'uint96' },
      { name: 'memo', type: 'bytes32' },
      { name: 'refundTo', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getEscrow',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'escrow',
        type: 'tuple',
        components: [
          { name: 'payer', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'deadline', type: 'uint64' },
          { name: 'payee', type: 'address' },
          { name: 'amount', type: 'uint96' },
          { name: 'memo', type: 'bytes32' },
          { name: 'refundTo', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getRequest',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'payee', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'expiry', type: 'uint64' },
          { name: 'payer', type: 'address' },
          { name: 'amount', type: 'uint96' },
          { name: 'memo', type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'identifier',
    inputs: [],
    outputs: [
      { name: '', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'nextEscrowId',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nextRequestId',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'payRequest',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'reclaimEscrow',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refundEscrow',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'releaseEscrow',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'requests',
    inputs: [
      { name: '', type: 'uint256' },
    ],
    outputs: [
      { name: 'payee', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'expiry', type: 'uint64' },
      { name: 'payer', type: 'address' },
      { name: 'amount', type: 'uint96' },
      { name: 'memo', type: 'bytes32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'send',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'memo', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'sendBatch',
    inputs: [
      { name: 'tos', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'memos', type: 'bytes32[]' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'sendBatchBestEffort',
    inputs: [
      { name: 'tos', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'memos', type: 'bytes32[]' },
      { name: 'gasPerRecipient', type: 'uint256' },
    ],
    outputs: [
      { name: 'refunded', type: 'uint256' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'setEscrowRefundAddress',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'newRefundTo', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'BatchSent',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'total', type: 'uint256', indexed: false },
      { name: 'count', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EscrowCreated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
      { name: 'memo', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EscrowReclaimed',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'refundTo', type: 'address', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EscrowRefundAddressSet',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'refundTo', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EscrowRefunded',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'refundTo', type: 'address', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EscrowReleased',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Payment',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'memo', type: 'bytes32', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PaymentSkipped',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'memo', type: 'bytes32', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RequestCancelled',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RequestCreated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'expiry', type: 'uint64', indexed: false },
      { name: 'memo', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RequestPaid',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AmountTooLarge',
    inputs: [
      { name: 'amount', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'BatchTooLarge',
    inputs: [
      { name: 'count', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'DeadlineNotPassed',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
    ],
  },
  { type: 'error', name: 'EmptyBatch', inputs: [] },
  {
    type: 'error',
    name: 'EscrowNotOpen',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'IncorrectValue',
    inputs: [
      { name: 'supplied', type: 'uint256' },
      { name: 'expected', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientGas',
    inputs: [
      { name: 'gasLeft', type: 'uint256' },
      { name: 'required', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'InvalidDeadline',
    inputs: [
      { name: 'deadline', type: 'uint64' },
    ],
  },
  {
    type: 'error',
    name: 'InvalidExpiry',
    inputs: [
      { name: 'expiry', type: 'uint64' },
    ],
  },
  {
    type: 'error',
    name: 'InvalidGasLimit',
    inputs: [
      { name: 'gasPerRecipient', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'LengthMismatch',
    inputs: [
      { name: 'tos', type: 'uint256' },
      { name: 'amounts', type: 'uint256' },
      { name: 'memos', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'NotPayee',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'caller', type: 'address' },
    ],
  },
  {
    type: 'error',
    name: 'NotPayer',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'caller', type: 'address' },
    ],
  },
  { type: 'error', name: 'ReentrantCall', inputs: [] },
  {
    type: 'error',
    name: 'RequestExpired',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'expiry', type: 'uint64' },
    ],
  },
  {
    type: 'error',
    name: 'RequestNotOpen',
    inputs: [
      { name: 'id', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'SelfTarget', inputs: [] },
  {
    type: 'error',
    name: 'TransferFailed',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
] as const
