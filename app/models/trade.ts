import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Trade extends BaseModel {
  // Composite primary key: [chainId, transactionHash, poolId, blockTimestamp]
  // No single @column.isPrimary key

  // Chain and contract info
  @column()
  declare chainId: number

  @column()
  declare contractAddress: string

  // Trade data from Trade event
  @column()
  declare poolId: number

  @column()
  declare trader: string

  @column()
  declare sender: string

  @column()
  declare tokenAddress: string

  @column()
  declare tokenName: string

  @column()
  declare tokenTicker: string

  @column()
  declare tokenUri: string | null

  @column()
  declare quoteAmount: string

  @column()
  declare baseAmount: string

  @column()
  declare fee: string

  @column()
  declare side: number // 1 = buy, 2 = sell

  @column()
  declare poolEthBalance: string

  @column()
  declare poolTokenBalance: string

  // Blockchain transaction info
  @column()
  declare transactionHash: string

  @column()
  declare blockNumber: number

  @column.dateTime()
  declare blockTimestamp: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}