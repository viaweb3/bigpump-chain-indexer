import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ScannerState extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare chainId: number

  @column()
  declare scannerName: string

  @column()
  declare lastProcessedBlock: number

  @column()
  declare isRunning: boolean

  @column.dateTime()
  declare lastRunAt: DateTime | null

  @column.dateTime()
  declare lastSuccessAt: DateTime | null

  @column.dateTime()
  declare lastErrorAt: DateTime | null

  @column()
  declare lastErrorMessage: string | null

  @column()
  declare totalBlocksProcessed: number

  @column()
  declare totalEventsProcessed: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}