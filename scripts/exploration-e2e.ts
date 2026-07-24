/**
 * Exploration Consumer Pipeline — 端到端 API smoke（§11 黄金路径）
 *
 * Usage:
 *   npx tsx scripts/exploration-e2e.ts
 *   BASE_URL=http://localhost:3000/api npx tsx scripts/exploration-e2e.ts
 *   AUTH_TOKEN=<jwt> npx tsx scripts/exploration-e2e.ts   # 跳过登录
 *
 * Auth: 默认用 exploration-e2e@tripnara.dev + 验证码 888888（非 production）
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const E2E_EMAIL = process.env.E2E_EMAIL ?? 'exploration-e2e@tripnara.dev';
const prisma = new PrismaClient();

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
  statusCode?: number;
  message?: string | string[];
};

interface CheckResult {
  step: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];
let token = process.env.AUTH_TOKEN?.trim() ?? '';

function log(step: string, pass: boolean, detail: string) {
  results.push({ step, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${step}: ${detail}`);
}

function skip(step: string, detail: string) {
  results.push({ step, pass: true, detail });
  console.log(`[SKIP] ${step}: ${detail}`);
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  expectStatus?: number,
): Promise<{ status: number; json: ApiResponse<T> & Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json: ApiResponse<T> & Record<string, unknown> = {};
  try {
    json = (await res.json()) as ApiResponse<T> & Record<string, unknown>;
  } catch {
    json = { message: await res.text() };
  }

  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(
      `${method} ${path} expected ${expectStatus} got ${res.status}: ${JSON.stringify(json).slice(0, 400)}`,
    );
  }

  return { status: res.status, json };
}

async function ensureAuth(): Promise<void> {
  if (token) {
    log('AUTH', true, 'using AUTH_TOKEN from env');
    return;
  }

  // 请求验证码（dev 固定 888888 或 DB 记录）
  try {
    await fetch(`${BASE}/auth/email/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: E2E_EMAIL }),
    });
  } catch {
    /* 用户可能已存在，send-code 可选 */
  }

  let code = '888888';
  if (process.env.NODE_ENV === 'production') {
    const row = await prisma.emailVerificationCode.findFirst({
      where: { email: E2E_EMAIL, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new Error('No verification code; set AUTH_TOKEN');
    code = row.code;
  }

  // 尝试注册
  const reg = await fetch(`${BASE}/auth/email/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, code, displayName: 'Exploration E2E' }),
  });
  if (!reg.ok && reg.status !== 400) {
    const t = await reg.text();
    console.warn(`register skipped (${reg.status}): ${t.slice(0, 120)}`);
  }

  const loginRes = await fetch(`${BASE}/auth/email/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, code }),
  });
  const loginJson = (await loginRes.json()) as { accessToken?: string; message?: string };
  if (!loginRes.ok || !loginJson.accessToken) {
    throw new Error(`Login failed: ${JSON.stringify(loginJson)}`);
  }
  token = loginJson.accessToken;
  log('AUTH', true, `logged in as ${E2E_EMAIL}`);
}

async function pollCheckJob(jobId: string, timeoutMs = 90_000): Promise<{
  job: { status: string; error?: string };
  issues?: { totalIssueCount: number; displayedIssues: Array<{ issueId: string }> };
}> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { json } = await api<{
      job: { status: string; error?: string };
      issues?: { totalIssueCount: number; displayedIssues: Array<{ issueId: string }> };
    }>('GET', `/exploration/check-jobs/${jobId}`);
    const data = json.data ?? json;
    const job = (data as { job: { status: string; error?: string } }).job;
    if (job?.status === 'COMPLETED' || job?.status === 'FAILED') {
      return data as {
        job: { status: string; error?: string };
        issues?: { totalIssueCount: number; displayedIssues: Array<{ issueId: string }> };
      };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Check job ${jobId} timed out`);
}

async function main() {
  console.log(`Exploration E2E — base=${BASE}\n`);

  // 0. 探测 exploration 路由
  const probe = await fetch(`${BASE}/exploration/principles/catalog`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (probe.status === 404) {
    log('PROBE', false, 'GET /exploration/principles/catalog → 404（服务未加载 ExplorationModule，请 npm run build && 重启）');
    printSummary();
    process.exit(1);
  }

  await ensureAuth();

  let scenarioId = '';
  let sessionId = '';
  let problemId = '';

  // 1. 创建 Scenario
  try {
    const { status, json } = await api<{
      scenarioId: string;
      sessionId: string;
      assignedVariant: string | null;
      lockedFields?: string[];
      scenario?: { mobilityContext?: { vehicleType?: string } };
    }>('POST', '/exploration/scenarios', {
      researchProtocolId: process.env.E2E_RESEARCH_MODE === '1' ? 'iceland-discovery-v1' : undefined,
      destinationCodes: ['IS'],
      dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
      travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
      budget: { currency: 'USD', min: 3000, max: 4000 },
      mobilityContext: {
        vehicleType: process.env.E2E_RESEARCH_MODE === '1' ? '2WD_COMPACT_SUV' : '4WD_SUV',
      },
    });
    const data = json.data ?? (json as unknown as typeof json.data);
    if (!data?.scenarioId) {
      throw new Error(`unexpected response: ${JSON.stringify(json).slice(0, 300)}`);
    }
    scenarioId = data.scenarioId;
    sessionId = data.sessionId;
    log(
      '1-scenarios',
      (status === 200 || status === 201) && !!scenarioId,
      `scenarioId=${scenarioId} locked=${JSON.stringify(data?.lockedFields ?? [])} vehicle=${data?.scenario?.mobilityContext?.vehicleType}`,
    );
  } catch (e) {
    log('1-scenarios', false, e instanceof Error ? e.message : String(e));
    printSummary();
    process.exit(1);
  }

  // 2. Principles catalog + save
  try {
    const cat = await api<Array<{ principleId: string }>>('GET', '/exploration/principles/catalog');
    const principles = (cat.json.data ?? []).slice(0, 3).map((p, i) => ({
      principleId: p.principleId,
      rank: i + 1,
    }));
    await api('PUT', `/exploration/scenarios/${scenarioId}/principles`, { principles });
    log('2-principles', principles.length === 3, `saved ${principles.map((p) => p.principleId).join(', ')}`);
  } catch (e) {
    log('2-principles', false, e instanceof Error ? e.message : String(e));
  }

  // 2b. Post-materialize conditions patch (vehicle change → invalidate)
  try {
    const patchRes = await api<{
      tripSynced?: boolean;
      candidatesInvalidated?: number;
      candidatesStatus?: { status: string };
    }>('PATCH', `/exploration/scenarios/${scenarioId}/conditions`, {
      mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
    });
    log(
      '2b-patch-conditions',
      patchRes.json.data?.tripSynced === true &&
        (patchRes.json.data?.candidatesStatus?.status === 'STALE' ||
          (patchRes.json.data?.candidatesInvalidated ?? 0) === 0),
      `tripSynced=${patchRes.json.data?.tripSynced} invalidated=${patchRes.json.data?.candidatesInvalidated} status=${patchRes.json.data?.candidatesStatus?.status}`,
    );
  } catch (e) {
    log('2b-patch-conditions', false, e instanceof Error ? e.message : String(e));
  }

  // 3. Candidates
  let routeId = 'route_remote-highlands-south';
  try {
    const { json } = await api<{
      candidates: Array<{ routeId: string; generationSource?: string }>;
      generationVersion: number;
      generationMode?: string;
    }>('POST', `/exploration/scenarios/${scenarioId}/candidates`, {});
    const candidates = json.data?.candidates ?? [];
    const highlands = candidates.find((c) => c.routeId.includes('highlands'));
    if (highlands) routeId = highlands.routeId;
    log(
      '3-candidates',
      candidates.length >= 3,
      `${candidates.length} candidates v${json.data?.generationVersion} mode=${json.data?.generationMode ?? '?'} pick ${routeId}`,
    );

    if (process.env.EXPLORATION_AI_ROUTE_GENERATION === '1') {
      const aiSources = new Set(['PERSONALIZED', 'ENGINE_MAPBOX', 'LLM']);
      const aiReady = candidates.filter(
        (c) =>
          aiSources.has(c.generationSource ?? '') ||
          c.narrative?.includes('个性化') ||
          (json.data?.generationMode === 'ENGINE' && (c.preview?.map?.mainLine?.length ?? 0) > 20),
      );
      log(
        '3-candidates-ai',
        aiReady.length >= 3,
        `${aiReady.length}/${candidates.length} AI-ready source=${candidates.map((c) => c.generationSource).join(',')} mode=${json.data?.generationMode}`,
      );
    }
  } catch (e) {
    log('3-candidates', false, e instanceof Error ? e.message : String(e));
  }

  // 3b. Principles change → stale → regenerate
  try {
    const cat = await api<Array<{ principleId: string }>>('GET', '/exploration/principles/catalog');
    const reversed = (cat.json.data ?? []).slice(0, 3).reverse().map((p, i) => ({
      principleId: p.principleId,
      rank: i + 1,
    }));
    const principlesRes = await api<{ candidatesInvalidated?: number; candidatesStatus?: { status: string } }>(
      'PUT',
      `/exploration/scenarios/${scenarioId}/principles`,
      { principles: reversed },
    );
    const invalidated = principlesRes.json.data?.candidatesInvalidated ?? 0;
    const staleStatus = principlesRes.json.data?.candidatesStatus?.status;

    const detail = await api<{ candidatesStatus?: { status: string } }>(
      'GET',
      `/exploration/scenarios/${scenarioId}`,
    );
    const detailStatus = detail.json.data?.candidatesStatus?.status;

    const regen = await api<{
      generationVersion: number;
      previousStatus: string;
      candidates: Array<{ routeId: string }>;
    }>('POST', `/exploration/scenarios/${scenarioId}/candidates/regenerate`, {});

    log(
      '3b-regenerate',
      invalidated >= 3 &&
        (staleStatus === 'STALE' || detailStatus === 'STALE') &&
        (regen.json.data?.generationVersion ?? 0) >= 2 &&
        (regen.json.data?.candidates?.length ?? 0) >= 3,
      `invalidated=${invalidated} stale=${staleStatus ?? detailStatus} regenV=${regen.json.data?.generationVersion} prev=${regen.json.data?.previousStatus}`,
    );
  } catch (e) {
    log('3b-regenerate', false, e instanceof Error ? e.message : String(e));
  }

  // 4. Selection
  try {
    await api('POST', `/exploration/scenarios/${scenarioId}/selections`, {
      routeId,
      selectionReason: 'e2e test — highlands',
      prioritizedGainIds: ['gain_remote'],
      acceptedSacrificeIds: ['sac_vehicle'],
    });
    log('4-selections', true, routeId);
  } catch (e) {
    log('4-selections', false, e instanceof Error ? e.message : String(e));
  }

  // 5. Check (async)
  try {
    const { status, json } = await api<{ jobId: string; status: string }>(
      'POST',
      `/exploration/scenarios/${scenarioId}/check`,
      { async: true },
      202,
    );
    const jobId = json.data?.jobId ?? (json as { jobId?: string }).jobId;
    if (!jobId) throw new Error('no jobId');
    log('5-check-start', status === 202, `jobId=${jobId}`);

    const polled = await pollCheckJob(jobId);
    const issueCount = polled.issues?.totalIssueCount ?? 0;
    problemId = polled.issues?.displayedIssues?.[0]?.issueId ?? '';
    log(
      '5-check-poll',
      polled.job.status === 'COMPLETED',
      `status=${polled.job.status} issues=${issueCount} first=${problemId || 'none'}`,
    );
  } catch (e) {
    log('5-check', false, e instanceof Error ? e.message : String(e));
  }

  // 6. Issues (direct)
  try {
    const { json } = await api<{ totalIssueCount: number }>('GET', `/exploration/scenarios/${scenarioId}/issues`);
    log('6-issues', true, `totalIssueCount=${json.data?.totalIssueCount ?? '?'}`);
  } catch (e) {
    log('6-issues', false, e instanceof Error ? e.message : String(e));
  }

  // 7. Repair options + submit + apply
  if (problemId) {
    try {
      const { json } = await api<{ options: Array<{ optionId: string }> }>(
        'GET',
        `/exploration/scenarios/${scenarioId}/issues/${problemId}/options`,
      );
      const options = json.data?.options ?? [];
      if (options.length === 0) throw new Error('no repair options');
      const optionId = options[0]!.optionId;
      await api('POST', `/exploration/scenarios/${scenarioId}/decisions/${problemId}/submit`, {
        optionId,
      });
      const applied = await api<{ originalProblem: { resolved: boolean }; issues: unknown }>(
        'POST',
        `/exploration/scenarios/${scenarioId}/decisions/${problemId}/apply`,
        {},
      );
      const resolved = applied.json.data?.originalProblem?.resolved;
      log('7-decision', true, `option=${optionId} resolved=${resolved}`);
    } catch (e) {
      log('7-decision', false, e instanceof Error ? e.message : String(e));
    }
  } else {
    skip('7-decision', 'no problemId from check');
  }

  // 8. Continue packages + feedback
  try {
    const { json } = await api<{ packages: unknown[]; presentationOrder: string[] }>(
      'GET',
      `/exploration/scenarios/${scenarioId}/continue/packages`,
    );
    const order = json.data?.presentationOrder ?? [];
    await api('POST', `/exploration/scenarios/${scenarioId}/continue/feedback`, {
      packageRankings: order.length ? order : ['expert_review', 'full_report', 'trip_assurance', 'auto_repair'],
      valueScores: { full_report: 5, expert_review: 4 },
      trustScores: { full_report: 4, expert_review: 5 },
      acceptablePriceUsd: { currency: 'USD', min: 29, max: 79 },
    });
    log('8-continue', true, `${json.data?.packages?.length ?? 0} packages`);
  } catch (e) {
    log('8-continue', false, e instanceof Error ? e.message : String(e));
  }

  // 9. Commitment
  if (sessionId) {
    try {
      await api('POST', `/research/sessions/${sessionId}/commitments`, {
        commitmentType: 'NOTIFY_ME',
        email: E2E_EMAIL,
      });
      log('9-commitment', true, 'NOTIFY_ME');
    } catch (e) {
      log('9-commitment', false, e instanceof Error ? e.message : String(e));
    }
  }

  // 10. Research events
  if (sessionId) {
    try {
      await api('POST', `/research/sessions/${sessionId}/events/batch`, {
        events: [
          {
            eventName: 'exploration_e2e_completed',
            payload: { sessionId, scenarioId, timestamp: new Date().toISOString() },
          },
        ],
      });
      log('10-events', true, 'batch ok');
    } catch (e) {
      log('10-events', false, e instanceof Error ? e.message : String(e));
    }
  }

  // 11. 4B payment（可选）
  if (process.env.RESEARCH_PAYMENT_COMMITMENT_ENABLED === '1' && sessionId) {
    try {
      await api('GET', '/research/payments/catalog');
      const dep = await api<{ clientSecret?: string }>(
        'POST',
        `/research/sessions/${sessionId}/payments/deposit/start`,
        {},
      );
      await api('POST', `/research/sessions/${sessionId}/payments/deposit/confirm`, {});
      log('11-payment', true, `deposit ${dep.json.data?.clientSecret ? 'started+confirmed' : 'sandbox'}`);
    } catch (e) {
      log('11-payment', false, e instanceof Error ? e.message : String(e));
    }
  } else {
    skip('11-payment', 'RESEARCH_PAYMENT_COMMITMENT_ENABLED not set');
  }

  printSummary();
  await prisma.$disconnect();
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed / ${results.length} steps ===`);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
