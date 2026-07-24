#!/usr/bin/env npx tsx
import 'dotenv/config';
import {
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
} from './prod-canary-execution-slip-pre-signoff.constants';
import { httpJson, mintCanaryJwt } from './prod-canary-execution-slip-pre-signoff.util';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3002').replace(/\/$/, '');
const API = `${BASE}/api`;

async function main() {
  const token = mintCanaryJwt();
  const res = await httpJson<{
    success?: boolean;
    data?: { status: string; problemId?: string; observationId?: string };
    error?: { code?: string; message?: string };
  }>('POST', `${API}/trips/${EXEC_SLIP_CANARY_TRIP_ID}/execution/departure-slip`, {
    token,
    body: {
      activityId: EXEC_SLIP_CANARY_ACTIVITY_A_ID,
      observedAt: EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
      stillAtPoi: true,
      source: 'USER_REPORT',
    },
  });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`departure-slip HTTP ${res.status}: ${JSON.stringify(res.json.error ?? res.json)}`);
  }
  if (res.json.data?.status !== 'RECORDED' || !res.json.data.problemId) {
    throw new Error(
      `expected RECORDED+problemId, got ${JSON.stringify(res.json.data ?? res.json.error)}`,
    );
  }

  console.log(
    `PASS: departure-slip RECORDED problemId=${res.json.data.problemId} observationId=${res.json.data.observationId}`,
  );
}

main().catch((e) => {
  console.error('FAIL:', e.message ?? e);
  process.exit(1);
});
