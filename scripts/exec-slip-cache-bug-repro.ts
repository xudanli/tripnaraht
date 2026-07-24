#!/usr/bin/env npx tsx
import 'dotenv/config';
import { mintCanaryJwt, httpJson } from './prod-canary-execution-slip-pre-signoff.util';
import {
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
} from './prod-canary-execution-slip-pre-signoff.constants';

const API = `${(process.env.BASE_URL ?? 'http://localhost:3002').replace(/\/$/, '')}/api`;

async function main() {
  const token = mintCanaryJwt();

  // Prime cache (simulates iOS loading decision queue before slip)
  await httpJson('GET', `${API}/trips/${EXEC_SLIP_CANARY_TRIP_ID}/decision-queue`, { token });
  console.log('Primed decision-queue cache');

  const slip = await httpJson<{ data?: { problemId?: string } }>(
    'POST',
    `${API}/trips/${EXEC_SLIP_CANARY_TRIP_ID}/execution/departure-slip`,
    {
      token,
      body: {
        activityId: EXEC_SLIP_CANARY_ACTIVITY_A_ID,
        observedAt: '2026-07-12T13:45:00.000Z',
        stillAtPoi: true,
        source: 'USER_REPORT',
      },
    },
  );
  const pid = slip.json.data?.problemId;
  console.log('POST problemId:', pid);

  const item = await httpJson('GET', `${API}/trips/${EXEC_SLIP_CANARY_TRIP_ID}/decision-queue/${pid}`, {
    token,
  });
  console.log('GET item after cache prime: success=', item.json.success, 'error=', item.json.error?.message);
}

main();
