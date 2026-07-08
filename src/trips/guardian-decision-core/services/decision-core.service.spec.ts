import { DecisionCoreService } from '../services/decision-core.service';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import { rfc001DecisionRecordSchema } from '../contracts/schemas/rfc001-phase0.schemas';

describe('DecisionCoreService.finalize', () => {
  const core = new DecisionCoreService();

  const baseWorkspace: DecisionWorkspace = {
    workspaceId: 'ws_iceland',
    problemId: 'prob_road_closed',
    basePlanVersionId: 'plan_v17',
    worldStateSnapshotId: 'wss_1022',
    preferenceSnapshotId: 'pref_default',
    constraintAssertions: [
      {
        assertionId: 'assert_block_original',
        workspaceId: 'ws_iceland',
        actor: 'ABU',
        targetCandidateId: 'original',
        affectedEntityRefs: [{ kind: 'ROUTE_SEGMENT', id: 'seg_f208' }],
        affectedPlanItemIds: ['item_day3_drive'],
        verdict: 'BLOCK',
        constraintCode: 'ROAD_CLOSED',
        reasonCodes: [RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED],
        evidenceRefs: ['ev_road_official_8821'],
        ruleVersion: 'is.iceland.road.v3',
        confidence: 0.98,
        overridable: false,
        createdAt: '2026-06-30T10:22:00Z',
      },
      {
        assertionId: 'assert_pass_a',
        workspaceId: 'ws_iceland',
        actor: 'ABU',
        targetCandidateId: 'cand_a',
        affectedEntityRefs: [],
        affectedPlanItemIds: ['item_day3_drive'],
        verdict: 'PASS',
        constraintCode: 'ROUTE_FEASIBLE',
        reasonCodes: [],
        evidenceRefs: ['ev_road_official_8821'],
        ruleVersion: 'is.iceland.road.v3',
        confidence: 0.9,
        overridable: false,
        createdAt: '2026-06-30T10:22:00Z',
      },
    ],
    loadAssessments: [
      {
        assessmentId: 'load_a',
        workspaceId: 'ws_iceland',
        actor: 'DRDRE',
        targetCandidateId: 'cand_a',
        affectedTravelerIds: ['traveler_1'],
        physicalLoad: 0.55,
        scheduleStress: 0.5,
        recoveryDeficit: 0.3,
        adjustmentRequirements: [],
        modelVersion: 'load-model-0.4',
        inputSnapshotRef: 'wss_1022',
        confidence: 0.82,
        createdAt: '2026-06-30T10:22:00Z',
      },
    ],
    repairCandidates: [
      {
        candidateId: 'cand_a',
        workspaceId: 'ws_iceland',
        actor: 'NEPTUNE',
        basePlanVersionId: 'plan_v17',
        replacesPlanItemIds: ['item_day3_drive'],
        proposedOperations: [
          {
            operationId: 'op_1',
            kind: 'REPLACE_ITEM',
            targetRefs: [{ kind: 'PLAN_ITEM', id: 'item_day3_drive' }],
            parameters: { substitutePoiId: 'poi_glacier_alt' },
          },
        ],
        preservedIntentRefs: ['intent_glacier'],
        degradedIntentRefs: [],
        lostIntentRefs: [],
        estimatedIntentPreservation: 0.92,
        estimatedAddedCost: { amount: 0, currency: 'ISK' },
        estimatedAddedDurationMinutes: 20,
        generationMethod: 'ONTOLOGY_EQUIVALENCE',
        evidenceRefs: [],
        generatorVersion: 'intent-graph-0.2',
        status: 'VALID',
        createdAt: '2026-06-30T10:22:00Z',
      },
    ],
    createdAt: '2026-06-30T10:22:00Z',
    revision: 1,
    status: 'READY_FOR_FINALIZE',
  };

  it('selects feasible repair after original BLOCK (Iceland slice pattern)', () => {
    const { record, humanDecisionRequired } = core.finalize({
      workspace: baseWorkspace,
      currentWorldStateSnapshotId: 'wss_1022',
      defaultAuthorizationLevel: 'L2',
    });

    expect(record.finalAction).toBe('REPLACE');
    expect(record.selectedCandidateId).toBe('cand_a');
    expect(record.authorizationRequirement.level).toBe('L2');
    expect(record.authorizationRequirement.requiresUserConfirmation).toBe(true);
    expect(humanDecisionRequired).toBe(false);
    expect(record.rejectedCandidates.some((r) => r.candidateId === 'original')).toBe(true);

    const parsed = rfc001DecisionRecordSchema.safeParse(record);
    expect(parsed.success).toBe(true);
  });

  it('REJECT when no feasible candidates remain', () => {
    const ws: DecisionWorkspace = {
      ...baseWorkspace,
      repairCandidates: [],
      loadAssessments: [],
      constraintAssertions: baseWorkspace.constraintAssertions.filter(
        (a) => a.targetCandidateId === 'original',
      ),
    };
    const { record } = core.finalize({
      workspace: ws,
      currentWorldStateSnapshotId: 'wss_1022',
    });
    expect(record.finalAction).toBe('REJECT');
    expect(record.selectedCandidateId).toBeUndefined();
  });
});
