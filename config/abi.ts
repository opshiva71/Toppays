/** ABI of contracts/ArcSend.sol. Kept separate from config/contract.ts so it can be regenerated. */

export const ARC_SEND_ABI = [
  {
    type: 'function',
    name: 'send',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'memo', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'identifier',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'IDENTIFIER',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'Payment',
    anonymous: false,
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'memo', type: 'bytes32', indexed: true },
    ],
  },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'SelfTarget', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  {
    type: 'error',
    name: 'TransferFailed',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
] as const
