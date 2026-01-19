import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pools'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('token_price', 78).nullable().index()
      table.string('market_cap', 78).nullable().index()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('token_price')
      table.dropColumn('market_cap')
    })
  }
}