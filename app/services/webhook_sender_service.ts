import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import Pool from '#models/pool'
import Trade from '#models/trade'
import { sleep } from '#utils/helpers'

export interface WebhookConfig {
  webhookUrl: string
  pollInterval: number
  retryAttempts: number
  retryDelay: number
  timeout: number
  ssePublishToken: string
}

export class WebhookSenderService {
  private config: WebhookConfig
  private isRunning: boolean = false

  constructor() {
    // Load configuration from environment variables
    this.config = {
      webhookUrl: env.get('WEBHOOK_URL') || '',
      pollInterval: Number(env.get('WEBHOOK_POLL_INTERVAL')) || 5000,
      retryAttempts: Number(env.get('WEBHOOK_RETRY_ATTEMPTS')) || 3,
      retryDelay: Number(env.get('WEBHOOK_RETRY_DELAY')) || 10000,
      timeout: Number(env.get('WEBHOOK_TIMEOUT')) || 5000,
      ssePublishToken: env.get('SSE_PUBLISH_TOKEN') || '',
    }
  }

  /**
   * Start the webhook sender service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Webhook sender is already running')
      return
    }

    this.isRunning = true
    logger.info('Starting webhook sender service', {
      webhookUrl: this.config.webhookUrl,
      pollInterval: this.config.pollInterval,
      retryAttempts: this.config.retryAttempts,
    })

    // Start the main loop
    await this.senderLoop()
  }

  /**
   * Stop the webhook sender service
   */
  async stop(): Promise<void> {
    this.isRunning = false
    logger.info('Stopping webhook sender service')
  }

  /**
   * Main sender loop
   */
  private async senderLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check for new events
        await this.checkAndSendEvents()
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        logger.error(`💥 Error in webhook sender loop: ${errorMsg}`)
      }

      // Wait before next iteration
      await sleep(this.config.pollInterval)
    }
  }

  /**
   * Check for new events and send them to webhooks
   */
  private async checkAndSendEvents(): Promise<void> {
    try {
      // Check for new pool events
      await this.sendPoolEvents()

      // Check for new trade events
      await this.sendTradeEvents()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error(`💥 Error checking and sending events: ${errorMsg}`)
    }
  }

  /**
   * Send new pool events to webhook
   */
  private async sendPoolEvents(): Promise<void> {
    try {
      // Skip if no webhook URL is configured
      if (!this.config.webhookUrl) {
        logger.debug('Webhook URL not configured, skipping pool event sending')
        return
      }

      // Get all pools that haven't been sent to webhook yet
      const pools = await Pool.query().where('webhook_sent', false).orderBy('created_at')

      logger.info(`Found ${pools.length} new pool events to send`, {
        totalPoolEvents: pools.length,
        webhookUrl: this.config.webhookUrl
      })

      for (const pool of pools) {
        // Use AdonisJS Logger API correctly: structured data first, then message
        logger.info({
          poolId: pool.poolId,
          tokenAddress: pool.tokenAddress,
          creator: pool.creator,
          createdAt: pool.createdAt.toISO()
        }, `Processing pool event`)
        
        // Send to the configured webhook URL
        const sent = await this.sendEventToWebhook(this.config.webhookUrl, 'pool', pool)

        // If webhook was successful, mark the event as sent
        if (sent) {
          await pool.merge({ webhookSent: true }).save()
          logger.info(`Successfully sent pool event to webhook`, {
            poolId: pool.poolId,
            tokenAddress: pool.tokenAddress,
            creator: pool.creator,
            webhookUrl: this.config.webhookUrl,
          })
        } else {
          logger.warn(`Failed to send pool event to webhook after all attempts`, {
            poolId: pool.poolId,
            tokenAddress: pool.tokenAddress,
            webhookUrl: this.config.webhookUrl
          })
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error(`💥 Error sending pool events: ${errorMsg}`, {
        errorDetails: error instanceof Error ? error.stack : undefined
      })
    }
  }

  /**
   * Send new trade events to webhook
   */
  private async sendTradeEvents(): Promise<void> {
    try {
      // Skip if no webhook URL is configured
      if (!this.config.webhookUrl) {
        logger.debug('Webhook URL not configured, skipping trade event sending')
        return
      }

      // Get all trades that haven't been sent to webhook yet
      const trades = await Trade.query().where('webhook_sent', false).orderBy('created_at')

      logger.info(`Found ${trades.length} new trade events to send`, {
        totalTradeEvents: trades.length,
        webhookUrl: this.config.webhookUrl
      })

      for (const trade of trades) {
        // Use AdonisJS Logger API correctly: structured data first, then message
        logger.info({
          transactionHash: trade.transactionHash,
          poolId: trade.poolId,
          side: trade.side === 1 ? 'buy' : 'sell',
          baseAmount: trade.baseAmount,
          quoteAmount: trade.quoteAmount,
          createdAt: trade.createdAt.toISO()
        }, `Processing trade event`)
        
        // Send to the configured webhook URL
        const sent = await this.sendEventToWebhook(this.config.webhookUrl, 'trade', trade)

        // If webhook was successful, mark the event as sent
        if (sent) {
          await trade.merge({ webhookSent: true }).save()
          logger.info(`Successfully sent trade event to webhook`, {
            transactionHash: trade.transactionHash,
            poolId: trade.poolId,
            side: trade.side === 1 ? 'buy' : 'sell',
            webhookUrl: this.config.webhookUrl,
          })
        } else {
          logger.warn(`Failed to send trade event to webhook after all attempts`, {
            transactionHash: trade.transactionHash,
            poolId: trade.poolId,
            webhookUrl: this.config.webhookUrl
          })
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error(`💥 Error sending trade events: ${errorMsg}`, {
        errorDetails: error instanceof Error ? error.stack : undefined
      })
    }
  }

  /**
   * Send a single event to a webhook URL with retry mechanism
   */
  private async sendEventToWebhook(
    url: string,
    eventType: string,
    eventData: any
  ): Promise<boolean> {
    let attempt = 0
    const eventId = eventData.id || eventData.transactionHash || eventData.poolId

    while (attempt <= this.config.retryAttempts) {
      try {
        // Use AdonisJS Logger API correctly: structured data first, then message
        logger.info({
          webhookUrl: url,
          eventId: eventId,
          attempt: attempt + 1,
          eventType: eventType,
          eventDetails: eventType === 'pool' ? {
            poolId: eventData.poolId,
            tokenAddress: eventData.tokenAddress
          } : {
            transactionHash: eventData.transactionHash,
            poolId: eventData.poolId,
            side: eventData.side === 1 ? 'buy' : 'sell'
          }
        }, `Sending ${eventType} event to webhook`)

        const startTime = Date.now()

        // Prepare request options
        const options: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(this.config.timeout),
        }

        // Special handling for SSE publish endpoint
        let requestBody: any
        if (url.includes('bigpump.ai/connection/sse/publish')) {
          // Add Authorization header with Bearer token
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${this.config.ssePublishToken}`,
          }

          // Construct request body in SSE publish format
          let sseBody: any

          if (eventType === 'trade') {
            // Handle trade event for SSE publish
            sseBody = {
              channel: 'pump',
              type: 'prod_bsc_evm_pump_events_swap_origin',
              data: {
                token_price:
                  Number.parseFloat(eventData.quoteAmount) /
                  Number.parseFloat(eventData.baseAmount),
                trader: eventData.trader,
                token_address: eventData.tokenAddress,
                user_avatar: '', // Default empty avatar
                user_name: eventData.trader.substring(0, 10), // Use truncated trader address as username
                user_certified: 0, // Default not certified
                conversion_rate:
                  Number.parseFloat(eventData.quoteAmount) /
                  Number.parseFloat(eventData.baseAmount),
                nft_description: '', // Not available in trade event
                token_supply: 0, // Not available in trade event
                creator: '', // Not available in trade event
                market_cap: 0, // Calculate if available
                sender: eventData.sender,
                quote_amount: eventData.quoteAmount,
                base_amount: eventData.baseAmount,
                time: Math.floor(eventData.blockTimestamp.toSeconds()),
                type: eventData.side === 1 ? 'buy' : 'sell',
              },
            }
          } else if (eventType === 'pool') {
            // Handle pool event for SSE publish
            sseBody = {
              channel: 'pump',
              type: 'prod_evm_pump_events_newpool_origin',
              data: {
                pool_id: eventData.poolId,
                creator: eventData.creator,
                token_address: eventData.tokenAddress,
                token_decimals: eventData.tokenDecimals,
                nft_name: eventData.nftName,
                nft_ticker: eventData.nftTicker,
                uri: eventData.uri,
                nft_description: eventData.nftDescription,
                conversion_rate: eventData.conversionRate,
                token_supply: eventData.tokenSupply,
                token_balance: eventData.tokenBalance,
                eth_balance: eventData.ethBalance,
                nft_price: eventData.nftPrice,
                fee_rate: eventData.feeRate,
                mintable: eventData.mintable,
                lp_amount: eventData.lpAmount,
                transaction_hash: eventData.transactionHash,
                block_number: eventData.blockNumber,
                time: Math.floor(eventData.blockTimestamp.toSeconds()),
                type: 'pool',
              },
            }
          }

          options.body = JSON.stringify(sseBody)
          requestBody = sseBody
        } else {
          // Regular webhook format
          const regularBody = {
            eventType,
            eventData,
            timestamp: DateTime.now().toISO(),
          }
          options.body = JSON.stringify(regularBody)
          requestBody = regularBody
        }

        // Use AdonisJS Logger API correctly: structured data first, then message
        logger.debug({
          webhookUrl: url,
          eventId: eventId,
          attempt: attempt + 1,
          method: options.method,
          headers: Object.keys(options.headers || {}),
          requestBodyType: requestBody.channel ? 'SSE Publish' : 'Regular Webhook'
        }, `Webhook request details`)

        // Send the event to the webhook
        const response = await fetch(url, options)

        const duration = Date.now() - startTime
        const responseText = await response.text()

        if (response.ok) {
          // Use AdonisJS Logger API correctly: structured data first, then message
          logger.info({
            webhookUrl: url,
            eventId: eventId,
            status: response.status,
            statusText: response.statusText,
            durationMs: duration,
            attempt: attempt + 1,
            responseLength: responseText.length
          }, `Successfully sent ${eventType} event to webhook`)
          return true
        } else {
          // Use AdonisJS Logger API correctly: structured data first, then message
          logger.warn({
            webhookUrl: url,
            eventId: eventId,
            status: response.status,
            statusText: response.statusText,
            responseText: responseText.substring(0, 200), // Limit response text length in logs
            durationMs: duration,
            attempt: attempt + 1,
            retryAttemptsLeft: this.config.retryAttempts - attempt
          }, `Failed to send ${eventType} event to webhook`)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        // Use AdonisJS Logger API correctly: structured data first, then message
        logger.warn({
          webhookUrl: url,
          eventId: eventId,
          error: errorMsg,
          attempt: attempt + 1,
          retryAttemptsLeft: this.config.retryAttempts - attempt,
          errorStack: error instanceof Error ? error.stack : undefined
        }, `Error sending ${eventType} event to webhook`)
      }

      attempt++

      if (attempt <= this.config.retryAttempts) {
        // Use AdonisJS Logger API correctly: structured data first, then message
        logger.info({
          webhookUrl: url,
          eventId: eventId,
          delay: this.config.retryDelay,
          attempt: attempt + 1,
          retryAttemptsLeft: this.config.retryAttempts - attempt
        }, `Retrying ${eventType} event sending after delay`)
        await sleep(this.config.retryDelay)
      }
    }

    // Use AdonisJS Logger API correctly: structured data first, then message
    logger.error({
      webhookUrl: url,
      eventId: eventId,
      totalRetryAttempts: this.config.retryAttempts,
      eventType: eventType
    }, `Failed to send ${eventType} event to webhook after all attempts`)

    return false
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
    }
  }
}
