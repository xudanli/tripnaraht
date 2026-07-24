/**
 * LEGACY_FALLBACK drill — validate three-tier rollback posture (offline + optional HTTP).
 *
 * Usage:
 *   npm run p4-legacy-fallback:drill
 *   npm run p4-legacy-fallback:drill -- http://localhost:3001/api
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { evaluateLegacyFallbackDrill } from '../../src/decision-runtime/p4-phase/legacy-fallback-drill.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-legacy-fallback-drill');
const BASE = (
  process.argv[2] ?? process.env.P4_LEGACY_FALLBACK_BASE_URL ?? ''
).replace(/\/$/, '');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [legacy-fallback-drill] ${line}`);
}

async function httpSnapshot(base: string) {
  const res = await fetch(`${base}/decision-engine/v1/runtime-capabilities`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { success: boolean; data?: Record<string, unknown> };
  return json.data ?? {};
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const caps = resolveDecisionRuntimeCapabilities();
  const drill = evaluateLegacyFallbackDrill(caps);

  let httpBefore: Record<string, unknown> | null = null;
  if (BASE) {
    try {
      httpBefore = await httpSnapshot(BASE);
    } catch (err) {
      log(`http skip: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const report = {
    schemaId: 'tripnara.p4_legacy_fallback_drill_report@v1',
    generatedAt: new Date().toISOString(),
    drill,
    httpBefore,
    pass: drill.drillPass,
    runbook: 'src/decision-runtime/p4-phase/LEGACY_FALLBACK_RUNBOOK.md',
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`drillPass=${drill.drillPass} tiers=${drill.tiers.map((t) => t.tier).join(' → ')}`);

  if (!drill.drillPass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
