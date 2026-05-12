module.exports = {
  apps: [
    {
      name: "werdant-bot",
      cwd: __dirname,
      script: "./werdant-bot/index.js",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
