import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Pool extends BaseModel {
  // Composite primary key: [chainId, poolId, transactionHash, blockTimestamp]
  // Use transactionHash as Lucid's primary key (even though DB has composite key)
  public static selfAssignPrimaryKey = true
  public static primaryKey = 'transactionHash'

  // Chain and contract info
  @column()
  declare chainId: number

  @column()
  declare contractAddress: string

  // Pool data from NewPool event
  @column()
  declare poolId: number

  @column()
  declare creator: string

  @column()
  declare tokenAddress: string

  @column()
  declare tokenDecimals: number

  @column()
  declare nftName: string

  @column()
  declare nftTicker: string

  @column()
  declare uri: string | null

  @column()
  declare nftDescription: string | null

  @column()
  declare conversionRate: string

  @column()
  declare tokenSupply: string

  @column()
  declare tokenBalance: string

  @column()
  declare ethBalance: string

  @column()
  declare nftPrice: string

  @column()
  declare feeRate: string

  @column()
  declare mintable: number

  @column()
  declare lpAmount: string

  // Blockchain transaction info
  @column({ isPrimary: true })
  declare transactionHash: string

  @column()
  declare blockNumber: number

  @column.dateTime()
  declare blockTimestamp: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Webhook tracking
  @column()
  declare webhookSent: boolean
}
