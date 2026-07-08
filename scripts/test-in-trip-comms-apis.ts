#!/usr/bin/env npx tsx
/**
 * P2 行中团队对讲接口联调
 *
 * Usage:
 *   npm run test:in-trip-comms
 *   TRIP_ID=... npx tsx scripts/test-in-trip-comms-apis.ts
 */
import axios from 'axios';
import { randomUUID } from 'crypto';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const API = `${BASE}/api`;
const TRIP_ID = process.env.TRIP_ID ?? '1ae5cd8b-84ba-457d-9e0b-50ac3813a104';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function call<T = unknown>(
  label: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; errorCode?: string }> {
  const url = `${API}${path}`;
  console.log(`\n${yellow('▶')} ${label}`);
  console.log(`  ${method} ${url}`);
  if (body) console.log(`  body: ${JSON.stringify(body)}`);

  try {
    const res = await axios.request({ method, url, data: body, validateStatus: () => true });
    const payload = res.data as {
      success?: boolean;
      data?: T;
      error?: { code?: string; message?: string };
    };
    const ok = res.status >= 200 && res.status < 300 && payload.success !== false;
    console.log(ok ? green(`  ✓ HTTP ${res.status}`) : red(`  ✗ HTTP ${res.status}`));
    if (payload.error?.code) console.log(`  error.code: ${payload.error.code}`);
    console.log(JSON.stringify(payload, null, 2).slice(0, 2500));
    return {
      ok,
      status: res.status,
      data: (payload.data ?? null) as T | null,
      errorCode: payload.error?.code,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(red(`  ✗ ${msg}`));
    return { ok: false, status: 0, data: null };
  }
}

async function main() {
  console.log(yellow('========================================'));
  console.log(yellow('行中团队对讲 P2 接口测试'));
  console.log(yellow(`TRIP_ID=${TRIP_ID}`));
  console.log(yellow('========================================'));

  const results: Array<{ name: string; ok: boolean }> = [];
  const clientId = randomUUID();

  const heartbeatRes = await call(
    'POST peers/heartbeat',
    'POST',
    `/trips/${TRIP_ID}/in-trip/comms/peers/heartbeat`,
    {
      lat: 63.8804,
      lng: -22.4495,
      accuracyMeters: 10,
      shareLocation: true,
      clientTimestamp: new Date().toISOString(),
    },
  );
  results.push({ name: 'heartbeat', ok: heartbeatRes.ok });

  const peersRes = await call<{ peers?: unknown[] }>(
    'GET peers',
    'GET',
    `/trips/${TRIP_ID}/in-trip/comms/peers?refLat=63.8804&refLng=-22.4495`,
  );
  results.push({ name: 'peers', ok: peersRes.ok && (peersRes.data?.peers?.length ?? 0) >= 1 });

  const syncRes = await call<{ syncedIds?: string[]; latestServerSeq?: number }>(
    'POST comms/sync',
    'POST',
    `/trips/${TRIP_ID}/in-trip/comms/sync`,
    {
      messages: [
        {
          clientId,
          clientSeq: Date.now() % 1_000_000,
          type: 'text',
          body: `联调消息 ${new Date().toISOString()}`,
          createdAt: new Date().toISOString(),
        },
      ],
      lastKnownServerSeq: 0,
    },
  );
  results.push({
    name: 'sync',
    ok: syncRes.ok && (syncRes.data?.syncedIds?.includes(clientId) ?? false),
  });

  const latestSeq = syncRes.data?.latestServerSeq ?? 0;

  const listRes = await call<{ messages?: unknown[] }>(
    'GET comms history',
    'GET',
    `/trips/${TRIP_ID}/in-trip/comms?limit=10`,
  );
  results.push({ name: 'list', ok: listRes.ok && (listRes.data?.messages?.length ?? 0) >= 1 });

  const syncAgain = await call(
    'POST comms/sync idempotent',
    'POST',
    `/trips/${TRIP_ID}/in-trip/comms/sync`,
    {
      messages: [
        {
          clientId,
          clientSeq: Date.now() % 1_000_000,
          type: 'text',
          body: 'duplicate',
          createdAt: new Date().toISOString(),
        },
      ],
      lastKnownServerSeq: latestSeq,
    },
  );
  results.push({ name: 'sync-idempotent', ok: syncAgain.ok });

  // summary
  const summaryRes = await call<{ bullets?: string[] }>(
    'GET comms/summary',
    'GET',
    `/trips/${TRIP_ID}/in-trip/comms/summary?maxBullets=5`,
  );
  results.push({ name: 'summary', ok: summaryRes.ok });

  // reject raw audio in sync JSON
  const badSync = await call(
    'POST sync with base64 audio (expect COMMS_AUDIO_IN_JSON)',
    'POST',
    `/trips/${TRIP_ID}/in-trip/comms/sync`,
    {
      messages: [
        {
          clientId: randomUUID(),
          clientSeq: Date.now() % 1_000_000,
          type: 'voice',
          body: `data:audio/webm;base64,${'A'.repeat(600)}`,
          createdAt: new Date().toISOString(),
        },
      ],
    },
  );
  results.push({
    name: 'sync-reject-audio-json',
    ok: !badSync.ok && badSync.errorCode === 'COMMS_AUDIO_IN_JSON',
  });
  if (badSync.errorCode === 'COMMS_AUDIO_IN_JSON') {
    console.log(green('  ✓ sync 正确拒绝 JSON 内嵌音频'));
  }

  console.log(`\n${yellow('========================================')}`);
  console.log(yellow('汇总'));
  for (const r of results) {
    console.log(r.ok ? green(`  ✓ ${r.name}`) : red(`  ✗ ${r.name}`));
  }
  const allOk = results.every((r) => r.ok);
  console.log(allOk ? green('\n全部通过') : red('\n存在失败项'));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
