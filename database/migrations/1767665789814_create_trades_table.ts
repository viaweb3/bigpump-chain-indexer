import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'trades'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // Chain and contract info
      table.integer('chain_id').notNullable().index()
      table.string('contract_address', 42).notNullable()

      // Trade data from Trade event
      table.bigInteger('pool_id').notNullable().index()
      table.string('trader', 42).notNullable().index()
      table.string('sender', 42).notNullable()
      table.string('token_address', 42).notNullable().index()
      table.string('token_name', 255).notNullable()
      table.string('token_ticker', 100).notNullable()
      table.text('token_uri')
      table.string('quote_amount', 78).notNullable() // Use string for big numbers
      table.string('base_amount', 78).notNullable()
      table.string('fee', 78).notNullable()
      table.integer('side').notNullable() // 1 = buy, 2 = sell
      table.string('pool_eth_balance', 78).notNullable()
      table.string('pool_token_balance', 78).notNullable()

      // Blockchain transaction info
      table.string('transaction_hash', 66).notNullable().index()
      table.bigInteger('block_number').notNullable().index()
      table.timestamp('block_timestamp').notNullable().index()

      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Primary key includes block_timestamp for TimescaleDB hypertable compatibility
      table.primary(['chain_id', 'transaction_hash', 'pool_id', 'block_timestamp'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
