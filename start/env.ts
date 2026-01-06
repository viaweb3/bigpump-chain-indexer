/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for blockchain scanner
  |----------------------------------------------------------
  */
  BSC_RPC_URL: Env.schema.string({ format: 'url' }),
  BSC_ARCHIVE_RPC_URL: Env.schema.string.optional({ format: 'url' }),
  CREATE_POOL_ADDRESS_BSC: Env.schema.string(),
  BONDINGCURVE_ADDRESS_BSC: Env.schema.string(),
  SCANNER_START_BLOCK: Env.schema.number.optional(),
  SCANNER_BLOCK_CONFIRMATIONS: Env.schema.number.optional(),
  SCANNER_POLL_INTERVAL: Env.schema.number.optional(),
  SCANNER_CHUNK_SIZE: Env.schema.number.optional(),
  SCANNER_ARCHIVE_THRESHOLD: Env.schema.number.optional(),
})
