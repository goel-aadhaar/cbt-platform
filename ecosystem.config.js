/**
 * pm2 process definitions for a single-instance deployment (see DEPLOYMENT.md).
 *
 * Both apps are started by their own compiled/built output directly — not
 * routed through `pnpm --filter` — so each process's cwd is exactly where its
 * own .env and build artifacts live, with no extra layer in between.
 *
 * First deploy or update:
 *   pm2 startOrReload ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: "drsk-api",
      cwd: "./apps/api",
      script: "dist/main.js",
      env: { NODE_ENV: "production" },
      max_memory_restart: "600M",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "drsk-web",
      cwd: "./apps/web",
      script: "node_modules/.bin/next",
      args: "start",
      env: { NODE_ENV: "production" },
      max_memory_restart: "600M",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
