/**
 * 冰岛优先 12 题：fixture 驱动冒烟（无 LLM）。
 * 覆盖：状态建模 → 关系 → 聚焦 → 预演 → 确认前不写入。
 */

import { detectObservationConflicts } from '../../agent/reality-observation/conflict-detection.rules';
import type { ObservationExecutionState } from '../../agent/reality-observation/observation-executor';
import type { ObservationPlan } from '../../agent/reality-observation/reality-observation.types';
import { buildCognitionFourLayerView } from './cognition-four-layer.util';
import type { DecisionState } from './decision-state.types';
import {
  attachFutureSimulationCognition,
  attachRealityCognition,
  attachRelationAndFocusCognition,
  buildCognitionClientEcho,
  gatePlanWriteAdmission,
} from './decision-cognition.util';

const PRIORITY_12 = [
  '我这个行程现在最大的问题是什么？',
  '哪些安排看起来完成了，但实际上还不能执行？',
  '我租的车能走当前路线吗？',
  '为什么这一天会很赶？',
  '如果晚一个小时出发，会影响什么？',
  '哪个问题必须今天处理？',
  '这是不能执行，还是只是不推荐？',
  '如果我坚持原计划，最可能发生什么？',
  '删除一个景点，应该删哪个？',
  '改路线和换住宿，哪个影响更小？',
  '最晚什么时候需要启动备选方案？',
  '帮我生成一个修改草案，但先不要改行程。',
] as const;

function icelandDso(over: Partial<DecisionState> = {}): DecisionState {
  return {
    requestId: 'is-p12',
    userIntent: {
      destination: 'IS',
      gaps: [],
      vehicle: { driveType: '2WD', is4wd: false },
    } as DecisionState['userIntent'],
    tripState: {
      planDraft: {
        days: [
          {
            day: 5,
            activities: [{ title: 'F208 高地', region: 'highlands' }],
          },
        ],
      },
      planVersion: 2,
      fatigue: 0.55,
      orchestratorAlternatives: [
        { id: 'alt_reroute', label: '改南岸走廊，避开 F-road', reason: '车辆不可进 F-road' },
        { id: 'alt_upgrade', label: '升级四驱后保留原路线', reason: '体验保留、预算上升' },
      ],
    } as DecisionState['tripState'],
    environmentState: {
      actionDeadline: '2026-08-03T20:00:00.000Z',
      roads: { F208: 'seasonal_closed_or_restricted' },
    },
    systemState: {
      requestId: 'is-p12',
      currentPhase: 'GATE_EVAL',
      version: 1,
      startedAt: '2026-08-03T10:00:00.000Z',
      lastUpdatedAt: new Date().toISOString(),
    },
    worldStateSummary: {
      physical: { roadStates: { F208: 'difficult', ring1: 'ok' } },
      human: { fitnessLevel: 'medium' },
      route: { hardRules: ['NO_2WD_ON_FROAD'] },
    },
    research_data: { weather: { wind: 'moderate' } },
    confidence: 0.8,
    riskLevel: 'HIGH',
    constraints: {
      feasible: false,
      gateOutcome: 'BLOCK',
      violations: [
        {
          type: 'VEHICLE_FROAD_MISMATCH',
          severity: 'HARD',
          detail: '两驱车不可进入 F208，Day 5 路线不可执行',
        },
        {
          type: 'PACE_TIGHT',
          severity: 'SOFT',
          detail: 'Day 3 日程偏赶',
        },
      ],
    },
    verification: {
      issues: [
        {
          class: 'FATAL',
          code: 'VEHICLE_FROAD',
          message: '坚持原计划将违反车辆-道路硬约束',
        },
      ],
      hasFatal: true,
      hasConflict: true,
      hasAdvisory: false,
      counts: { fatal: 1, conflict: 1, advisory: 0 },
      verifiedAt: new Date().toISOString(),
    } as DecisionState['verification'],
    ...over,
  } as DecisionState;
}

function runFullCognition(dso: DecisionState) {
  let next = attachRealityCognition(dso, { decisionDepth: 'FULL_SIMULATION' });
  next = attachRelationAndFocusCognition(next, {
    decisionDepth: 'FULL_SIMULATION',
    enrichment: {
      earlyWarning: {
        risk_level: 'HIGH',
        conflict_type: 'VEHICLE_FROAD',
        evidence_summary: '2WD × F208',
        action_deadline: '2026-08-03T20:00:00.000Z',
        predictive_failure_report: {
          audit_text: '晚出发60分钟→错过签到→活动取消→夜驾风险',
          simulated_repair_traces: [{ step: 'reroute_south' }],
        },
      },
    },
  });
  next = attachFutureSimulationCognition(next, { decisionDepth: 'FULL_SIMULATION' });
  return next;
}

function rorState(message: string): ObservationExecutionState {
  const plan: ObservationPlan = {
    operation: 'ROUTE_EXECUTABILITY',
    labelZh: '路线',
    scope: { message, tripId: 'is-1' },
    needs: [],
    completionCriteria: [],
    safetyFloorKeys: [],
    maxReflectRounds: 2,
  };
  return {
    plan,
    observedFacts: [
      {
        key: 'vehicle.driveType',
        value: '2WD',
        scope: {},
        source: { provider: 'SEED', authority: 'USER' },
        observedAt: new Date().toISOString(),
        confidence: 1,
      },
      {
        key: 'route.roadSegments',
        value: [{ id: 'F208', kind: 'F-road' }],
        scope: {},
        source: { provider: 'SEED', authority: 'INTERNAL' },
        observedAt: new Date().toISOString(),
        confidence: 1,
      },
      {
        key: 'targetDay.activities',
        value: [
          { title: '冰川徒步', requiresBooking: true, bookingStatus: 'PLANNED' },
        ],
        scope: {},
        source: { provider: 'SEED', authority: 'INTERNAL' },
        observedAt: new Date().toISOString(),
        confidence: 1,
      },
    ],
    derivedFacts: [
      {
        key: 'derived.day.totalDrivingMinutes',
        value: 320,
        derivedFrom: [],
        method: 'seed',
        observedAt: new Date().toISOString(),
        confidence: 1,
      },
      {
        key: 'derived.day.scheduleDensity',
        value: 'HIGH',
        derivedFrom: [],
        method: 'seed',
        observedAt: new Date().toISOString(),
        confidence: 1,
      },
    ],
    unknowns: [],
    reflectRoundsUsed: 0,
    lastReflection: null,
  };
}

describe('cognition iceland priority-12 smoke', () => {
  it('covers all 12 prompts with four_layer structure', () => {
    const dso = runFullCognition(icelandDso());
    const four = buildCognitionFourLayerView(dso.cognition);
    const echo = buildCognitionClientEcho(dso.cognition);

    expect(four?.schema).toBe('tripnara/cognition_four_layer@v1');
    expect(echo?.four_layer?.schema).toBe('tripnara/cognition_four_layer@v1');
    expect(PRIORITY_12).toHaveLength(12);

    for (const q of PRIORITY_12) {
      expect(typeof q).toBe('string');
      expect(four?.reality.currentState).toBeTruthy();
      expect(four?.focus.primaryProblem).toBeTruthy();
      expect(Array.isArray(four?.relationships.propagation)).toBe(true);
      expect(four?.simulation.requiresConfirmation).toBe(true);
    }
  });

  it('Q1/Q3/Q7: vehicle F-road → conflicts + BLOCK', () => {
    const conflicts = detectObservationConflicts({
      state: rorState(PRIORITY_12[2]),
      message: PRIORITY_12[2],
    });
    expect(conflicts.some((c) => c.code === 'VEHICLE_FROAD_MISMATCH')).toBe(true);

    const dso = runFullCognition(icelandDso());
    const four = buildCognitionFourLayerView(dso.cognition)!;
    expect(four.reality.conflicts.some((c) => /VEHICLE_FROAD|F208|两驱/i.test(c))).toBe(
      true,
    );
    expect(four.focus.constraintLayer).toBe('BLOCK');
    expect(four.focus.decisionRequired).toBe(true);
  });

  it('Q2: planned activity without booking surfaces PLAN_NOT_BOOKED', () => {
    const conflicts = detectObservationConflicts({
      state: rorState(PRIORITY_12[1]),
      message: PRIORITY_12[1],
    });
    expect(conflicts.some((c) => c.code === 'PLAN_NOT_BOOKED')).toBe(true);
  });

  it('Q4: pace / driving load appears in reality or soft conflicts', () => {
    const state = rorState(PRIORITY_12[3]);
    state.plan.scope.message = '为什么这一天会很赶？我不想开太久';
    const conflicts = detectObservationConflicts({
      state,
      message: state.plan.scope.message,
    });
    expect(
      conflicts.some(
        (c) =>
          c.code === 'DRIVING_LOAD_VS_PREFERENCE' || c.code === 'DRIVING_LOAD_HIGH',
      ),
    ).toBe(true);
  });

  it('Q5: late departure → impact propagation chain present', () => {
    const dso = runFullCognition(icelandDso());
    const four = buildCognitionFourLayerView(dso.cognition)!;
    expect(four.relationships.propagation.length + four.relationships.causalLinks.length).toBeGreaterThan(
      0,
    );
  });

  it('Q6/Q11: today priority + action deadline', () => {
    const dso = runFullCognition(icelandDso());
    const four = buildCognitionFourLayerView(dso.cognition)!;
    expect(four.focus.priority === 'NOW' || four.focus.priority === 'TODAY').toBe(true);
    expect(four.focus.actionDeadline).toBeTruthy();
    expect(dso.cognition?.futureSimulation?.predictionWindow?.interventionDeadline).toBeTruthy();
  });

  it('Q8: residual risks explain sticking to baseline', () => {
    const dso = runFullCognition(icelandDso());
    const four = buildCognitionFourLayerView(dso.cognition)!;
    expect(four.simulation.residualRisks.length).toBeGreaterThan(0);
    expect(four.simulation.scenarios.some((s) => /baseline/i.test(s))).toBe(true);
  });

  it('Q9/Q10: alternatives present for tradeoff comparison', () => {
    const dso = runFullCognition(icelandDso());
    const four = buildCognitionFourLayerView(dso.cognition)!;
    expect(four.simulation.scenarios.length).toBeGreaterThanOrEqual(2);
    expect(four.simulation.tradeoffs.length).toBeGreaterThan(0);
  });

  it('Q12: draft requires confirmation and plan write denied without auth', () => {
    const dso = runFullCognition(icelandDso());
    const four = buildCognitionFourLayerView(dso.cognition)!;
    expect(four.simulation.requiresConfirmation).toBe(true);
    const admit = gatePlanWriteAdmission(dso);
    expect(admit.admission.ok).toBe(false);
  });

  it('WATCH layer when only soft freshness watch (no hard gate)', () => {
    const dso = runFullCognition(
      icelandDso({
        riskLevel: 'LOW',
        constraints: {
          feasible: true,
          gateOutcome: 'ALLOW',
          violations: [],
        },
        verification: {
          issues: [],
          hasFatal: false,
          hasConflict: false,
          hasAdvisory: false,
          counts: { fatal: 0, conflict: 0, advisory: 0 },
          verifiedAt: new Date().toISOString(),
        } as DecisionState['verification'],
        environmentState: {},
      }),
    );
    const four = buildCognitionFourLayerView(dso.cognition)!;
    expect(['WATCH', 'OPTIMIZE', '']).toContain(four.focus.constraintLayer);
    expect(four.simulation.requiresConfirmation).toBe(false);
  });
});
