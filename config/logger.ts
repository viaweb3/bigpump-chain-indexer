import env from '#start/env'
import { defineConfig } from '@adonisjs/core/logger'

const loggerConfig = defineConfig({
  default: 'app',

  /**
   * The loggers object can be used to define multiple loggers.
   * By default, we configure only one logger (named "app").
   */
  loggers: {
    app: {
      enabled: true,
      name: env.get('APP_NAME'),
      level: env.get('LOG_LEVEL'),
      
      /**
       * Use JSON format output to ensure all structured data is visible
       * This is the most reliable way to ensure all structured data is displayed
       */
      transport: {
        targets: [
          {
            target: 'pino/file',
            level: env.get('LOG_LEVEL'),
            options: {
              destination: 1, // 1 = stdout
              timestamp: true // Include timestamp in logs
            }
          }
        ]
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
