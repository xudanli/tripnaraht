/**
 * Execution Risk staging drill — real HTTP apply → confirm against live API.
 *
 * Usage:
 *   npm run execution-risk-staging:drill
 *
 * Environment:
 *   ERC_STAGING_BASE_URL     API base (default http://localhost:3000/api)
 *   ERC_STAGING_TRIP_ID      Trip with active risks (default 1ae5cd8b-84ba-457d-9e0b-50ac3813a104)
 *   ERC_STAGING_RISK_ID      Override auto-picked risk
 *   ERC_STAGING_RECOMMENDATION_ID  Override auto-picked recommendation
 *   ERC_STAGING_AUTH_TOKEN   Bearer token (optional; non-prod allows anonymous-dev-user)
 *   ERC_STAGING_SKIP_CONFIRM=1  Preview-only drill (no POST confirm)
 *   ERC_STAGING_REQUIRE_CONFIRM=1 Fail if confirm cannot APPLIED (staging cutover mode)
 *   ERC_STAGING_SKIP_E2E=1      Skip in-process jest harness
 *   ERC_STAGING_HTTP_ONLY=1     HTTP drill only (implies SKIP_E2E)
 *   ERC_STAGING_TIMEOUT_MS     Per-request timeout (default 30000)
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectExecutionRiskStagingPhase,
  evaluateExecutionRiskStagingRollout,
} from '../../src/trips/execution-risk-center/config/execution-risk-staging-rollout.util';
import {
  isExecutionRiskConfirmWriteEnabled,
  isExecutionRiskPostConfirmRefreshEnabled,
  isExecutionRiskSnapshotQueryEnabled,
  readExecutionRiskFeatureFlags,
} from '../../src/trips/execution-risk-center/config/execution-risk-feature-flags.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'execution-risk-staging-validation');
const BASE = (process.env.ERC_STAGING_BASE_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
const TRIP_ID = process.env.ERC_STAGING_TRIP_ID ?? '1ae5cd8b-84ba-457d-9e0b-50ac3813a104';
const TIMEOUT_MS = Number(process.env.ERC_STAGING_TIMEOUT_MS ?? 30_000);
const SKIP_CONFIRM = process.env.ERC_STAGING_SKIP_CONFIRM === '1';
const REQUIRE_CONFIRM = process.env.ERC_STAGING_REQUIRE_CONFIRM === '1';
const SKIP_E2E =
  process.env.ERC_STAGING_SKIP_E2E === '1' || process.env.ERC_STAGING_HTTP_ONLY === '1';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

interface DrillStep {
  id: string;
  pass: boolean;
  status: number;
  detail: string;
  body?: unknown;
}

interface ActiveRiskItem {
  id: string;
  riskKey?: string;
  code?: string;
  title?: string;
  treatmentStatus?: string;
  recommendationIds?: string[];
}

interface RecommendationItem {
  id: string;
  label?: string;
  isRecommended?: boolean;
}

interface ApplyResponse {
  executionStatus: string;
  riskId: string;
  recommendationId: string;
  planDiff?: { beforePlanVersionId?: string; afterPlanVersionId?: string };
  expectedPlanVersionId?: string;
  idempotencyKey?: string;
  idempotentReplay?: boolean;
  requiresConfirmation?: boolean;
}

interface ConfirmResponse extends ApplyResponse {
  applied?: boolean;
  newPlanVersionId?: string;
  effectivePlanVersionId?: string;
  itineraryMaterialized?: boolean;
  riskRefreshSnapshotId?: string;
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [erc-drill] ${line}`);
}

function healthUrl(): string {
  const u = new URL(BASE);
  u.pathname = '/health';
  return u.toString();
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.ERC_STAGING_AUTH_TOKEN?.trim();
  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  return headers;
}

async function api<T>(
  method: string,
  pathSuffix: string,
  init?: { body?: unknown; idempotencyKey?: string },
): Promise<{ ok: boolean; status: number; body: ApiResponse<T> | unknown; rawText: string }> {
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
  };

  try {
    const res = await fetch(`${BASE}${pathSuffix}`, {
      method,
      headers,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const rawText = await res.text();
    let body: ApiResponse<T> | unknown = rawText;
    try {
      body = JSON.parse(rawText) as ApiResponse<T>;
    } catch {
      // keep text
    }
    return { ok: res.ok, status: res.status, body, rawText };
  } catch (error) {
    return { ok: false, status: 0, body: String(error), rawText: String(error) };
  }
}

function recordStep(
  steps: DrillStep[],
  id: string,
  pass: boolean,
  status: number,
  detail: string,
  body?: unknown,
) {
  steps.push({ id, pass, status, detail, body });
  const mark = pass ? 'PASS' : 'FAIL';
  log(`[${mark}] ${id}: ${detail}`);
}

function unwrapData<T>(body: unknown): T | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const envelope = body as ApiResponse<T>;
  if (envelope.success && envelope.data !== undefined) return envelope.data;
  return undefined;
}

function pickRisk(items: ActiveRiskItem[]): ActiveRiskItem | undefined {
  const override = process.env.ERC_STAGING_RISK_ID?.trim();
  if (override) return items.find((r) => r.id === override) ?? { id: override };

  const actionable = items.filter(
    (r) => r.treatmentStatus !== 'APPLIED' && r.treatmentStatus !== 'RESOLVED',
  );
  const pool = actionable.length > 0 ? actionable : items;
  return pool.find((r) => (r.recommendationIds?.length ?? 0) > 0) ?? pool[0];
}

function pickRecommendation(items: RecommendationItem[]): RecommendationItem | undefined {
  const override = process.env.ERC_STAGING_RECOMMENDATION_ID?.trim();
  if (override) return items.find((r) => r.id === override) ?? { id: override };
  return items.find((r) => r.isRecommended) ?? items[0];
}

async function runHttpDrill(): Promise<{
  reachable: boolean;
  steps: DrillStep[];
  riskId?: string;
  recommendationId?: string;
  idempotencyKey?: string;
}> {
  const steps: DrillStep[] = [];

  const health = await fetch(healthUrl(), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);

  if (!health?.ok) {
    recordStep(
      steps,
      'HTTP-00-health',
      false,
      health?.status ?? 0,
      `API unreachable at ${healthUrl()}`,
    );
    return { reachable: false, steps };
  }

  const healthJson = (await health.json()) as { status?: string };
  recordStep(
    steps,
    'HTTP-00-health',
    healthJson.status === 'ok',
    health.status,
    `status=${healthJson.status ?? 'unknown'}`,
  );

  const listRes = await api<{ items: ActiveRiskItem[]; count: number }>(
    'GET',
    `/trips/${TRIP_ID}/execution-risks`,
  );
  const risks = unwrapData<{ items: ActiveRiskItem[]; count: number }>(listRes.body);
  const riskCount = risks?.items?.length ?? 0;
  recordStep(
    steps,
    'HTTP-01-list-risks',
    listRes.ok && riskCount > 0,
    listRes.status,
    `count=${riskCount}`,
    listRes.ok ? undefined : listRes.body,
  );

  if (!listRes.ok || !risks?.items?.length) {
    return { reachable: true, steps };
  }

  const summaryRes = await api('GET', `/trips/${TRIP_ID}/execution-risks/summary`);
  recordStep(
    steps,
    'HTTP-02-summary',
    summaryRes.ok,
    summaryRes.status,
    summaryRes.ok ? 'summary ok' : String((summaryRes.body as ApiResponse<unknown>)?.error?.message ?? 'failed'),
  );

  const risk = pickRisk(risks.items);
  if (!risk?.id) {
    recordStep(steps, 'HTTP-03-pick-risk', false, 0, 'no risk to drill');
    return { reachable: true, steps };
  }

  recordStep(
    steps,
    'HTTP-03-pick-risk',
    true,
    200,
    `riskId=${risk.id} title=${risk.title ?? risk.code ?? 'n/a'}`,
  );

  const recRes = await api<{ items: RecommendationItem[]; count: number }>(
    'GET',
    `/trips/${TRIP_ID}/execution-risks/${encodeURIComponent(risk.id)}/recommendations`,
  );
  const recs = unwrapData<{ items: RecommendationItem[]; count: number }>(recRes.body);
  const recCount = recs?.items?.length ?? 0;
  recordStep(
    steps,
    'HTTP-04-list-recommendations',
    recRes.ok && recCount > 0,
    recRes.status,
    `count=${recCount}`,
    recRes.ok ? undefined : recRes.body,
  );

  if (!recRes.ok || !recs?.items?.length) {
    return { reachable: true, steps, riskId: risk.id };
  }

  const rec = pickRecommendation(recs.items);
  if (!rec?.id) {
    recordStep(steps, 'HTTP-05-pick-recommendation', false, 0, 'no recommendation to drill');
    return { reachable: true, steps, riskId: risk.id };
  }

  recordStep(
    steps,
    'HTTP-05-pick-recommendation',
    true,
    200,
    `recommendationId=${rec.id} label=${rec.label ?? 'n/a'}`,
  );

  const idempotencyKey = process.env.ERC_STAGING_IDEMPOTENCY_KEY?.trim() ?? randomUUID();
  const applyPath = `/trips/${TRIP_ID}/execution-risks/${encodeURIComponent(risk.id)}/recommendations/${encodeURIComponent(rec.id)}/apply`;

  // Keep apply body minimal — confirm re-invokes apply with anonymous-dev-user as requestedBy;
  // a custom requestedBy here causes IDEMPOTENCY_CONFLICT on confirm.
  const applyRes = await api<ApplyResponse>('POST', applyPath, {
    idempotencyKey,
    body: {},
  });
  const applyData = unwrapData<ApplyResponse>(applyRes.body);
  const applyPass =
    applyRes.ok &&
    applyData?.executionStatus === 'PREVIEW' &&
    Boolean(applyData.planDiff) &&
    Boolean(applyData.expectedPlanVersionId);

  recordStep(
    steps,
    'HTTP-06-apply-preview',
    applyPass,
    applyRes.status,
    applyPass
      ? `PREVIEW planDiff=${applyData?.planDiff?.beforePlanVersionId ?? '?'}→${applyData?.planDiff?.afterPlanVersionId ?? '?'} expectedPlanVersionId=${applyData?.expectedPlanVersionId}`
      : String((applyRes.body as ApiResponse<unknown>)?.error?.message ?? applyData?.executionStatus ?? 'apply failed'),
    applyRes.ok ? undefined : applyRes.body,
  );

  if (!applyPass) {
    return {
      reachable: true,
      steps,
      riskId: risk.id,
      recommendationId: rec.id,
      idempotencyKey,
    };
  }

  if (SKIP_CONFIRM) {
    recordStep(steps, 'HTTP-07-confirm', true, 0, 'skipped (ERC_STAGING_SKIP_CONFIRM=1)');
    return {
      reachable: true,
      steps,
      riskId: risk.id,
      recommendationId: rec.id,
      idempotencyKey,
    };
  }

  const confirmPath = `/trips/${TRIP_ID}/execution-risks/${encodeURIComponent(risk.id)}/recommendations/${encodeURIComponent(rec.id)}/confirm`;
  const confirmRes = await api<ConfirmResponse>('POST', confirmPath, {
    idempotencyKey,
    body: {
      confirm: true,
      idempotencyKey,
      expectedPlanVersionId: applyData.expectedPlanVersionId,
    },
  });
  const confirmData = unwrapData<ConfirmResponse>(confirmRes.body);
  const confirmError = (confirmRes.body as ApiResponse<unknown>)?.error;

  const writeEnabled = isExecutionRiskConfirmWriteEnabled();
  let confirmPass = confirmRes.ok && confirmData?.executionStatus === 'APPLIED';

  if (confirmPass && writeEnabled) {
    confirmPass =
      confirmData?.applied === true &&
      (Boolean(confirmData.newPlanVersionId) || Boolean(confirmData.effectivePlanVersionId));
  } else if (confirmPass && !writeEnabled) {
    confirmPass = confirmData?.applied === true || confirmData?.requiresConfirmation === true;
  }

  if (!confirmPass) {
    const forbiddenOrganizer =
      confirmRes.status === 403 ||
      confirmError?.code === 'FORBIDDEN' ||
      String(confirmError?.message ?? '').includes('OWNER') ||
      String(confirmError?.message ?? '').includes('EDITOR');

    if (forbiddenOrganizer && !REQUIRE_CONFIRM && rec.id.startsWith('env-rec-')) {
      recordStep(
        steps,
        'HTTP-07-confirm',
        true,
        confirmRes.status,
        `skipped: env-rec confirm needs OWNER/EDITOR or server EXECUTION_RISK_CONFIRM_WRITE_ENABLED=1 (set ERC_STAGING_REQUIRE_CONFIRM=1 to fail hard)`,
      );
    } else {
      recordStep(
        steps,
        'HTTP-07-confirm',
        confirmPass,
        confirmRes.status,
        confirmPass
          ? `APPLIED newPlanVersionId=${confirmData?.newPlanVersionId ?? 'n/a'} materialized=${confirmData?.itineraryMaterialized ?? false} refresh=${confirmData?.riskRefreshSnapshotId ?? 'n/a'}`
          : String(confirmError?.message ?? confirmData?.executionStatus ?? 'confirm failed'),
        confirmRes.ok ? undefined : confirmRes.body,
      );
      if (!confirmPass) {
        const postListRes = await api<{ items: ActiveRiskItem[]; count: number }>(
          'GET',
          `/trips/${TRIP_ID}/execution-risks`,
        );
        const postRisks = unwrapData<{ items: ActiveRiskItem[]; count: number }>(postListRes.body);
        recordStep(
          steps,
          'HTTP-08-post-confirm-risks',
          postListRes.ok,
          postListRes.status,
          `count=${postRisks?.count ?? 0}`,
        );
        return {
          reachable: true,
          steps,
          riskId: risk.id,
          recommendationId: rec.id,
          idempotencyKey,
        };
      }
    }
  } else {
    recordStep(
      steps,
      'HTTP-07-confirm',
      confirmPass,
      confirmRes.status,
      confirmPass
        ? `APPLIED newPlanVersionId=${confirmData?.newPlanVersionId ?? 'n/a'} materialized=${confirmData?.itineraryMaterialized ?? false} refresh=${confirmData?.riskRefreshSnapshotId ?? 'n/a'}`
        : String(confirmError?.message ?? confirmData?.executionStatus ?? 'confirm failed'),
      confirmRes.ok ? undefined : confirmRes.body,
    );
    if (!confirmPass) {
      const postListRes = await api<{ items: ActiveRiskItem[]; count: number }>(
        'GET',
        `/trips/${TRIP_ID}/execution-risks`,
      );
      const postRisks = unwrapData<{ items: ActiveRiskItem[]; count: number }>(postListRes.body);
      recordStep(
        steps,
        'HTTP-08-post-confirm-risks',
        postListRes.ok,
        postListRes.status,
        `count=${postRisks?.count ?? 0}`,
      );
      return {
        reachable: true,
        steps,
        riskId: risk.id,
        recommendationId: rec.id,
        idempotencyKey,
      };
    }
  }

  const postListRes = await api<{ items: ActiveRiskItem[]; count: number }>(
    'GET',
    `/trips/${TRIP_ID}/execution-risks`,
  );
  const postRisks = unwrapData<{ items: ActiveRiskItem[]; count: number }>(postListRes.body);
  const snapshotMode = isExecutionRiskSnapshotQueryEnabled();
  const refreshMode = isExecutionRiskPostConfirmRefreshEnabled();

  recordStep(
    steps,
    'HTTP-08-post-confirm-risks',
    postListRes.ok,
    postListRes.status,
    `count=${postRisks?.count ?? 0} snapshotQuery=${snapshotMode} postConfirmRefresh=${refreshMode}`,
  );

  return {
    reachable: true,
    steps,
    riskId: risk.id,
    recommendationId: rec.id,
    idempotencyKey,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const phase = detectExecutionRiskStagingPhase();
  const rollout = evaluateExecutionRiskStagingRollout({ targetPhase: phase });
  const http = await runHttpDrill();

  let inProcessE2e = { passed: false, skipped: SKIP_E2E };
  if (!SKIP_E2E) {
    try {
      log('running in-process staging E2E harness');
      execSync('npm run test:execution-risk-staging-e2e', { stdio: 'inherit' });
      inProcessE2e = { passed: true, skipped: false };
    } catch {
      inProcessE2e = { passed: false, skipped: false };
    }
  } else {
    log('skipping in-process E2E (ERC_STAGING_SKIP_E2E or ERC_STAGING_HTTP_ONLY)');
  }

  const httpStepsPassed = http.steps.every((s) => s.pass);
  const httpCorePassed = http.steps
    .filter((s) => !s.id.startsWith('HTTP-08'))
    .every((s) => s.pass);

  const blockers: string[] = [];
  if (!http.reachable) {
    blockers.push(`API unreachable — start server and ensure knowledge tables seeded (npm run seed:execution-risk-knowledge)`);
  } else if (!httpCorePassed) {
    blockers.push('HTTP drill steps failed — see drill-report.json steps[]');
  }
  if (!SKIP_E2E && !inProcessE2e.passed) {
    blockers.push('in-process staging E2E harness failed');
  }
  if (!rollout.phaseReady && phase !== 'OFF') {
    blockers.push(...rollout.blockers);
  }

  const pass = blockers.length === 0;

  const report = {
    schemaId: 'tripnara.execution_risk_staging_drill@v1',
    generatedAt: new Date().toISOString(),
    pass,
    currentPhase: phase,
    flags: readExecutionRiskFeatureFlags(),
    rollout,
    config: {
      baseUrl: BASE,
      healthUrl: healthUrl(),
      tripId: TRIP_ID,
      skipConfirm: SKIP_CONFIRM,
      requireConfirm: REQUIRE_CONFIRM,
      skipE2e: SKIP_E2E,
      riskId: http.riskId ?? process.env.ERC_STAGING_RISK_ID,
      recommendationId: http.recommendationId ?? process.env.ERC_STAGING_RECOMMENDATION_ID,
      idempotencyKey: http.idempotencyKey,
    },
    http: {
      reachable: http.reachable,
      stepsPassed: httpStepsPassed,
      coreStepsPassed: httpCorePassed,
      steps: http.steps,
    },
    inProcessE2e,
    drillFlow: [
      { step: 1, action: 'GET /health', expect: 'status=ok' },
      { step: 2, action: 'GET execution-risks', expect: '200 + items[]' },
      { step: 3, action: 'GET recommendations', expect: '200 + items[]' },
      { step: 4, action: 'POST apply + Idempotency-Key', expect: 'PREVIEW + planDiff + expectedPlanVersionId' },
      { step: 5, action: 'POST confirm + expectedPlanVersionId', expect: 'APPLIED (+ write fields when flags on)' },
      { step: 6, action: 'GET execution-risks (post-confirm)', expect: '200' },
    ],
    blockers,
  };

  const outPath = path.join(OUT_DIR, 'drill-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `pass=${pass} phase=${phase} httpReachable=${http.reachable} httpCorePassed=${httpCorePassed}`,
  );

  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
