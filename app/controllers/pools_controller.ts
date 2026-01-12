import type { HttpContext } from '@adonisjs/core/http'
import Pool from '#models/pool'
import { DateTime } from 'luxon'

export default class PoolsController {
  /**
   * Get all pools with pagination
   */
  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const chainId = request.input('chain_id')
    const creator = request.input('creator')

    const query = Pool.query().orderBy('block_timestamp', 'desc')

    if (chainId) {
      query.where('chain_id', chainId)
    }

    if (creator) {
      query.where('creator', creator.toLowerCase())
    }

    const pools = await query.paginate(page, limit)

    return response.json(pools)
  }

  /**
   * Get a single pool by ID
   */
  async show({ params, response }: HttpContext) {
    const pool = await Pool.findOrFail(params.id)
    return response.json(pool)
  }

  /**
   * Get pool by pool_id and chain_id
   */
  async showByPoolId({ request, response }: HttpContext) {
    const poolId = request.input('pool_id')
    const chainId = request.input('chain_id', 56)

    const pool = await Pool.query()
      .where('pool_id', poolId)
      .where('chain_id', chainId)
      .firstOrFail()

    return response.json(pool)
  }

  /**
   * Get pools created in a time range
   * Supports both Unix timestamp (milliseconds) and ISO 8601 string
   */
  async byTimeRange({ request, response }: HttpContext) {
    const startTimestamp = request.input('start_timestamp')
    const endTimestamp = request.input('end_timestamp')
    const startTime = request.input('start_time')
    const endTime = request.input('end_time')
    const chainId = request.input('chain_id')
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

    const query = Pool.query()
      .where('block_timestamp', '>=', startDateTime)
      .where('block_timestamp', '<=', endDateTime)
      .orderBy('block_timestamp', 'desc')

    if (chainId) {
      query.where('chain_id', chainId)
    }

    const pools = await query.paginate(page, limit)

    return response.json(pools)
  }

  /**
   * Get pool statistics
   */
  async stats({ request, response }: HttpContext) {
    const chainId = request.input('chain_id', 56)

    const total = await Pool.query().where('chain_id', chainId).count('* as total')

    const last24h = await Pool.query()
      .where('chain_id', chainId)
      .where('block_timestamp', '>=', DateTime.now().minus({ hours: 24 }))
      .count('* as total')

    const last7d = await Pool.query()
      .where('chain_id', chainId)
      .where('block_timestamp', '>=', DateTime.now().minus({ days: 7 }))
      .count('* as total')

    return response.json({
      chain_id: chainId,
      total_pools: total[0].$extras.total,
      pools_last_24h: last24h[0].$extras.total,
      pools_last_7d: last7d[0].$extras.total,
    })
  }
}
