/**
 * Iceland Elderly + F208 CGUS Evolution — 三演进线集成 harness。
 *
 * Party Aggregation → CGUS Subgraph Preflight → Causal Narrative
 * 供 integration / golden-path 测试复用（纯函数 + 可注入 Nest 服务）。
 */
import type { CGUSCandidate, CGUSSearchResult } from '../../trips/decision/optimization/cgus-search.service';
import type { DecisionState, OptimizationHints } from '../../decision/kernel/decision-state.types';
import type { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import type { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { EXPERIENCE_FLOW_SCHEMA_V1 } from '../../trips/decision/models/experience-flow.model';
import { createHumanCapabilityModelFromProfile } from '../../trips/decision/models/human-capability.model';
import {
  enrichWorldModelWithPartyAggregation,
  projectPartyPersonasFromTripRequest,
} from '../../trips/decision/persona/project-party-from-request.util';
import { runCgusSubgraphPreflight } from '../../trips/decision/constraint-graph/cgus-subgraph-preflight.util';
import { compileCausalNarrative } from '../../trips/decision/narration/causal-narrative-compiler.service';
import type { CausalNarrativeCompileResult } from '../../trips/decision/narration/causal-chain.types';

export const ICELAND_F208_ROAD_ID = 'F208';
export const ICELAND_EVOLUTION_MONTH = 10;

/** Anchor A — 带父母冰岛：world.buildContext 等价物 */
export function buildIcelandElderlyWorldContext(): WorldModelContext {
  const baseHuman = createHumanCapabilityModelFromProfile('primary-solo', {
    pace: 'normal',
    fitness: 'medium',
    riskTolerance: 'medium',
  });

  const baseWorld: WorldModelContext = {
    physical: {
      demEvidence: [
        {
          segmentId: 'seg-f208-approach',
          elevationProfile: [100, 180, 240],
          cumulativeAscent: 140,
          maxSlopePct: 8,
          rollingAscent3Days: 320,
          fatigueIndex: 18,
          violation: 'NONE',
          explanation: 'F208 approach stub',
        },
      ],
      roadStates: [
        {
          roadId: ICELAND_F208_ROAD_ID,
          status: 'SEASONAL',
          requires4x4: true,
          seasonOpenFrom: 6,
          seasonOpenTo: 9,
        },
      ],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: ICELAND_EVOLUTION_MONTH,
    },
    human: baseHuman,
    routeDirection: {
      id: 'is-ring-road',
      countryCode: 'IS',
      name: 'Iceland Ring',
      nameCN: '冰岛环岛',
      nameEN: 'Iceland Ring',
      tags: ['f-road'],
    },
  };

  const personas = projectPartyPersonasFromTripRequest({
    party: { count: 2, has_elderly: true, fitness_level: 'medium' },
    party_profile: { risk_tolerance: 'LOW' },
  });

  return enrichWorldModelWithPartyAggregation(baseWorld, personas, {
    date: '2026-10-15',
  });
}

/** Anchor B — F208 段 CGUS 候选 */
export function buildIcelandF208CgusCandidates(tripId = 'iceland-elderly-e2e'): CGUSCandidate[] {
  const f208Segment = {
    segmentId: 'seg-f208',
    dayIndex: 2,
    distanceKm: 48,
    ascentM: 120,
    slopePct: 8,
    graphRelations: {
      fromPlaceId: `road:${ICELAND_F208_ROAD_ID}`,
      graphNodeId: 'seg:seg-f208',
    },
  };

  const ringSegment = {
    segmentId: 'seg-ring-paved',
    dayIndex: 1,
    distanceKm: 90,
    ascentM: 80,
    slopePct: 4,
    graphRelations: {
      fromPlaceId: 'place:reykjavik',
      graphNodeId: 'seg:seg-ring-paved',
    },
  };

  return [
    {
      id: 'plan-f208-direct',
      feasible: true,
      constraintViolations: [],
      plan: {
        tripId,
        routeDirectionId: 'is-ring-road',
        segments: [ringSegment, f208Segment],
      },
    },
    {
      id: 'plan-ring-only',
      feasible: true,
      constraintViolations: [{ type: 'EXPERIENCE_DENSITY_LOW', severity: 'SOFT', degree: 0.35 }],
      plan: {
        tripId,
        routeDirectionId: 'is-ring-road',
        segments: [ringSegment],
      },
    },
  ];
}

export type EvolutionPreflightResult = ReturnType<typeof runCgusSubgraphPreflight>;

/** Anchor B — CGUS 子图 preflight（演进线 1） */
export function runEvolutionCgusPreflightPhase(
  world: WorldModelContext,
  candidates = buildIcelandF208CgusCandidates(),
): EvolutionPreflightResult {
  return runCgusSubgraphPreflight({
    worldContext: world,
    candidates,
    month: ICELAND_EVOLUTION_MONTH,
    vehicleType: '2WD',
    perturbation: {
      closedNodeIds: [`road:${ICELAND_F208_ROAD_ID}`],
      edgeDelayMinutes: {
        'connects:place:reykjavik:seg:seg-ring-paved': 25,
      },
    },
  });
}

/** Neptune F208 规避 + CGUS 判决书决策日志 */
export function buildEvolutionDecisionLogs(): DecisionLogEntry[] {
  return [
    {
      persona: 'NEPTUNE',
      action: 'REPLACE',
      explanation: '规避 F208 非铺装颠簸路段（10 月季节性关闭 + 2WD 不可通行）',
      reasonCodes: ['F_ROAD_CLOSED', 'SEASONAL_CLOSURE'],
      timestamp: '2026-10-15T09:00:00Z',
      decisionSource: 'PHYSICAL',
      decisionStage: 'SPATIAL_REPAIR',
    },
    {
      persona: 'DR_DRE',
      action: 'ADJUST',
      explanation: '派对木桶：父母体能主导，日移动上限收紧至 16km',
      reasonCodes: ['PARTY_RHYTHM_TDM'],
      timestamp: '2026-10-15T09:05:00Z',
      decisionSource: 'HUMAN',
      decisionStage: 'PACE_ADJUST',
    },
  ];
}

export function buildEvolutionOptimizationHints(
  preflight: EvolutionPreflightResult,
  chosenPlanId = 'plan-ring-only',
): OptimizationHints {
  return {
    method: 'CGUS',
    recommendedAlternativeId: chosenPlanId,
    decisionVerdict: {
      chosen_plan_id: chosenPlanId,
      rejected_plans: [
        {
          id: 'plan-f208-direct',
          status: 'infeasible',
          rejection_reasons: ['HARD:F_ROAD_SEASONAL', 'SOFT:GLOBAL_SUBGRAPH_CASCADE_DELAY'],
          hard_violation_count: 1,
        },
      ],
      monte_carlo_summary: { used: true, total_samples: 500 },
    },
    worldConstraintMaterialization: {
      appliedEvents: 0,
      roadIds: [ICELAND_F208_ROAD_ID],
      weatherDates: [],
      storeVersion: 0,
      globalSubgraphNodeCount: preflight.stats.nodeCount,
      globalSubgraphEdgeCount: preflight.stats.edgeCount,
      globalSubgraphPrunedNodes: preflight.prunedNodeIds.length,
    },
    metaDecisionAudit: `META_BUDGET(sample=200,cand=2,monteCarlo=1,mcTotal=500,gsg=${preflight.stats.nodeCount}/${preflight.stats.edgeCount})`,
  };
}

/** PR-1 — CGUS/MC 双降级后的 HEURISTIC hints（含 fallback_chain） */
export function buildHeuristicDegradationHints(): OptimizationHints {
  return {
    method: 'HEURISTIC',
    recommendedAlternativeId: 'heuristic-current',
    decisionVerdict: {
      chosen_plan_id: 'heuristic-current',
      rejected_plans: [],
      fallback_chain: [
        { step: 'cgus_search', reason: 'cgus_exception:simulated failure', timestamp: '2026-10-15T09:10:00Z' },
        { step: 'monte_carlo_gate', reason: 'monte_carlo_gate_false', timestamp: '2026-10-15T09:10:01Z' },
      ],
    },
  };
}

/** Anchor C — 因果叙事编译（演进线 3） */
export function runEvolutionCausalNarrativePhase(
  hints: OptimizationHints,
  logs = buildEvolutionDecisionLogs(),
): CausalNarrativeCompileResult {
  const compiled = compileCausalNarrative({
    decisionLogs: logs,
    optimizationHints: hints,
    partyNoteZh: '我们注意到您带着父母同行，已在体能与路况校验中采用更保守的物理门槛。',
  });
  if (!compiled) {
    throw new Error('runEvolutionCausalNarrativePhase: compileCausalNarrative returned undefined');
  }
  return compiled;
}

/** 构建带 party worldModel 的 DSO（供 OptimizationEngineAdapter 集成测试） */
export function buildEvolutionDecisionState(
  world: WorldModelContext,
  hints?: OptimizationHints,
): DecisionState {
  return {
    userIntent: {
      destination: 'Iceland',
      days: 5,
      dateRange: { startDate: '2026-10-12', endDate: '2026-10-17' },
      party: { count: 2, has_elderly: true },
    },
    tripState: {
      planDraft: {
        request_id: 'iceland-elderly-e2e',
        days: [
          {
            date: '2026-10-13',
            items: [
              {
                id: 'd1-a',
                type: 'POI',
                start_window: '09:00',
                end_window: '12:00',
                location_ref: { place_id: 'reykjavik', name: 'Reykjavik' },
              },
              {
                id: 'd1-b',
                type: 'DRIVE',
                start_window: '13:00',
                end_window: '17:00',
                location_ref: { place_id: 'f208', name: 'F208 Highland' },
              },
            ],
          },
        ],
      },
    },
    environmentState: {
      countryCode: 'IS',
      month: ICELAND_EVOLUTION_MONTH,
      routeDirectionId: 'is-ring-road',
      windSpeedMs: 22,
    },
    constraints: { feasible: true, violations: [] },
    research_data: { worldModel: world },
    optimizationHints: hints,
    systemState: {
      requestId: 'iceland-elderly-e2e',
      version: 1,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    },
    requestId: 'iceland-elderly-e2e',
  } as DecisionState;
}

export function assertPartyAggregationBarrel(world: WorldModelContext): void {
  expect(world.partyAggregation).toBeDefined();
  expect(world.partyPersonas?.length).toBeGreaterThanOrEqual(2);
  expect(world.human.maxDailyAscentM).toBeLessThanOrEqual(250);
  expect(world.human.maxSlopePct).toBeLessThanOrEqual(12);
  expect(world.experienceFlow?.tempo).toBe('EMPATHY_RECOVERY');
  expect(world.experienceFlow?.schemaVersion).toBe(EXPERIENCE_FLOW_SCHEMA_V1);
}

export function assertCgusPreflightArtifacts(preflight: EvolutionPreflightResult): void {
  expect(preflight.stats.nodeCount).toBeGreaterThan(0);
  expect(preflight.worldContext.subgraphExtraction?.stats.nodeCount).toBeGreaterThan(0);
  expect(preflight.prunedNodeIds.length).toBeGreaterThan(0);
  expect(preflight.prunedNodeIds.some((id) => /f208/i.test(id))).toBe(true);
}

export function assertCausalNarrativeArtifacts(compiled: CausalNarrativeCompileResult): void {
  expect(compiled.chain.monteCarloSampleCount).toBe(500);
  expect(compiled.chain.nodes.some((n) => n.kind === 'PERSONA_REPAIR')).toBe(true);
  expect(compiled.deterministicSummaryZh).toMatch(/F208|路况|规避/);
  expect(compiled.structuredContextJson).toContain('causal-narrative-context/v1');
}

/** 模拟 CGUS search 返回：ring-only 胜出 */
export function mockCgusSearchResult(candidates: CGUSCandidate[]): CGUSSearchResult {
  const ranked = candidates.map((c, i) => ({
    candidate: c,
    utility: c.id === 'plan-ring-only' ? 0.88 : 0.42,
    expectedUtility: c.id === 'plan-ring-only' ? 0.86 : 0.38,
    feasibilityProbability: c.id === 'plan-ring-only' ? 0.94 : 0.31,
  }));
  ranked.sort((a, b) => (b.expectedUtility ?? 0) - (a.expectedUtility ?? 0));
  return {
    rankedCandidates: ranked,
    recommended: ranked[0]?.candidate,
    usedMonteCarlo: true,
    usedRollout: false,
    usedExploration: false,
    monteCarloSamplingDetails: { totalSamples: 500, samplesPerCandidate: { 'plan-ring-only': 280, 'plan-f208-direct': 220 } },
  } as CGUSSearchResult;
}
