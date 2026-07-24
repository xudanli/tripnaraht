/**
 * Constraint DEFAULT_ON staging — HTTP probes on CANONICAL + CONSTRAINT_GATEWAY_MODE=ON.
 *
 * Usage:
 *   npm run p5-constraint-default-on:staging
 *   npm run p5-constraint-default-on:staging -- http://localhost:3001/api
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BASE = (
  process.env.P5_CONSTRAINT_DEFAULT_ON_BASE_URL ?? 'http://localhost:3001/api'
).replace(/\/$/, '');
const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p5-constraint-default-on-staging');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p5-default-on] ${line}`);
}

async function main() {
  const base = (process.argv[2] ?? DEFAULT_BASE).replace(/\/$/, '');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const probes: Array<{ id: string; pass: boolean; detail: string }> = [];

  try {
    const capsRes = await fetch(`${base}/decision-engine/v1/runtime-capabilities`, {
      signal: AbortSignal.timeout(8000),
    });
    const capsJson = (await capsRes.json()) as {
      success: boolean;
      data?: Record<string, unknown>;
    };
    const caps = capsJson.data ?? {};
    probes.push({
      id: 'runtime-mode-canonical',
      pass: caps.mode === 'CANONICAL',
      detail: String(caps.mode),
    });
    probes.push({
      id: 'constraint-gateway-on',
      pass: caps.constraintGatewayMode === 'ON',
      detail: String(caps.constraintGatewayMode),
    });
    probes.push({
      id: 'not-on-for-selected',
      pass: caps.constraintGatewayOnForSelected !== true,
      detail: String(caps.constraintGatewayOnForSelected),
    });
  } catch (err) {
    probes.push({
      id: 'http-connectivity',
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const pass = probes.every((p) => p.pass);
  const report = {
    schemaId: 'tripnara.p5_constraint_default_on_staging@v1',
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    pass,
    probes,
    blockers: probes.filter((p) => !p.pass).map((p) => p.id),
    hint: pass
      ? []
      : ['Start :3001: npm run p4-canonical-default:dev-3001 -- --skip-build'],
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} probes=${probes.filter((p) => p.pass).length}/${probes.length}`);

  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
