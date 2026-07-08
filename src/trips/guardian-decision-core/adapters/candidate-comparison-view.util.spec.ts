import { buildCandidateComparisonView } from './candidate-comparison-view.util';
import type { Rfc001DecisionCenterProblemView } from './decision-center-bridge.adapter';

function baseView(
  overrides: Partial<Rfc001DecisionCenterProblemView> = {},
): Rfc001DecisionCenterProblemView {
  return {
    schemaId: 'tripnara.rfc001_problem_view@v1',
    tripId: 'trip_1',
    problemId: 'problem_1',
    problemSummary: {} as Rfc001DecisionCenterProblemView['problemSummary'],
    rfc001Problem: {
      problemId: 'problem_1',
      tripId: 'trip_1',
      planVersionId: 'plan_1',
      type: 'EXCESSIVE_LOAD',
      triggerEventId: 'evt_load_day_5',
      semanticCapability: 'EXCESSIVE_DAILY_LOAD',
      affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'item_1', label: 'day5' }],
      affectedPlanItemIds: ['item_1'],
      worldStateSnapshotId: 'snap_1',
      detectedAt: '2026-06-30T00:00:00.000Z',
      urgency: 'HIGH',
      status: 'DECIDED',
    },
    leadingPersona: 'DRDRE',
    requiresUserConfirmation: true,
    candidates: [
      {
        candidateId: 'original',
        label: 'ORIGINAL',
        generationMethod: 'BASE_PLAN',
        intentPreservation: 1,
        estimatedAddedDurationMinutes: 0,
        preservedIntentRefs: [],
        abuVerdict: 'BLOCK',
        physicalLoad: 1,
        scheduleStress: 0.65,
        blocked: true,
      },
      {
        candidateId: 'cand_split_day',
        label: 'SPLIT_DAY',
        generationMethod: 'SPLIT_DAY',
        intentPreservation: 0.82,
        estimatedAddedDurationMinutes: 0,
        preservedIntentRefs: ['intent_split_overloaded_day'],
        abuVerdict: 'WARNING',
        physicalLoad: 0.55,
        scheduleStress: 0.5,
        utility: 0.21,
        blocked: false,
      },
    ],
    workspace: {
      workspaceId: 'ws_1',
      problemId: 'problem_1',
      basePlanVersionId: 'plan_1',
      worldStateSnapshotId: 'snap_1',
      preferenceSnapshotId: 'pref_1',
      constraintAssertions: [],
      loadAssessments: [],
      repairCandidates: [
        {
          candidateId: 'cand_split_day',
          workspaceId: 'ws_1',
          actor: 'NEPTUNE',
          basePlanVersionId: 'plan_1',
          replacesPlanItemIds: ['item_1'],
          proposedOperations: [],
          preservedIntentRefs: ['intent_split_overloaded_day'],
          degradedIntentRefs: [],
          lostIntentRefs: [],
          estimatedIntentPreservation: 0.82,
          estimatedAddedCost: { amount: 0, currency: 'ISK' },
          estimatedAddedDurationMinutes: 0,
          generationMethod: 'SPLIT_DAY',
          evidenceRefs: [],
          generatorVersion: 'v1',
          status: 'PROPOSED',
          createdAt: '2026-06-30T00:00:00.000Z',
        },
      ],
      createdAt: '2026-06-30T00:00:00.000Z',
      revision: 1,
      status: 'FINALIZED',
    },
    record: {
      decisionId: 'dec_1',
      problemId: 'problem_1',
      workspaceId: 'ws_1',
      basePlanVersionId: 'plan_1',
      worldStateSnapshotId: 'snap_1',
      preferenceSnapshotId: 'pref_1',
      consideredCandidateIds: ['original', 'cand_split_day'],
      rejectedCandidates: [
        {
          candidateId: 'original',
          reasonCodes: ['CANDIDATE_BLOCKED_BY_HARD_CONSTRAINT', 'EXCESSIVE_DAILY_LOAD'],
          rejectedBy: 'HARD_CONSTRAINT',
        },
      ],
      selectedCandidateId: 'cand_split_day',
      finalAction: 'REPLACE',
      reasonCodes: [],
      evidenceRefs: [],
      utilityEvaluation: [
        {
          candidateId: 'cand_split_day',
          utility: 0.21,
          vector: {
            experienceValue: 0.82,
            intentPreservation: 0.82,
            fatigueCost: 0.5,
            monetaryCost: 0,
            timeStress: 0.5,
            residualRisk: 0.1,
            reversibility: 0.7,
          },
        },
      ],
      authorizationRequirement: {
        level: 'L2',
        requiresUserConfirmation: true,
        reasons: [],
        externalSideEffects: [],
      },
      ruleVersions: [],
      modelVersions: {},
      recordStatus: 'PROPOSED',
      createdAt: '2026-06-30T00:00:00.000Z',
      decidedAt: '2026-06-30T00:00:00.000Z',
    },
    options: [],
    lineage: [],
    ...overrides,
  };
}

describe('buildCandidateComparisonView', () => {
  it('CMP-001: builds original intent narrative and comparison rows', () => {
    const view = buildCandidateComparisonView(baseView());

    expect(view.schemaId).toBe('tripnara.candidate_comparison@v1');
    expect(view.originalIntent.labels.length).toBeGreaterThan(0);
    expect(view.originalIntent.narrative).toContain('可完成的日行程节奏');
    expect(view.rows).toHaveLength(2);
    expect(view.recommendedCandidateId).toBe('cand_split_day');
    expect(view.rows[1].recommended).toBe(true);
    expect(view.rows[1].experienceRetentionLabel).toBe('82%');
    expect(view.rows[0].safety.label).toBe('不通过');
    expect(view.rows[1].safety.label).toBe('需确认');
    expect(view.rejections[0].message).toContain('没有被推荐');
  });

  it('CMP-002: road slice uses intent labels from preserved refs', () => {
    const view = buildCandidateComparisonView(
      baseView({
        rfc001Problem: {
          ...baseView().rfc001Problem,
          semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
          type: 'FEASIBILITY_FAILURE',
        },
        workspace: {
          ...baseView().workspace!,
          repairCandidates: [
            {
              ...baseView().workspace!.repairCandidates[0],
              candidateId: 'cand_a',
              generationMethod: 'ONTOLOGY_EQUIVALENCE',
              preservedIntentRefs: ['intent_glacier', 'intent_wilderness'],
              estimatedIntentPreservation: 0.92,
            },
          ],
        },
        candidates: [
          baseView().candidates[0],
          {
            ...baseView().candidates[1],
            candidateId: 'cand_a',
            generationMethod: 'ONTOLOGY_EQUIVALENCE',
            intentPreservation: 0.92,
            preservedIntentRefs: ['intent_glacier', 'intent_wilderness'],
            blocked: false,
          },
        ],
        record: {
          ...baseView().record!,
          selectedCandidateId: 'cand_a',
          rejectedCandidates: [],
        },
      }),
      { destinationCountry: 'IS' },
    );

    expect(view.originalIntent.labels).toEqual(
      expect.arrayContaining(['冰川体验', '荒野感']),
    );
    expect(view.rows[1].title).toContain('等价替代');
    expect(view.rows[1].experienceRetentionLabel).toBe('92%');
  });
});
