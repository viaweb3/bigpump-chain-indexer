import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'scanner_states'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Chain and scanner identifier
      table.integer('chain_id').notNullable()
      table.string('scanner_name', 100).notNullable() // e.g., 'bsc-main', 'eth-main'

      // Last processed block
      table.bigInteger('last_processed_block').notNullable().defaultTo(0)

      // Status tracking
      table.boolean('is_running').notNullable().defaultTo(false)
      table.timestamp('last_run_at').nullable()
      table.timestamp('last_success_at').nullable()
      table.timestamp('last_error_at').nullable()
      table.text('last_error_message').nullable()

      // Statistics
      table.bigInteger('total_blocks_processed').notNullable().defaultTo(0)
      table.bigInteger('total_events_processed').notNullable().defaultTo(0)

      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Unique constraint for chain_id and scanner_name combination
      table.unique(['chain_id', 'scanner_name'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}