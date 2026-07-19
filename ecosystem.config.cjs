module.exports = {
  apps: [
    {
      name: 'hmn-erp-api',
      cwd: './backend',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      kill_timeout: 12000,
      listen_timeout: 15000,
      env: { NODE_ENV: 'production' },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
