/**
 * PM2 — Vedur collector stack (devbox ingest + Frankfurt reverse tunnel).
 */
module.exports = {
  apps: [
    {
      name: 'vedur-collector-ingest',
      script: 'scripts/run-vedur-collector-ingest-server.sh',
      cwd: '/home/devbox/project',
      interpreter: 'bash',
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
    },
    {
      name: 'vedur-collector-tunnel',
      script: 'scripts/vedur-collector-tunnel.sh',
      cwd: '/home/devbox/project',
      interpreter: 'bash',
      autorestart: true,
      max_restarts: 100,
      min_uptime: '5s',
    },
  ],
};
