import { projectCgusOptimizationPolicy } from './project-cgus-optimization-policy.util';
import {
  applyCgusHardConstraintsToCandidates,
  scoreCandidatePreferenceAgainstPolicy,
} from './apply-cgus-optimization-policy.util';
import type { CGUSCandidate } from './cgus-search.service';
import { projectCgusDecisionTraceFromSearchResult } from './cgus-decision-trace.util';

describe('projectCgusOptimizationPolicy', () => {
  it('projects hard vehicle/F-road + soft principles + authority excluded from scoring', () => {
    const policy = projectCgusOptimizationPolicy({
      tripId: 'trip-1',
      constraintsVersion: 3,
      metadata: {
        travelDecisionContract: {
          objectives: {
            rankedPrinciples: ['PACE', 'SAFETY', 'BUDGET'],
            version: 2,
          },
          changeStrategy: {
            archetype: 'CONSERVATIVE',
            tolerances: { maxPoiRemovals: 1, maxBudgetOverrunPct: 5 },
          },
          automation: {
            defaultLevel: 'SUGGEST',
            autoAllowed: [],
            confirmationRequired: ['reroute'],
          },
          automationPaused: false,
        },
        constraints: { vehicle_type: '2WD', fRoadAllowed: false, maxDailyDriveHours: 5 },
        icelandSelfDrive: {
          drivingSettings: {
            vehicle: { is4wd: false },
            routePreferences: { pacePreference: 'easy', fRoadPreference: 'avoid' },
          },
        },
      },
    });

    expect(policy.schemaId).toBe('tripnara.cgus_optimization_policy@v1');
    expect(policy.contractVersion).toBe(3);
    expect(policy.policySource).toBe('travel_decision_contract');
    expect(policy.hardConstraints.some((h) => h.kind === 'VEHICLE_TYPE')).toBe(true);
    expect(policy.hardConstraints.some((h) => h.kind === 'F_ROAD_FORBIDDEN')).toBe(true);
    expect(policy.hardConstraints.some((h) => h.kind === 'MAX_DAILY_DRIVE_HOURS')).toBe(true);
    expect(policy.hardConstraints.some((h) => h.kind === 'CHANGE_STRATEGY_CAP')).toBe(true);
    expect(policy.softObjectives[0]).toMatchObject({ kind: 'PACE', intensity: 'HIGH' });
    expect(policy.scoringHints.densityPreference).toBe('relaxed');
    expect(policy.executionAuthority.scoringExcluded).toBe(true);
    expect(policy.executionAuthority.confirmationRequired).toContain('reroute');
  });

  it('marks F-road candidates infeasible under F_ROAD_FORBIDDEN', () => {
    const policy = projectCgusOptimizationPolicy({
      tripId: 't',
      metadata: { constraints: { vehicle_type: '2WD', fRoadAllowed: false } },
    });
    const candidates: CGUSCandidate[] = [
      {
        id: 'ok',
        feasible: true,
        constraintViolations: [],
        plan: { tripId: 't', routeDirectionId: 'r', segments: [] } as any,
      },
      {
        id: 'froad',
        feasible: true,
        constraintViolations: [],
        plan: {
          tripId: 't',
          routeDirectionId: 'r',
          segments: [{ segmentId: 's1', metadata: { fRoad: true, type: 'DRIVE' } }],
        } as any,
      },
    ];
    const next = applyCgusHardConstraintsToCandidates(candidates, policy);
    expect(next[0].feasible).toBe(true);
    expect(next[1].feasible).toBe(false);
    expect(next[1].constraintViolations.some((v) => v.type === 'F_ROAD_FORBIDDEN')).toBe(true);
  });

  it('boosts relaxed candidates via preferenceScore without rewriting weights', () => {
    const score = scoreCandidatePreferenceAgainstPolicy(
      {
        id: 'plan-relaxed-pace',
        feasible: true,
        constraintViolations: [],
        plan: { tripId: 't', routeDirectionId: 'r', segments: [] } as any,
      },
      { densityPreference: 'relaxed', fatigueSensitivity: 0.8 },
    );
    const dense = scoreCandidatePreferenceAgainstPolicy(
      {
        id: 'plan-high-density',
        feasible: true,
        constraintViolations: [],
        plan: { tripId: 't', routeDirectionId: 'r', segments: [] } as any,
      },
      { densityPreference: 'relaxed', fatigueSensitivity: 0.8 },
    );
    expect(score).toBeGreaterThan(dense);
  });

  it('trace carries policy provenance', () => {
    const trace = projectCgusDecisionTraceFromSearchResult({
      decision_id: 'd1',
      trip_id: 't1',
      decision_type: 'OPTIMIZE',
      result: {
        recommended: { id: 'A', plan: {} as any, constraintViolations: [], feasible: true },
        usedMonteCarlo: false,
        rankedCandidates: [
          {
            candidate: { id: 'A', plan: {} as any, constraintViolations: [], feasible: true },
            utility: 0.7,
            expectedUtility: 0.7,
          },
        ],
      } as any,
      policyProvenance: {
        contractVersion: 2,
        policyVersion: 1,
        policySource: 'travel_decision_contract',
        effectiveConstraints: ['hard:f_road_forbidden'],
        effectiveObjectives: ['PACE:HIGH'],
        executionAuthorityExcludedFromScoring: true,
      },
    });
    expect(trace.contractVersion).toBe(2);
    expect(trace.policySource).toBe('travel_decision_contract');
    expect(trace.effectiveConstraints).toEqual(['hard:f_road_forbidden']);
    expect(trace.executionAuthorityExcludedFromScoring).toBe(true);
  });
});
