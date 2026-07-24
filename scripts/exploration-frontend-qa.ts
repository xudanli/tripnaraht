/**
 * Exploration 前端联调 QA — 对照 handoff checklist
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api npx tsx scripts/exploration-frontend-qa.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL ?? 'exploration-e2e@tripnara.dev';
const prisma = new PrismaClient();

type Step = { name: string; pass: boolean; detail: string };
const steps: Step[] = [];
let token = process.env.AUTH_TOKEN?.trim() ?? '';

function record(name: string, pass: boolean, detail: string) {
  steps.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

async function api<T>(method: string, path: string, body?: unknown, expectStatus?: number) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { success?: boolean; data?: T; error?: { code?: string; message?: string } };
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(`${method} ${path} expected ${expectStatus} got ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return { status: res.status, json, data: json.data as T };
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
    body: JSON.stringify({ email: EMAIL, code, displayName: 'Frontend QA' }),
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

async function main() {
  console.log(`Frontend QA — ${BASE}\n`);
  await login();

  // 1. Create + principles
  const created = await api<{ scenarioId: string }>('POST', '/exploration/scenarios', {
    destinationCodes: ['IS'],
    dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
    travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
    mobilityContext: { vehicleType: '4WD_SUV' },
  });
  const scenarioId = created.data!.scenarioId;

  await api('PUT', `/exploration/scenarios/${scenarioId}/principles`, {
    principles: [
      { principleId: 'LOW_DRIVING', rank: 1 },
      { principleId: 'REMOTE_EXPLORATION', rank: 2 },
      { principleId: 'CORE_EXPERIENCE_FIRST', rank: 3 },
    ],
  });

  // 2. Generate v1
  const gen1 = await api<{
    generationVersion: number;
    generationMode?: string;
    dimensions?: Array<{ key: string }>;
    candidates: Array<{ generationSource?: string; preview?: { map?: { mainLine?: unknown[] } } }>;
  }>('POST', `/exploration/scenarios/${scenarioId}/candidates`, {});

  record(
    'dimensions-api',
    (gen1.data?.dimensions?.length ?? 0) === 6,
    `dimensions=${gen1.data?.dimensions?.length ?? 0} keys=${gen1.data?.dimensions?.map((d) => d.key).join(',')}`,
  );
  record(
    'generation-mode',
    Boolean(gen1.data?.generationMode),
    `mode=${gen1.data?.generationMode} v=${gen1.data?.generationVersion}`,
  );

  const linePts = gen1.data?.candidates?.[0]?.preview?.map?.mainLine?.length ?? 0;
  record(
    'engine-polyline',
    gen1.data?.generationMode === 'ENGINE' ? linePts > 100 : linePts > 0,
    `mainLine points=${linePts}`,
  );

  // 3. STALE → regenerate v2
  await api('PUT', `/exploration/scenarios/${scenarioId}/principles`, {
    principles: [
      { principleId: 'CORE_EXPERIENCE_FIRST', rank: 1 },
      { principleId: 'LOW_DRIVING', rank: 2 },
      { principleId: 'REMOTE_EXPLORATION', rank: 3 },
    ],
  });
  const detail = await api<{ candidatesStatus?: { status: string } }>('GET', `/exploration/scenarios/${scenarioId}`);
  record('stale-after-principles', detail.data?.candidatesStatus?.status === 'STALE', `status=${detail.data?.candidatesStatus?.status}`);

  const regen = await api<{ generationVersion: number; previousStatus: string; candidates: unknown[] }>(
    'POST',
    `/exploration/scenarios/${scenarioId}/candidates/regenerate`,
    {},
  );
  record(
    'regenerate-v2',
    (regen.data?.generationVersion ?? 0) >= 2 && (regen.data?.candidates?.length ?? 0) === 3,
    `v=${regen.data?.generationVersion} prev=${regen.data?.previousStatus}`,
  );

  // 4. PATCH vehicle (materialized, no selection yet)
  const patch = await api<{ tripSynced?: boolean; candidatesStatus?: { status: string } }>(
    'PATCH',
    `/exploration/scenarios/${scenarioId}/conditions`,
    { mobilityContext: { vehicleType: '2WD_COMPACT_SUV' } },
  );
  record(
    'patch-after-materialize',
    patch.data?.tripSynced === true && patch.data?.candidatesStatus?.status === 'STALE',
    `tripSynced=${patch.data?.tripSynced} status=${patch.data?.candidatesStatus?.status}`,
  );

  // 5. Select route → 409 on regenerate
  const pick = gen1.data!.candidates[0] as { routeId: string };
  await api('POST', `/exploration/scenarios/${scenarioId}/selections`, {
    routeId: pick.routeId,
    selectionReason: 'frontend-qa',
  });

  try {
    await api('POST', `/exploration/scenarios/${scenarioId}/candidates/regenerate`, {}, 409);
    record('409-after-selection', true, 'regenerate blocked');
  } catch (e) {
    record('409-after-selection', false, e instanceof Error ? e.message : String(e));
  }

  try {
    await api(
      'PATCH',
      `/exploration/scenarios/${scenarioId}/conditions`,
      { mobilityContext: { vehicleType: '4WD_SUV' } },
      409,
    );
    record('409-patch-after-selection', true, 'conditions patch blocked');
  } catch (e) {
    record('409-patch-after-selection', false, e instanceof Error ? e.message : String(e));
  }

  const failed = steps.filter((s) => !s.pass);
  console.log(`\n=== ${steps.length - failed.length}/${steps.length} passed ===`);
  await prisma.$disconnect();
  if (failed.length > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
