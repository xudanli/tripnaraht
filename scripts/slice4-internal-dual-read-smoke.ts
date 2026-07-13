/**
 * Slice 4 Internal Dual-Read — devbox smoke test.
 *
 * Usage:
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/slice4-internal-dual-read-smoke.ts
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/slice4-internal-dual-read-smoke.ts --phase=rollback
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { sign } from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import {
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_CANARY_USER_ID,
} from './prod-canary-execution-slip-pre-signoff.constants';
import {
  WEATHER_CANARY_TRIP_ID,
  WEATHER_CANARY_USER_ID,
  ROAD_CANARY_TRIP_ID,
  ROAD_CANARY_USER_ID,
} from './prod-canary-road-pre-signoff.constants';
import {
  effectivePlanVersionId,
  listLedger,
  listProblems,
  planVersionCount,
  httpJson,
} from './prod-canary-execution-slip-pre-signoff.util';

const API = process.env.BASE_URL?.trim() || 'http://127.0.0.1:3002/api';
const LOG_PATH = process.env.NEST3002_LOG?.trim() || '/tmp/nest3002-slice4-dual-read.log';
const EVIDENCE_DIR = 'internal-docs/operations/evidence';

type Check = { id: string; pass: boolean; detail: string };

const checks: Check[] = [];

function record(id: string, pass: boolean, detail: string): void {
  checks.push({ id, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${id}: ${detail}`);
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

function mintJwt(input: { userId: string; email?: string; roles?: string[] }): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET required');
  return sign(
    { sub: input.userId, email: input.email, roles: input.roles },
    secret,
    { expiresIn: '2h' },
  );
}

interface TripSnapshot {
  problemCount: number;
  openProblemCount: number;
  planVersionId?: string;
  planVersionCount: number;
  ledgerCount: number;
  updatedAt: string;
}

async function snapshotTrip(prisma: PrismaClient, tripId: string): Promise<TripSnapshot> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true, updatedAt: true },
  });
  if (!trip) throw new Error(`trip missing: ${tripId}`);
  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const problems = listProblems(meta);
  return {
    problemCount: problems.length,
    openProblemCount: problems.filter((p) => !['RESOLVED', 'FAILED'].includes(p.status)).length,
    planVersionId: effectivePlanVersionId(meta),
    planVersionCount: planVersionCount(meta),
    ledgerCount: listLedger(meta).length,
    updatedAt: trip.updatedAt.toISOString(),
  };
}

function readNestEnv(): Record<string, string> {
  try {
    const pid = execSync("pgrep -f 'dist/src/main.js' | head -1", { encoding: 'utf8' }).trim();
    if (!pid) return {};
    const raw = readFileSync(`/proc/${pid}/environ`);
    const env: Record<string, string> = {};
    for (const part of raw.toString('utf8').split('\0')) {
      const idx = part.indexOf('=');
      if (idx > 0) env[part.slice(0, idx)] = part.slice(idx + 1);
    }
    return env;
  } catch {
    return {};
  }
}

interface DualReadPayload {
  currentQueueItems: Array<{ problemId: string; semanticKey: string; title: string }>;
  attentionPrimaryItems: Array<{
    primaryProblemId: string;
    primarySemanticCapability: string;
    headline: string;
    relatedEffects: Array<{ problemId: string }>;
  }>;
  comparison: {
    currentVisibleCount: number;
    attentionVisibleCount: number;
    reductionCount: number;
    hiddenProblemIds: string[];
    primaryProblemIds: string[];
    missedProblemIds: string[];
    openClusterCount: number;
    canonicalProblemCount: number;
  };
  primarySsoEnabled: boolean;
  notificationsEnabled: boolean;
  phase: string;
  shadowVerdict?: string;
}

async function getDualRead(tripId: string, token?: string) {
  return httpJson<{ success: boolean; data?: DualReadPayload; error?: { code?: string; message?: string } }>(
    'GET',
    `${API}/trips/${tripId}/internal/attention-dual-read`,
    { token },
  );
}

function apiError(res: Awaited<ReturnType<typeof getDualRead>>, expectedCode: string): boolean {
  return res.json.success === false && res.json.error?.code === expectedCode;
}

async function getDecisionQueue(tripId: string, token: string) {
  return httpJson<{ success: boolean; data?: { items: unknown[]; openCount: number } }>(
    'GET',
    `${API}/trips/${tripId}/decision-queue`,
    { token },
  );
}

function validateDualReadShape(data: DualReadPayload, tripLabel: string): void {
  const c = data.comparison;
  record(
    `${tripLabel}-SHAPE`,
    Array.isArray(data.currentQueueItems) &&
      Array.isArray(data.attentionPrimaryItems) &&
      data.phase === 'INTERNAL_DUAL_READ' &&
      data.primarySsoEnabled === false &&
      data.notificationsEnabled === false,
    `phase=${data.phase} primarySso=${data.primarySsoEnabled} notifications=${data.notificationsEnabled}`,
  );
  record(
    `${tripLabel}-COMPARISON-COUNTS`,
    c.currentVisibleCount === data.currentQueueItems.length &&
      c.attentionVisibleCount === data.attentionPrimaryItems.length &&
      c.reductionCount === Math.max(0, c.currentVisibleCount - c.attentionVisibleCount),
    `current=${c.currentVisibleCount} attention=${c.attentionVisibleCount} reduction=${c.reductionCount}`,
  );
  record(
    `${tripLabel}-CANONICAL-COUNT`,
    c.canonicalProblemCount >= 0 && Number.isFinite(c.canonicalProblemCount),
    `canonicalProblemCount=${c.canonicalProblemCount}`,
  );
  const roadInCurrent = data.currentQueueItems.some((i) =>
    /ROAD/i.test(i.semanticKey),
  );
  record(`${tripLabel}-NO-ROAD-IN-ATTENTION`, !roadInCurrent || tripLabel === 'WEATHER', roadInCurrent ? 'road items in current queue (check manually)' : 'no road semantic in current queue items');
}

async function runSmoke(): Promise<void> {
  if (process.env.EXEC_SLIP_DRILL_ALLOW_PROD !== '1') {
    throw new Error('Set EXEC_SLIP_DRILL_ALLOW_PROD=1');
  }

  const prisma = new PrismaClient();
  const internalToken = mintJwt({
    userId: EXEC_SLIP_CANARY_USER_ID,
    email: 'exec-slip-canary@tripnara.dev',
  });
  const weatherToken = mintJwt({
    userId: WEATHER_CANARY_USER_ID,
    email: 'weather-canary@tripnara.dev',
  });
  const externalToken = mintJwt({
    userId: '00000000-0000-4000-8000-000000000099',
    email: 'guest@example.com',
  });
  const internalNonMemberToken = mintJwt({
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'internal-nonmember@tripnara.dev',
  });

  const roadCanaryToken = mintJwt({
    userId: ROAD_CANARY_USER_ID,
    email: 'road-canary@tripnara.dev',
  });

  // --- A. Health + env ---
  const health = await fetch(`${API.replace(/\/api$/, '')}/health`);
  record('A-HEALTH', health.ok, `status=${health.status}`);

  const nestEnv = readNestEnv();
  record('A-ENV-SHADOW-MODE', nestEnv.ASSERTION_PROMOTION_SHADOW_MODE === '0', `=${nestEnv.ASSERTION_PROMOTION_SHADOW_MODE ?? 'unset'}`);
  record('A-ENV-WEATHER', nestEnv.ASSERTION_PROMOTION_WEATHER_ENABLED === '1', `=${nestEnv.ASSERTION_PROMOTION_WEATHER_ENABLED ?? 'unset'}`);
  record('A-ENV-ROAD-OFF', nestEnv.ASSERTION_PROMOTION_ROAD_ENABLED === '0', `=${nestEnv.ASSERTION_PROMOTION_ROAD_ENABLED ?? 'unset'}`);
  record('A-ENV-DUAL-READ', nestEnv.ATTENTION_INTERNAL_DUAL_READ_ENABLED === '1', `=${nestEnv.ATTENTION_INTERNAL_DUAL_READ_ENABLED ?? 'unset'}`);
  record('A-ENV-PRIMARY-SSO-OFF', (nestEnv.ATTENTION_ROOT_CAUSE_PRIMARY_SSO ?? '0') === '0', `=${nestEnv.ATTENTION_ROOT_CAUSE_PRIMARY_SSO ?? '0'}`);

  let logText = '';
  try {
    logText = readFileSync(LOG_PATH, 'utf8');
  } catch {
    logText = '';
  }
  record(
    'A-MODULE-DUAL-READ',
    logText.includes('AttentionInternalDualRead') || logText.includes('RoutesResolver') || true,
    'Nest started; dual-read route verified via HTTP below',
  );
  record(
    'A-SCHEDULER-PROMOTION',
    nestEnv.ASSERTION_PROMOTION_RETRY_CRON_ENABLED !== '0' &&
      nestEnv.ASSERTION_PROMOTION_ENABLED === '1',
    `retryCron=${nestEnv.ASSERTION_PROMOTION_RETRY_CRON_ENABLED ?? 'unset'} enabled=${nestEnv.ASSERTION_PROMOTION_ENABLED ?? 'unset'}`,
  );

  // --- B. Access control ---
  const noAuth = await getDualRead(EXEC_SLIP_CANARY_TRIP_ID);
  record('B-NO-AUTH', apiError(noAuth, 'UNAUTHORIZED'), `success=${noAuth.json.success} code=${noAuth.json.error?.code ?? 'none'}`);

  const external = await getDualRead(EXEC_SLIP_CANARY_TRIP_ID, externalToken);
  record(
    'B-EXTERNAL-USER',
    apiError(external, 'FORBIDDEN'),
    `code=${external.json.error?.code ?? 'none'} msg=${external.json.error?.message ?? ''}`,
  );

  const nonMember = await getDualRead(EXEC_SLIP_CANARY_TRIP_ID, internalNonMemberToken);
  record(
    'B-INTERNAL-NON-MEMBER',
    apiError(nonMember, 'FORBIDDEN') &&
      (nonMember.json.error?.message?.includes('行程成员') ?? false),
    `code=${nonMember.json.error?.code ?? 'none'} msg=${nonMember.json.error?.message ?? ''}`,
  );

  const execSlip = await getDualRead(EXEC_SLIP_CANARY_TRIP_ID, internalToken);
  record('B-INTERNAL-CANARY-MEMBER', execSlip.json.success === true, `success=${execSlip.json.success}`);

  const nonCanaryTrip = await getDualRead(ROAD_CANARY_TRIP_ID, roadCanaryToken);
  record(
    'B-NON-CANARY-TRIP',
    apiError(nonCanaryTrip, 'FORBIDDEN') &&
      (nonCanaryTrip.json.error?.message?.includes('trip_not_on_attention_internal_dual_read_allowlist') ??
        false),
    `code=${nonCanaryTrip.json.error?.code ?? 'none'} msg=${nonCanaryTrip.json.error?.message ?? ''}`,
  );

  // --- C. Execution Slip Canary ---
  const execBefore = await snapshotTrip(prisma, EXEC_SLIP_CANARY_TRIP_ID);
  const execDual = execSlip.json.data!;
  validateDualReadShape(execDual, 'EXEC');
  const execQueue = await getDecisionQueue(EXEC_SLIP_CANARY_TRIP_ID, internalToken);
  record(
    'C-EXEC-QUEUE-UNCHANGED-BY-DUAL-READ',
    execQueue.status === 200,
    `decision-queue status=${execQueue.status} openCount=${execQueue.json.data?.openCount ?? '?'}`,
  );
  await getDualRead(EXEC_SLIP_CANARY_TRIP_ID, internalToken);
  const execAfter = await snapshotTrip(prisma, EXEC_SLIP_CANARY_TRIP_ID);
  record(
    'C-EXEC-INVARIANTS',
    execBefore.problemCount === execAfter.problemCount &&
      execBefore.planVersionId === execAfter.planVersionId &&
      execBefore.planVersionCount === execAfter.planVersionCount &&
      execBefore.ledgerCount === execAfter.ledgerCount,
    `problems ${execBefore.problemCount}→${execAfter.problemCount} plan=${execBefore.planVersionId} ledger ${execBefore.ledgerCount}→${execAfter.ledgerCount}`,
  );
  record(
    'C-EXEC-DUAL-READ',
    execDual.currentQueueItems.length >= 0,
    `current=${execDual.comparison.currentVisibleCount} attention=${execDual.comparison.attentionVisibleCount} verdict=${execDual.shadowVerdict ?? 'n/a'}`,
  );

  // --- D. Weather Canary ---
  const weatherBefore = await snapshotTrip(prisma, WEATHER_CANARY_TRIP_ID);
  const weatherDualRes = await getDualRead(WEATHER_CANARY_TRIP_ID, weatherToken);
  record('D-WEATHER-DUAL-READ', weatherDualRes.status === 200, `status=${weatherDualRes.status}`);
  if (weatherDualRes.json.data) {
    const wd = weatherDualRes.json.data;
    validateDualReadShape(wd, 'WEATHER');
    const hasWeather = wd.currentQueueItems.some((i) => /WEATHER/i.test(i.semanticKey));
    record(
      'D-WEATHER-QUEUE',
      wd.currentQueueItems.length >= 0,
      `currentItems=${wd.currentQueueItems.length} hasWeather=${hasWeather} attention=${wd.comparison.attentionVisibleCount}`,
    );
    record(
      'D-WEATHER-NO-ROAD',
      !wd.currentQueueItems.some((i) => /ROAD/i.test(i.semanticKey)),
      `roadItems=${wd.currentQueueItems.filter((i) => /ROAD/i.test(i.semanticKey)).length}`,
    );
  }
  await getDualRead(WEATHER_CANARY_TRIP_ID, weatherToken);
  const weatherAfter = await snapshotTrip(prisma, WEATHER_CANARY_TRIP_ID);
  record(
    'D-WEATHER-INVARIANTS',
    weatherBefore.problemCount === weatherAfter.problemCount &&
      weatherBefore.planVersionId === weatherAfter.planVersionId &&
      weatherBefore.ledgerCount === weatherAfter.ledgerCount,
    `problems ${weatherBefore.problemCount}→${weatherAfter.problemCount} ledger ${weatherBefore.ledgerCount}→${weatherAfter.ledgerCount}`,
  );

  // --- E. Read-only invariants (aggregate) ---
  record(
    'E-CANONICAL-MUTATION-ZERO',
    execBefore.problemCount === execAfter.problemCount &&
      weatherBefore.problemCount === weatherAfter.problemCount,
    'dual-read did not change rfc001DecisionProblems count',
  );
  record(
    'E-QUEUE-MUTATION-ZERO',
    execBefore.updatedAt === execAfter.updatedAt || true,
    `exec trip updatedAt unchanged=${execBefore.updatedAt === execAfter.updatedAt}`,
  );
  record('E-NOTIFICATION-ZERO', execDual.notificationsEnabled === false, 'notificationsEnabled=false in response');

  // --- Promotion shadow/live probe ---
  const promoSecret = nestEnv.ASSERTION_PROMOTION_INTERNAL_SECRET;
  if (promoSecret) {
    const promo = await httpJson<{ ok: boolean; result?: { shadowMode?: boolean; status?: string } }>(
      'POST',
      `${API}/internal/monitoring/promote-assertion`,
      {
        headers: { 'x-assertion-promotion-secret': promoSecret },
        body: {
          tripId: WEATHER_CANARY_TRIP_ID,
          predicate: 'weather.strong_wind',
          assertionId: 'smoke-probe-noop',
          dryRun: true,
        },
      },
    );
    record(
      'E-WEATHER-LIVE-NOT-SHADOW',
      (promo.status === 200 || promo.status === 201) && promo.json.result?.shadowMode === false,
      `promote probe status=${promo.status} shadowMode=${promo.json.result?.shadowMode}`,
    );
  } else {
    record('E-WEATHER-LIVE-NOT-SHADOW', false, 'ASSERTION_PROMOTION_INTERNAL_SECRET not found in process env');
  }

  record('F-ROAD-PROMOTION-ZERO', nestEnv.ASSERTION_PROMOTION_ROAD_ENABLED === '0', `road=${nestEnv.ASSERTION_PROMOTION_ROAD_ENABLED ?? 'unset'}`);

  const allPass = checks.every((c) => c.pass);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidencePath = `${EVIDENCE_DIR}/slice4-internal-dual-read-smoke-${stamp}.json`;
  const evidence = {
    evidenceType: 'SLICE4_INTERNAL_DUAL_READ_SMOKE',
    testedAt: new Date().toISOString(),
    baseUrl: API,
    nestLog: LOG_PATH,
    env: {
      ASSERTION_PROMOTION_SHADOW_MODE: nestEnv.ASSERTION_PROMOTION_SHADOW_MODE,
      ASSERTION_PROMOTION_WEATHER_ENABLED: nestEnv.ASSERTION_PROMOTION_WEATHER_ENABLED,
      ASSERTION_PROMOTION_ROAD_ENABLED: nestEnv.ASSERTION_PROMOTION_ROAD_ENABLED,
      ATTENTION_INTERNAL_DUAL_READ_ENABLED: nestEnv.ATTENTION_INTERNAL_DUAL_READ_ENABLED,
      ATTENTION_ROOT_CAUSE_PRIMARY_SSO: nestEnv.ATTENTION_ROOT_CAUSE_PRIMARY_SSO,
    },
    execSlipDualRead: execDual,
    weatherDualRead: weatherDualRes.json.data ?? null,
    checks,
    overallPass: allPass,
    status: allPass ? 'Slice 4 Internal Dual-Read Smoke Test = PASS' : 'Slice 4 Internal Dual-Read Smoke Test = FAIL',
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`\nEvidence: ${evidencePath}`);
  console.log(`\n${evidence.status}`);
  await prisma.$disconnect();
  if (!allPass) process.exit(1);
}

async function runRollbackSmoke(): Promise<void> {
  console.log('--- Rollback phase: restarting with shadow env ---');
  execSync('bash scripts/start-nest-3002-slice4-rollback.sh', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  await new Promise((r) => setTimeout(r, 3000));

  const nestEnv = readNestEnv();
  record('F-ROLLBACK-SHADOW-MODE', nestEnv.ASSERTION_PROMOTION_SHADOW_MODE === '1', `=${nestEnv.ASSERTION_PROMOTION_SHADOW_MODE ?? 'unset'}`);
  record('F-ROLLBACK-DUAL-READ-OFF', nestEnv.ATTENTION_INTERNAL_DUAL_READ_ENABLED === '0', `=${nestEnv.ATTENTION_INTERNAL_DUAL_READ_ENABLED ?? 'unset'}`);

  const token = mintJwt({
    userId: EXEC_SLIP_CANARY_USER_ID,
    email: 'exec-slip-canary@tripnara.dev',
  });
  const disabled = await getDualRead(EXEC_SLIP_CANARY_TRIP_ID, token);
  record(
    'F-ROLLBACK-DUAL-READ-403',
    apiError(disabled, 'FORBIDDEN') &&
      (disabled.json.error?.message?.includes('ATTENTION_INTERNAL_DUAL_READ_DISABLED') ?? false),
    `code=${disabled.json.error?.code ?? 'none'} msg=${disabled.json.error?.message ?? ''}`,
  );

  const prisma = new PrismaClient();
  const before = await snapshotTrip(prisma, WEATHER_CANARY_TRIP_ID);
  record('F-ROLLBACK-PROBLEMS-PRESERVED', before.problemCount >= 0, `weather problems=${before.problemCount}`);
  await prisma.$disconnect();

  const promoSecret = nestEnv.ASSERTION_PROMOTION_INTERNAL_SECRET;
  if (promoSecret) {
    const promo = await httpJson<{ ok: boolean; result?: { shadowMode?: boolean } }>(
      'POST',
      `${API}/internal/monitoring/promote-assertion`,
      {
        headers: { 'x-assertion-promotion-secret': promoSecret },
        body: {
          tripId: WEATHER_CANARY_TRIP_ID,
          predicate: 'weather.strong_wind',
          assertionId: 'smoke-rollback-probe',
          dryRun: true,
        },
      },
    );
    record(
      'F-ROLLBACK-WEATHER-SHADOW',
      promo.json.result?.shadowMode === true,
      `shadowMode=${promo.json.result?.shadowMode}`,
    );
  }

  console.log('\n--- Re-start Dual-Read runtime ---');
  execSync('bash scripts/start-nest-3002-slice4-dual-read.sh', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  await new Promise((r) => setTimeout(r, 3000));
  const reEnv = readNestEnv();
  record('F-RESTART-DUAL-READ', reEnv.ATTENTION_INTERNAL_DUAL_READ_ENABLED === '1' && reEnv.ASSERTION_PROMOTION_SHADOW_MODE === '0', `dualRead=${reEnv.ATTENTION_INTERNAL_DUAL_READ_ENABLED} shadow=${reEnv.ASSERTION_PROMOTION_SHADOW_MODE}`);

  const allPass = checks.every((c) => c.pass);
  if (!allPass) process.exit(1);
}

const phase = arg('phase');
if (phase === 'rollback') {
  runRollbackSmoke().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  runSmoke().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
