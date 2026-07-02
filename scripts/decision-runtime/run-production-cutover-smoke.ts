/**
 * Post-cutover smoke — live runtime verify + redlines + scenario checklist.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PRODUCTION_CUTOVER_SMOKE_SCENARIOS } from '../../src/decision-runtime/production-transition/production-cutover.catalog';
import { verifyCutoverRuntimePosture } from '../../src/decision-runtime/production-transition/production-cutover-runtime-verify.util';
import type { CutoverRuntimeCapsInput } from '../../src/decision-runtime/production-transition/production-cutover-runtime-verify.util';
import { anchorProbationBaseline } from '../../src/decision-runtime/production-transition/production-cutover-probation-anchor.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [cutover-smoke] ${line}`);
}

function resolveApiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const apiBase = resolveApiBase(
    process.env.DECISION_RUNTIME_BASE_URL?.trim() || 'http://localhost:3000/api',
  );

  const probes: Array<{ id: string; pass: boolean; detail: string }> = [];

  try {
    const health = await fetch(`${apiBase}/decision-engine/v1/health`, {
      signal: AbortSignal.timeout(8000),
    });
    probes.push({ id: 'health', pass: health.ok, detail: `HTTP ${health.status}` });
  } catch (err) {
    probes.push({ id: 'health', pass: false, detail: (err as Error).message });
  }

  let runtimeVerify = verifyCutoverRuntimePosture({});
  try {
    const res = await fetch(`${apiBase}/decision-engine/v1/runtime-capabilities`, {
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { data?: CutoverRuntimeCapsInput };
    runtimeVerify = verifyCutoverRuntimePosture(json.data ?? {});
    for (const check of runtimeVerify.checks) {
      probes.push({
        id: `runtime-${check.id}`,
        pass: check.pass,
        detail: `${check.label}: ${check.actual} (expected ${check.expected})`,
      });
    }
  } catch (err) {
    probes.push({ id: 'runtime-capabilities', pass: false, detail: (err as Error).message });
  }

  try {
    const obs = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'artifacts/production-observation/report.json'),
        'utf8',
      ),
    ) as { readiness?: { hardRedlinesPassed?: boolean } };
    probes.push({
      id: 'observation-redlines',
      pass: obs.readiness?.hardRedlinesPassed !== false,
      detail: obs.readiness?.hardRedlinesPassed ? 'hardRedlinesPassed' : 'redline check',
    });
  } catch {
    probes.push({
      id: 'observation-redlines',
      pass: false,
      detail: 'run npm run production-observation:collect',
    });
  }

  const wiring = runtimeVerify.checks.find((c) => c.id === 'trigger-gateway');
  probes.push({
    id: 'trigger-lineage-ready',
    pass: wiring?.pass === true,
    detail: 'Trigger Gateway ON — verify lineage on first formal request',
  });

  const report = {
    schemaId: 'tripnara.production_cutover_smoke@v2',
    generatedAt: new Date().toISOString(),
    apiBase,
    pass: probes.every((p) => p.pass),
    cutoverComplete: probes.every((p) => p.pass),
    runtimeVerify,
    automatedProbes: probes,
    manualScenarios: PRODUCTION_CUTOVER_SMOKE_SCENARIOS.map((s) => ({
      ...s,
      pass: false,
      note: 'Execute with staging trip — record in ops log',
    })),
    legacyFallback: {
      cmd: 'npm run rollback-tier-a:legacy',
      note: 'Config-only rollback — restart required',
    },
  };

  const outPath = path.join(OUT_DIR, 'smoke.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`automated=${report.pass} probes=${probes.filter((p) => p.pass).length}/${probes.length}`);

  if (report.pass) {
    const runtimeVerifyArtifact = (() => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(OUT_DIR, 'runtime-verify.json'), 'utf8'),
        ) as { pass?: boolean };
      } catch {
        return null;
      }
    })();
    const baseline = anchorProbationBaseline({
      verifyRuntimePass: runtimeVerifyArtifact?.pass === true || runtimeVerify.pass,
      smokePass: true,
    });
    if (baseline) {
      log(`probation anchor recorded probationStartedAt=${baseline.probationStartedAt}`);
    }
  }

  if (!report.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
