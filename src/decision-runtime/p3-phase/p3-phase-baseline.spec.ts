import { summarizeMonitoringDetectorWiring } from '../trigger/monitoring-detector-wiring.catalog';
import { buildEventFingerprint, shouldDedupeEvent } from '../trigger/event-dedup.util';
import { evaluateReplanningTrigger } from '../trigger/replanning-trigger.policy';
import {
  inferWorldEventSeverity,
  shouldRunKernelFullReplan,
  toReplanningTriggerDecision,
} from '../trigger/replanning-trigger-decision.util';
import { buildDecisionTriggerEvent } from '../trigger/decision-trigger-event.types';
import {
  inferInTripEventSeverity,
  shouldDelegateFullReplan,
  shouldRunInTripRecovery,
} from '../trigger/in-trip-replanning.util';
import { selectBoundedRepairCandidate } from '../local-repair/bounded-lns-repair.util';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import { BoundedLnsRepairStrategy } from '../optimization/strategies/bounded-lns-repair.strategy';
import type { OptimizationProblem } from '../contracts/optimization-problem';

describe('MonitoringDetectorWiring catalog', () => {
  it('lists P3 detectors with dispatch and policy_gated entries', () => {
    const summary = summarizeMonitoringDetectorWiring();
    expect(summary.total).toBeGreaterThanOrEqual(8);
    expect(summary.dispatchWired).toBeGreaterThanOrEqual(5);
    expect(summary.policyGated).toBeGreaterThanOrEqual(2);
    expect(summary.wiredCoveragePct).toBe(100);
  });
});

describe('event-dedup.util', () => {
  it('dedupes within cooldown unless severity upgrades', () => {
    const store = new Map();
    const fp = buildEventFingerprint({
      tripId: 't1',
      eventType: 'ROAD_CLOSED',
      source: 'monitoring',
    });
    const now = Date.now();
    expect(shouldDedupeEvent(fp, 'MEDIUM', store, now).dedupe).toBe(false);
    expect(shouldDedupeEvent(fp, 'MEDIUM', store, now + 1000).dedupe).toBe(true);
    expect(shouldDedupeEvent(fp, 'HIGH', store, now + 2000).dedupe).toBe(false);
  });
});

describe('replanning-trigger-decision.util', () => {
  it('maps NO_OP to shouldTrigger=false', () => {
    process.env.REPLANNING_TRIGGER_POLICY_ENABLED = '1';
    const result = evaluateReplanningTrigger({
      tripId: 't1',
      triggerKind: 'CANONICAL_MONITORING_POLL',
      decisionRecordStale: false,
    });
    const decision = toReplanningTriggerDecision(result);
    expect(decision.shouldTrigger).toBe(false);
    expect(decision.strategy).toBe('ADVISORY');
  });

  it('infers HIGH severity for flight_cancelled', () => {
    expect(inferWorldEventSeverity('flight_cancelled')).toBe('HIGH');
  });

  it('skips kernel full replan for LOCAL_REPAIR', () => {
    expect(shouldRunKernelFullReplan('LOCAL_REPAIR')).toBe(false);
    expect(shouldRunKernelFullReplan('FULL_REPLAN')).toBe(true);
  });
});

describe('decision-trigger-event.types', () => {
  it('builds M1 event contract', () => {
    const ev = buildDecisionTriggerEvent({
      eventId: 'e1',
      eventType: 'WEATHER_HAZARD_CHANGED',
      source: 'monitoring',
      tripId: 't1',
    });
    expect(ev.schemaId).toBe('tripnara.decision_trigger_event@v1');
    expect(ev.severity).toBe('MEDIUM');
  });
});

describe('in-trip-replanning.util', () => {
  it('maps ROAD_CLOSED to HIGH severity', () => {
    expect(inferInTripEventSeverity('ROAD_CLOSED')).toBe('HIGH');
  });

  it('runs in-trip for LOCAL_REPAIR and PARTIAL_REPLAN', () => {
    expect(shouldRunInTripRecovery('LOCAL_REPAIR')).toBe(true);
    expect(shouldRunInTripRecovery('PARTIAL_REPLAN')).toBe(true);
    expect(shouldRunInTripRecovery('NO_OP')).toBe(false);
    expect(shouldRunInTripRecovery('FULL_REPLAN')).toBe(false);
  });

  it('delegates FULL_REPLAN to kernel path', () => {
    expect(shouldDelegateFullReplan('FULL_REPLAN')).toBe(true);
    expect(shouldDelegateFullReplan('LOCAL_REPAIR')).toBe(false);
  });

  it('allows force/manual to bypass policy skip', () => {
    expect(shouldRunInTripRecovery('NO_OP', { force: true })).toBe(true);
    expect(shouldRunInTripRecovery('FULL_REPLAN', { manual: true })).toBe(true);
  });
});

describe('bounded-lns-repair.util', () => {
  const base = (overrides: Partial<DecisionCandidate>): DecisionCandidate => ({
    candidateId: 'c1',
    label: 'baseline',
    source: 'LEGACY_TRIP_PLANNING',
    plan: {} as DecisionCandidate['plan'],
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  it('prefers NEPTUNE_REPAIR candidates', () => {
    const repair = base({ candidateId: 'repair', source: 'NEPTUNE_REPAIR' });
    const picked = selectBoundedRepairCandidate([base({ candidateId: 'other' }), repair]);
    expect(picked?.candidateId).toBe('repair');
  });
});

describe('BoundedLnsRepairStrategy', () => {
  it('selects feasible repair candidate when enabled', async () => {
    process.env.BOUNDED_LNS_REPAIR_ENABLED = '1';
    const strategy = new BoundedLnsRepairStrategy();
    const repair = {
      candidateId: 'repair-1',
      label: 'neptune repair',
      source: 'NEPTUNE_REPAIR' as const,
      plan: {} as DecisionCandidate['plan'],
      createdAt: new Date().toISOString(),
    };
    const problem: OptimizationProblem = {
      schemaId: 'tripnara.optimization_problem@v1',
      problemId: 'p1',
      tripId: 't1',
      snapshotId: 's1',
      createdAt: new Date().toISOString(),
      snapshot: {
        schemaId: 'tripnara.canonical_world_state_snapshot@v1',
        snapshotId: 's1',
        tripId: 't1',
        revision: '1',
        createdAt: new Date().toISOString(),
        weather: [],
        roads: [],
        hazards: [],
        ferries: [],
        poiStates: [],
        travelMatrix: { matrixId: 'm1', entries: [] },
        completeness: {
          roads: 'COMPLETE',
          weather: 'COMPLETE',
          hazards: 'COMPLETE',
          ferries: 'COMPLETE',
          openingHours: 'COMPLETE',
        },
        sourceVersions: [],
      },
      profile: {
        phase: 'EXECUTION',
        poiCount: 1,
        dayCount: 1,
        memberCount: 1,
        enabledObjectiveCount: 1,
        disruptionScope: 'LOCAL',
        dataCompleteness: 1,
      },
      objectiveProfile: {
        registryVersion: 'objectives@v1',
        enabledObjectives: ['daily_driving_load'],
      },
      candidates: [repair],
      constraintReport: {
        schemaId: 'tripnara.canonical_constraint_report@v1',
        tripId: 't1',
        evaluatedAt: new Date().toISOString(),
        assertions: [],
        completeness: {
          roads: 'COMPLETE',
          weather: 'COMPLETE',
          hazards: 'COMPLETE',
          ferries: 'COMPLETE',
          openingHours: 'COMPLETE',
        },
        overallStatus: 'FEASIBLE',
        degraded: false,
        degradedReasons: [],
      },
      mandatoryEvaluations: [],
      objectiveRegistryVersion: 'v1',
      constraintPolicyVersion: 'v1',
    };

    const result = await strategy.solve(problem, { timeLimitMs: 1000 });
    expect(result.recommendedCandidateId).toBe('repair-1');
    expect(result.solver.strategyId).toBe('bounded-lns-repair');
    delete process.env.BOUNDED_LNS_REPAIR_ENABLED;
  });
});
