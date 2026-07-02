/**
 * Formal calibration blocker status — blind review queue + runtime capabilities.
 *
 * Usage:
 *   npx tsx scripts/decision-runtime/run-formal-calibration-status.ts
 *   npx tsx scripts/decision-runtime/run-formal-calibration-status.ts http://localhost:3001/api
 *
 * Env:
 *   CALIBRATION_STATUS_BASE_URL (default http://localhost:3001/api)
 *   CALIBRATION_STATUS_LOCAL_URL (default http://localhost:3000/api)
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const SHADOW_BASE = (
  process.argv[2] ??
  process.env.CALIBRATION_STATUS_BASE_URL ??
  'http://localhost:3001/api'
).replace(/\/$/, '');
const LOCAL_BASE = (
  process.env.CALIBRATION_STATUS_LOCAL_URL ?? 'http://localhost:3000/api'
).replace(/\/$/, '');
const OUT_DIR = path.join(process.cwd(), 'artifacts', 'formal-calibration-status');

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

type ReviewQueue = {
  items: Array<{
    reviewCaseId: string;
    comparisonId: string;
    tripId: string;
    status: string;
    divergenceTypes: string[];
    divergenceSeverity: string;
  }>;
};

type RuntimeCapabilities = {
  mode?: string;
  constraintGatewayMode?: string;
  constraintGatewayShadowCompare?: boolean;
  constraintShadowMetrics?: {
    comparedTotal: number;
    divergedTotal: number;
    byDivergenceKind: Record<string, number>;
  };
};

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [calibration-status] ${line}`);
}

async function api<T>(base: string, apiPath: string): Promise<ApiResponse<T>> {
  const res = await fetch(`${base}${apiPath}`);
  return (await res.json()) as ApiResponse<T>;
}

async function probeCapabilities(label: string, base: string) {
  const res = await api<RuntimeCapabilities>(base, '/decision-engine/v1/runtime-capabilities');
  if (!res.success || !res.data) {
    const health = await api<{ capabilities?: Record<string, unknown> }>(
      base,
      '/decision-engine/v1/health',
    );
    if (health.success && health.data) {
      log(`${label} capabilities N/A — health ok (legacy server, restart :3001 for runtime-capabilities)`);
      return {
        mode: String(health.data.capabilities?.decisionRuntimeMode ?? 'unknown'),
        constraintGatewayMode: 'UNKNOWN',
        constraintGatewayShadowCompare: false,
      } satisfies RuntimeCapabilities;
    }
    log(`${label} capabilities FAIL: ${res.error?.message ?? 'unknown'}`);
    return null;
  }
  const d = res.data;
  log(
    `${label} mode=${d.mode} constraintMode=${d.constraintGatewayMode} shadowCompare=${d.constraintGatewayShadowCompare} metrics=${JSON.stringify(d.constraintShadowMetrics ?? {})}`,
  );
  return d;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const shadowCaps = await probeCapabilities('shadow', SHADOW_BASE);
  const localCaps = await probeCapabilities('local', LOCAL_BASE);

  const queueRes = await api<ReviewQueue>(
    SHADOW_BASE,
    '/decision-engine/v1/shadow-reviews/queue?status=PENDING&limit=20',
  );
  const pending = queueRes.data?.items ?? [];
  log(`blind review PENDING count=${pending.length}`);

  const completedRes = await api<ReviewQueue>(
    SHADOW_BASE,
    '/decision-engine/v1/shadow-reviews/queue?status=COMPLETED&limit=50',
  );
  const completedItems = completedRes.data?.items ?? [];

  const CALIBRATION_TRIPS = [
    'bench_calibration_REAL_MULTI_CANDIDATE_001',
    'bench_calibration_REAL_MULTI_CANDIDATE_002',
    'bench_calibration_TD_006_three_way',
  ];
  const calibrationBlindReviewCompleted = CALIBRATION_TRIPS.map((tripId) => {
    const match = completedItems.find((i) => i.tripId === tripId);
    return match
      ? {
          reviewCaseId: match.reviewCaseId,
          comparisonId: match.comparisonId,
          tripId: match.tripId,
          status: match.status,
        }
      : { tripId, status: 'MISSING' as const };
  });
  const calibrationSubmittedCount = calibrationBlindReviewCompleted.filter(
    (c) => c.status === 'COMPLETED',
  ).length;
  log(`calibration-v1 blind review COMPLETED=${calibrationSubmittedCount}/3`);

  for (const item of pending.slice(0, 5)) {
    log(
      `  - ${item.reviewCaseId} trip=${item.tripId} severity=${item.divergenceSeverity} types=${item.divergenceTypes.join(',')}`,
    );
  }

  const blockers: string[] = [];
  if (calibrationSubmittedCount < 3) {
    blockers.push(
      `calibration-v1 blind review incomplete (${calibrationSubmittedCount}/3 COMPLETED)`,
    );
  }
  if (!shadowCaps?.constraintGatewayShadowCompare && !localCaps?.constraintGatewayShadowCompare) {
    blockers.push('CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE not enabled on probed servers');
  }

  const nextSteps =
    calibrationSubmittedCount >= 3
      ? [
          'Formal freeze: Aliyun post-migration snapshot (npm run task-e1:record-post-migration-snapshot)',
          'Formal freeze: git tag decision-benchmark-calibration-v1',
          'Constraint shadow staging: CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE npm run dev && npm run constraint-shadow:staging',
        ]
      : [
          'Submit 3 calibration blind reviews: npm run task-e1:shadow-blind-review list',
          'Constraint shadow staging: CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE npm run dev && npm run constraint-shadow:staging',
          'Grafana: monitoring/GRAFANA_CONSTRAINT_SHADOW_IMPORT.md',
        ];

  const report = {
    generatedAt: new Date().toISOString(),
    shadowBase: SHADOW_BASE,
    localBase: LOCAL_BASE,
    shadowCapabilities: shadowCaps,
    localCapabilities: localCaps,
    calibrationBlindReviewCompleted,
    calibrationBlindReviewSubmittedCount: calibrationSubmittedCount,
    blindReviewPending: pending.map((i) => ({
      reviewCaseId: i.reviewCaseId,
      comparisonId: i.comparisonId,
      tripId: i.tripId,
      divergenceTypes: i.divergenceTypes,
      divergenceSeverity: i.divergenceSeverity,
    })),
    blockers,
    nextSteps,
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);

  if (blockers.length) {
    log(`BLOCKERS: ${blockers.join('; ')}`);
    process.exitCode = 1;
  } else {
    log('no hard blockers detected from this probe (manual review + git tag still required)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
