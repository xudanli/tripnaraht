#!/usr/bin/env npx tsx
/**
 * MVP 执行阶段接口联调：T-01 ~ T-05
 *
 * Usage:
 *   npx tsx scripts/test-execute-phase-mvp-apis.ts
 *   TRIP_ID=... PLACE_ID=... npx tsx scripts/test-execute-phase-mvp-apis.ts
 */
import axios from 'axios';

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
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const url = `${API}${path}`;
  console.log(`\n${yellow('▶')} ${label}`);
  console.log(`  ${method} ${url}`);
  if (body) console.log(`  body: ${JSON.stringify(body)}`);

  try {
    const res = await axios.request({ method, url, data: body, validateStatus: () => true });
    const payload = res.data as { success?: boolean; data?: T; error?: { code?: string; message?: string } };
    const ok = res.status >= 200 && res.status < 300 && payload.success !== false;
    console.log(ok ? green(`  ✓ HTTP ${res.status}`) : red(`  ✗ HTTP ${res.status}`));
    if (payload.error?.code) console.log(`  error.code: ${payload.error.code}`);
    const preview = JSON.stringify(payload, null, 2);
    console.log(preview.length > 3500 ? `${preview.slice(0, 3500)}\n  ... (truncated)` : preview);
    return { ok, status: res.status, data: (payload.data ?? payload) as T };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(red(`  ✗ ${msg}`));
    return { ok: false, status: 0, data: null };
  }
}

async function main() {
  console.log(yellow('========================================'));
  console.log(yellow('执行阶段 MVP 接口测试'));
  console.log(yellow(`TRIP_ID=${TRIP_ID}`));
  console.log(yellow('========================================'));

  const results: Array<{ name: string; ok: boolean }> = [];

  // T-01 + T-02
  const advisoryRes = await call<Record<string, unknown>>(
    'T-01/T-02 GET execution-advisory',
    'GET',
    `/trips/${TRIP_ID}/in-trip/execution-advisory`,
  );
  results.push({ name: 'execution-advisory', ok: advisoryRes.ok });

  const advisory = advisoryRes.data as {
    recommendations?: Array<{ id: string; actionType: string; label?: string }>;
    causalInsight?: { guardianHeadline?: string; causalStory?: { chain?: unknown[] } };
    verdict?: { status?: string; headline?: string };
    currentState?: { activeItemId?: string; delayMinutes?: number };
    date?: string;
  } | null;

  const recs = advisory?.recommendations ?? [];
  const hasKeep = recs.some((r) => r.actionType === 'keep');
  const chainLen = advisory?.causalInsight?.causalStory?.chain?.length ?? 0;
  console.log(
    `\n  checks: recommendations=${recs.length}, hasKeep=${hasKeep}, causalChain=${chainLen}, verdict=${advisory?.verdict?.status}`,
  );
  if (advisoryRes.ok) {
    if (recs.length < 1 || !hasKeep) {
      results[results.length - 1].ok = false;
      console.log(red('  ✗ recommendations 应 ≥1 且含 keep'));
    }
  }

  // T-03 — TRAVELING 行程在无 ?now= 时也应返回 nextStop + 坐标（行中日 fallback）
  const stateBareRes = await call<Record<string, unknown>>(
    'T-03 GET trip state (no now, TRAVELING fallback)',
    'GET',
    `/trips/${TRIP_ID}/state`,
  );
  results.push({ name: 'trip-state-fallback', ok: stateBareRes.ok });

  const stateBare = stateBareRes.data as {
    nextStop?: {
      placeId?: number;
      estimatedArrivalTime?: string;
      Place?: { latitude?: number | null; longitude?: number | null };
    };
    eta?: string;
  } | null;

  let placeId = process.env.PLACE_ID ? Number(process.env.PLACE_ID) : stateBare?.nextStop?.placeId;
  let lat = stateBare?.nextStop?.Place?.latitude;
  let lng = stateBare?.nextStop?.Place?.longitude;
  console.log(
    `\n  checks (fallback): nextStop.placeId=${placeId ?? 'n/a'}, lat=${lat}, lng=${lng}, eta=${stateBare?.nextStop?.estimatedArrivalTime ?? stateBare?.eta ?? 'n/a'}`,
  );
  if (stateBareRes.ok && (!stateBare?.nextStop || lat == null || lng == null)) {
    results[results.length - 1].ok = false;
    console.log(red('  ✗ TRAVELING fallback 下 nextStop 缺少坐标'));
  }

  // T-03 — optional explicit now window
  const stateNow = process.env.STATE_NOW ?? '2026-07-16T10:00:00.000Z';
  const stateRes = await call<Record<string, unknown>>(
    'T-03 GET trip state (explicit now)',
    'GET',
    `/trips/${TRIP_ID}/state?now=${encodeURIComponent(stateNow)}`,
  );
  results.push({ name: 'trip-state-explicit-now', ok: stateRes.ok });

  const state = stateRes.data as typeof stateBare;
  if (stateRes.ok && state?.nextStop) {
    placeId = placeId ?? state.nextStop.placeId;
    lat = lat ?? state.nextStop.Place?.latitude;
    lng = lng ?? state.nextStop.Place?.longitude;
    if (lat == null || lng == null) {
      results[results.length - 1].ok = false;
      console.log(red('  ✗ explicit now 下 nextStop 缺少坐标'));
    }
  }

  // T-05
  const evidencePlaceId = placeId ?? 381471;
  if (evidencePlaceId) {
    const date = advisory?.date ?? new Date().toISOString().slice(0, 10);
    const evidenceRes = await call<Record<string, unknown>>(
      'T-05 GET place evidence',
      'GET',
      `/places/${evidencePlaceId}/evidence?date=${date}&includeWeather=true&includeTraffic=true`,
    );
    results.push({ name: 'place-evidence', ok: evidenceRes.ok });
    const wind = (evidenceRes.data as { evidence?: { weatherWindow?: { wind?: { speed?: number } } } })
      ?.evidence?.weatherWindow?.wind?.speed;
    console.log(`\n  checks: wind.speed=${wind ?? 'n/a'}`);
  } else {
    console.log(yellow('\n⚠ 跳过 place evidence：无 placeId'));
    results.push({ name: 'place-evidence', ok: false });
  }

  // T-04 write chain blocked (optional — run server with EFFECTIVE_PLAN_WRITE_CHAIN=1)
  if (process.env.TEST_WRITE_CHAIN === '1') {
    const blockRec = recs.find((r) => r.actionType === 'shorten') ?? recs[0];
    if (blockRec && blockRec.actionType !== 'keep') {
      const blockRes = await call(
        'T-04 POST apply with write chain ON (expect WRITE_CHAIN_BLOCKED)',
        'POST',
        `/trips/${TRIP_ID}/in-trip/execution-advisory/recommendations/${blockRec.id}/apply`,
        { confirm: true, clientTimestamp: new Date().toISOString() },
      );
      const code = (blockRes.data as { error?: { code?: string } })?.error?.code;
      const blocked = !blockRes.ok && code === 'WRITE_CHAIN_BLOCKED';
      results.push({ name: 'apply-write-chain-blocked', ok: blocked });
      if (blocked) console.log(green('  ✓ 写链开启时返回 WRITE_CHAIN_BLOCKED'));
      else console.log(red(`  ✗ 期望 WRITE_CHAIN_BLOCKED，实际 code=${code ?? 'n/a'}`));
    }
  }

  // T-04 apply keep (expect no-op)
  const keepRec = recs.find((r) => r.actionType === 'keep');
  if (keepRec) {
    const keepRes = await call(
      'T-04 POST apply keep (expect RECOMMENDATION_NO_OP)',
      'POST',
      `/trips/${TRIP_ID}/in-trip/execution-advisory/recommendations/${keepRec.id}/apply`,
      { confirm: true, clientTimestamp: new Date().toISOString() },
    );
    const isExpectedNoOp = !keepRes.ok; // 400 expected
    results.push({ name: 'apply-keep-no-op', ok: isExpectedNoOp });
    if (isExpectedNoOp) console.log(green('  ✓ keep 正确拒绝'));
  }

  // T-04 apply shorten (if available)
  const shortenRec = recs.find((r) => r.actionType === 'shorten');
  if (shortenRec) {
    const applyRes = await call<Record<string, unknown>>(
      'T-04 POST apply shorten recommendation',
      'POST',
      `/trips/${TRIP_ID}/in-trip/execution-advisory/recommendations/${shortenRec.id}/apply`,
      { confirm: true, clientTimestamp: new Date().toISOString() },
    );
    const applied = (applyRes.data as { applied?: boolean })?.applied === true;
    results.push({ name: 'apply-shorten', ok: applyRes.ok && applied });
    if (applied) {
      const mutations = (applyRes.data as { scheduleMutations?: unknown[] })?.scheduleMutations;
      console.log(`\n  scheduleMutations: ${JSON.stringify(mutations)}`);
    }
  } else {
    console.log(yellow('\n⚠ 无 shorten 推荐，跳过 apply 写回测试'));
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
