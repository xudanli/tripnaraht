/**
 * Minimal M1 local app instance — health + identity for LB probes.
 */
import { createServer } from 'http';

const port = Number(process.env.PORT ?? 0);
const instanceId = String(process.env.APP_INSTANCE_ID ?? 'local-unknown');

if (!port) {
  console.error('PORT required');
  process.exit(1);
}

const server = createServer((req, res) => {
  res.setHeader('X-App-Instance-Id', instanceId);
  if (req.url === '/health' || req.url === '/api/health') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, instanceId }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'NOT_FOUND' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`listening :${port} id=${instanceId}`);
});
