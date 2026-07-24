/**
 * Evaluates O7 canary admission gates from local artifacts (no HTTP required).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CANARY_ADMISSION_GATES,
  type CanaryGateStatus,
  type CanaryAdmissionGateDefinition,
} from './canary-admission-gate.catalog';

export const CALIBRATION_V1_RUN_ID = 'bench_eab3892f-b7e7-4f15-b1e5-440fea2b3047';

export interface CanaryGateEvaluation {
  gateId: string;
  status: CanaryGateStatus;
  detail: string;
  requiredForCanary: boolean;
}

export interface CanaryAdmissionEvaluationSummary {
  schemaId: 'tripnara.canary_admission_evaluation@v1';
  evaluatedAt: string;
  calibrationRunId: string;
  gates: CanaryGateEvaluation[];
  requiredPassed: number;
  requiredTotal: number;
  requiredFailed: number;
  requiredPending: number;
  canaryReady: boolean;
  blockers: string[];
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function artifactRoot(cwd = process.cwd()) {
  return path.join(cwd, 'artifacts');
}

type P0Status = { overall?: string };
type FaultGate = { passed?: number; failed?: number; total?: number };
type BlindReview = {
  summary?: { allCompleted?: boolean; submittedCount?: number; requiredCount?: number };
  submissions?: Array<{ preferredOption?: string; status?: string }>;
};
type BenchmarkProgress = {
  runStatus?: string;
  counters?: { excluded?: number; failed?: number; total?: number; completed?: number };
  instances?: Array<{ instanceId: string; status: string; failureClass?: string | null }>;
};
type ConstraintShadowReport = {
  summary?: { compared?: number; diverged?: number; divergenceRate?: number };
  probes?: Array<{ probeId?: string; aligned?: boolean; divergenceKind?: string }>;
};
type P1Status = {
  triggerWiring?: { notWired?: number; dispatchCoveragePct?: number };
};
type HoldoutPreflight = { ready?: boolean; holdoutInstanceCount?: number };
type HoldoutSummary = {
  blindReviewSubmitted?: number;
  materializedReviewCases?: number;
};

function findCompletedHoldoutRun(cwd: string): {
  runId: string;
  progress: BenchmarkProgress;
} | null {
  const benchRoot = path.join(artifactRoot(cwd), 'task-e1-benchmark');
  if (!fs.existsSync(benchRoot)) return null;

  const candidates: Array<{ runId: string; progress: BenchmarkProgress; mtime: number }> = [];
  for (const d of fs.readdirSync(benchRoot, { withFileTypes: true })) {
    if (!d.isDirectory() || !d.name.startsWith('bench_')) continue;
    const runDir = path.join(benchRoot, d.name);
    const manifest = readJson<{ config?: { split?: string } }>(
      path.join(runDir, 'manifest.json'),
    );
    const progress = readJson<BenchmarkProgress>(
      path.join(runDir, 'reports', 'benchmark-progress.json'),
    );
    if (manifest?.config?.split !== 'HOLDOUT' || progress?.runStatus !== 'COMPLETED') {
      continue;
    }
    const stat = fs.statSync(runDir);
    candidates.push({ runId: d.name, progress, mtime: stat.mtimeMs });
  }

  candidates.sort((a, b) => b.mtime - a.mtime);
  const latest = candidates[0];
  return latest ? { runId: latest.runId, progress: latest.progress } : null;
}

export { findCompletedHoldoutRun };

function evaluateGate(
  gate: CanaryAdmissionGateDefinition,
  ctx: {
    p0: P0Status | null;
    faultGate: FaultGate | null;
    blindReview: BlindReview | null;
    benchmarkProgress: BenchmarkProgress | null;
    constraintShadow: ConstraintShadowReport | null;
    p1Status: P1Status | null;
    holdoutPreflight: HoldoutPreflight | null;
    holdoutRun: { runId: string; progress: BenchmarkProgress } | null;
    holdoutSummary: HoldoutSummary | null;
  },
): CanaryGateEvaluation {
  const base = {
    gateId: gate.gateId,
    requiredForCanary: gate.requiredForCanary,
  };

  switch (gate.gateId) {
    case 'P0_FORMAL_FREEZE':
      return {
        ...base,
        status: ctx.p0?.overall === 'COMPLETE' ? 'PASS' : 'FAIL',
        detail: ctx.p0?.overall ?? 'p0-freeze-status missing',
      };

    case 'FAULT_INJECTION_GATE': {
      const passed = ctx.faultGate?.passed ?? 0;
      const failed = ctx.faultGate?.failed ?? 0;
      return {
        ...base,
        status: passed >= 29 && failed === 0 ? 'PASS' : 'PENDING',
        detail: `${passed}/29 passed, ${failed} failed`,
      };
    }

    case 'CALIBRATION_BLIND_REVIEW': {
      const ok = ctx.blindReview?.summary?.allCompleted === true;
      const count = ctx.blindReview?.summary?.submittedCount ?? 0;
      return {
        ...base,
        status: ok ? 'PASS' : 'FAIL',
        detail: `${count}/3 blind reviews completed`,
      };
    }

    case 'INPUT_CONSISTENCY_RATE': {
      const instances = ctx.benchmarkProgress?.instances ?? [];
      const total = instances.length || (ctx.benchmarkProgress?.counters?.total ?? 0);
      const excluded = instances.filter((i) => i.status === 'EXCLUDED').length;
      const eligible = total - excluded;
      const rate = total > 0 ? eligible / total : 0;
      return {
        ...base,
        status: rate >= 0.8 ? 'PASS' : 'FAIL',
        detail: `${eligible}/${total} eligible (${Math.round(rate * 100)}%)`,
      };
    }

    case 'NO_L1_REGRESSION': {
      const td007 = ctx.benchmarkProgress?.instances?.find(
        (i) => i.instanceId === 'TD-007-l1-block',
      );
      return {
        ...base,
        status: td007?.status === 'COMPLETED' ? 'PASS' : 'FAIL',
        detail: td007 ? `TD-007 status=${td007.status}` : 'TD-007 instance missing',
      };
    }

    case 'NO_BLOCKED_WINNER': {
      const blocked = ctx.benchmarkProgress?.instances?.filter(
        (i) => i.failureClass === 'BLOCKED_WINNER',
      );
      return {
        ...base,
        status: (blocked?.length ?? 0) === 0 ? 'PASS' : 'FAIL',
        detail: `${blocked?.length ?? 0} blocked-winner failures`,
      };
    }

    case 'SHADOW_ERROR_RATE': {
      const instances = ctx.benchmarkProgress?.instances ?? [];
      const errorIds = new Set(['TD-010-shadow-error', 'TD-011-shadow-timeout']);
      const comparable = instances.filter((i) => !errorIds.has(i.instanceId));
      const failed = comparable.filter((i) => i.status === 'FAILED').length;
      const rate = comparable.length > 0 ? failed / comparable.length : 0;
      return {
        ...base,
        status: rate <= 0.1 ? 'PASS' : 'FAIL',
        detail: `${failed}/${comparable.length} failed (${Math.round(rate * 100)}%)`,
      };
    }

    case 'BLIND_REVIEW_NOT_INFERIOR': {
      const bad = ctx.blindReview?.submissions?.filter((s) =>
        ['BOTH_INVALID', 'INSUFFICIENT_INFORMATION'].includes(s.preferredOption ?? ''),
      );
      return {
        ...base,
        status: (bad?.length ?? 0) === 0 ? 'PASS' : 'FAIL',
        detail: `${bad?.length ?? 0} inferior verdicts`,
      };
    }

    case 'CONSTRAINT_SHADOW_OBSERVED': {
      const diverged = ctx.constraintShadow?.summary?.diverged ?? 0;
      return {
        ...base,
        status: diverged >= 1 ? 'PASS' : 'PENDING',
        detail: `diverged=${diverged}`,
      };
    }

    case 'CONSTRAINT_DIVERGENCE_DOCUMENTED': {
      const compared = ctx.constraintShadow?.summary?.compared ?? 0;
      const kinds = new Set(
        (ctx.constraintShadow?.probes ?? [])
          .map((p) => p.divergenceKind)
          .filter(Boolean),
      );
      return {
        ...base,
        status: compared >= 3 && kinds.size >= 1 ? 'PASS' : 'PENDING',
        detail: `compared=${compared} kinds=${kinds.size}`,
      };
    }

    case 'HOLDOUT_PREFLIGHT':
      return {
        ...base,
        status: ctx.holdoutPreflight?.ready ? 'PASS' : 'PENDING',
        detail: ctx.holdoutPreflight
          ? `holdout=${ctx.holdoutPreflight.holdoutInstanceCount ?? 0} ready=${ctx.holdoutPreflight.ready}`
          : 'holdout preflight not run',
      };

    case 'HOLDOUT_BLIND_REVIEW': {
      const required = ctx.holdoutSummary?.materializedReviewCases ?? 0;
      const submitted = ctx.holdoutSummary?.blindReviewSubmitted ?? 0;
      if (required === 0) {
        return { ...base, status: 'PENDING', detail: 'no materialized holdout cases' };
      }
      return {
        ...base,
        status: submitted >= required ? 'PASS' : 'FAIL',
        detail: `${submitted}/${required} holdout blind reviews submitted`,
      };
    }

    case 'HOLDOUT_RUN_COMPLETE': {
      const run = ctx.holdoutRun;
      if (!run) {
        return {
          ...base,
          status: 'PENDING',
          detail: 'no holdout run — npm run task-e1:benchmark-batch -- --split holdout',
        };
      }
      const total = run.progress.instances?.length ?? run.progress.counters?.total ?? 0;
      const failed = run.progress.instances?.filter((i) => i.status === 'FAILED').length ?? 0;
      const excluded = run.progress.instances?.filter((i) => i.status === 'EXCLUDED').length ?? 0;
      const completed = run.progress.instances?.filter((i) => i.status === 'COMPLETED').length ?? 0;
      return {
        ...base,
        status: failed === 0 && total >= 30 ? 'PASS' : failed > 0 ? 'FAIL' : 'PENDING',
        detail: `${run.runId}: completed=${completed} excluded=${excluded} failed=${failed}/${total}`,
      };
    }

    case 'AUTHORIZATION_GATEWAY_STAGING':
      return {
        ...base,
        status: 'NOT_EVALUATED',
        detail: 'evaluated by p2-staging:validate auth probes',
      };

    case 'P1_TRIGGER_WIRING': {
      const tw = ctx.p1Status?.triggerWiring;
      const ok =
        (tw?.notWired ?? 1) === 0 && (tw?.dispatchCoveragePct ?? 0) >= 100;
      return {
        ...base,
        status: ok ? 'PASS' : 'PENDING',
        detail: tw
          ? `not_wired=${tw.notWired} coverage=${tw.dispatchCoveragePct}%`
          : 'p1 status missing',
      };
    }

    default:
      return { ...base, status: 'NOT_EVALUATED', detail: 'unknown gate' };
  }
}

export function evaluateCanaryAdmissionGates(
  cwd = process.cwd(),
  options?: { authGatewayStagingPass?: boolean },
): CanaryAdmissionEvaluationSummary {
  const root = artifactRoot(cwd);
  const benchDir = path.join(root, 'task-e1-benchmark', CALIBRATION_V1_RUN_ID, 'reports');

  const p0 = readJson<P0Status>(path.join(root, 'task-e1-freeze', 'p0-freeze-status.json'));
  const faultGate = readJson<FaultGate>(
    path.join(root, 'task-e1-benchmark', '.fault-injection-gate.json'),
  );
  const blindReview = readJson<BlindReview>(path.join(benchDir, 'blind-review-submissions.json'));
  const benchmarkProgress = readJson<BenchmarkProgress>(
    path.join(benchDir, 'benchmark-progress.json'),
  );
  const constraintShadow = readJson<ConstraintShadowReport>(
    path.join(root, 'constraint-shadow-staging', 'report.json'),
  );
  const p1Status = readJson<P1Status>(path.join(root, 'p1-phase-status', 'status.json'));
  const holdoutPreflight = readJson<HoldoutPreflight>(
    path.join(root, 'p2-phase-status', 'holdout-preflight.json'),
  );
  const holdoutRun = findCompletedHoldoutRun(cwd);
  const holdoutSummary = holdoutRun
    ? readJson<HoldoutSummary>(
        path.join(
          root,
          'task-e1-benchmark',
          holdoutRun.runId,
          'reports',
          'holdout-summary.json',
        ),
      )
    : null;

  const ctx = {
    p0,
    faultGate,
    blindReview,
    benchmarkProgress,
    constraintShadow,
    p1Status,
    holdoutPreflight,
    holdoutRun,
    holdoutSummary,
  };

  const gates = CANARY_ADMISSION_GATES.map((g) => {
    const ev = evaluateGate(g, ctx);
    if (g.gateId === 'AUTHORIZATION_GATEWAY_STAGING' && options?.authGatewayStagingPass) {
      return { ...ev, status: 'PASS' as CanaryGateStatus, detail: 'auth probes passed' };
    }
    return ev;
  });

  const required = gates.filter((g) => g.requiredForCanary);
  const requiredPassed = required.filter((g) => g.status === 'PASS').length;
  const requiredFailed = required.filter((g) => g.status === 'FAIL').length;
  const requiredPending = required.filter(
    (g) => g.status === 'PENDING' || g.status === 'NOT_EVALUATED',
  ).length;

  const blockers = required
    .filter((g) => g.status !== 'PASS')
    .map((g) => `${g.gateId}: ${g.detail}`);

  return {
    schemaId: 'tripnara.canary_admission_evaluation@v1',
    evaluatedAt: new Date().toISOString(),
    calibrationRunId: CALIBRATION_V1_RUN_ID,
    gates,
    requiredPassed,
    requiredTotal: required.length,
    requiredFailed,
    requiredPending,
    canaryReady: requiredFailed === 0 && requiredPending === 0,
    blockers,
  };
}
