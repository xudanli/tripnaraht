#!/usr/bin/env npx tsx
/**
 * Legacy Neptune 执行接口联调：T-06 ~ T-08
 *
 * Usage:
 *   npx tsx scripts/test-execute-phase-legacy-apis.ts
 */
import axios from 'axios';

const API = `${process.env.BASE_URL ?? 'http://localhost:3000'}/api`;
const TRIP_ID = process.env.TRIP_ID ?? '1ae5cd8b-84ba-457d-9e0b-50ac3813a104';
const DAY_ID = process.env.DAY_ID ?? '31c6e120-ed3c-4822-97da-5ed2b97cf586';
const ITEM_ID = process.env.ITEM_ID ?? '5ee5ce0c-f6a7-44f1-8232-694a9aecd12e';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function call(label: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  console.log(`\n${yellow('▶')} ${label}`);
  console.log(`  ${method} ${API}${path}`);
  const res = await axios.request({ method, url: `${API}${path}`, data: body, validateStatus: () => true });
  const payload = res.data as { success?: boolean; data?: unknown; error?: { code?: string; message?: string } };
  const ok = res.status >= 200 && res.status < 300 && payload.success !== false;
  console.log(ok ? green(`  ✓ HTTP ${res.status}`) : red(`  ✗ HTTP ${res.status}`));
  if (payload.error?.code) console.log(`  error.code: ${payload.error.code}`);
  const text = JSON.stringify(payload, null, 2);
  console.log(text.length > 2500 ? `${text.slice(0, 2500)}\n  ... (truncated)` : text);
  return { ok, payload, status: res.status };
}

async function main() {
  console.log(yellow('Legacy Neptune / Execution API 测试'));
  const results: Array<{ name: string; ok: boolean }> = [];

  const health = await call('Health', 'GET', '/execution/health');
  results.push({ name: 'health', ok: health.ok });

  const status = await call('T-06 get_status', 'POST', '/execution/execute', {
    tripId: TRIP_ID,
    action: 'get_status',
  });
  results.push({ name: 'get_status', ok: status.ok && !!(status.payload as { data?: { executionState?: unknown } }).data });

  const remind = await call('T-06 remind', 'POST', '/execution/execute', {
    tripId: TRIP_ID,
    action: 'remind',
    remindParams: { reminderTypes: ['departure', 'weather'], advanceHours: 24 },
  });
  const reminders =
    (remind.payload as { data?: { uiOutput?: { reminders?: unknown[] }; executionState?: { reminders?: unknown[] } } })
      .data?.uiOutput?.reminders ??
    (remind.payload as { data?: { executionState?: { reminders?: unknown[] } } }).data?.executionState?.reminders;
  results.push({ name: 'remind', ok: remind.ok });

  const delay = await call('T-06 handle_change delay', 'POST', '/execution/execute', {
    tripId: TRIP_ID,
    action: 'handle_change',
    changeParams: {
      changeType: 'schedule_change',
      changeDetails: { reason: '联调延迟15分钟', delayMinutes: 15, itemId: ITEM_ID },
    },
  });
  results.push({ name: 'handle_change', ok: delay.ok });

  const fallback = await call('T-06 fallback', 'POST', '/execution/execute', {
    tripId: TRIP_ID,
    action: 'fallback',
    fallbackParams: { triggerReason: '联调触发修复', itemId: ITEM_ID, originalPlan: {} },
  });
  const solutions = (
    fallback.payload as {
      data?: { uiOutput?: { fallbackPlan?: { solutions?: Array<{ id: string }> } } };
    }
  ).data?.uiOutput?.fallbackPlan?.solutions;
  const solutionId = solutions?.[0]?.id;
  results.push({ name: 'fallback', ok: fallback.ok && (solutions?.length ?? 0) > 0 });

  if (solutionId) {
    const preview = await call('T-08b preview fallback', 'GET', `/execution/fallback/${solutionId}/preview`);
    results.push({ name: 'fallback-preview', ok: preview.ok });

    const applyFb = await call('T-08a apply fallback', 'POST', '/execution/apply-fallback', {
      tripId: TRIP_ID,
      solutionId,
      confirm: true,
    });
    const writeBlocked = (applyFb.payload as { error?: { code?: string } }).error?.code?.includes('WRITE_CHAIN');
    results.push({ name: 'apply-fallback', ok: applyFb.ok || writeBlocked });
  } else {
    console.log(yellow('\n⚠ 无 fallback solutions，跳过 preview/apply'));
  }

  const reorder = await call('T-07 reorder', 'POST', '/execution/reorder', {
    tripId: TRIP_ID,
    dayId: DAY_ID,
    newOrder: [
      '5ee5ce0c-f6a7-44f1-8232-694a9aecd12e',
      '123853b2-9580-4379-a653-291889742d31',
      '6f70dfc2-c95e-4171-8833-773cfce35115',
    ],
    reason: '联调重排',
  });
  const reorderBlocked = (reorder.payload as { error?: { code?: string } }).error?.code?.includes('WRITE_CHAIN');
  results.push({ name: 'reorder', ok: reorder.ok || reorderBlocked });

  console.log(`\n${yellow('汇总')}`);
  for (const r of results) console.log(r.ok ? green(`  ✓ ${r.name}`) : red(`  ✗ ${r.name}`));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
