import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pools'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // Chain and contract info
      table.integer('chain_id').notNullable().index()
      table.string('contract_address', 42).notNullable()

      // Pool data from NewPool event
      table.bigInteger('pool_id').notNullable()
      table.string('creator', 42).notNullable().index()
      table.string('token_address', 42).notNullable().index()
      table.integer('token_decimals').notNullable()
      table.string('nft_name', 255).notNullable()
      table.string('nft_ticker', 100).notNullable()
      table.text('uri')
      table.text('nft_description')
      table.string('conversion_rate', 78).notNullable() // Use string for big numbers
      table.string('token_supply', 78).notNullable()
      table.string('token_balance', 78).notNullable()
      table.string('eth_balance', 78).notNullable()
      table.string('nft_price', 78).notNullable()
      table.string('fee_rate', 78).notNullable()
      table.integer('mintable').notNullable()
      table.string('lp_amount', 78).notNullable()

      // Blockchain transaction info
      table.string('transaction_hash', 66).notNullable().index()
      table.bigInteger('block_number').notNullable().index()
      table.timestamp('block_timestamp').notNullable().index()

      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Primary key includes block_timestamp for TimescaleDB hypertable compatibility
      table.primary(['chain_id', 'pool_id', 'transaction_hash', 'block_timestamp'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
