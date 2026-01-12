import type { HttpContext } from '@adonisjs/core/http'
import Trade from '#models/trade'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

export default class TradesController {
  /**
   * Get all trades with pagination
   */
  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const chainId = request.input('chain_id')
    const poolId = request.input('pool_id')
    const trader = request.input('trader')
    const side = request.input('side') // 1=buy, 2=sell

    const query = Trade.query().orderBy('block_timestamp', 'desc')

    if (chainId) {
      query.where('chain_id', chainId)
    }

    if (poolId) {
      query.where('pool_id', poolId)
    }

    if (trader) {
      query.where('trader', trader.toLowerCase())
    }

    if (side) {
      query.where('side', side)
    }

    const trades = await query.paginate(page, limit)

    return response.json(trades)
  }

  /**
   * Get a single trade by ID
   */
  async show({ params, response }: HttpContext) {
    const trade = await Trade.findOrFail(params.id)
    return response.json(trade)
  }

  /**
   * Get trades in a time range
   * Supports both Unix timestamp (milliseconds) and ISO 8601 string
   */
  async byTimeRange({ request, response }: HttpContext) {
    const startTimestamp = request.input('start_timestamp')
    const endTimestamp = request.input('end_timestamp')
    const startTime = request.input('start_time')
    const endTime = request.input('end_time')
    const chainId = request.input('chain_id')
    const poolId = request.input('pool_id')
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    // Parse start time (timestamp takes priority)
    let startDateTime: DateTime
    if (startTimestamp) {
      startDateTime = DateTime.fromMillis(parseInt(startTimestamp))
    } else if (startTime) {
      startDateTime = DateTime.fromISO(startTime)
    } else {
      return response.badRequest({
        error: 'start_timestamp or start_time is required',
      })
    }

    // Parse end time (timestamp takes priority)
    let endDateTime: DateTime
    if (endTimestamp) {
      endDateTime = DateTime.fromMillis(parseInt(endTimestamp))
    } else if (endTime) {
      endDateTime = DateTime.fromISO(endTime)
    } else {
      return response.badRequest({
        error: 'end_timestamp or end_time is required',
      })
    }

    const query = Trade.query()
      .where('block_timestamp', '>=', startDateTime)
      .where('block_timestamp', '<=', endDateTime)
      .orderBy('block_timestamp', 'desc')

    if (chainId) {
      query.where('chain_id', chainId)
    }

    if (poolId) {
      query.where('pool_id', poolId)
    }

    const trades = await query.paginate(page, limit)

    return response.json(trades)
  }

  /**
   * Generate candlestick (K-line) data
   * Supports both Unix timestamp (milliseconds) and ISO 8601 string
   */
  async kline({ request, response }: HttpContext) {
    const poolId = request.input('pool_id')
    const chainId = request.input('chain_id', 56)
    const interval = request.input('interval', '1h') // 5m, 15m, 1h, 4h, 1d
    const startTimestamp = request.input('start_timestamp')
    const endTimestamp = request.input('end_timestamp')
    const startTime = request.input('start_time')
    const endTime = request.input('end_time')

    if (!poolId) {
      return response.badRequest({ error: 'pool_id is required' })
    }

    // Parse start time (timestamp takes priority)
    let startDateTime: DateTime
    if (startTimestamp) {
      startDateTime = DateTime.fromMillis(parseInt(startTimestamp))
    } else if (startTime) {
      startDateTime = DateTime.fromISO(startTime)
    } else {
      return response.badRequest({
        error: 'start_timestamp or start_time is required',
      })
    }

    // Parse end time (timestamp takes priority)
    let endDateTime: DateTime
    if (endTimestamp) {
      endDateTime = DateTime.fromMillis(parseInt(endTimestamp))
    } else if (endTime) {
      endDateTime = DateTime.fromISO(endTime)
    } else {
      return response.badRequest({
        error: 'end_timestamp or end_time is required',
      })
    }

    // Map interval to TimescaleDB time_bucket format
    const intervalMap: Record<string, string> = {
      '1m': '1 minute',
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': '1 hour',
      '4h': '4 hours',
      '1d': '1 day',
    }

    const bucketInterval = intervalMap[interval] || '1 hour'

    const klineData = await db.rawQuery(
      `
      SELECT
        time_bucket(?, block_timestamp) as time,
        COUNT(*) as trade_count,
        SUM(CASE WHEN side = 1 THEN 1 ELSE 0 END) as buy_count,
        SUM(CASE WHEN side = 0 THEN 1 ELSE 0 END) as sell_count,
        SUM(quote_amount::numeric) as total_quote_volume,
        SUM(base_amount::numeric) as total_base_volume,
        AVG(quote_amount::numeric / NULLIF(base_amount::numeric, 0)) as avg_price,
        MIN(pool_eth_balance::numeric) as min_eth_balance,
        MAX(pool_eth_balance::numeric) as max_eth_balance,
        MIN(pool_token_balance::numeric) as min_token_balance,
        MAX(pool_token_balance::numeric) as max_token_balance
      FROM trades
      WHERE pool_id = ?
        AND chain_id = ?
        AND block_timestamp >= ?
        AND block_timestamp <= ?
      GROUP BY time
      ORDER BY time DESC
      `,
      [bucketInterval, poolId, chainId, startDateTime.toSQL(), endDateTime.toSQL()]
    )

    return response.json({
      pool_id: poolId,
      chain_id: chainId,
      interval,
      start_timestamp: startDateTime.toMillis(),
      end_timestamp: endDateTime.toMillis(),
      start_time: startDateTime.toISO(),
      end_time: endDateTime.toISO(),
      data: klineData.rows,
    })
  }

  /**
   * Get trade statistics
   */
  async stats({ request, response }: HttpContext) {
    const chainId = request.input('chain_id', 56)
    const poolId = request.input('pool_id')

    const query = Trade.query().where('chain_id', chainId)

    if (poolId) {
      query.where('pool_id', poolId)
    }

    const total = await query.clone().count('* as total')

    const last24h = await query
      .clone()
      .where('block_timestamp', '>=', DateTime.now().minus({ hours: 24 }))
      .count('* as total')

    const buyCount = await query.clone().where('side', 1).count('* as total')

    const sellCount = await query.clone().where('side', 0).count('* as total')

    const volumeStats = await db.rawQuery(
      `
      SELECT
        SUM(quote_amount::numeric) as total_quote_volume,
        SUM(base_amount::numeric) as total_base_volume,
        SUM(fee::numeric) as total_fees
      FROM trades
      WHERE chain_id = ?
        ${poolId ? 'AND pool_id = ?' : ''}
      `,
      poolId ? [chainId, poolId] : [chainId]
    )

    return response.json({
      chain_id: chainId,
      pool_id: poolId || 'all',
      total_trades: total[0].$extras.total,
      trades_last_24h: last24h[0].$extras.total,
      buy_trades: buyCount[0].$extras.total,
      sell_trades: sellCount[0].$extras.total,
      total_quote_volume: volumeStats.rows[0].total_quote_volume || '0',
      total_base_volume: volumeStats.rows[0].total_base_volume || '0',
      total_fees: volumeStats.rows[0].total_fees || '0',
    })
  }
}
