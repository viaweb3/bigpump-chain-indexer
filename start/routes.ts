/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const PoolsController = () => import('#controllers/pools_controller')
const TradesController = () => import('#controllers/trades_controller')
const ScannerStatesController = () => import('#controllers/scanner_states_controller')

router.get('/', async () => {
  return {
    name: 'BigPump Chain Indexer API',
    version: '1.0.0',
    status: 'running',
  }
})

// API v1 routes
router
  .group(() => {
    // Pool routes
    router
      .group(() => {
        router.get('/', [PoolsController, 'index'])
        router.get('/stats', [PoolsController, 'stats'])
        router.get('/time-range', [PoolsController, 'byTimeRange'])
        router.get('/by-pool-id', [PoolsController, 'showByPoolId'])
        router.get('/:id', [PoolsController, 'show'])
      })
      .prefix('/pools')

    // Trade routes
    router
      .group(() => {
        router.get('/', [TradesController, 'index'])
        router.get('/stats', [TradesController, 'stats'])
        router.get('/kline', [TradesController, 'kline'])
        router.get('/time-range', [TradesController, 'byTimeRange'])
        router.get('/:id', [TradesController, 'show'])
      })
      .prefix('/trades')

    // Scanner state routes
    router
      .group(() => {
        router.get('/', [ScannerStatesController, 'index'])
        router.get('/show', [ScannerStatesController, 'show'])
      })
      .prefix('/scanner-states')
  })
  .prefix('/api/v1')
