import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Optimize indexes for pools table
    this.schema.alterTable('pools', (table) => {
      // Add composite index for chain_id + pool_id - used by showByPoolId endpoint
      table.index(['chain_id', 'pool_id'], 'pools_chain_id_pool_id_idx')

      // Add index for webhook_sent field - used by webhook sender service
      table.index(['webhook_sent'], 'pools_webhook_sent_idx')
    })

    // Optimize indexes for trades table
    this.schema.alterTable('trades', (table) => {
      // Add composite index for chain_id + pool_id + block_timestamp - most common query pattern
      table.index(
        ['chain_id', 'pool_id', 'block_timestamp'],
        'trades_chain_id_pool_id_block_timestamp_idx'
      )

      // Add composite index for pool_id + chain_id - used by kline endpoint
      table.index(['pool_id', 'chain_id'], 'trades_pool_id_chain_id_idx')

      // Add index for webhook_sent field - used by webhook sender service
      table.index(['webhook_sent'], 'trades_webhook_sent_idx')
    })
  }

  async down() {
    // Remove indexes from pools table
    this.schema.alterTable('pools', (table) => {
      table.dropIndex(['chain_id', 'pool_id'], 'pools_chain_id_pool_id_idx')
      table.dropIndex(['webhook_sent'], 'pools_webhook_sent_idx')
    })

    // Remove indexes from trades table
    this.schema.alterTable('trades', (table) => {
      table.dropIndex(
        ['chain_id', 'pool_id', 'block_timestamp'],
        'trades_chain_id_pool_id_block_timestamp_idx'
      )
      table.dropIndex(['pool_id', 'chain_id'], 'trades_pool_id_chain_id_idx')
      table.dropIndex(['webhook_sent'], 'trades_webhook_sent_idx')
    })
  }
}
