// ==============================================================================
// Pack-Parikshak AI (पैक-परीक्षक एआई) - PM2 Production Ecosystem Config
// Designed for Linux VPS / Bare Metal / Cloud VM Deployments
// ==============================================================================

module.exports = {
  apps: [
    {
      name: "pack-parikshak-ai",
      script: "./app.js",
      instances: 1, // Runs unified server which auto-manages Python OCR worker
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
        PYTHON_OCR_PORT: 5000,
        PYTHON_OCR_HOST: "127.0.0.1"
      },
      error_file: "./logs/pm2-err.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      kill_timeout: 5000,
      listen_timeout: 8000
    }
  ]
};

