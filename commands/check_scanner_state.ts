import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ScannerState from '#models/scanner_state'

export default class CheckScannerState extends BaseCommand {
  static commandName = 'check:scanner-state'
  static description = 'Check and manage scanner state'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ description: 'Reset all scanner states to initial values', default: false })
  declare reset: boolean

  async run() {
    // Get all scanner states
    const states = await ScannerState.all()

    if (states.length === 0) {
      this.logger.info('No scanner states found in database')
      return
    }

    this.logger.info(`Found ${states.length} scanner state(s):`)
    console.log('')

    for (const state of states) {
      console.log(`Scanner: ${state.scannerName}`)
      console.log(`  Chain ID: ${state.chainId}`)
      console.log(`  Last Processed Block: ${state.lastProcessedBlock}`)
      console.log(`  Is Running: ${state.isRunning}`)
      console.log(`  Total Blocks Processed: ${state.totalBlocksProcessed}`)
      console.log(`  Total Events Processed: ${state.totalEventsProcessed}`)
      console.log(`  Last Run At: ${state.lastRunAt || 'Never'}`)
      console.log(`  Last Success At: ${state.lastSuccessAt || 'Never'}`)
      console.log(`  Last Error At: ${state.lastErrorAt || 'Never'}`)
      if (state.lastErrorMessage) {
        console.log(`  Last Error Message: ${state.lastErrorMessage}`)
      }
      console.log('')
    }

    // Check if reset flag is provided
    if (this.reset) {
      this.logger.info('Resetting scanner states...')
      for (const state of states) {
        await state.merge({
          lastProcessedBlock: 0,
          isRunning: false,
          totalBlocksProcessed: 0,
          totalEventsProcessed: 0,
          lastRunAt: null,
          lastSuccessAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
        }).save()
        this.logger.success(`Reset scanner state for ${state.scannerName}`)
      }
      this.logger.success('All scanner states have been reset to initial values')
    } else {
      this.logger.info('Run with --reset flag to reset all scanner states')
    }
  }
}
