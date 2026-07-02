/**
 * P1 staging validation — local env + unit probes + optional HTTP when server is up.
 *
 * Usage:
 *   npm run p1-staging:validate
 *   npm run p1-staging:validate -- http://localhost:3000/api
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { summarizeTriggerWiring } from '../../src/decision-runtime/trigger/decision-trigger-wiring.catalog';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { buildDecisionRuntimeCapabilitiesView } from '../../src/decision-runtime/execution/decision-runtime-capabilities.view';
import { buildConstraintEvaluationShadowComparison } from '../../src/decision-runtime/constraints/constraint-evaluation-shadow-compare.util';
import type { CanonicalConstraintReport } from '../../src/decision-runtime/constraints/contracts/canonical-constraint-report';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p1-staging-validation');
const BASE = (process.argv[2] ?? process.env.P1_STATUS_BASE_URL ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p1-staging] ${line}`);
}

function canonicalReport(status: CanonicalConstraintReport['overallStatus']): CanonicalConstraintReport {
  return {
    schemaId: 'tripnara.canonical_constraint_report@v1',
    tripId: 'p1-staging-probe',
    evaluatedAt: new Date().toISOString(),
    assertions:
      status === 'FEASIBLE'
        ? []
        : [
            {
              assertionId: 'a1',
              constraintType: 'ROAD',
              status: 'BLOCK',
              severity: 'HARD',
              scope: { tripId: 'p1-staging-probe' },
              reasonCode: 'ROAD_CLOSED',
              evidenceRefs: [],
              message: 'road closed',
              evaluator: { engine: 'p1-staging', version: '0' },
            },
          ],
    completeness: {
      roads: 'MISSING',
      weather: 'MISSING',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'MISSING',
    },
    overallStatus: status,
    degraded: false,
    degradedReasons: [],
  };
}

const SHADOW_PROBES = [
  {
    id: 'aligned-feasible',
    legacyFeasible: true,
    canonical: canonicalReport('FEASIBLE'),
    expectDiverged: false,
  },
  {
    id: 'weather-outdoor-storm',
    legacyFeasible: true,
    canonical: canonicalReport('INFEASIBLE'),
    expectDiverged: true,
  },
  {
    id: 'legacy-block-canonical-pass',
    legacyFeasible: false,
    canonical: canonicalReport('FEASIBLE'),
    expectDiverged: true,
  },
] as const;

async function probeHttpCapabilities(): Promise<{
  reachable: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const res = await fetch(`${BASE}/decision-engine/v1/runtime-capabilities`, {
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { data?: unknown };
    return { reachable: true, data: json.data ?? null };
  } catch (err) {
    return {
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  process.env.DECISION_TRIGGER_GATEWAY_ENABLED = '1';
  process.env.CONSTRAINT_GATEWAY_MODE = 'SHADOW_COMPARE';
  process.env.CONSTRAINT_EVALUATION_GATEWAY_ENABLED = '1';

  const localCaps = resolveDecisionRuntimeCapabilities();
  const triggerWiring = summarizeTriggerWiring();
  const view = buildDecisionRuntimeCapabilitiesView();

  const shadowProbeResults = SHADOW_PROBES.map((probe) => {
    const cmp = buildConstraintEvaluationShadowComparison({
      legacyFeasible: probe.legacyFeasible,
      canonicalReport: probe.canonical,
    });
    return {
      probeId: probe.id,
      diverged: cmp.diverged,
      divergenceKind: cmp.divergenceKind,
      pass: cmp.diverged === probe.expectDiverged,
    };
  });

  let jestExit = 0;
  try {
    execSync(
      'npx jest src/decision-runtime/p1-phase/p1-phase-baseline.spec.ts src/decision-runtime/trigger/decision-trigger.gateway.service.spec.ts src/decision-runtime/constraints/constraint-evaluation-shadow-compare.util.spec.ts --runInBand',
      {
        stdio: 'pipe',
        env: {
          ...process.env,
          DECISION_TRIGGER_GATEWAY_ENABLED: '0',
          CONSTRAINT_GATEWAY_MODE: 'OFF',
          CONSTRAINT_EVALUATION_GATEWAY_ENABLED: '0',
        },
      },
    );
  } catch (err) {
    jestExit = 1;
    log(`jest probe failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const httpProbe = await probeHttpCapabilities();

  const blockers: string[] = [];
  if (!localCaps.decisionTriggerGateway) blockers.push('decisionTriggerGateway not enabled locally');
  if (!localCaps.constraintGatewayShadowCompare) blockers.push('constraintGatewayShadowCompare not enabled locally');
  if (triggerWiring.notWired > 0) blockers.push(`${triggerWiring.notWired} trigger entry point(s) not_wired`);
  if (shadowProbeResults.some((p) => !p.pass)) blockers.push('in-process shadow probe mismatch');
  if (jestExit !== 0) blockers.push('jest P1 unit suite failed');
  if (!httpProbe.reachable) blockers.push(`HTTP server unreachable at ${BASE}`);

  const report = {
    schemaId: 'tripnara.p1_staging_validation@v1',
    generatedAt: new Date().toISOString(),
    env: {
      DECISION_TRIGGER_GATEWAY_ENABLED: process.env.DECISION_TRIGGER_GATEWAY_ENABLED,
      CONSTRAINT_GATEWAY_MODE: process.env.CONSTRAINT_GATEWAY_MODE,
      CONSTRAINT_EVALUATION_GATEWAY_ENABLED: process.env.CONSTRAINT_EVALUATION_GATEWAY_ENABLED,
    },
    localCapabilities: localCaps,
    triggerWiring,
    constraintRegistry: view.constraintRegistry,
    inProcessShadowProbes: shadowProbeResults,
    jestUnitSuite: jestExit === 0 ? 'PASS' : 'FAIL',
    httpProbe,
    blockers,
    pass: blockers.length === 0,
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `local trigger=${localCaps.decisionTriggerGateway} constraintShadow=${localCaps.constraintGatewayShadowCompare} wiring=${triggerWiring.dispatchCoveragePct}%`,
  );
  log(`in-process shadow probes: ${shadowProbeResults.filter((p) => p.pass).length}/${shadowProbeResults.length} pass`);
  log(`http: ${httpProbe.reachable ? 'reachable' : httpProbe.error ?? 'unreachable'}`);

  if (!report.pass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
