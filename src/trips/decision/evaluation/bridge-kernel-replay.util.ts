/**
 * Planning Workbench / Feasibility MC 桥接路径回放固件（CGUS replay 并轨）
 */
import { Logger } from '@nestjs/common';
import { dsoToMinimalWorldModelContext } from '../../../decision/kernel/dso-to-world-model-converter';
import { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { ConstraintReport, DecisionState } from '../../../decision/kernel/decision-state.types';
import type { GateResultLike } from '../../../decision/kernel/interfaces/phase-executor.interface';
import { PlanningWorkbenchKernelBridgeService } from '../../../agent/services/planning-workbench-kernel-bridge.service';
import type { PlanSkeleton, PlanState } from '../../../skills/plan/shared/plan-state.types';
import type { RoutePlanDraft, WorldModelContext } from '../shared/world-model.types';
import { FatigueCalculatorService } from '../services/fatigue-calculator.service';
import { ObjectiveFunctionService } from '../optimization/objective-function.service';
import { PlanFeaturesService } from '../optimization/plan-features/plan-features.service';
import { ExposureMapService } from '../optimization/plan-features/exposure-map.service';
import { ExpectedUtilityService } from '../optimization/probabilistic/expected-utility.service';
import { ProbabilisticWorldModelService } from '../optimization/probabilistic/probabilistic-world-model.service';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../optimization/objective-function.interface';
import { DEFAULT_UNCERTAINTY_CONFIG } from '../optimization/probabilistic/probabilistic-world-model.interface';
import { assessMonteCarloDeterministicAlignment } from '../../trip-constraint-solver/utils/feasibility-mc-alignment.util';
import { normalizeDecisionOsAuditContract } from '../../../agent/contracts/decision-os-audit.contract';

export const BRIDGE_REPLAY_SCHEMA_VERSION = 'v1';

export interface BridgeReplayCaseResult {
  id: string;
  path: 'physical_mc_alignment' | 'planning_workbench_compare';
  title: string;
  elapsedMs: number;
  dominant_cid: string;
  session_consistency_score: number;
  aligned: boolean;
  delta_utility: number;
  delta_reason: string;
  audit_contract_violations: number;
  passed: boolean;
  failureReason?: string;
  details?: Record<string, unknown>;
}

export interface BridgeReplaySuiteReport {
  schemaVersion: typeof BRIDGE_REPLAY_SCHEMA_VERSION;
  generatedAt: string;
  caseCount: number;
  passedCount: number;
  gate: {
    passed: boolean;
    minSessionScore: number;
    failures: string[];
  };
  results: BridgeReplayCaseResult[];
}

const PHYSICAL_INFEASIBLE_WORLD = {
  physical: {
    month: 1,
    countryCode: 'IS',
    ferryStates: [],
    climateSeasonality: { accessibilityScore: 0.55 },
    roadStates: [{ roadId: 'f-road-1', status: 'OPEN', metadata: {} }],
    hazardZones: [{ type: 'AVALANCHE', level: 'HIGH', seasonality: { highRiskMonths: [1, 2, 12] } }],
    demEvidence: [
      {
        segmentId: 'phys-hard-seg',
        elevationProfile: [200, 800, 1200],
        cumulativeAscent: 1800,
        maxSlopePct: 28,
        rollingAscent3DaysM: 3200,
        fatigueIndex: 0.92,
        violation: 'HARD',
        explanation: 'rolling ascent exceeds human capability envelope',
      },
    ],
  },
  human: {
    maxDailyAscentM: 600,
    rollingAscent3DaysM: 1500,
    fitnessLevel: 'MEDIUM',
    riskTolerance: 'LOW',
    preferredPace: 'MODERATE',
    confidenceLevel: 'MEDIUM',
  },
  routeDirection: { id: 'rd-iceland-south', name: 'South Coast', philosophy: {}, constraints: {} },
} as unknown as WorldModelContext;

const PHYSICAL_FEASIBLE_WORLD = {
  physical: {
    month: 6,
    countryCode: 'IS',
    ferryStates: [],
    climateSeasonality: { accessibilityScore: 0.82 },
    roadStates: [{ roadId: 'f-road-1', status: 'OPEN', metadata: {} }],
    hazardZones: [],
    demEvidence: [
      {
        segmentId: 'phys-ok-seg',
        elevationProfile: [100, 220, 280],
        cumulativeAscent: 280,
        maxSlopePct: 8,
        rollingAscent3DaysM: 500,
        fatigueIndex: 0.25,
        violation: 'NONE',
        explanation: 'within envelope',
      },
    ],
  },
  human: {
    maxDailyAscentM: 900,
    rollingAscent3DaysM: 2500,
    fitnessLevel: 'MEDIUM',
    riskTolerance: 'MEDIUM',
    preferredPace: 'MODERATE',
    confidenceLevel: 'MEDIUM',
  },
  routeDirection: { id: 'rd-iceland-south', name: 'South Coast', philosophy: {}, constraints: {} },
} as unknown as WorldModelContext;

const PHYSICAL_INFEASIBLE_PLAN: RoutePlanDraft = {
  tripId: 'replay-phys-hard',
  routeDirectionId: 'rd-iceland-south',
  segments: [
    { segmentId: 'phys-hard-seg', dayIndex: 0, distanceKm: 42, ascentM: 1800, slopePct: 22 },
    { segmentId: 'phys-hard-seg-2', dayIndex: 1, distanceKm: 38, ascentM: 1400, slopePct: 18 },
  ],
};

const PHYSICAL_FEASIBLE_PLAN: RoutePlanDraft = {
  tripId: 'replay-phys-ok',
  routeDirectionId: 'rd-iceland-south',
  segments: [
    { segmentId: 'phys-ok-seg', dayIndex: 0, distanceKm: 12, ascentM: 280, slopePct: 6 },
    { segmentId: 'phys-ok-seg-2', dayIndex: 1, distanceKm: 10, ascentM: 220, slopePct: 5 },
  ],
};

function makeKernelWithGateMap(
  gateBySkeletonId: Record<string, { gateResult: GateResultLike; constraints: ConstraintReport }>,
): DecisionKernelService {
  const mergeMock = (current: DecisionState, patch: Partial<DecisionState>) => ({
    ...current,
    ...patch,
    systemState: { ...(current.systemState ?? {}), ...(patch.systemState ?? {}) },
  });

  const noop = () => undefined;
  const gateEvalExecutor = {
    execute: async (dso: DecisionState) => {
      const rid = String(dso.requestId ?? '');
      const skeletonId = Object.keys(gateBySkeletonId).find((k) => rid.endsWith(`:${k}`)) ?? 'opt_a';
      const mapped = gateBySkeletonId[skeletonId] ?? gateBySkeletonId.opt_a;
      return mapped;
    },
  };

  return new DecisionKernelService(
    { merge: mergeMock, commit: noop, appendHistoryDelta: noop, commitWithLock: noop } as any,
    { getReport: noop, getReportAsync: noop } as any,
    { getHints: noop, getHintsAsync: noop } as any,
    { buildContextPackage: noop } as any,
    { recordDecisionLog: noop, recordUserFeedback: noop } as any,
    undefined,
    gateEvalExecutor as any,
  );
}

function mockPlanState(): PlanState {
  return {
    plan_id: 'plan_replay',
    plan_version: 1,
    constraints: {
      time: { days: 5 },
      budget: { total: 3000, currency: 'USD' },
      fitness: { level: 'medium' },
    },
    itinerary: {
      tripId: 'trip-replay',
      routeDirectionId: 'rd-iceland-south',
      segments: [],
    },
    mobility: { transferSegments: [] },
    budget: {},
    pace: {},
    gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
    evidence_refs: [],
    decision_log_refs: [],
    status: 'DRAFT',
  };
}

function mockSkeleton(id: string, name: string): PlanSkeleton {
  return {
    id,
    name,
    dayThemes: [
      { day: 1, theme: 'Day1', description: 'segment' },
      { day: 2, theme: 'Day2', description: 'segment' },
    ],
    anchors: [],
    transferDays: [],
    rationale: { philosophy: 'test', tradeoffs: [], strengths: [], weaknesses: [] },
  };
}

async function runPhysicalAlignmentCase(input: {
  id: string;
  title: string;
  plan: RoutePlanDraft;
  world: WorldModelContext;
  expectAligned: boolean;
  minSessionScore: number;
}): Promise<BridgeReplayCaseResult> {
  const t0 = Date.now();
  const objective = new ObjectiveFunctionService(new FatigueCalculatorService());
  const planFeatures = new PlanFeaturesService();
  const exposureMap = new ExposureMapService();
  const expectedUtility = new ExpectedUtilityService(planFeatures, exposureMap, objective);
  const pwm = new ProbabilisticWorldModelService(exposureMap);

  const det = objective.evaluate(input.plan, input.world);
  const hardViolationCount = det.constraints.hardViolations.filter((v) => v.violationDegree > 0).length;

  const probCtx = pwm.fromDeterministicModel(input.world, DEFAULT_UNCERTAINTY_CONFIG);
  const mc = expectedUtility.computeExpectedUtility(
    input.plan,
    probCtx,
    DEFAULT_OBJECTIVE_WEIGHTS,
    { sampleSize: 120, seed: 42, deterministicWorld: input.world },
  );

  const alignment = assessMonteCarloDeterministicAlignment(
    { feasibilityProbability: mc.feasibilityProbability, expectedUtility: mc.expectedUtility },
    { totalUtility: det.totalUtility, hardViolationCount },
  );

  const audit = normalizeDecisionOsAuditContract({
    dominant_cid: alignment.dominant_cid,
    session_consistency_score: alignment.session_consistency_score,
    predictive_feedback_then_repair: {
      intent_revision_flag: false,
      drift_vector: {
        delta_reason: alignment.aligned ? 'aligned' : 'mc_det_direction_mismatch',
        delta_utility: alignment.drift_vector.delta_utility,
      },
    },
  });

  const passed =
    alignment.aligned === input.expectAligned &&
    alignment.session_consistency_score >= input.minSessionScore &&
    audit.violations.length === 0;

  return {
    id: input.id,
    path: 'physical_mc_alignment',
    title: input.title,
    elapsedMs: Date.now() - t0,
    dominant_cid: alignment.dominant_cid,
    session_consistency_score: alignment.session_consistency_score,
    aligned: alignment.aligned,
    delta_utility: alignment.drift_vector.delta_utility,
    delta_reason: alignment.aligned ? 'aligned' : 'mc_det_direction_mismatch',
    audit_contract_violations: audit.violations.length,
    passed,
    failureReason: passed
      ? undefined
      : `aligned=${alignment.aligned} score=${alignment.session_consistency_score} hardViolations=${hardViolationCount}`,
    details: {
      feasibilityProbability: mc.feasibilityProbability,
      expectedUtility: mc.expectedUtility,
      totalUtility: det.totalUtility,
      hardViolationCount,
      isFeasible: det.isFeasible,
    },
  };
}

async function runCompareGateReplayCase(): Promise<BridgeReplayCaseResult> {
  const t0 = Date.now();
  const kernel = makeKernelWithGateMap({
    opt_compact: {
      constraints: { feasible: true, violations: [] },
      gateResult: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 0.92,
      },
    },
    opt_intense: {
      constraints: {
        feasible: false,
        violations: [
          {
            type: 'FATIGUE',
            severity: 'HARD',
            degree: 0.85,
            detail: 'rolling ascent exceeds envelope',
            constraint: 'HC_FATIGUE',
          },
        ],
      },
      gateResult: {
        gate_result: 'ADJUST_REQUIRED',
        violations: [
          {
            type: 'FATIGUE',
            severity: 'HARD',
            degree: 0.85,
            detail: 'rolling ascent exceeds envelope',
            constraint: 'HC_FATIGUE',
          },
        ],
        required_adjustments: [{ action: 'REDUCE_PACE', why: '疲劳过高' }],
        confidence: 0.61,
      },
    },
  });

  process.env.PLANNING_WORKBENCH_KERNEL_MODE = 'native';
  const bridge = new PlanningWorkbenchKernelBridgeService(
    kernel,
    undefined,
    undefined,
    undefined,
    { getFlags: () => ({ planningWorkbenchKernelMode: 'native' }) } as any,
  );

  const compare = await bridge.runCompareGateEvalForOptions({
    request: {
      context: {
        destination: { country: 'IS', city: 'Reykjavik' },
        days: 5,
        travelMode: 'self_drive',
      },
      tripId: 'trip-replay-compare',
      userAction: 'compare',
    },
    planState: mockPlanState(),
    options: [mockSkeleton('opt_compact', '紧凑型'), mockSkeleton('opt_intense', '高强度')],
    llmRecommendedOptionId: 'opt_intense',
    requestId: 'replay-compare-1',
  });

  const audit = normalizeDecisionOsAuditContract(compare?.decisionOsAudit);
  const intenseDelta = compare?.optionDeltas.find((d) => d.optionId === 'opt_intense');
  const l3 = intenseDelta?.l3Evidence?.[0];

  const passed =
    compare?.recommendedByGate === 'opt_compact' &&
    compare?.divergesFromLlmRecommendation === true &&
    intenseDelta?.dominantCid === 'HC_FATIGUE' &&
    l3?.cid === 'HC_FATIGUE' &&
    l3?.slack === 0.85 &&
    l3?.limit === 0 &&
    audit.session_consistency_score < 95 &&
    audit.dominant_cid === 'KERNEL_LLM_COMPARE_MISMATCH' &&
    audit.violations.length === 0;

  return {
    id: 'pwb_compare_kernel_injection',
    path: 'planning_workbench_compare',
    title: 'Kernel compare ranks compact over intense with L3 evidence',
    elapsedMs: Date.now() - t0,
    dominant_cid: audit.dominant_cid,
    session_consistency_score: audit.session_consistency_score,
    aligned: false,
    delta_utility: audit.delta_utility,
    delta_reason: audit.delta_reason,
    audit_contract_violations: audit.violations.length,
    passed,
    failureReason: passed ? undefined : JSON.stringify({
      recommendedByGate: compare?.recommendedByGate,
      dominantCid: intenseDelta?.dominantCid,
      l3,
      auditScore: audit.session_consistency_score,
    }),
    details: {
      recommendedByGate: compare?.recommendedByGate,
      llmRecommended: compare?.llmRecommendedOptionId,
      diverges: compare?.divergesFromLlmRecommendation,
      optionDeltas: compare?.optionDeltas.map((d) => ({
        optionId: d.optionId,
        gateStatus: d.gateStatus,
        dominantCid: d.dominantCid,
        l3Evidence: d.l3Evidence,
      })),
    },
  };
}

export async function runBridgeKernelReplaySuite(logger?: Logger): Promise<BridgeReplaySuiteReport> {
  const log = logger ?? new Logger('BridgeKernelReplay');
  const minSessionScore = Number(process.env.BRIDGE_REPLAY_MIN_SESSION_SCORE ?? 95);
  const results: BridgeReplayCaseResult[] = [];

  log.log('Running bridge kernel replay: physical aligned infeasible...');
  results.push(
    await runPhysicalAlignmentCase({
      id: 'physical_hard_infeasible_aligned',
      title: 'DEM HARD + high ascent: MC pessimistic aligns with deterministic',
      plan: PHYSICAL_INFEASIBLE_PLAN,
      world: PHYSICAL_INFEASIBLE_WORLD,
      expectAligned: true,
      minSessionScore,
    }),
  );

  log.log('Running bridge kernel replay: physical aligned feasible...');
  results.push(
    await runPhysicalAlignmentCase({
      id: 'physical_relaxed_feasible_aligned',
      title: 'Relaxed plan: MC optimistic aligns with deterministic',
      plan: PHYSICAL_FEASIBLE_PLAN,
      world: PHYSICAL_FEASIBLE_WORLD,
      expectAligned: true,
      minSessionScore,
    }),
  );

  log.log('Running bridge kernel replay: planning workbench compare + kernel...');
  results.push(await runCompareGateReplayCase());

  const failures: string[] = [];
  for (const r of results) {
    if (!r.passed) failures.push(`${r.id}: ${r.failureReason ?? 'failed'}`);
    if (r.path === 'physical_mc_alignment' && r.session_consistency_score < minSessionScore) {
      failures.push(`${r.id}: session_consistency_score ${r.session_consistency_score} < ${minSessionScore}`);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  return {
    schemaVersion: BRIDGE_REPLAY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    caseCount: results.length,
    passedCount,
    gate: { passed: failures.length === 0, minSessionScore, failures },
    results,
  };
}

/** DSO stub for observability fingerprint (compare path uses real kernel injection). */
export function buildBridgeReplayDsoStub(): DecisionState {
  return {
    requestId: 'bridge-replay-stub',
    userIntent: { destination: 'Iceland', days: 5, mode: 'drive' },
    tripState: {},
    environmentState: { countryCode: 'IS', weatherRisk: 0.35 },
    systemState: { requestId: 'bridge-replay-stub', currentPhase: 'GATE_EVAL' },
  };
}

export function bridgeReplayWorldFingerprint(): string {
  const ctx = dsoToMinimalWorldModelContext(buildBridgeReplayDsoStub());
  return String(ctx?.physical?.month ?? 'na');
}
