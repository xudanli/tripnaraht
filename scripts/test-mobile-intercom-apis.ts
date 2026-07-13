#!/usr/bin/env npx tsx
/**
 * Mobile BFF 团队对讲接口联调（TeamIntercomView）
 *
 * Usage:
 *   npm run test:mobile-intercom
 *   TRIP_ID=... BASE_URL=http://localhost:3000 npx tsx scripts/test-mobile-intercom-apis.ts
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
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const url = `${API}${path}`;
  console.log(`\n${yellow('▶')} ${label}`);
  console.log(`  ${method} ${url}`);

  try {
    const res = await axios.request({
      method,
      url,
      data: body,
      headers,
      validateStatus: () => true,
    });
    const payload = res.data as { success?: boolean; data?: T; error?: { code?: string } };
    const ok = res.status >= 200 && res.status < 300 && payload.success !== false;
    console.log(ok ? green(`  ✓ HTTP ${res.status}`) : red(`  ✗ HTTP ${res.status}`));
    if (payload.error?.code) console.log(`  error.code: ${payload.error.code}`);
    console.log(JSON.stringify(payload, null, 2).slice(0, 2000));
    return { ok, status: res.status, data: (payload.data ?? null) as T | null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(red(`  ✗ ${msg}`));
    return { ok: false, status: 0, data: null };
  }
}

async function main() {
  console.log(yellow('========================================'));
  console.log(yellow('Mobile 团队对讲 BFF 联调'));
  console.log(yellow(`TRIP_ID=${TRIP_ID}`));
  console.log(yellow('========================================'));

  const results: Array<{ name: string; ok: boolean }> = [];
  const idemText = randomUUID();
  const idemStatus = randomUUID();

  const presence = await call(
    'PUT presence',
    'PUT',
    `/mobile/trips/${TRIP_ID}/members/anonymous-dev-user/presence`,
    {
      lat: 64.6643,
      lng: -20.9119,
      accuracy: 10,
      batteryPercent: 78,
      recordedAt: new Date().toISOString(),
    },
  );
  results.push({ name: 'presence', ok: presence.ok });

  const teamStatus = await call<{ members?: unknown[] }>(
    'GET team-status',
    'GET',
    `/mobile/trips/${TRIP_ID}/execution/team-status`,
  );
  results.push({ name: 'team-status', ok: teamStatus.ok });

  const messagesBefore = await call<{ messages?: unknown[] }>(
    'GET intercom/messages',
    'GET',
    `/mobile/trips/${TRIP_ID}/intercom/messages?limit=5`,
  );
  results.push({ name: 'intercom-messages', ok: messagesBefore.ok });

  const summary = await call<{ bullets?: string[]; status?: string }>(
    'GET intercom/summary',
    'GET',
    `/mobile/trips/${TRIP_ID}/intercom/summary`,
  );
  results.push({ name: 'intercom-summary', ok: summary.ok });

  const text = await call(
    'POST intercom text',
    'POST',
    `/mobile/trips/${TRIP_ID}/intercom/messages`,
    { kind: 'text', body: `联调文字 ${new Date().toISOString()}` },
    { 'Content-Type': 'application/json', 'Idempotency-Key': idemText },
  );
  results.push({ name: 'intercom-text', ok: text.ok });

  const status = await call(
    'POST notification arrived',
    'POST',
    `/mobile/trips/${TRIP_ID}/notifications`,
    {
      recipientIds: ['anonymous-dev-user'],
      type: 'arrived',
      title: '我到了',
      body: '已到达当前位置',
      attachments: { includeLocation: true },
      location: { lat: 64.6643, lng: -20.9119 },
    },
    { 'Content-Type': 'application/json', 'Idempotency-Key': idemStatus },
  );
  results.push({ name: 'status-notification', ok: status.ok });

  const messagesAfter = await call<{ messages?: Array<{ kind: string; statusType?: string }> }>(
    'GET intercom/messages (after writes)',
    'GET',
    `/mobile/trips/${TRIP_ID}/intercom/messages?limit=10`,
  );
  const hasStatus = (messagesAfter.data?.messages ?? []).some((m) => m.kind === 'status');
  results.push({ name: 'status-in-history', ok: messagesAfter.ok && hasStatus });

  console.log(`\n${yellow('========================================')}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`${yellow('结果:')} ${passed}/${results.length} 通过`);
  for (const r of results) {
    console.log(r.ok ? green(`  ✓ ${r.name}`) : red(`  ✗ ${r.name}`));
  }
  console.log(yellow('========================================\n'));

  if (passed < results.length) process.exit(1);
}

void main();
