/**
 * Task D engineering validation scenarios (12–15 instances).
 * Full-plan candidate selection dual-run — NOT POI-level CP-SAT.
 */

import type { TripPlan } from '../../trips/decision/plan-model';
import type { DecisionCandidate } from '../../decision-runtime/candidates/contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../../decision-runtime/constraints/contracts/canonical-constraint-report';
import type { ShadowDivergenceType } from '../../decision-runtime/observability/shadow-divergence.types';
import {
  icelandMinimalMultiCandidateFixture,
  icelandMinimalWorldState,
} from '../fixtures/iceland-minimal.fixture';

export type TaskDScenarioCategory =
  | 'consistency'
  | 'lex_divergence'
  | 'constraint'
  | 'failure';

export interface TaskDScenarioExpect {
  sameWinner?: boolean;
  authorityWinnerId?: string;
  shadowWinnerId?: string;
  eligibleForComparison?: boolean;
  divergenceTypes?: ShadowDivergenceType[];
  shadowNativeCpSat?: false;
  shadowOptimizationLevel?: 'FULL_PLAN_CANDIDATE_SELECTION';
  deterministicRepeat?: boolean;
}

export interface TaskDScenario {
  id: string;
  category: TaskDScenarioCategory;
  description: string;
  candidates: DecisionCandidate[];
  constraintReports: Record<string, CanonicalConstraintReport>;
  worldState?: ReturnType<typeof icelandMinimalWorldState>;
  shadowError?: string;
  shadowTimeLimitMs?: number;
  inputMismatch?: boolean;
  expect: TaskDScenarioExpect;
}

function feasibleReport(tripId: string, candidateId: string): CanonicalConstraintReport {
  return {
    schemaId: 'tripnara.canonical_constraint_report@v1',
    tripId,
    candidateId,
    evaluatedAt: new Date().toISOString(),
    assertions: [],
    completeness: {
      roads: 'COMPLETE',
      weather: 'COMPLETE',
      hazards: 'COMPLETE',
      ferries: 'COMPLETE',
      openingHours: 'MISSING',
    },
    overallStatus: 'FEASIBLE',
    degraded: false,
    degradedReasons: [],
  };
}

function blockAssertion(code: string, message: string) {
  return {
    assertionId: `assert_${code}`,
    constraintType: code,
    status: 'BLOCK' as const,
    severity: 'CRITICAL' as const,
    scope: { tripId: 'task_d_trip' },
    reasonCode: code,
    evidenceRefs: [],
    message,
    evaluator: { engine: 'task-d-fixture', version: '1.0.0' },
    overridable: false,
  };
}

function requiresVerificationAssertion(code: string, message: string) {
  return {
    assertionId: `assert_${code}`,
    constraintType: code,
    status: 'REQUIRES_VERIFICATION' as const,
    severity: 'HIGH' as const,
    scope: { tripId: 'task_d_trip' },
    reasonCode: code,
    evidenceRefs: [],
    message,
    evaluator: { engine: 'task-d-fixture', version: '1.0.0' },
    overridable: false,
  };
}

function blockedReport(tripId: string, candidateId: string): CanonicalConstraintReport {
  return {
    ...feasibleReport(tripId, candidateId),
    overallStatus: 'INFEASIBLE',
    assertions: [blockAssertion('ROAD_CLOSED', 'F208 closed')],
  };
}

function unverifiedReport(tripId: string, candidateId: string): CanonicalConstraintReport {
  return {
    ...feasibleReport(tripId, candidateId),
    overallStatus: 'UNVERIFIED',
    assertions: [
      requiresVerificationAssertion('WEATHER_UNVERIFIED', 'Weather incomplete'),
    ],
  };
}

function planWithDrive(driveMin: number, utility: number, id: string): DecisionCandidate {
  const plan: TripPlan = {
    version: 'v1',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-08-15',
        timeSlots: [
          {
            id: `${id}_s1`,
            time: '10:00',
            endTime: '12:00',
            title: 'A',
            type: 'sightseeing',
          },
          {
            id: `${id}_s2`,
            time: '14:00',
            endTime: '17:00',
            title: 'B',
            type: 'sightseeing',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 63.4, lng: -19.0 },
              to: { lat: 64.1, lng: -21.9 },
              durationMin: driveMin,
            },
          },
        ],
      },
    ],
  };
  return {
    candidateId: id,
    label: id,
    source: 'LEGACY_TRIP_PLANNING',
    plan,
    utilityHint: utility,
    createdAt: new Date().toISOString(),
  };
}

function reportsFor(
  tripId: string,
  candidates: DecisionCandidate[],
  factory: (id: string) => CanonicalConstraintReport = (id) =>
    feasibleReport(tripId, id),
): Record<string, CanonicalConstraintReport> {
  const out: Record<string, CanonicalConstraintReport> = {};
  for (const c of candidates) out[c.candidateId] = factory(c.candidateId);
  return out;
}

export function buildTaskDScenarios(): TaskDScenario[] {
  const tripId = 'task_d_trip';
  const worldState = icelandMinimalWorldState();
  const multi = icelandMinimalMultiCandidateFixture();

  const single = [multi[0]!];
  const tiedUtility = [
    planWithDrive(0, 0.8, 'tie_a'),
    planWithDrive(0, 0.8, 'tie_b'),
  ];
  const dominates = [
    planWithDrive(30, 0.95, 'dominant'),
    planWithDrive(180, 0.5, 'inferior'),
  ];

  return [
    {
      id: 'TD-001-single-candidate',
      category: 'consistency',
      description: 'Single candidate — authority and shadow must agree',
      candidates: single,
      constraintReports: reportsFor(tripId, single),
      worldState,
      expect: {
        sameWinner: true,
        authorityWinnerId: 'balanced',
        shadowWinnerId: 'balanced',
        eligibleForComparison: true,
        shadowNativeCpSat: false,
        shadowOptimizationLevel: 'FULL_PLAN_CANDIDATE_SELECTION',
        deterministicRepeat: true,
      },
    },
    {
      id: 'TD-002-tied-utility',
      category: 'consistency',
      description: 'Equal utility — lex tie-break is deterministic',
      candidates: tiedUtility,
      constraintReports: reportsFor(tripId, tiedUtility),
      worldState,
      expect: { sameWinner: true, eligibleForComparison: true, deterministicRepeat: true },
    },
    {
      id: 'TD-003-dominates',
      category: 'consistency',
      description: 'One candidate dominates drive + utility',
      candidates: dominates,
      constraintReports: reportsFor(tripId, dominates),
      worldState,
      expect: {
        sameWinner: true,
        authorityWinnerId: 'dominant',
        shadowWinnerId: 'dominant',
        eligibleForComparison: true,
      },
    },
    {
      id: 'TD-004-iceland-multi-lex',
      category: 'lex_divergence',
      description: 'Iceland multi — lex prefers lower L2 drive (balanced)',
      candidates: multi,
      constraintReports: reportsFor(tripId, multi),
      worldState,
      expect: {
        shadowWinnerId: 'balanced',
        eligibleForComparison: true,
        deterministicRepeat: true,
      },
    },
    {
      id: 'TD-005-l2-drive-fork',
      category: 'lex_divergence',
      description: 'High utility but heavy drive — lex may diverge from utility winner',
      candidates: [
        planWithDrive(0, 0.92, 'high_utility_light'),
        planWithDrive(240, 0.88, 'high_utility_heavy'),
      ],
      constraintReports: reportsFor(tripId, [
        planWithDrive(0, 0.92, 'high_utility_light'),
        planWithDrive(240, 0.88, 'high_utility_heavy'),
      ]),
      worldState,
      expect: {
        shadowWinnerId: 'high_utility_light',
        eligibleForComparison: true,
      },
    },
    {
      id: 'TD-006-three-way',
      category: 'lex_divergence',
      description: 'Three candidates — stage traces must eliminate progressively',
      candidates: [
        planWithDrive(60, 0.7, 'mid'),
        planWithDrive(0, 0.75, 'light'),
        planWithDrive(200, 0.9, 'heavy'),
      ],
      constraintReports: reportsFor(tripId, [
        planWithDrive(60, 0.7, 'mid'),
        planWithDrive(0, 0.75, 'light'),
        planWithDrive(200, 0.9, 'heavy'),
      ]),
      worldState,
      expect: {
        shadowWinnerId: 'light',
        eligibleForComparison: true,
      },
    },
    {
      id: 'TD-007-l1-block',
      category: 'constraint',
      description: 'Blocked candidate must not be shadow winner',
      candidates: multi,
      constraintReports: {
        balanced: feasibleReport(tripId, 'balanced'),
        conservative: blockedReport(tripId, 'conservative'),
      },
      worldState,
      expect: {
        shadowWinnerId: 'balanced',
        eligibleForComparison: true,
      },
    },
    {
      id: 'TD-008-unverified-filter',
      category: 'constraint',
      description: 'REQUIRES_VERIFICATION candidate excluded from lex pool',
      candidates: multi,
      constraintReports: {
        balanced: feasibleReport(tripId, 'balanced'),
        conservative: unverifiedReport(tripId, 'conservative'),
      },
      worldState,
      expect: {
        shadowWinnerId: 'balanced',
        eligibleForComparison: true,
      },
    },
    {
      id: 'TD-009-all-infeasible',
      category: 'constraint',
      description: 'All candidates blocked — no shadow incumbent',
      candidates: multi,
      constraintReports: {
        balanced: blockedReport(tripId, 'balanced'),
        conservative: blockedReport(tripId, 'conservative'),
      },
      worldState,
      expect: {
        shadowWinnerId: undefined,
        eligibleForComparison: true,
      },
    },
    {
      id: 'TD-010-shadow-error',
      category: 'failure',
      description: 'Shadow error — authority still returns, SHADOW_ERROR typed',
      candidates: multi,
      constraintReports: reportsFor(tripId, multi),
      worldState,
      shadowError: 'simulated shadow failure',
      expect: {
        eligibleForComparison: true,
        divergenceTypes: ['SHADOW_ERROR'],
      },
    },
    {
      id: 'TD-011-shadow-timeout',
      category: 'failure',
      description: 'Shadow timeout — authority unaffected',
      candidates: multi,
      constraintReports: reportsFor(tripId, multi),
      worldState,
      shadowTimeLimitMs: 0,
      expect: {
        eligibleForComparison: true,
        divergenceTypes: ['SHADOW_TIMEOUT'],
      },
    },
    {
      id: 'TD-012-input-mismatch',
      category: 'failure',
      description: 'Input mismatch — not eligible for strategy comparison stats',
      candidates: multi,
      constraintReports: reportsFor(tripId, multi),
      worldState,
      inputMismatch: true,
      expect: {
        eligibleForComparison: false,
        divergenceTypes: ['INPUT_MISMATCH'],
      },
    },
    {
      id: 'TD-013-determinism',
      category: 'consistency',
      description: 'Repeat run produces identical shadow winner',
      candidates: multi,
      constraintReports: reportsFor(tripId, multi),
      worldState,
      expect: {
        shadowWinnerId: 'balanced',
        deterministicRepeat: true,
        eligibleForComparison: true,
      },
    },
    {
      id: 'TD-014-metadata-nomenclature',
      category: 'consistency',
      description: 'Shadow solver metadata declares non-native candidate selector',
      candidates: multi,
      constraintReports: reportsFor(tripId, multi),
      worldState,
      expect: {
        shadowNativeCpSat: false,
        shadowOptimizationLevel: 'FULL_PLAN_CANDIDATE_SELECTION',
      },
    },
  ];
}
