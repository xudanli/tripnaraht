/**
 * Serve production observation dashboard + report artifact.
 *
 * Usage:
 *   npm run production-observation:preview
 *   PRODUCTION_OBSERVATION_PREVIEW_PORT=8091 npm run production-observation:preview
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

const HTML_PATH = path.join(
  process.cwd(),
  'src/decision-runtime/production-transition/production-observation-dashboard.internal.html',
);
const REPORT_PATH = path.join(process.cwd(), 'artifacts/production-observation/report.json');
const PORT = Number(process.env.PRODUCTION_OBSERVATION_PREVIEW_PORT ?? '8091');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [observation-preview] ${line}`);
}

function main() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '/';

    if (url === '/report.json') {
      if (!fs.existsSync(REPORT_PATH)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Run npm run production-observation:report first' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(REPORT_PATH, 'utf8'));
      return;
    }

    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(PORT, () => {
    log(`dashboard → http://localhost:${PORT}/`);
    log(`example: http://localhost:${PORT}/?api=http://localhost:3000/api`);
  });
}

main();
