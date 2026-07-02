/**
 * Lex CANARY pilot — :3001 SHADOW dual-run smoke (Legacy authority unchanged).
 *
 * Usage:
 *   npm run lex-canary:pilot
 *   npm run lex-canary:pilot -- http://localhost:3001/api
 *
 * Requires :3001 with DECISION_RUNTIME_MODE=SHADOW + shadow persistence env.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { buildTaskDScenarios } from '../../src/decision-lab/e2e/task-d-scenarios.fixture';
import { icelandMinimalWorldState } from '../../src/decision-lab/fixtures/iceland-minimal.fixture';
import { evaluateCanaryAdmissionGates } from '../../src/decision-runtime/p2-phase/canary-admission-gate.evaluator';
import { snapshotCanaryRolloutGovernance } from '../../src/decision-runtime/p2-phase/canary-rollout-governance.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p2-canary-pilot');
const DEFAULT_BASE = (
  process.argv[2] ?? process.env.LEX_CANARY_BASE_URL ?? 'http://localhost:3001/api'
).replace(/\/$/, '');

const PILOT_SCENARIOS = ['TD-006-three-way', 'TD-001-single-candidate'] as const;

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [lex-canary] ${line}`);
}

type ApiResponse<T> = { success: boolean; data?: T; error?: { message?: string } };

type RuntimeCapabilities = {
  mode?: string;
  effectiveRuntimeMode?: string;
  constraintGatewayMode?: string;
  optimizationStrategyMode?: string;
};

type PlanSelectionResult = {
  optimizationShadow?: {
    comparisonId?: string;
    eligibleForStrategyComparison?: boolean;
    authorityStrategyId?: string;
    shadowStrategyId?: string;
    runtimeMode?: string;
    authorityResult?: { selectedCandidateId?: string };
    shadowResult?: { selectedCandidateId?: string };
  };
};

async function api<T>(
  method: string,
  apiPath: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${DEFAULT_BASE}${apiPath}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return (await res.json()) as ApiResponse<T>;
}

async function runPilotScenario(scenarioId: string) {
  const scenario = buildTaskDScenarios().find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);

  const tripId = `lex_canary_${scenarioId.replace(/[^a-zA-Z0-9]+/g, '_')}`;
  const runId = `canary-${scenarioId}-${Date.now()}`;
  const body = {
    tripId,
    state: scenario.worldState ?? icelandMinimalWorldState(),
    prebuiltCandidates: scenario.candidates,
    constraintReportsByCandidateId: scenario.constraintReports,
    problemId: runId,
    experimentContext: {
      experimentId: 'P2_LEX_CANARY_PILOT',
      scenarioId,
      runId,
      source: 'lex-canary-pilot',
    },
  };

  const res = await api<PlanSelectionResult>(
    'POST',
    '/decision-engine/v1/canonical-plan-selection',
    body,
    {
      'X-Decision-Experiment-Id': 'P2_LEX_CANARY_PILOT',
      'X-Decision-Scenario-Id': scenarioId,
      'X-Decision-Run-Id': runId,
      'X-Decision-Source': 'lex-canary-pilot',
    },
  );

  if (!res.success || !res.data?.optimizationShadow) {
    throw new Error(
      `${scenarioId} failed: ${res.error?.message ?? 'missing optimizationShadow'}`,
    );
  }

  const shadow = res.data.optimizationShadow;
  const authorityId = shadow.authorityStrategyId ?? shadow.authorityResult?.selectedCandidateId;
  const legacyAuthority =
    shadow.authorityStrategyId === 'decision-core-finalize' ||
    Boolean(shadow.authorityResult?.selectedCandidateId);
  const shadowRan = Boolean(shadow.comparisonId && shadow.shadowResult?.selectedCandidateId);

  return {
    scenarioId,
    tripId,
    comparisonId: shadow.comparisonId,
    runtimeMode: shadow.runtimeMode,
    authorityStrategyId: shadow.authorityStrategyId,
    shadowStrategyId: shadow.shadowStrategyId,
    eligible: shadow.eligibleForStrategyComparison,
    authorityWinner: shadow.authorityResult?.selectedCandidateId,
    shadowWinner: shadow.shadowResult?.selectedCandidateId,
    legacyAuthority,
    shadowRan,
    pass: legacyAuthority && shadowRan && shadow.runtimeMode === 'SHADOW',
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const canaryGates = evaluateCanaryAdmissionGates();
  const governance = snapshotCanaryRolloutGovernance();
  const blockers: string[] = [];

  if (!canaryGates.canaryReady) {
    blockers.push('canary admission gates not ready');
  }

  let caps: RuntimeCapabilities | null = null;
  try {
    const capsRes = await api<RuntimeCapabilities>(
      'GET',
      '/decision-engine/v1/runtime-capabilities',
    );
    caps = capsRes.data ?? null;
  } catch (err) {
    blockers.push(
      `:3001 unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (caps) {
    log(
      `server mode=${caps.mode} effective=${caps.effectiveRuntimeMode ?? caps.mode} constraint=${caps.constraintGatewayMode}`,
    );
    if (caps.mode !== 'SHADOW' && caps.effectiveRuntimeMode !== 'SHADOW') {
      blockers.push(`expected SHADOW runtime, got mode=${caps.mode}`);
    }
  }

  const scenarioResults = [];
  if (blockers.length === 0) {
    for (const scenarioId of PILOT_SCENARIOS) {
      log(`running ${scenarioId}...`);
      const result = await runPilotScenario(scenarioId);
      scenarioResults.push(result);
      log(
        `  ${scenarioId} comparison=${result.comparisonId} authority=${result.authorityWinner} shadow=${result.shadowWinner} pass=${result.pass}`,
      );
      if (!result.pass) {
        blockers.push(`${scenarioId} pilot probe failed`);
      }
    }
  }

  const pass = blockers.length === 0;

  const report = {
    schemaId: 'tripnara.lex_canary_pilot@v1',
    generatedAt: new Date().toISOString(),
    baseUrl: DEFAULT_BASE,
    pass,
    canaryAdmission: {
      canaryReady: canaryGates.canaryReady,
      requiredPassed: canaryGates.requiredPassed,
      requiredTotal: canaryGates.requiredTotal,
    },
    governance: governance.rules.map((r) => r.ruleId),
    serverCapabilities: caps,
    scenarios: scenarioResults,
    blockers,
    notes: [
      'Legacy-frozen remains authority — pilot verifies SHADOW dual-run only',
      'DECISION_RUNTIME_MODE=CANARY maps to DUAL_RUN (same observation path as SHADOW)',
    ],
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} scenarios=${scenarioResults.length}`);

  if (!pass) {
    log(`BLOCKERS: ${blockers.join('; ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
