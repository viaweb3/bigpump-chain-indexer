import type { HttpContext } from '@adonisjs/core/http'
import ScannerState from '#models/scanner_state'

export default class ScannerStatesController {
  /**
   * Get all scanner states
   */
  async index({ response }: HttpContext) {
    const states = await ScannerState.query().orderBy('chain_id', 'asc')
    return response.json(states)
  }

  /**
   * Get scanner state by chain and name
   */
  async show({ request, response }: HttpContext) {
    const chainId = request.input('chain_id', 56)
    const scannerName = request.input('scanner_name', 'bsc-main')

    const state = await ScannerState.query()
      .where('chain_id', chainId)
      .where('scanner_name', scannerName)
      .firstOrFail()

    return response.json(state)
  }
}