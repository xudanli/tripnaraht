/**
 * Exploration CPRE resolvedPois 覆盖率 QA
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api npx tsx scripts/exploration-cpre-poi-qa.ts
 *   SCENARIO_ID=... AUTH_TOKEN=... npx tsx scripts/exploration-cpre-poi-qa.ts  # 仅 compare 已有场景
 *
 * 通过标准（可调 env）：
 *   CPRE_QA_MIN_POIS_PER_CANDIDATE=6
 *   CPRE_QA_MIN_MATCH_RATE=0.5
 */

import 'dotenv/config';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL ?? 'exploration-e2e@tripnara.dev';
const MIN_POIS = Number(process.env.CPRE_QA_MIN_POIS_PER_CANDIDATE ?? 6);
const MIN_MATCH_RATE = Number(process.env.CPRE_QA_MIN_MATCH_RATE ?? 0.5);

let token = process.env.AUTH_TOKEN?.trim() ?? '';

type ResolvedPoiRef = {
  name: string;
  resolved?: boolean;
  poiId?: string;
  status?: string;
};

type Candidate = {
  routeId: string;
  title?: string;
  resolvedPois?: ResolvedPoiRef[];
};

type Step = { name: string; pass: boolean; detail: string };
const steps: Step[] = [];

function record(name: string, pass: boolean, detail: string) {
  steps.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

async function api<T>(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { success?: boolean; data?: T; error?: { message?: string } };
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json.data as T;
}

async function login() {
  if (token) return;
  await fetch(`${BASE}/auth/email/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  }).catch(() => undefined);
  const code = process.env.NODE_ENV === 'production' ? undefined : '888888';
  if (!code) throw new Error('Set AUTH_TOKEN in production');
  await fetch(`${BASE}/auth/email/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, code, displayName: 'CPRE POI QA' }),
  }).catch(() => undefined);
  const loginRes = await fetch(`${BASE}/auth/email/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, code }),
  });
  const loginJson = (await loginRes.json()) as { accessToken?: string };
  if (!loginJson.accessToken) throw new Error('login failed');
  token = loginJson.accessToken;
}

function summarizeCandidate(c: Candidate) {
  const pois = c.resolvedPois ?? [];
  const matched = pois.filter((p) => p.resolved && p.poiId);
  const notFound = pois.filter((p) => p.status === 'NOT_FOUND' || !p.resolved);
  const rate = pois.length > 0 ? matched.length / pois.length : 0;
  return { total: pois.length, matched: matched.length, notFound: notFound.length, rate, pois };
}

async function main() {
  console.log(`CPRE POI QA — ${BASE} (minPois=${MIN_POIS}, minMatchRate=${MIN_MATCH_RATE})\n`);
  await login();

  let scenarioId = process.env.SCENARIO_ID?.trim();
  if (!scenarioId) {
    const created = await api<{ scenarioId: string }>('POST', '/exploration/scenarios', {
      destinationCodes: ['IS'],
      dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
      travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
      mobilityContext: { vehicleType: '4WD_SUV' },
    });
    scenarioId = created.scenarioId;

    await api('PUT', `/exploration/scenarios/${scenarioId}/principles`, {
      principles: [
        { principleId: 'CORE_EXPERIENCE_FIRST', rank: 1 },
        { principleId: 'LOW_DRIVING', rank: 2 },
        { principleId: 'REMOTE_EXPLORATION', rank: 3 },
      ],
    });
  }

  const compare = await api<{
    candidates: Candidate[];
    generationMode?: string;
  }>('GET', `/exploration/scenarios/${scenarioId}/candidates/compare`);

  record(
    'compare-has-candidates',
    (compare.candidates?.length ?? 0) >= 1,
    `count=${compare.candidates?.length ?? 0} mode=${compare.generationMode ?? '?'}`,
  );

  let allPass = true;
  for (const c of compare.candidates ?? []) {
    const s = summarizeCandidate(c);
    const passCount = s.total >= MIN_POIS;
    const passRate = s.rate >= MIN_MATCH_RATE;
    const pass = passCount && passRate;
    if (!pass) allPass = false;

    const samples = s.pois
      .slice(0, 4)
      .map((p) => `${p.name}→${p.poiId ?? p.status ?? '?'}`)
      .join('; ');

    record(
      `resolvedPois:${c.routeId}`,
      pass,
      `total=${s.total} matched=${s.matched} notFound=${s.notFound} rate=${(s.rate * 100).toFixed(0)}% | ${samples}`,
    );
  }

  record('all-candidates-cpre-threshold', allPass, allPass ? 'ok' : 'see per-route failures');

  const pick = compare.candidates?.[0];
  if (pick?.routeId) {
    const detail = await api<{ detail?: { resolvedPois?: ResolvedPoiRef[]; poiMentions?: string[] } }>(
      'GET',
      `/exploration/scenarios/${scenarioId}/routes/${pick.routeId}`,
    );
    const detailPois = detail.detail?.resolvedPois ?? [];
    record(
      'route-detail-resolvedPois',
      detailPois.length >= MIN_POIS,
      `detail.resolvedPois=${detailPois.length} poiMentions=${detail.detail?.poiMentions?.length ?? 0}`,
    );
  }

  const cpreResolve = await fetch(`${BASE}/poi/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '塞里雅兰瀑布', countryCode: 'IS' }),
  });
  const cpreJson = (await cpreResolve.json()) as { data?: { status?: string; poiId?: string } };
  record(
    'cpre-fuzzy-塞里雅兰瀑布',
    cpreJson.data?.status === 'MATCHED' && cpreJson.data?.poiId === 'is.seljalandsfoss',
    `status=${cpreJson.data?.status} poiId=${cpreJson.data?.poiId ?? '?'}`,
  );

  const failed = steps.filter((s) => !s.pass);
  console.log(`\n=== ${steps.length - failed.length}/${steps.length} passed ===`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
