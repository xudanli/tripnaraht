/**
 * Verify staging build exposes v2 shadow schema + clusterVisibility before formal observation.
 *
 * Usage: npm run execution-risk-shadow:build-verify
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import type {
  ExecutionRiskCutoverBuildMetadata,
  ExecutionRiskShadowComparison,
} from '../../src/trips/execution-risk-center/shadow/execution-risk-shadow-compare.types';
import { verifyShadowCompareBuild } from '../../src/trips/execution-risk-center/shadow/execution-risk-shadow-build-verify.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'execution-risk-staging-validation');
const BASE = (process.env.ERC_STAGING_BASE_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const TRIP_ID = process.env.ERC_STAGING_TRIP_ID ?? '1ae5cd8b-84ba-457d-9e0b-50ac3813a104';
const TIMEOUT_MS = Number(process.env.ERC_STAGING_TIMEOUT_MS ?? 30_000);

type ShadowComparePayload = ExecutionRiskShadowComparison & {
  build?: ExecutionRiskCutoverBuildMetadata;
};

type ApiResponse<T> = { success: boolean; data?: T; error?: { message?: string } };

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [erc-build-verify] ${line}`);
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.ERC_STAGING_AUTH_TOKEN?.trim();
  if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return headers;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const res = await fetch(`${BASE}/trips/${TRIP_ID}/execution-risks/shadow-compare`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json()) as ApiResponse<ShadowComparePayload>;
  if (!res.ok || !body.data) {
    log(`FAIL status=${res.status} ${body.error?.message ?? ''}`);
    process.exitCode = 1;
    return;
  }

  const verified = verifyShadowCompareBuild({
    comparison: body.data,
    build: body.data.build,
  });

  for (const check of verified.checks) {
    log(`[${check.pass ? 'PASS' : 'FAIL'}] ${check.id}: ${check.detail}`);
  }

  const report = {
    schemaId: 'tripnara.execution_risk_shadow_build_verify@v1',
    generatedAt: new Date().toISOString(),
    tripId: TRIP_ID,
    pass: verified.pass,
    checks: verified.checks,
    build: body.data.build,
    clusterVisibility: body.data.semanticComparison?.clusterVisibility,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'shadow-build-verify-report.json'), JSON.stringify(report, null, 2));
  log(`written shadow-build-verify-report.json pass=${verified.pass}`);

  if (!verified.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
