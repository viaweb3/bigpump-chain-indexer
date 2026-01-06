export const BONDING_CURVE_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        components: [
          { internalType: 'uint256', name: 'poolId', type: 'uint256' },
          { internalType: 'address', name: 'trader', type: 'address' },
          { internalType: 'address', name: 'sender', type: 'address' },
          { internalType: 'address', name: 'tokenAddress', type: 'address' },
          { internalType: 'string', name: 'tokenName', type: 'string' },
          { internalType: 'string', name: 'tokenTicker', type: 'string' },
          { internalType: 'string', name: 'tokenUri', type: 'string' },
          { internalType: 'uint256', name: 'quoteAmount', type: 'uint256' },
          { internalType: 'uint256', name: 'baseAmount', type: 'uint256' },
          { internalType: 'uint256', name: 'fee', type: 'uint256' },
          { internalType: 'uint256', name: 'side', type: 'uint256' },
          { internalType: 'uint256', name: 'poolEthBalance', type: 'uint256' },
          { internalType: 'uint256', name: 'poolTokenBalance', type: 'uint256' },
          { internalType: 'uint256', name: 'time', type: 'uint256' },
        ],
        indexed: false,
        internalType: 'struct CommonStructs.Trade',
        name: '',
        type: 'tuple',
      },
    ],
    name: 'Trade',
    type: 'event',
  },
] as const
