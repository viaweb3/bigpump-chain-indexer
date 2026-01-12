import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Enable TimescaleDB extension
    this.schema.raw('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;')

    // Convert trades table to hypertable for time-series optimization
    // This should run after the trades table is created
    this.schema.raw(`
      SELECT create_hypertable(
        'trades',
        'block_timestamp',
        if_not_exists => TRUE,
        migrate_data => TRUE
      );
    `)

    // Optional: Convert pools table to hypertable as well
    this.schema.raw(`
      SELECT create_hypertable(
        'pools',
        'block_timestamp',
        if_not_exists => TRUE,
        migrate_data => TRUE
      );
    `)

    // Create index for time-based queries
    this.schema.raw('CREATE INDEX IF NOT EXISTS trades_time_idx ON trades (block_timestamp DESC);')
    this.schema.raw('CREATE INDEX IF NOT EXISTS pools_time_idx ON pools (block_timestamp DESC);')
  }

  async down() {
    // Drop indexes
    this.schema.raw('DROP INDEX IF EXISTS trades_time_idx;')
    this.schema.raw('DROP INDEX IF EXISTS pools_time_idx;')

    // Note: Cannot easily revert hypertable conversion, so we just drop the extension
    // This will fail if other databases use timescaledb
    this.schema.raw('DROP EXTENSION IF EXISTS timescaledb CASCADE;')
  }
}
