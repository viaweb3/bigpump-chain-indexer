module.exports = {
  apps: [
    {
      name: 'bigpump-scanner-bsc',
      script: './ace.js',
      cwd: '/home/allis/bigpump-chain-indexer',
      args: 'scan:blockchain --chain=bsc',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/scanner-bsc-error.log',
      out_file: './logs/scanner-bsc-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
}
