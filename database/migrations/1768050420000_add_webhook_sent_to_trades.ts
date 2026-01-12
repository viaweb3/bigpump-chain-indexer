import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'trades'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.boolean('webhook_sent').defaultTo(false).index()
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('webhook_sent')
    })
  }
}
