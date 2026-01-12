import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { WebhookSenderService } from '#services/webhook_sender_service'
import logger from '@adonisjs/core/services/logger'

export default class SendWebhooks extends BaseCommand {
  static commandName = 'send:webhooks'
  static description = 'Start webhook sender service to push pool and trade events'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Starting webhook sender service')

    const webhookSender = new WebhookSenderService()

    // Handle graceful shutdown
    const shutdown = async () => {
      this.logger.info('Shutting down webhook sender...')
      await webhookSender.stop()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Start the webhook sender
    try {
      await webhookSender.start()
    } catch (error) {
      logger.error('Fatal error in webhook sender', { error })
      process.exit(1)
    }
  }
}
