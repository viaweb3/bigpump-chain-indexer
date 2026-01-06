export const CREATE_POOL_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        components: [
          { internalType: 'uint256', name: 'poolId', type: 'uint256' },
          { internalType: 'address', name: 'creator', type: 'address' },
          { internalType: 'address', name: 'tokenAddress', type: 'address' },
          { internalType: 'uint256', name: 'tokenDecimals', type: 'uint256' },
          { internalType: 'string', name: 'nftName', type: 'string' },
          { internalType: 'string', name: 'nftTicker', type: 'string' },
          { internalType: 'string', name: 'uri', type: 'string' },
          { internalType: 'string', name: 'nftDescription', type: 'string' },
          { internalType: 'uint256', name: 'conversionRate', type: 'uint256' },
          { internalType: 'uint256', name: 'tokenSupply', type: 'uint256' },
          { internalType: 'uint256', name: 'tokenBalance', type: 'uint256' },
          { internalType: 'uint256', name: 'ethBalance', type: 'uint256' },
          { internalType: 'uint256', name: 'nftPrice', type: 'uint256' },
          { internalType: 'uint256', name: 'feeRate', type: 'uint256' },
          { internalType: 'uint256', name: 'mintable', type: 'uint256' },
          { internalType: 'uint256', name: 'lpAmount', type: 'uint256' },
          { internalType: 'uint256', name: 'time', type: 'uint256' },
        ],
        indexed: false,
        internalType: 'struct CommonStructs.Pool',
        name: '',
        type: 'tuple',
      },
    ],
    name: 'NewPool',
    type: 'event',
  },
] as const
