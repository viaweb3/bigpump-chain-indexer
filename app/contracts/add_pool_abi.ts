export const ADD_POOL_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'poolId',
        type: 'uint256',
      },
    ],
    name: 'AddPool',
    type: 'event',
  },
] as const
