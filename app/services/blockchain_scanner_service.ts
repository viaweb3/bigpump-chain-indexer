import { ethers } from 'ethers'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import Pool from '#models/pool'
import Trade from '#models/trade'
import ScannerState from '#models/scanner_state'
import { BONDING_CURVE_ABI } from '#contracts/bonding_curve_abi'
import { CREATE_POOL_ABI } from '#contracts/create_pool_abi'

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
  private provider: ethers.JsonRpcProvider
  private archiveProvider: ethers.JsonRpcProvider | null = null
  private bondingCurveContract: ethers.Contract
  private createPoolContract: ethers.Contract
  private bondingCurveArchiveContract: ethers.Contract | null = null
  private createPoolArchiveContract: ethers.Contract | null = null
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
    // Regular provider
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl)

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

    // Archive provider (if configured)
    if (this.config.archiveRpcUrl) {
      logger.info('Archive RPC URL configured', { url: this.config.archiveRpcUrl })
      this.archiveProvider = new ethers.JsonRpcProvider(this.config.archiveRpcUrl)

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
    const currentBlock = await this.provider.getBlockNumber()
    const archiveThreshold = this.config.archiveThreshold || 128

    // If querying blocks older than threshold, use archive
    if (currentBlock - toBlock > archiveThreshold) {
      logger.debug('Using archive node for historical blocks', {
        fromBlock,
        toBlock,
        currentBlock,
        threshold: archiveThreshold,
      })

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
        logger.error('Error in scan loop', { error })

        // Update error state
        await this.updateState({
          lastErrorAt: DateTime.now(),
          lastErrorMessage: error instanceof Error ? error.message : String(error),
        })

        await this.handleError(error)
      }

      // Wait before next iteration
      await this.sleep(this.config.pollInterval || 5000)
    }
  }

  /**
   * Handle errors and reconnection
   */
  private async handleError(error: any): Promise<void> {
    this.reconnectAttempts++

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Stopping scanner.', {
        attempts: this.reconnectAttempts,
      })
      this.stop()
      throw error
    }

    const delay = this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5))
    logger.warn(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`, {
      delay: delay,
    })

    await this.sleep(delay)

    // Reinitialize provider
    try {
      this.initializeProvider()
      logger.info('Provider reinitialized successfully')
    } catch (reinitError) {
      logger.error('Failed to reinitialize provider', { error: reinitError })
    }
  }

  /**
   * Process new blocks
   */
  private async processNewBlocks(): Promise<void> {
    const latestBlock = await this.provider.getBlockNumber()
    const confirmations = this.config.blockConfirmations || 12
    const safeBlock = latestBlock - confirmations

    if (safeBlock <= this.lastProcessedBlock) {
      return
    }

    logger.info(`Processing blocks ${this.lastProcessedBlock + 1} to ${safeBlock}`)

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
  }

  /**
   * Process a range of blocks
   */
  private async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    logger.debug(`Processing block range ${fromBlock} to ${toBlock}`)

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
    await Promise.all([this.processTrades(tradeEvents), this.processPools(poolEvents)])

    // Update statistics
    const totalEvents = tradeEvents.length + poolEvents.length
    const blocksProcessed = toBlock - fromBlock + 1

    await ScannerState.query()
      .where('chain_id', this.config.chainId)
      .where('scanner_name', this.config.scannerName)
      .increment('total_blocks_processed', blocksProcessed)
      .increment('total_events_processed', totalEvents)

    logger.info(`Processed ${tradeEvents.length} trades and ${poolEvents.length} pools`, {
      fromBlock,
      toBlock,
      usedArchive: isArchive,
      totalEvents,
    })
  }

  /**
   * Process Trade events
   */
  private async processTrades(events: ethers.EventLog[]): Promise<void> {
    for (const event of events) {
      try {
        const tradeData = event.args?.[0]
        if (!tradeData) continue

        const block = await event.getBlock()
        const receipt = await event.getTransactionReceipt()

        await Trade.updateOrCreate(
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
            tokenName: tradeData.tokenName,
            tokenTicker: tradeData.tokenTicker,
            tokenUri: tradeData.tokenUri || null,
            quoteAmount: tradeData.quoteAmount.toString(),
            baseAmount: tradeData.baseAmount.toString(),
            fee: tradeData.fee.toString(),
            side: Number(tradeData.side),
            poolEthBalance: tradeData.poolEthBalance.toString(),
            poolTokenBalance: tradeData.poolTokenBalance.toString(),
            transactionHash: receipt.hash,
            blockNumber: block.number,
            blockTimestamp: DateTime.fromSeconds(block.timestamp),
          }
        )

        logger.debug(`Processed trade event`, {
          txHash: receipt.hash,
          poolId: Number(tradeData.poolId),
          trader: tradeData.trader,
        })
      } catch (error) {
        logger.error('Error processing trade event', { error, event })
      }
    }
  }

  /**
   * Process NewPool events
   */
  private async processPools(events: ethers.EventLog[]): Promise<void> {
    for (const event of events) {
      try {
        const poolData = event.args?.[0]
        if (!poolData) continue

        const block = await event.getBlock()
        const receipt = await event.getTransactionReceipt()

        await Pool.updateOrCreate(
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
            tokenDecimals: Number(poolData.tokenDecimals),
            nftName: poolData.nftName,
            nftTicker: poolData.nftTicker,
            uri: poolData.uri || null,
            nftDescription: poolData.nftDescription || null,
            conversionRate: poolData.conversionRate.toString(),
            tokenSupply: poolData.tokenSupply.toString(),
            tokenBalance: poolData.tokenBalance.toString(),
            ethBalance: poolData.ethBalance.toString(),
            nftPrice: poolData.nftPrice.toString(),
            feeRate: poolData.feeRate.toString(),
            mintable: Number(poolData.mintable),
            lpAmount: poolData.lpAmount.toString(),
            transactionHash: receipt.hash,
            blockNumber: block.number,
            blockTimestamp: DateTime.fromSeconds(block.timestamp),
          }
        )

        logger.debug(`Processed pool event`, {
          txHash: receipt.hash,
          poolId: Number(poolData.poolId),
          creator: poolData.creator,
        })
      } catch (error) {
        logger.error('Error processing pool event', { error, event })
      }
    }
  }

  /**
   * Helper function to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
