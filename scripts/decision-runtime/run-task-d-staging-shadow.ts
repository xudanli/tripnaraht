/**
 * Task D.1 — Staging HTTP dual-run script.
 *
 * Validates real HTTP: canonical-plan-selection → Authority/Shadow → Dashboard events.
 * Does NOT call services directly.
 *
 * Usage:
 *   npx tsx scripts/decision-runtime/run-task-d-staging-shadow.ts [baseUrl] [--quick|--all]
 *
 * Recommended staging env:
 *   DECISION_RUNTIME_MODE=SHADOW
 *   CANONICAL_FULL_PLAN_SELECTION=1
 *   OPTIMIZATION_SHADOW_OBSERVABILITY_ENABLED=1
 *   (DECISION_LAB_ENABLED=1 optional — SHADOW mode also accepts stagingShadowOptions)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildTaskDScenarios, type TaskDScenario } from '../../src/decision-lab/e2e/task-d-scenarios.fixture';
import {
  icelandMinimalMultiCandidateFixture,
  icelandMinimalWorldState,
} from '../../src/decision-lab/fixtures/iceland-minimal.fixture';
import type { OptimizationShadowEvent } from '../../src/decision-runtime/observability/shadow-divergence.types';
import type { LexicographicStageTrace } from '../../src/decision-runtime/optimization/engines/cp-sat-engine.types';
import { CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY } from '../../src/decision-runtime/optimization/solver-capability.constants';

const EXPERIMENT_ID = 'TASK_D_STAGING_E2E';
const DEFAULT_BASE = 'http://localhost:3000/api';
const DEFAULT_TRIP_ID = 'task_d_staging_trip';
const ARTIFACT_ROOT = path.join(process.cwd(), 'artifacts/task-d-staging');

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

export interface StagingShadowRunReport {
  runId: string;
  scenarioId: string;
  authority: {
    succeeded: boolean;
    latencyMs: number;
    winnerId?: string;
    strategyId?: string;
  };
  shadow: {
    succeeded: boolean;
    latencyMs?: number;
    winnerId?: string;
    solverEngine?: string;
    comparisonId?: string;
  };
  comparison: {
    eligible: boolean;
    sameWinner?: boolean;
    divergenceTypes: string[];
    severity: string;
  };
  checks: {
    fingerprintConsistent: boolean;
    traceComplete: boolean;
    l1GateCorrect: boolean;
    authorityNotBlocked: boolean;
    effectivePlanUnchanged: boolean;
    capabilityMetadataCorrect: boolean;
    dashboardEventLinked: boolean;
  };
  failures: string[];
  skippedChecks: string[];
}

interface PlanVersionBlock {
  effectivePlanVersionId?: string;
  items: unknown[];
  lastUpdatedAt?: string;
}

interface CanonicalSelectionResponse {
  record?: { selectedCandidateId?: string; decisionId?: string };
  optimizationShadow?: OptimizationShadowEvent;
  shadowOptimizationResult?: {
    selectedCandidateId?: string;
    solverMetadata?: Record<string, unknown>;
  };
  optimizationResult?: {
    selectedCandidateId?: string;
    solverMetadata?: Record<string, unknown>;
  };
  candidates?: Array<{ candidateId: string }>;
  humanDecisionRequired?: boolean;
  experimentContext?: { runId?: string };
}

const args = process.argv.slice(2);
const baseUrl = (args.find((a) => !a.startsWith('--')) ?? DEFAULT_BASE).replace(/\/$/, '');
const mode = args.includes('--all') ? 'all' : args.includes('--fixtures') ? 'fixtures' : 'quick';

function log(line: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${line}`);
}

async function appendLog(line: string) {
  await fs.mkdir(path.join(ARTIFACT_ROOT, 'logs'), { recursive: true });
  await fs.appendFile(path.join(ARTIFACT_ROOT, 'logs/runner.log'), `[${new Date().toISOString()}] ${line}\n`);
}

async function api<T>(
  method: string,
  urlPath: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; json: ApiResponse<T>; latencyMs: number }> {
  const started = Date.now();
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const latencyMs = Date.now() - started;
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = { success: false, error: { message: `Non-JSON response (${res.status})` } };
  }
  return { status: res.status, json, latencyMs };
}

function planFingerprint(block: PlanVersionBlock | undefined): string {
  if (!block) return 'unavailable';
  return JSON.stringify({
    effectivePlanVersionId: block.effectivePlanVersionId ?? null,
    versionCount: block.items?.length ?? 0,
    lastUpdatedAt: block.lastUpdatedAt ?? null,
  });
}

function validateStageTraces(traces: LexicographicStageTrace[] | undefined): string[] {
  const failures: string[] = [];
  if (!traces?.length) {
    failures.push('stageTraces empty');
    return failures;
  }
  let prevRemaining: string[] | undefined;
  for (const stage of traces) {
    for (const field of [
      'layer',
      'objectiveId',
      'objectiveValues',
      'eliminatedCandidateIds',
      'remainingCandidateIds',
      'fixedBound',
    ] as const) {
      if ((stage as Record<string, unknown>)[field] === undefined) {
        failures.push(`stage ${stage.stageIndex} missing ${field}`);
      }
    }
    if (prevRemaining) {
      const inputSet = new Set(stage.inputCandidateIds);
      const prevSet = new Set(prevRemaining);
      if (inputSet.size !== prevSet.size || ![...inputSet].every((id) => prevSet.has(id))) {
        failures.push(
          `stage ${stage.stageIndex} inputCandidateIds != previous remainingCandidateIds`,
        );
      }
    }
    prevRemaining = stage.remainingCandidateIds;
  }
  return failures;
}

function validateCapability(
  shadow: OptimizationShadowEvent | undefined,
  scenario?: TaskDScenario | null,
): string[] {
  const failures: string[] = [];
  if (
    scenario?.expect.divergenceTypes?.includes('SHADOW_ERROR') &&
    shadow?.divergence.types.includes('SHADOW_ERROR')
  ) {
    return failures;
  }
  const meta = shadow?.shadowResult;
  const expected = CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY;
  if (!meta) {
    failures.push('shadowResult missing');
    return failures;
  }
  if (meta.strategyId !== expected.strategyId) {
    failures.push(`strategyId=${meta.strategyId} expected ${expected.strategyId}`);
  }
  if (meta.solverEngine !== 'cp-sat-lex-v1') {
    failures.push(`solverEngine=${meta.solverEngine} expected cp-sat-lex-v1`);
  }
  if (meta.solverFamily !== expected.solverFamily) {
    failures.push(`solverFamily=${meta.solverFamily}`);
  }
  if (meta.optimizationLevel !== expected.optimizationLevel) {
    failures.push(`optimizationLevel=${meta.optimizationLevel}`);
  }
  if (meta.nativeCpSat !== false) {
    failures.push(`nativeCpSat=${meta.nativeCpSat} expected false`);
  }
  return failures;
}

function validateFingerprint(event: OptimizationShadowEvent | undefined): string[] {
  const failures: string[] = [];
  if (!event?.inputFingerprint) {
    failures.push('inputFingerprint missing');
    return failures;
  }
  const fp = event.inputFingerprint;
  for (const key of [
    'snapshotHash',
    'candidateSetHash',
    'constraintReportHash',
    'objectiveConfigHash',
  ] as const) {
    if (!fp[key]) failures.push(`inputFingerprint.${key} missing`);
  }
  if (
    event.eligibleForStrategyComparison &&
    event.divergence.types.includes('INPUT_MISMATCH')
  ) {
    failures.push('eligibleForStrategyComparison=true but INPUT_MISMATCH present');
  }
  return failures;
}

function validateL1Gate(
  scenario: TaskDScenario | { id: string },
  authorityWinnerId: string | undefined,
  shadowWinnerId: string | undefined,
  humanDecisionRequired: boolean | undefined,
): string[] {
  const failures: string[] = [];
  if (scenario.id === 'TD-007-l1-block') {
    if (authorityWinnerId === 'conservative') {
      failures.push('authority selected L1 BLOCK candidate conservative');
    }
    if (shadowWinnerId === 'conservative') {
      failures.push('shadow selected L1 BLOCK candidate conservative');
    }
  }
  if (scenario.id === 'TD-009-all-infeasible') {
    if (shadowWinnerId) {
      failures.push(`all infeasible but shadow winner=${shadowWinnerId}`);
    }
    if (authorityWinnerId && !humanDecisionRequired) {
      failures.push(`all infeasible but authority winner=${authorityWinnerId} without human gate`);
    }
  }
  return failures;
}

async function fetchPlanVersions(tripId: string): Promise<PlanVersionBlock | undefined> {
  const res = await api<PlanVersionBlock>(
    'GET',
    `/internal/rfc001/iceland/trips/${tripId}/plan-versions`,
  );
  if (!res.json.success) return undefined;
  return res.json.data;
}

async function pollShadowEvent(
  comparisonId: string | undefined,
  decisionRunId: string,
  tripId: string,
): Promise<{ event?: OptimizationShadowEvent; latencyMs: number }> {
  const started = Date.now();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (comparisonId) {
      const byId = await api<OptimizationShadowEvent>(
        'GET',
        `/decision-engine/v1/shadow-observability/events/${encodeURIComponent(comparisonId)}`,
      );
      if (byId.json.success && byId.json.data) {
        return { event: byId.json.data, latencyMs: Date.now() - started };
      }
    }
    const list = await api<{ events: OptimizationShadowEvent[] }>(
      'GET',
      `/decision-engine/v1/shadow-observability/events?decisionRunId=${encodeURIComponent(decisionRunId)}&tripId=${encodeURIComponent(tripId)}&limit=5`,
    );
    const match = list.json.data?.events?.[0];
    if (match) {
      return { event: match, latencyMs: Date.now() - started };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { latencyMs: Date.now() - started };
}

function buildRequestBody(
  scenario: TaskDScenario | null,
  tripId: string,
  runId: string,
  options?: { realMulti?: boolean },
) {
  const worldState = scenario?.worldState ?? icelandMinimalWorldState();
  const body: Record<string, unknown> = {
    tripId,
    state: worldState,
    experimentContext: {
      experimentId: EXPERIMENT_ID,
      scenarioId: scenario?.id ?? 'REAL-MULTI-CANDIDATE',
      runId,
      source: 'STAGING_HTTP_RUNNER',
    },
    problemId: runId,
  };

  if (scenario && !options?.realMulti) {
    body.prebuiltCandidates = scenario.candidates;
    body.constraintReportsByCandidateId = scenario.constraintReports;
    if (scenario.shadowError || scenario.shadowTimeLimitMs != null || scenario.inputMismatch) {
      body.stagingShadowOptions = {
        ...(scenario.shadowError ? { shadowError: scenario.shadowError } : {}),
        ...(scenario.shadowTimeLimitMs != null
          ? { shadowTimeLimitMs: scenario.shadowTimeLimitMs }
          : {}),
        ...(scenario.inputMismatch ? { inputMismatch: true } : {}),
      };
    }
  } else if (options?.realMulti) {
    body.prebuiltCandidates = icelandMinimalMultiCandidateFixture();
    // No constraintReportsByCandidateId — Gateway re-evaluates (real normalizer path)
  }

  return body;
}

async function runScenario(
  scenario: TaskDScenario | null,
  tripId: string,
  planBefore: PlanVersionBlock | undefined,
  options?: { realMulti?: boolean },
): Promise<StagingShadowRunReport> {
  const scenarioId = scenario?.id ?? 'REAL-MULTI-CANDIDATE';
  const runId = `task-d-${scenarioId}-${Date.now()}`;
  const failures: string[] = [];
  const skippedChecks: string[] = [];

  const headers = {
    'X-Decision-Experiment-Id': EXPERIMENT_ID,
    'X-Decision-Scenario-Id': scenarioId,
    'X-Decision-Run-Id': runId,
    'X-Decision-Source': 'STAGING_HTTP_RUNNER',
  };

  const requestBody = buildRequestBody(scenario, tripId, runId, options);
  const rawDir = path.join(ARTIFACT_ROOT, 'raw');
  await fs.mkdir(rawDir, { recursive: true });
  await fs.writeFile(
    path.join(rawDir, `${scenarioId}-request.json`),
    JSON.stringify(requestBody, null, 2),
  );

  const authorityStarted = Date.now();
  const httpRes = await api<CanonicalSelectionResponse>(
    'POST',
    '/decision-engine/v1/canonical-plan-selection',
    requestBody,
    headers,
  );
  const authorityLatencyMs = Date.now() - authorityStarted;

  await fs.writeFile(
    path.join(rawDir, `${scenarioId}-response.json`),
    JSON.stringify({ status: httpRes.status, ...httpRes.json }, null, 2),
  );

  const data = httpRes.json.data;
  const authoritySucceeded = httpRes.status === 200 && httpRes.json.success === true;
  if (!authoritySucceeded) {
    failures.push(
      `authority HTTP failed status=${httpRes.status} ${httpRes.json.error?.message ?? ''}`,
    );
  }
  if (authoritySucceeded && !data?.candidates?.length) {
    failures.push('authority response missing candidates');
  }

  const authorityWinnerId =
    data?.record?.selectedCandidateId ??
    data?.optimizationResult?.selectedCandidateId;
  const inlineShadow = data?.optimizationShadow;
  const comparisonId = inlineShadow?.comparisonId;

  if (authoritySucceeded && !inlineShadow) {
    failures.push('response missing optimizationShadow (is DECISION_RUNTIME_MODE=SHADOW?)');
  }

  const { event: dashboardEvent, latencyMs: shadowPollMs } = await pollShadowEvent(
    comparisonId,
    runId,
    tripId,
  );
  const shadowEvent = dashboardEvent ?? inlineShadow;

  if (shadowEvent) {
    await fs.writeFile(
      path.join(rawDir, `${scenarioId}-shadow-event.json`),
      JSON.stringify(shadowEvent, null, 2),
    );
  } else {
    failures.push('dashboard event not found for decisionRunId');
  }

  const fingerprintFailures = validateFingerprint(shadowEvent);
  failures.push(...fingerprintFailures);

  const capabilityFailures = validateCapability(shadowEvent, scenario);
  failures.push(...capabilityFailures);

  const needsTraces =
    scenario?.category === 'lex_divergence' ||
    shadowEvent?.divergence.types.includes('DIFFERENT_WINNER');
  let traceComplete = true;
  if (needsTraces) {
    const traceFailures = validateStageTraces(shadowEvent?.lexicographicStageTraces);
    if (traceFailures.length) {
      traceComplete = false;
      failures.push(...traceFailures);
    }
  }

  const l1Failures = validateL1Gate(
    scenario ?? { id: scenarioId },
    authorityWinnerId,
    shadowEvent?.shadowResult?.selectedCandidateId,
    data?.humanDecisionRequired,
  );
  failures.push(...l1Failures);

  let effectivePlanUnchanged = true;
  const planAfter = await fetchPlanVersions(tripId);
  if (planBefore && planAfter) {
    if (planFingerprint(planBefore) !== planFingerprint(planAfter)) {
      effectivePlanUnchanged = false;
      failures.push('effective plan version block changed after shadow run');
    }
  } else {
    skippedChecks.push('effectivePlanUnchanged (RFC001 plan-versions unavailable)');
    effectivePlanUnchanged = true;
  }

  if (scenario?.expect.sameWinner === true && shadowEvent && !shadowEvent.divergence.sameWinner) {
    failures.push('expected SAME_WINNER but diverged');
  }
  if (scenario?.expect.shadowWinnerId && shadowEvent?.shadowResult?.selectedCandidateId) {
    if (shadowEvent.shadowResult.selectedCandidateId !== scenario.expect.shadowWinnerId) {
      failures.push(
        `shadow winner ${shadowEvent.shadowResult.selectedCandidateId} != expected ${scenario.expect.shadowWinnerId}`,
      );
    }
  }
  if (scenario?.expect.eligibleForComparison === true && shadowEvent) {
    if (!shadowEvent.eligibleForStrategyComparison) {
      failures.push('expected eligibleForStrategyComparison=true');
    }
  }
  if (scenario?.expect.divergenceTypes?.length && shadowEvent) {
    for (const t of scenario.expect.divergenceTypes) {
      if (!shadowEvent.divergence.types.includes(t)) {
        failures.push(`expected divergence type ${t}`);
      }
    }
  }

  const report: StagingShadowRunReport = {
    runId,
    scenarioId,
    authority: {
      succeeded: authoritySucceeded,
      latencyMs: authorityLatencyMs,
      winnerId: authorityWinnerId,
      strategyId: data?.optimizationResult?.solverMetadata?.strategyId as string | undefined,
    },
    shadow: {
      succeeded: Boolean(shadowEvent?.shadowResult?.success ?? shadowEvent?.shadowResult),
      latencyMs: shadowEvent?.shadowResult?.elapsedMs ?? shadowPollMs,
      winnerId: shadowEvent?.shadowResult?.selectedCandidateId,
      solverEngine: shadowEvent?.shadowResult?.solverEngine,
      comparisonId: shadowEvent?.comparisonId,
    },
    comparison: {
      eligible: shadowEvent?.eligibleForStrategyComparison ?? false,
      sameWinner: shadowEvent?.divergence.sameWinner,
      divergenceTypes: shadowEvent?.divergence.types ?? [],
      severity: shadowEvent?.divergence.severity ?? 'UNKNOWN',
    },
    checks: {
      fingerprintConsistent: fingerprintFailures.length === 0,
      traceComplete,
      l1GateCorrect: l1Failures.length === 0,
      authorityNotBlocked: authoritySucceeded,
      effectivePlanUnchanged,
      capabilityMetadataCorrect: capabilityFailures.length === 0,
      dashboardEventLinked: Boolean(shadowEvent && (shadowEvent.decisionRunId === runId || comparisonId)),
    },
    failures,
    skippedChecks,
  };

  const reportsDir = path.join(ARTIFACT_ROOT, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(
    path.join(reportsDir, `${scenarioId}-report.json`),
    JSON.stringify(report, null, 2),
  );

  return report;
}

function selectScenarios(modeArg: string): TaskDScenario[] {
  const all = buildTaskDScenarios();
  if (modeArg === 'all') return all;
  if (modeArg === 'fixtures') return all;
  const quickIds = new Set([
    'TD-004-iceland-multi-lex',
    'TD-005-l2-drive-fork',
    'TD-006-three-way',
    'TD-007-l1-block',
    'TD-009-all-infeasible',
  ]);
  return all.filter((s) => quickIds.has(s.id));
}

function renderMarkdownSummary(reports: StagingShadowRunReport[]): string {
  const passed = reports.filter((r) => r.failures.length === 0).length;
  const lines = [
    '# Task D Staging HTTP Shadow Summary',
    '',
    `- Base URL: \`${baseUrl}\``,
    `- Mode: \`${mode}\``,
    `- Scenarios: ${reports.length}`,
    `- Passed: ${passed}/${reports.length}`,
    `- Generated: ${new Date().toISOString()}`,
    '',
    '| Scenario | Authority | Shadow | Divergence | Failures |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of reports) {
    lines.push(
      `| ${r.scenarioId} | ${r.authority.succeeded ? 'OK' : 'FAIL'} (${r.authority.latencyMs}ms) | ${r.shadow.winnerId ?? '-'} | ${r.comparison.divergenceTypes.join(', ') || '-'} | ${r.failures.length ? r.failures.join('; ') : 'none'} |`,
    );
  }
  lines.push('', '## DoD checklist', '');
  const dod = [
    ['Authority success rate', reports.every((r) => r.checks.authorityNotBlocked)],
    ['Shadow never blocks authority', reports.every((r) => r.checks.authorityNotBlocked)],
    ['Fingerprint consistent (fixture)', reports.filter((r) => r.scenarioId.startsWith('TD-')).every((r) => r.checks.fingerprintConsistent)],
    ['Capability metadata', reports.every((r) => r.checks.capabilityMetadataCorrect)],
    ['Dashboard linked', reports.every((r) => r.checks.dashboardEventLinked)],
    ['Effective plan unchanged', reports.every((r) => r.checks.effectivePlanUnchanged)],
    ['L1 gate (TD-007/009)', reports.filter((r) => r.scenarioId.includes('l1') || r.scenarioId.includes('infeasible')).every((r) => r.checks.l1GateCorrect)],
    ['Trace complete (divergence)', reports.filter((r) => r.comparison.divergenceTypes.includes('DIFFERENT_WINNER') || r.scenarioId.includes('three-way') || r.scenarioId.includes('drive-fork')).every((r) => r.checks.traceComplete)],
  ];
  for (const [label, ok] of dod) {
    lines.push(`- [${ok ? 'x' : ' '}] ${label}`);
  }
  return lines.join('\n');
}

async function checkStagingEnv(): Promise<string[]> {
  const warnings: string[] = [];
  const health = await api<{
    capabilities?: {
      canonicalFullPlanSelection?: boolean;
      decisionRuntimeMode?: string;
      effectiveRuntimeMode?: string;
      fullPlanOptimizationShadow?: boolean;
    };
  }>('GET', '/decision-engine/v1/health');

  if (!health.json.success) {
    warnings.push('health check failed');
    return warnings;
  }
  const caps = health.json.data?.capabilities;
  if (!caps?.canonicalFullPlanSelection) {
    warnings.push('CANONICAL_FULL_PLAN_SELECTION not enabled');
  }
  if (!caps?.fullPlanOptimizationShadow) {
    warnings.push('fullPlanOptimizationShadow=false — set DECISION_RUNTIME_MODE=SHADOW or DUAL_RUN');
  }
  log(
    `health ok mode=${caps?.decisionRuntimeMode} effective=${caps?.effectiveRuntimeMode} shadow=${caps?.fullPlanOptimizationShadow}`,
  );
  return warnings;
}

async function runReviewQueueSmokeTest(): Promise<string[]> {
  const failures: string[] = [];
  log('Review Queue smoke — materialize from recent shadow events...');

  const materialize = await api<{
    materialized: Array<{ reviewCaseId: string; comparisonId: string }>;
    skipped: Array<{ comparisonId: string; reason: string }>;
  }>('POST', '/decision-engine/v1/shadow-reviews/materialize', {
    tripId: DEFAULT_TRIP_ID,
    limit: 20,
  });

  await fs.writeFile(
    path.join(ARTIFACT_ROOT, 'raw', 'review-materialize.json'),
    JSON.stringify(materialize.json, null, 2),
  );

  if (!materialize.json.success) {
    failures.push(`materialize failed: ${materialize.json.error?.message}`);
    return failures;
  }

  const td006 = reports.find((r) => r.scenarioId === 'TD-006-three-way');
  const materialized = materialize.json.data?.materialized ?? [];
  if (td006?.shadow.comparisonId && materialized.length === 0) {
    const retry = await api<typeof materialize.json.data>(
      'POST',
      '/decision-engine/v1/shadow-reviews/materialize',
      { comparisonIds: [td006.shadow.comparisonId], force: true },
    );
    if (retry.json.data?.materialized?.length) {
      materialized.push(...retry.json.data.materialized);
    }
  }

  if (materialized.length === 0) {
    failures.push('no review cases materialized (need DIFFERENT_WINNER event)');
    return failures;
  }

  const reviewCaseId = materialized[0]!.reviewCaseId;
  const detail = await api<{ blindedOptionA: unknown; blindedOptionB: unknown }>(
    'GET',
    `/decision-engine/v1/shadow-reviews/${encodeURIComponent(reviewCaseId)}`,
  );
  if (!detail.json.success || !detail.json.data?.blindedOptionA) {
    failures.push('review case GET failed');
  }

  const submit = await api(
    'POST',
    `/decision-engine/v1/shadow-reviews/${encodeURIComponent(reviewCaseId)}/submit`,
    {
      preferredOption: 'A',
      scores: { reasonableness: 4, executability: 5, requirementFit: 4, paceFit: 4 },
      tradeOffSummary: 'Staging smoke — option A preferred.',
      confidence: 4,
    },
    { 'X-Shadow-Reviewer-Id': 'staging-smoke-reviewer' },
  );
  if (!submit.json.success) {
    failures.push(`submit failed: ${submit.json.error?.message}`);
  }

  const stats = await api('GET', '/decision-engine/v1/shadow-reviews/stats');
  if (!stats.json.success) {
    failures.push('stats GET failed');
  }

  await fs.writeFile(
    path.join(ARTIFACT_ROOT, 'reports/review-queue-smoke.json'),
    JSON.stringify({ materialize: materialize.json.data, detail: detail.json.data, submit: submit.json.data, stats: stats.json.data }, null, 2),
  );

  log(`Review Queue smoke: materialized=${materialized.length} reviewCaseId=${reviewCaseId}`);
  return failures;
}

let reports: StagingShadowRunReport[] = [];

async function main() {
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  log(`Task D.1 Staging HTTP runner — base=${baseUrl} mode=${mode}`);

  const envWarnings = await checkStagingEnv();
  for (const w of envWarnings) {
    log(`WARN: ${w}`);
    await appendLog(`WARN: ${w}`);
  }

  const dashboardBefore = await api('GET', '/decision-engine/v1/shadow-observability/dashboard?limit=5');
  await fs.mkdir(path.join(ARTIFACT_ROOT, 'raw'), { recursive: true });
  await fs.writeFile(
    path.join(ARTIFACT_ROOT, 'raw', 'dashboard-baseline.json'),
    JSON.stringify(dashboardBefore.json, null, 2),
  );

  const tripId = DEFAULT_TRIP_ID;
  const planBefore = await fetchPlanVersions(tripId);

  const scenarios = selectScenarios(mode);
  reports = [];

  for (const scenario of scenarios) {
    log(`Running fixture ${scenario.id}...`);
    const report = await runScenario(scenario, tripId, planBefore);
    reports.push(report);
    const mark = report.failures.length ? 'FAIL' : 'PASS';
    log(`[${mark}] ${scenario.id} authority=${report.authority.winnerId} shadow=${report.shadow.winnerId}`);
    if (report.failures.length) {
      for (const f of report.failures) log(`  - ${f}`);
    }
  }

  if (mode !== 'fixtures') {
    log('Running REAL-MULTI-CANDIDATE (legacy adapter)...');
    const realReport = await runScenario(null, `${tripId}_real`, planBefore, {
      realMulti: true,
    });
    reports.push(realReport);
    const mark = realReport.failures.length ? 'FAIL' : 'PASS';
    log(`[${mark}] REAL-MULTI-CANDIDATE candidates via HTTP`);
  }

  const summaryMd = renderMarkdownSummary(reports);
  await fs.writeFile(path.join(ARTIFACT_ROOT, 'reports/task-d-staging-summary.md'), summaryMd);
  await fs.writeFile(
    path.join(ARTIFACT_ROOT, 'reports/task-d-staging-summary.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2),
  );

  console.log('\n' + summaryMd);

  const reviewFailures = await runReviewQueueSmokeTest();
  if (reviewFailures.length) {
    log('Review Queue smoke FAIL:');
    for (const f of reviewFailures) log(`  - ${f}`);
  } else {
    log('Review Queue smoke PASS');
  }

  const failed = reports.filter((r) => r.failures.length > 0);
  process.exit(failed.length > 0 || reviewFailures.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await appendLog(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
