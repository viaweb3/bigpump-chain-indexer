import { ethers } from 'ethers'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import Pool from '#models/pool'
import Trade from '#models/trade'
import ScannerState from '#models/scanner_state'
import { BONDING_CURVE_ABI } from '#contracts/bonding_curve_abi'
import { CREATE_POOL_ABI } from '#contracts/create_pool_abi'
import { sleep } from '#utils/helpers'
import BigNumber from 'bignumber.js'

export interface ScannerConfig {
  chainId: number
  scannerName: string
  rpcUrl: string
  archiveRpcUrl?: string
  bondingCurveAddress: string
  createPoolAddress: string
  startBlock?: number
  blockConfirmations?: number
  pollInterval?: number
  chunkSize?: number
  archiveThreshold?: number
}

export class BlockchainScannerService {
  private provider!: ethers.JsonRpcProvider
  private archiveProvider!: ethers.JsonRpcProvider
  private bondingCurveContract!: ethers.Contract
  private createPoolContract!: ethers.Contract
  private bondingCurveArchiveContract!: ethers.Contract
  private createPoolArchiveContract!: ethers.Contract
  private config: ScannerConfig
  private lastProcessedBlock: number
  private isRunning: boolean = false
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private reconnectDelay: number = 5000

  constructor(config: ScannerConfig) {
    this.config = config
    this.initializeProvider()
    this.lastProcessedBlock = 0 // Will be loaded from DB
  }

  /**
   * Initialize provider and contracts
   */
  private initializeProvider(): void {
    // Regular provider with explicit chainId to avoid eth_chainId RPC calls
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl, {
      name: 'custom',
      chainId: this.config.chainId,
    })

    this.bondingCurveContract = new ethers.Contract(
      this.config.bondingCurveAddress,
      BONDING_CURVE_ABI,
      this.provider
    )

    this.createPoolContract = new ethers.Contract(
      this.config.createPoolAddress,
      CREATE_POOL_ABI,
      this.provider
    )

    // Archive provider (if configured) with explicit chainId to avoid eth_chainId RPC calls
    if (this.config.archiveRpcUrl) {
      logger.info('Archive RPC URL configured', { url: this.config.archiveRpcUrl })
      this.archiveProvider = new ethers.JsonRpcProvider(this.config.archiveRpcUrl, {
        name: 'custom-archive',
        chainId: this.config.chainId,
      })

      this.bondingCurveArchiveContract = new ethers.Contract(
        this.config.bondingCurveAddress,
        BONDING_CURVE_ABI,
        this.archiveProvider
      )

      this.createPoolArchiveContract = new ethers.Contract(
        this.config.createPoolAddress,
        CREATE_POOL_ABI,
        this.archiveProvider
      )
    }
  }

  /**
   * Determine which provider to use based on block range
   */
  private async getProviderForBlockRange(
    fromBlock: number,
    toBlock: number
  ): Promise<{
    provider: ethers.JsonRpcProvider
    bondingCurveContract: ethers.Contract
    createPoolContract: ethers.Contract
    isArchive: boolean
  }> {
    // If no archive provider, always use regular
    if (!this.archiveProvider) {
      return {
        provider: this.provider,
        bondingCurveContract: this.bondingCurveContract,
        createPoolContract: this.createPoolContract,
        isArchive: false,
      }
    }

    // Get current block
    try {
      const currentBlock = await this.provider.getBlockNumber()
      const archiveThreshold = this.config.archiveThreshold || 128
      const blockAge = currentBlock - toBlock

      // If querying blocks older than threshold, use archive
      if (blockAge > archiveThreshold) {
        return {
          provider: this.archiveProvider,
          bondingCurveContract: this.bondingCurveArchiveContract!,
          createPoolContract: this.createPoolArchiveContract!,
          isArchive: true,
        }
      }

      // Use regular provider for recent blocks
      return {
        provider: this.provider,
        bondingCurveContract: this.bondingCurveContract,
        createPoolContract: this.createPoolContract,
        isArchive: false,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorCode = (error as any).code || 'UNKNOWN'
      logger.error(
        `❌ Error in getProviderForBlockRange [${fromBlock}-${toBlock}]: ${errorMsg} (code: ${errorCode})`
      )
      throw error
    }
  }

  /**
   * Start the scanner
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scanner is already running')
      return
    }

    this.isRunning = true
    logger.info('Starting blockchain scanner', {
      chainId: this.config.chainId,
      scannerName: this.config.scannerName,
      bondingCurve: this.config.bondingCurveAddress,
      createPool: this.config.createPoolAddress,
    })

    // Load state from database
    await this.loadState()

    // Update scanner state to running
    await this.updateState({
      isRunning: true,
      lastRunAt: DateTime.now(),
    })

    // Get the latest block if we haven't processed any blocks yet
    if (this.lastProcessedBlock === 0) {
      const startBlock = this.config.startBlock || (await this.provider.getBlockNumber())
      this.lastProcessedBlock = startBlock
      logger.info(`Starting from block ${startBlock}`)

      await this.updateState({ lastProcessedBlock: startBlock })
    }

    // Start the main loop
    await this.scanLoop()
  }

  /**
   * Load scanner state from database
   */
  private async loadState(): Promise<void> {
    const state = await ScannerState.query()
      .where('chain_id', this.config.chainId)
      .where('scanner_name', this.config.scannerName)
      .first()

    if (state) {
      // Ensure lastProcessedBlock is a number (bigInteger can return strings)
      this.lastProcessedBlock = Number(state.lastProcessedBlock)
      logger.info('Loaded scanner state from database', {
        lastProcessedBlock: this.lastProcessedBlock,
        totalBlocksProcessed: state.totalBlocksProcessed,
        totalEventsProcessed: state.totalEventsProcessed,
      })
    } else {
      logger.info('No previous state found, creating new state')
      await ScannerState.create({
        chainId: this.config.chainId,
        scannerName: this.config.scannerName,
        lastProcessedBlock: 0,
        isRunning: false,
        totalBlocksProcessed: 0,
        totalEventsProcessed: 0,
      })
    }
  }

  /**
   * Update scanner state in database
   */
  private async updateState(updates: Partial<ScannerState>): Promise<void> {
    await ScannerState.query()
      .where('chain_id', this.config.chainId)
      .where('scanner_name', this.config.scannerName)
      .update(updates)
  }

  /**
   * Stop the scanner
   */
  async stop(): Promise<void> {
    this.isRunning = false
    logger.info('Stopping blockchain scanner')

    // Update state to not running
    await this.updateState({
      isRunning: false,
    })
  }

  /**
   * Main scanning loop
   */
  private async scanLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.processNewBlocks()
        this.reconnectAttempts = 0 // Reset on success

        // Update success timestamp
        await this.updateState({
          lastSuccessAt: DateTime.now(),
        })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const errorCode = (error as any).code || 'UNKNOWN'
        logger.error(`💥 Error in scan loop: ${errorMsg} (code: ${errorCode})`)

        // Update error state
        await this.updateState({
          lastErrorAt: DateTime.now(),
          lastErrorMessage: errorMsg,
        })

        await this.handleError(error, 'scan loop')
      }

      // Wait before next iteration
      await sleep(this.config.pollInterval || 5000)
    }
  }

  /**
   * Handle errors and reconnection
   */
  private async handleError(error: any, context?: string): Promise<void> {
    this.reconnectAttempts++

    // Extract error details
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = error.code || 'UNKNOWN'
    const errorReason = error.reason || 'No reason provided'
    const errorContext = context || 'Unknown operation'

    // Log detailed error information with inline details
    logger.error(
      `❌ Reconnection triggered [${this.reconnectAttempts}/${this.maxReconnectAttempts}]: ${errorMessage}`,
      {
        context: errorContext,
        errorCode,
        errorReason,
        errorType: error.constructor?.name || 'Unknown',
        lastProcessedBlock: this.lastProcessedBlock,
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
      }
    )

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        `🛑 Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping scanner.`
      )
      this.stop()
      throw error
    }

    const delay = this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5))
    logger.warn(
      `🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms | Error: ${errorMessage.substring(0, 100)}`
    )

    await sleep(delay)

    // Reinitialize provider
    try {
      this.initializeProvider()
      logger.info(`✅ Provider reinitialized successfully (attempt ${this.reconnectAttempts})`)
    } catch (reinitError) {
      const reinitMsg = reinitError instanceof Error ? reinitError.message : String(reinitError)
      logger.error(`❌ Failed to reinitialize provider: ${reinitMsg}`)
    }
  }

  /**
   * Process new blocks
   */
  private async processNewBlocks(): Promise<void> {
    try {
      const latestBlock = await this.provider.getBlockNumber()
      const confirmations = this.config.blockConfirmations || 12
      const safeBlock = latestBlock - confirmations

      if (safeBlock <= this.lastProcessedBlock) {
        return
      }

      logger.info(`Processing blocks ${this.lastProcessedBlock + 1} to ${safeBlock}`, {
        latestBlock,
        confirmations,
        blocksToProcess: safeBlock - this.lastProcessedBlock,
      })

      // Process in chunks to avoid overloading RPC
      // Configurable chunk size allows tuning based on RPC performance
      const chunkSize = this.config.chunkSize || 1000
      for (
        let fromBlock = this.lastProcessedBlock + 1;
        fromBlock <= safeBlock;
        fromBlock += chunkSize
      ) {
        const toBlock = Math.min(fromBlock + chunkSize - 1, safeBlock)

        await this.processBlockRange(fromBlock, toBlock)
        this.lastProcessedBlock = toBlock

        // Update state after each chunk
        await this.updateState({
          lastProcessedBlock: toBlock,
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorCode = (error as any).code || 'UNKNOWN'
      logger.error(
        `❌ Error in processNewBlocks: ${errorMsg} (code: ${errorCode}, lastBlock: ${this.lastProcessedBlock})`
      )
      throw error
    }
  }

  /**
   * Process a range of blocks
   */
  private async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    const startTime = Date.now()

    try {
      // Get appropriate provider for this block range
      const { bondingCurveContract, createPoolContract, isArchive } =
        await this.getProviderForBlockRange(fromBlock, toBlock)

      if (isArchive) {
        logger.info(`Using archive node for block range ${fromBlock} to ${toBlock}`)
      }

      // Fetch Trade events
      const tradeFilter = bondingCurveContract.filters.Trade()
      const tradeEvents = await bondingCurveContract.queryFilter(tradeFilter, fromBlock, toBlock)

      // Fetch NewPool events
      const poolFilter = createPoolContract.filters.NewPool()
      const poolEvents = await createPoolContract.queryFilter(poolFilter, fromBlock, toBlock)

      // Process events
      await Promise.all([
        this.processTrades(tradeEvents.filter((e): e is ethers.EventLog => 'args' in e && !!e.args)),
        this.processPools(poolEvents.filter((e): e is ethers.EventLog => 'args' in e && !!e.args))
      ])

      // Update statistics
      const totalEvents = tradeEvents.length + poolEvents.length
      const blocksProcessed = toBlock - fromBlock + 1

      await ScannerState.query()
        .where('chain_id', this.config.chainId)
        .where('scanner_name', this.config.scannerName)
        .increment('total_blocks_processed', blocksProcessed)
        .increment('total_events_processed', totalEvents)

      const duration = Date.now() - startTime
      logger.info(`Processed ${tradeEvents.length} trades and ${poolEvents.length} pools`, {
        fromBlock,
        toBlock,
        usedArchive: isArchive,
        totalEvents,
        durationMs: duration,
        blocksPerSecond: ((blocksProcessed / duration) * 1000).toFixed(2),
      })
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorCode = (error as any).code || 'UNKNOWN'
      const errorReason = (error as any).reason || 'No reason'
      logger.error(
        `❌ Error in processBlockRange [${fromBlock}-${toBlock}]: ${errorMsg} | Code: ${errorCode} | Reason: ${errorReason} | Duration: ${duration}ms`
      )
      throw error
    }
  }

  /**
   * Process Trade events
   */
  private async processTrades(events: ethers.EventLog[]): Promise<void> {
    for (const event of events) {
      try {
        // The event emits a tuple as the first (and only) argument
        const tradeData = event.args?.[0]
        if (!tradeData) {
          continue
        }

        const block = await event.getBlock()
        const receipt = await event.getTransactionReceipt()

        // Validate required fields
        if (!tradeData.trader || !tradeData.sender || !tradeData.tokenAddress) {
          logger.warn(
            `⚠️  Skipping trade event [Block: ${event.blockNumber}] - Missing required fields`
          )
          continue
        }
        // Create or update trade
        await Trade.firstOrCreate(
          {
            chainId: this.config.chainId,
            transactionHash: receipt.hash,
            poolId: Number(tradeData.poolId),
          },
          {
            chainId: this.config.chainId,
            contractAddress: this.config.bondingCurveAddress.toLowerCase(),
            poolId: Number(tradeData.poolId),
            trader: tradeData.trader.toLowerCase(),
            sender: tradeData.sender.toLowerCase(),
            tokenAddress: tradeData.tokenAddress.toLowerCase(),
            tokenName: tradeData.tokenName || '',
            tokenTicker: tradeData.tokenTicker || '',
            tokenUri: tradeData.tokenUri || null,
            quoteAmount: tradeData.quoteAmount?.toString() || '0',
            baseAmount: tradeData.baseAmount?.toString() || '0',
            fee: tradeData.fee?.toString() || '0',
            side: Number(tradeData.side || 0),
            poolEthBalance: tradeData.poolEthBalance?.toString() || '0',
            poolTokenBalance: tradeData.poolTokenBalance?.toString() || '0',
            transactionHash: receipt.hash,
            blockNumber: block.number,
            blockTimestamp: DateTime.fromSeconds(block.timestamp),
          }
        )

        // Update pool token price and market cap
        const pool = await Pool.query()
          .where('chain_id', this.config.chainId)
          .where('pool_id', Number(tradeData.poolId))
          .first()

        if (pool) {
          // Configure BigNumber to use fixed format (not scientific notation) and 18 decimal places
          BigNumber.config({
            DECIMAL_PLACES: 18,
            ROUNDING_MODE: BigNumber.ROUND_DOWN,
            EXPONENTIAL_AT: [-20, 20] // Avoid scientific notation for most numbers
          })
          
          const WEI = new BigNumber('1000000000000000000') // 1e18
          const MILLION = new BigNumber('1000000') // 1e6

          // Calculate token price: token_price = quote_amount / 1e18 / (base_amount / 1e6)
          let tokenPrice: string | null = null
          const quoteAmountBN = new BigNumber(tradeData.quoteAmount || 0)
          const baseAmountBN = new BigNumber(tradeData.baseAmount || 0)
          
          if (baseAmountBN.gt(0) && quoteAmountBN.gt(0)) {
            
            // Calculate price with full precision
            const price = quoteAmountBN.div(WEI).div(baseAmountBN.div(MILLION))
            // Use toFixed(18) to ensure standard notation with 18 decimal places
            tokenPrice = price.toFixed(18)
          }

          // Calculate market cap: market_cap = token_price * (token_supply / 1e6)
          let marketCap: string | null = null
          if (tokenPrice !== null && new BigNumber(pool.tokenSupply).gt(0)) {
            const tokenPriceBN = new BigNumber(tokenPrice)
            const tokenSupplyBN = new BigNumber(pool.tokenSupply)
            
            // Calculate market cap with full precision
            const marketCapBN = tokenPriceBN.multipliedBy(tokenSupplyBN.div(MILLION))
            // Use toFixed(18) to ensure standard notation with 18 decimal places
            marketCap = marketCapBN.toFixed(18)
          }

          // Update pool with new values
          await pool.merge({
            tokenPrice: tokenPrice,
            marketCap: marketCap,
          }).save()
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const errorCode = (error as any).code || 'UNKNOWN'
        logger.error(
          `❌ Error processing trade event [Block: ${event.blockNumber}, Tx: ${event.transactionHash}]: ${errorMsg} (code: ${errorCode})`
        )
        // Don't call handleError here - let the error propagate to processBlockRange
        throw error
      }
    }
  }

  /**
   * Process NewPool events
   */
  private async processPools(events: ethers.EventLog[]): Promise<void> {
    for (const event of events) {
      try {
        // The event emits a tuple as the first (and only) argument
        const poolData = event.args?.[0]
        if (!poolData) {
          continue
        }

        const block = await event.getBlock()
        const receipt = await event.getTransactionReceipt()

        // Validate required fields
        if (!poolData.creator || !poolData.tokenAddress) {
          logger.warn(
            `⚠️  Skipping pool event [Block: ${event.blockNumber}] - Missing required fields`
          )
          continue
        }
        await Pool.firstOrCreate(
          {
            chainId: this.config.chainId,
            poolId: Number(poolData.poolId),
            transactionHash: receipt.hash,
          },
          {
            chainId: this.config.chainId,
            contractAddress: this.config.createPoolAddress.toLowerCase(),
            poolId: Number(poolData.poolId),
            creator: poolData.creator.toLowerCase(),
            tokenAddress: poolData.tokenAddress.toLowerCase(),
            tokenDecimals: Number(poolData.tokenDecimals || 18),
            nftName: poolData.nftName || '',
            nftTicker: poolData.nftTicker || '',
            uri: poolData.uri || null,
            nftDescription: poolData.nftDescription || null,
            conversionRate: poolData.conversionRate?.toString() || '0',
            tokenSupply: poolData.tokenSupply?.toString() || '0',
            tokenBalance: poolData.tokenBalance?.toString() || '0',
            ethBalance: poolData.ethBalance?.toString() || '0',
            nftPrice: poolData.nftPrice?.toString() || '0',
            feeRate: poolData.feeRate?.toString() || '0',
            mintable: Number(poolData.mintable || 0),
            lpAmount: poolData.lpAmount?.toString() || '0',
            transactionHash: receipt.hash,
            blockNumber: block.number,
            blockTimestamp: DateTime.fromSeconds(block.timestamp),
          }
        )
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const errorCode = (error as any).code || 'UNKNOWN'
        logger.error(
          `❌ Error processing pool event [Block: ${event.blockNumber}, Tx: ${event.transactionHash}]: ${errorMsg} (code: ${errorCode})`
        )
        // Don't call handleError here - let the error propagate to processBlockRange
        throw error
      }
    }
  }

  /**
   * Get scanner status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      chainId: this.config.chainId,
      lastProcessedBlock: this.lastProcessedBlock,
      bondingCurveAddress: this.config.bondingCurveAddress,
      createPoolAddress: this.config.createPoolAddress,
    }
  }
}

/**
 * Create scanner instance for BSC
 */
export function createBscScanner(): BlockchainScannerService {
  return new BlockchainScannerService({
    chainId: 56,
    scannerName: 'bsc-main',
    rpcUrl: env.get('BSC_RPC_URL'),
    archiveRpcUrl: env.get('BSC_ARCHIVE_RPC_URL'),
    bondingCurveAddress: env.get('BONDINGCURVE_ADDRESS_BSC'),
    createPoolAddress: env.get('CREATE_POOL_ADDRESS_BSC'),
    startBlock: env.get('SCANNER_START_BLOCK') ? Number(env.get('SCANNER_START_BLOCK')) : undefined,
    blockConfirmations: Number(env.get('SCANNER_BLOCK_CONFIRMATIONS')),
    pollInterval: Number(env.get('SCANNER_POLL_INTERVAL')),
    chunkSize: Number(env.get('SCANNER_CHUNK_SIZE')),
    archiveThreshold: Number(env.get('SCANNER_ARCHIVE_THRESHOLD')),
  })
}
