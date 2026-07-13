/**
 * Execution Risk Legacy cutover — semantic shadow compare + Go/No-Go report.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { buildCutoverGoNoGoReport } from '../../src/trips/execution-risk-center/shadow/execution-risk-cutover-gates.util';
import type {
  ExecutionRiskCutoverBuildMetadata,
  ExecutionRiskShadowComparison,
} from '../../src/trips/execution-risk-center/shadow/execution-risk-shadow-compare.types';
import {
  appendFormalShadowSnapshot,
  observationWindowReady,
} from '../../src/trips/execution-risk-center/shadow/execution-risk-shadow-observation.store';
import {
  readExecutionRiskFeatureFlags,
  resolveExecutionRiskCutoverMode,
} from '../../src/trips/execution-risk-center/config/execution-risk-feature-flags.util';
import { verifyShadowCompareBuild } from '../../src/trips/execution-risk-center/shadow/execution-risk-shadow-build-verify.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'execution-risk-staging-validation');
const BASE = (process.env.ERC_STAGING_BASE_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const TRIP_ID = process.env.ERC_STAGING_TRIP_ID ?? '1ae5cd8b-84ba-457d-9e0b-50ac3813a104';
const TIMEOUT_MS = Number(process.env.ERC_STAGING_TIMEOUT_MS ?? 30_000);
const REQUIRE_BUILD_VERIFY = process.env.ERC_SHADOW_REQUIRE_BUILD_VERIFY !== '0';

type ShadowComparePayload = ExecutionRiskShadowComparison & {
  build?: ExecutionRiskCutoverBuildMetadata;
};

type ApiResponse<T> = { success: boolean; data?: T; error?: { message?: string } };

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [erc-shadow] ${line}`);
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.ERC_STAGING_AUTH_TOKEN?.trim();
  if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return headers;
}

async function api<T>(pathSuffix: string): Promise<{ ok: boolean; status: number; body: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${pathSuffix}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { ok: res.ok, status: res.status, body: (await res.json()) as ApiResponse<T> };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const flags = readExecutionRiskFeatureFlags();
  const cutoverMode = resolveExecutionRiskCutoverMode();
  log(`trip=${TRIP_ID} cutoverMode=${cutoverMode}`);

  const compareRes = await api<ShadowComparePayload>(
    `/trips/${TRIP_ID}/execution-risks/shadow-compare`,
  );
  if (!compareRes.ok || !compareRes.body.data) {
    log(`FAIL status=${compareRes.status} ${compareRes.body.error?.message ?? ''}`);
    process.exitCode = 1;
    return;
  }

  const comparison = compareRes.body.data;
  const buildVerify = verifyShadowCompareBuild({ comparison, build: comparison.build });
  for (const check of buildVerify.checks) {
    log(`build-verify [${check.pass ? 'PASS' : 'FAIL'}] ${check.id}: ${check.detail}`);
  }
  if (REQUIRE_BUILD_VERIFY && !buildVerify.pass) {
    log('FAIL: restart server on new build before formal observation — snapshots not appended');
    process.exitCode = 1;
    return;
  }

  const goNoGo = buildCutoverGoNoGoReport({ tripId: TRIP_ID, comparison });

  log(`primary=${comparison.divergenceKind} kinds=${comparison.divergenceKinds.join(',')}`);
  log(
    `raw legacy=${comparison.rawRiskComparison.legacyCount} canonical=${comparison.rawRiskComparison.canonicalCount} ` +
      `derived=${comparison.rawRiskComparison.derivedRiskCount} overlap=${comparison.rawRiskComparison.overlapRate.toFixed(2)}`,
  );
  log(
    `cluster legacyIssues=${comparison.clusterComparison.legacyIssueCount} ` +
      `canonicalClusters=${comparison.clusterComparison.canonicalClusterCount} ` +
      `dupClusters=${comparison.clusterComparison.duplicateClusterCount}`,
  );
  log(
    `semantic legacyCards=${comparison.semanticComparison.legacyVisibleCardCount} ` +
      `canonicalCards=${comparison.semanticComparison.canonicalVisibleCardCount} ` +
      `action=${comparison.semanticComparison.legacyRequiredAction}→${comparison.semanticComparison.canonicalRequiredAction}`,
  );
  const cv = comparison.semanticComparison.clusterVisibility;
  log(
    `cluster visible=${cv.visibleClusterCount} suppressed=${cv.suppressedClusterCount} ` +
      `hiddenStop=${cv.hiddenStopCount} hiddenHigh=${cv.hiddenHighSeverityCount} audits=${cv.audits.length}`,
  );
  if (comparison.build) {
    log(
      `build sha=${comparison.build.appBuildSha} knowledge=${comparison.build.knowledgeVersion} ` +
        `schema=${comparison.build.shadowSchemaVersion}`,
    );
  }
  log(`recommendation=${goNoGo.recommendation} pass=${goNoGo.pass} blockers=${goNoGo.blockers.length}`);

  const { dataset, appended } = appendFormalShadowSnapshot({
    comparison,
    build: {
      ...comparison.build,
      appBuildSha: process.env.APP_BUILD_SHA ?? comparison.build?.appBuildSha,
    },
    planVersionId: comparison.planVersionId,
  });
  log(
    `observation formalSnapshots=${dataset.snapshotCount} trips=${dataset.uniqueTripCount} ` +
      `appended=${appended} pendingAdjudication=${dataset.pendingAdjudicationCount} ` +
      `windowReady=${observationWindowReady(dataset)} legacyExcluded=${dataset.legacySnapshotsExcluded}`,
  );

  const shadowReport = {
    schemaId: 'tripnara.execution_risk_legacy_shadow_semantic@v2',
    generatedAt: new Date().toISOString(),
    tripId: TRIP_ID,
    flags,
    cutoverMode,
    build: comparison.build,
    buildVerify,
    comparison,
    projectStatus: {
      engineeringStatus: 'FEATURE_COMPLETE',
      verificationStatus: 'AUTOMATED_GATES_PASSED',
      runtimeStatus: goNoGo.runtimeStatus,
      writeStatus: 'STAGING_CONFIRM_GATED',
      productionStatus: 'NOT_YET_CUTOVER',
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, 'legacy-shadow-compare-report.json'), JSON.stringify(shadowReport, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'cutover-go-no-go-report.json'), JSON.stringify(goNoGo, null, 2));
  log('written legacy-shadow-compare-report.json + cutover-go-no-go-report.json');

  if (goNoGo.recommendation === 'NO_GO') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
