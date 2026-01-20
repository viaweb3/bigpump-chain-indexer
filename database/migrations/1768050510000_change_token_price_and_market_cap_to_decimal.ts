import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pools'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Change token_price and market_cap from varchar to decimal
      // Using decimal(38, 18) to support large numbers with 18 decimal places
      // Removed .index() to avoid creating duplicate indexes
      table.decimal('token_price', 38, 18).nullable().alter()
      table.decimal('market_cap', 38, 18).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Revert back to varchar if needed
      // Removed .index() to avoid creating duplicate indexes
      table.string('token_price', 78).nullable().alter()
      table.string('market_cap', 78).nullable().alter()
    })
  }
}