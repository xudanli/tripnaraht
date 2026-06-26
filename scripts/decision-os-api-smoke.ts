#!/usr/bin/env npx ts-node
/**
 * Decision OS 前端对接接口 smoke test
 *
 * 用法:
 *   API_BASE=http://localhost:3000 npx ts-node --transpile-only scripts/decision-os-api-smoke.ts
 *
 * 可选:
 *   GATE1_PROJECT_ID=...  PARTICIPANT_TOKEN=...  跳过 DB 探测
 *   RUN_SEED=1            无 Gate1 数据时先 seed
 */
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const BASE = (process.env.API_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api`;
const JWT_SECRET =
  process.env.JWT_SECRET ?? 'your-secret-key-change-in-production';
const ADVISOR_ID = process.env.GATE1_SEED_ADVISOR_ID ?? 'gate1-advisor-demo';
const OPS_ID = process.env.GATE1_SEED_OPS_ID ?? 'gate1-ops-demo';
const TEST_USER_ID =
  process.env.SMOKE_USER_ID ?? '00000000-0000-4000-8000-000000000001';

type Result = { name: string; method: string; path: string; ok: boolean; status: number; note?: string };

const results: Result[] = [];

function signToken(userId: string, roles?: string[]): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@smoke.local`, roles },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

async function req(
  name: string,
  method: string,
  urlPath: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }

  const ok = res.ok && json.success === true;
  results.push({
    name,
    method,
    path: urlPath,
    ok,
    status: res.status,
    note: ok ? undefined : String(json.error ?? res.statusText),
  });
  return { status: res.status, json };
}

async function resolveGate1Fixtures(prisma: PrismaClient): Promise<{
  projectId: string;
  participantToken: string | null;
}> {
  if (process.env.GATE1_PROJECT_ID) {
    return {
      projectId: process.env.GATE1_PROJECT_ID,
      participantToken: process.env.PARTICIPANT_TOKEN ?? null,
    };
  }

  const project = await prisma.gate1Project.findFirst({
    where: {
      candidateStrategies: { some: { status: 'PUBLISHED' } },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      participants: { take: 1, orderBy: { createdAt: 'asc' } },
    },
  });

  if (!project) {
    if (process.env.RUN_SEED === '1') {
      console.log('No Gate1 project found — running seed-gate1-mock-order.ts ...');
      execSync('npx tsx scripts/seed-gate1-mock-order.ts', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
      });
      return resolveGate1Fixtures(prisma);
    }
    throw new Error('No Gate1 project with published candidates. Set RUN_SEED=1 or GATE1_PROJECT_ID.');
  }

  const participantToken = project.participants[0]?.inviteToken ?? null;

  return { projectId: project.id, participantToken };
}

async function ensureUserProfile(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `smoke-${userId.slice(0, 8)}@tripnara.local`,
      displayName: 'Decision OS Smoke User',
    },
  });
  await prisma.userProfile.upsert({
    where: { userId },
    update: {},
    create: { userId, preferences: {}, updatedAt: new Date() },
  });
}

async function main(): Promise<void> {
  console.log(`\n🔬 Decision OS API smoke → ${API}\n`);

  const prisma = new PrismaClient();
  try {
    const advisorToken = signToken(ADVISOR_ID);
    const opsToken = signToken(OPS_ID, ['ADMIN']);
    const userToken = signToken(TEST_USER_ID);

    const { projectId, participantToken } = await resolveGate1Fixtures(prisma);
    console.log(`Project: ${projectId}`);
    console.log(`Participant token: ${participantToken ?? '(none)'}\n`);

    await ensureUserProfile(prisma, TEST_USER_ID);

    // ── Gate1 顾问（测序 ② → ③）──
    const overview = await req(
      '顾问 overview',
      'GET',
      `/advisor/projects/${projectId}/overview`,
      { token: advisorToken },
    );
    const trustPtr = (overview.json.data as Record<string, unknown> | undefined)?.trustSurface as
      | { cardCount?: number }
      | undefined;
    console.log(`  overview.trustSurface.cardCount = ${trustPtr?.cardCount ?? '?'}`);

    await req(
      '顾问 trust-surface',
      'GET',
      `/advisor/projects/${projectId}/trust-surface`,
      { token: advisorToken },
    );

    // ── Gate1 成员（测序 ① → ②）──
    if (participantToken) {
      const dash = await req(
        '成员 dashboard',
        'GET',
        `/participant/projects/${participantToken}/dashboard`,
      );
      const pTrust = (dash.json.data as Record<string, unknown> | undefined)?.trustSurface as
        | { cardCount?: number }
        | undefined;
      console.log(`  dashboard.trustSurface.cardCount = ${pTrust?.cardCount ?? '?'}`);

      await req(
        '成员 trust-surface',
        'GET',
        `/participant/projects/${participantToken}/trust-surface`,
      );
    } else {
      results.push({
        name: '成员 dashboard/trust-surface',
        method: 'SKIP',
        path: '/participant/projects/:token/*',
        ok: true,
        status: 0,
        note: 'no participant token',
      });
    }

    // ── C 端 consent（测序 GET → PUT → GET）──
    await req('consent GET', 'GET', '/users/me/decision-dna/consent', { token: userToken });
    await req('consent PUT (opt-in)', 'PUT', '/users/me/decision-dna/consent', {
      token: userToken,
      body: { implicit_learning: true },
    });
    await req('consent GET (after)', 'GET', '/users/me/decision-dna/consent', { token: userToken });
    await req('consent PUT (revoke)', 'PUT', '/users/me/decision-dna/consent', {
      token: userToken,
      body: { implicit_learning: false },
    });

    // ── Ops（并行 ①–⑤）──
    await req('Ops slo', 'GET', '/ops/runtime/slo', { token: opsToken });
    await req('Ops contingency recent', 'GET', '/ops/runtime/slo/contingency/recent?limit=5', {
      token: opsToken,
    });
    await req('Ops decision-dna recent', 'GET', '/ops/runtime/slo/decision-dna/recent?limit=5', {
      token: opsToken,
    });
    await req('Ops context-recall baseline', 'GET', '/ops/runtime/slo/context-recall/baseline', {
      token: opsToken,
    });
    await req('Ops memory-state recent', 'GET', '/ops/runtime/slo/memory-state/recent?limit=5', {
      token: opsToken,
    });
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│ 结果                                                         │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    if (r.ok) passed++;
    else failed++;
    const note = r.note ? ` — ${r.note}` : '';
    console.log(`${icon} [${r.status}] ${r.method} ${r.path}`);
    console.log(`       ${r.name}${note}`);
  }

  console.log(`\n合计: ${passed} passed, ${failed} failed / ${results.length}\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
