import type { TripConstraint } from './frontend-travel-decision-contract-api.types';
import type { UnifiedConstraintAssessmentBundle } from './frontend-constraint-assessment-api.types';
import {
  buildAssessmentLookup,
  buildConstraintCardView,
  buildConstraintConsoleWithAssessments,
  buildLaneBadges,
  resolveAggregateStatusUi,
  resolveAssessmentForConstraint,
  resolveConstraintKeyForTripConstraint,
} from './frontend-constraint-card-view.util';
import { buildConstraintConsoleViewModel } from './frontend-travel-decision-contract-view.util';

describe('frontend-constraint-card-view.util', () => {
  const maxDriveConstraint: TripConstraint = {
    id: 'c_max_daily_drive',
    tripId: 'pilot_is_01',
    name: '每日驾驶限制',
    category: 'SAFETY',
    type: 'HARD',
    status: 'ACTIVE',
    scope: { type: 'TRIP' },
    operator: 'LTE',
    value: 6,
    allowRelaxation: false,
    locked: false,
    source: { type: 'USER', templateId: 'max_daily_drive' },
    visibility: 'TEAM',
    enabled: true,
    displayValue: '≤ 6h',
    capability: {
      constraintKey: 'MAX_DAILY_DRIVE',
      enforcementLevel: 'ENABLED',
      phase0UiPolicy: 'OPEN',
    },
  };

  const assessmentsPass: UnifiedConstraintAssessmentBundle = {
    schemaId: 'tripnara.unified_constraint_assessment_bundle@v1',
    tripId: 'pilot_is_01',
    generatedAt: '2026-07-13T00:00:00.000Z',
    contextVersion: { tripId: 'pilot_is_01', version: 'v1' },
    items: [
      {
        constraintKey: 'MAX_DAILY_DRIVE',
        legacyConstraintId: 'c_max_daily_drive',
        contractRequirement: '≤ 6h',
        contextVersion: { tripId: 'pilot_is_01', version: 'v1' },
        evaluatedAt: '2026-07-13T00:00:00.000Z',
        lanes: {
          planning: { status: 'PASS', source: 'FEASIBILITY' },
          executability: { status: 'PASS', source: 'TEP', ruleId: 'SDR-101' },
          runtime: null,
        },
        aggregateStatus: 'PASS',
      },
    ],
    meta: { itemCount: 1 },
  };

  const assessmentsBlock: UnifiedConstraintAssessmentBundle = {
    ...assessmentsPass,
    items: [
      {
        constraintKey: 'MAX_DAILY_DRIVE',
        legacyConstraintId: 'c_max_daily_drive',
        contractRequirement: '≤ 6h',
        contextVersion: { tripId: 'pilot_is_01', version: 'v1' },
        evaluatedAt: '2026-07-13T00:00:00.000Z',
        lanes: {
          planning: null,
          executability: {
            status: 'BLOCK',
            source: 'TEP',
            ruleId: 'SDR-101',
            message: '第 1 日等效驾驶负荷 416min（HIGH）',
            evidence: { day: 1, actual: '6h56m', measuredMinutes: 416 },
            problemIds: ['problem_sdr101'],
          },
          runtime: null,
        },
        aggregateStatus: 'EXECUTION_BLOCK',
        problemIds: ['problem_sdr101'],
      },
    ],
  };

  it('resolveConstraintKeyForTripConstraint prefers capability.constraintKey', () => {
    expect(resolveConstraintKeyForTripConstraint(maxDriveConstraint)).toBe('MAX_DAILY_DRIVE');
  });

  it('resolveAggregateStatusUi maps EXECUTION_BLOCK to blocking danger UI', () => {
    const ui = resolveAggregateStatusUi('EXECUTION_BLOCK');
    expect(ui.label).toBe('不可执行');
    expect(ui.tone).toBe('danger');
    expect(ui.isBlocking).toBe(true);
  });

  it('buildLaneBadges exposes planning + executability rows', () => {
    const badges = buildLaneBadges(assessmentsPass.items[0]!);
    expect(badges.map((b) => b.kind)).toEqual(['planning', 'executability']);
    expect(badges[1]?.ruleId).toBe('SDR-101');
  });

  it('buildConstraintCardView uses aggregateStatus not constraint.type for blocking', () => {
    const lookup = buildAssessmentLookup(assessmentsBlock);
    const card = buildConstraintCardView({
      constraint: maxDriveConstraint,
      assessment: resolveAssessmentForConstraint(maxDriveConstraint, lookup),
      tripId: 'pilot_is_01',
    });

    expect(card.aggregateUi.aggregateStatus).toBe('EXECUTION_BLOCK');
    expect(card.aggregateUi.isBlocking).toBe(true);
    expect(card.laneBadges.find((b) => b.kind === 'executability')?.status).toBe('BLOCK');
    expect(card.repairDeepLink).toContain('problem_sdr101');
  });

  it('buildConstraintConsoleWithAssessments joins sections to cards', () => {
    const console = buildConstraintConsoleViewModel({
      meta: {
        tripId: 'pilot_is_01',
        constraintsVersion: 1,
        total: 1,
        byType: { HARD: 1 },
        byStatus: { ACTIVE: 1 },
        conflictCount: 0,
        pendingConfirmCount: 0,
        sections: [
          {
            key: 'hard_must_satisfy',
            label: '必须满足',
            constraintIds: ['c_max_daily_drive'],
          },
        ],
      },
      items: [maxDriveConstraint],
      contract: {
        schemaId: 'tripnara.travel_decision_contract@v1',
        tripId: 'pilot_is_01',
        constraintsVersion: 1,
        objectives: { rankedPrinciples: ['SAFETY'], version: 1 },
        displayPrinciples: [{ key: 'SAFETY', label: '安全第一', rank: 1 }],
        compiledWeights: { legacy: {}, canonical: {} },
        changeStrategy: { archetype: 'BALANCED', tolerances: {} },
        automation: { defaultLevel: 'INFORM_ONLY', autoAllowed: [], confirmationRequired: [] },
        teamGovernance: { rules: [] },
        conflicts: {
          hasConflicts: false,
          mustHandle: 0,
          suggestAdjust: 0,
          pendingConfirm: 0,
          conflictConstraintIds: [],
        },
      },
    });

    const view = buildConstraintConsoleWithAssessments({
      console,
      assessments: assessmentsBlock,
      tripId: 'pilot_is_01',
    });

    expect(view.sections[0]?.cards[0]?.aggregateUi.aggregateStatus).toBe('EXECUTION_BLOCK');
    expect(view.cardsByConstraintId.c_max_daily_drive?.name).toBe('每日驾驶限制');
  });
});
