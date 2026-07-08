import { assembleOptimizationProblem } from '../../../decision-runtime/core/optimization-problem-assembler.util';
import type { CanonicalWorldStateSnapshot } from '../../../decision-runtime/contracts/world-state-snapshot';
import type { CanonicalConstraintReport } from '../../../decision-runtime/constraints/contracts/canonical-constraint-report';
import { buildObjectiveProfileFromCanonicalWeights } from '../../../decision-runtime/objectives/objective-semantics.registry';
import { resolveObjectiveProfileFromTripMetadata } from './travel-decision-contract-runtime.util';
import { applyAutomationPolicyToResolutionMode } from './automation-resolution-policy.util';
import { resolveFeasibilityIssueResolution } from './feasibility-resolution-mode.util';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';

function issue(partial: Partial<FeasibilityIssueDto> & Pick<FeasibilityIssueDto, 'id' | 'message'>): FeasibilityIssueDto {
  return {
    priority: 'suggest_adjust',
    category: 'schedule',
    title: partial.message.slice(0, 40),
    affectedDays: [1],
    severity: 'medium',
    ...partial,
    message: partial.message,
    id: partial.id,
  };
}

describe('travel-decision-contract-runtime.util', () => {
  it('resolveObjectiveProfileFromTripMetadata applies ranked principles to weights', () => {
    const profile = resolveObjectiveProfileFromTripMetadata({
      tripId: 'trip-1',
      metadata: {
        travelDecisionContract: {
          objectives: {
            rankedPrinciples: ['BUDGET', 'SAFETY', 'PACE'],
            version: 1,
          },
        },
      },
    });

    expect(profile.weights?.budget_deviation).toBeGreaterThan(0);
    expect(profile.enabledObjectives).toContain('budget_deviation');
  });

  it('assembleOptimizationProblem uses tripMetadata objective weights', () => {
    const snapshot: CanonicalWorldStateSnapshot = {
      schemaId: 'tripnara.canonical_world_state@v1',
      snapshotId: 'ws_test',
      tripId: 'trip-1',
      capturedAt: new Date().toISOString(),
      worldRevision: 'wr_1',
      completeness: {
        roads: 'PARTIAL',
        weather: 'PARTIAL',
        hazards: 'MISSING',
        ferries: 'MISSING',
        openingHours: 'MISSING',
      },
      assertions: [],
    };
    const emptyReport: CanonicalConstraintReport = {
      schemaId: 'tripnara.canonical_constraint_report@v1',
      tripId: 'trip-1',
      evaluatedAt: new Date().toISOString(),
      assertions: [],
      completeness: snapshot.completeness,
      overallStatus: 'UNVERIFIED',
      degraded: false,
      degradedReasons: [],
    };

    const problem = assembleOptimizationProblem({
      tripId: 'trip-1',
      snapshot,
      candidates: [
        {
          candidateId: 'c1',
          label: 'A',
          source: 'LEGACY_TRIP_PLANNING',
          plan: { version: '1', createdAt: new Date().toISOString(), days: [] },
          createdAt: new Date().toISOString(),
        },
      ],
      constraintReportsByCandidateId: { c1: emptyReport },
      worldState: { context: { partySize: 2 } } as any,
      context: {
        tripId: 'trip-1',
        tripMetadata: {
          travelDecisionContract: {
            objectives: {
              rankedPrinciples: ['CORE_EXPERIENCE', 'SAFETY'],
              version: 1,
            },
          },
        },
      },
    });

    expect(problem.objectiveProfile.weights?.must_visit_poi_completion).toBeGreaterThan(0);
  });
});

describe('automation-resolution-policy.util', () => {
  it('INFORM_ONLY downgrades non-critical DECISION_REQUIRED to EVIDENCE_REFRESH', () => {
    const mode = applyAutomationPolicyToResolutionMode(
      issue({
        id: 'issue-meal-late',
        semanticKey: 'meal_late',
        issueKind: 'meal_late',
        message: '午餐窗冲突',
        repairOptions: [
          { id: 'a', label: 'A', type: 'repair' } as FeasibilityIssueDto['repairOptions'][number],
          { id: 'b', label: 'B', type: 'repair' } as FeasibilityIssueDto['repairOptions'][number],
        ],
      }),
      'DECISION_REQUIRED',
      { defaultLevel: 'INFORM_ONLY', autoAllowed: [], confirmationRequired: [] },
    );
    expect(mode).toBe('EVIDENCE_REFRESH');
  });

  it('AUTO_REPAIR_LOW_RISK downgrades single-option meal_late to AUTO_FIX', () => {
    const resolved = resolveFeasibilityIssueResolution(
      issue({
        id: 'issue-meal-late',
        semanticKey: 'plan_object_meal_late',
        issueKind: 'meal_late',
        message: '午餐顺延 15 分钟',
        repairOptions: [
          { id: 'shift_meal_later', label: '顺延午餐', type: 'repair' } as FeasibilityIssueDto['repairOptions'][number],
        ],
      }),
      {
        automation: {
          defaultLevel: 'AUTO_REPAIR_LOW_RISK',
          autoAllowed: ['shift_meal_within_30min'],
          confirmationRequired: ['remove_poi', 'change_lodging'],
        },
      },
    );
    expect(resolved.resolutionMode).toBe('AUTO_FIX');
    expect(resolved.linkedDecisionProblemId).toBeNull();
  });

  it('confirmationRequired keeps lodging change as DECISION_REQUIRED', () => {
    const resolved = resolveFeasibilityIssueResolution(
      issue({
        id: 'issue-drive',
        issueKind: 'daily_drive',
        priority: 'must_handle',
        severity: 'high',
        message: '驾驶超限需换住宿',
        repairOptions: [
          { id: 'lodging_a', label: '换住宿 A', type: 'repair' } as FeasibilityIssueDto['repairOptions'][number],
          { id: 'lodging_b', label: '换住宿 B', type: 'repair' } as FeasibilityIssueDto['repairOptions'][number],
        ],
      }),
      {
        automation: {
          defaultLevel: 'AUTO_REPAIR_LOW_RISK',
          autoAllowed: ['shift_meal_within_30min'],
          confirmationRequired: ['change_lodging'],
        },
      },
    );
    expect(resolved.resolutionMode).toBe('DECISION_REQUIRED');
  });
});

describe('buildObjectiveProfileFromCanonicalWeights', () => {
  it('merges weights without dropping default enabled objectives', () => {
    const profile = buildObjectiveProfileFromCanonicalWeights({
      daily_driving_load: 0.4,
      budget_deviation: 0.6,
    });
    expect(profile.weights?.budget_deviation).toBe(0.6);
    expect(profile.enabledObjectives).toContain('daily_driving_load');
  });
});
