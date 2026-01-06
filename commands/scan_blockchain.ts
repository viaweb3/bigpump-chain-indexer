import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { createBscScanner } from '#services/blockchain_scanner_service'
import logger from '@adonisjs/core/services/logger'

export default class ScanBlockchain extends BaseCommand {
  static commandName = 'scan:blockchain'
  static description = 'Start blockchain event scanner for BSC network'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({ description: 'Chain to scan (bsc)', default: 'bsc' })
  declare chain: string

  async run() {
    this.logger.info('Starting blockchain scanner')

    let scanner

    // Create scanner based on chain
    switch (this.chain.toLowerCase()) {
      case 'bsc':
        scanner = createBscScanner()
        break
      default:
        this.logger.error(`Unknown chain: ${this.chain}`)
        return
    }

    // Handle graceful shutdown
    const shutdown = async () => {
      this.logger.info('Shutting down scanner...')
      await scanner.stop()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Start the scanner
    try {
      await scanner.start()
    } catch (error) {
      logger.error('Fatal error in scanner', { error })
      process.exit(1)
    }
  }
}