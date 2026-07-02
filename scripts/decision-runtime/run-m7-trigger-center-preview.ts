/**
 * Serve M7 internal trigger center UI for ops / engineering.
 *
 * Usage:
 *   npm run m7-trigger-center:preview
 *   M7_PREVIEW_PORT=8090 npm run m7-trigger-center:preview
 *
 * Open:
 *   http://localhost:8090/?tripId=<id>&base=http://localhost:3000/api
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

const HTML_PATH = path.join(
  process.cwd(),
  'src/decision-runtime/trigger/m7-trigger-center.internal.html',
);
const PORT = Number(process.env.M7_PREVIEW_PORT ?? '8090');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [m7-preview] ${line}`);
}

function main() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error(`Missing ${HTML_PATH}`);
    process.exit(1);
  }

  const html = fs.readFileSync(HTML_PATH, 'utf8');

  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url?.startsWith('/?')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(PORT, () => {
    log(`M7 internal UI → http://localhost:${PORT}/`);
    log(`example: http://localhost:${PORT}/?tripId=p4-selective-probe&base=http://localhost:3000/api`);
  });
}

main();
