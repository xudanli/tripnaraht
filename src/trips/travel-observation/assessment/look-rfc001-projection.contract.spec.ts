import { LookDecisionProblemStore } from './look-decision-problem.store';
import { LookRfc001ProjectionService } from './look-rfc001-projection.service';
import { LookTripDecisionContextResolver } from './look-trip-decision-context.resolver';
import { ObservationAssessmentBridgeService } from './observation-assessment.bridge.service';
import { InMemoryRfc001DecisionProblemWriter } from './in-memory-rfc001-writer';
import {
  lookTriggerEventId,
  mapLookSemanticCapability,
  projectLookToRfc001DecisionProblem,
} from './project-look-to-rfc001';
import type { ObservationAssessment } from '../observation.types';

function sampleAssessment(
  overrides: Partial<ObservationAssessment> = {},
): ObservationAssessment {
  return {
    assessmentId: 'assess_1',
    observationId: 'obs_1',
    assessmentRevision: 1,
    summary: {
      whatHappened: 'F208',
      impact: '2WD',
      recommendation: 'do not enter',
    },
    status: 'EXECUTION_BLOCK',
    decisionProblem: {
      type: 'INFEASIBILITY',
      semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
    },
    evidenceIds: ['e1'],
    actions: [
      {
        type: 'PREVIEW',
        previewRef: 'arrange:froad_vehicle_mismatch',
        label: '查看安全方案',
      },
    ],
    verificationStatus: 'VERIFIED',
    writesPlanVersion: false,
    authority: 'OFFICIAL_CORROBORATED',
    contextHash: 'lch_test_sample',
    ...overrides,
  };
}

describe('Look → RFC-001 projection (S4+ / S4-BE-03)', () => {
  it('maps F-road Look semantic to ROAD_SEGMENT_RESTRICTED', () => {
    expect(
      mapLookSemanticCapability('RULE_TRIGGER.FROAD_VEHICLE_MISMATCH'),
    ).toBe('ROAD_SEGMENT_RESTRICTED');
  });

  it('projects Look problem with writesPlanVersion false and stable trigger', () => {
    const look = {
      problemId: 'look_dp_obs_1_r1',
      tripId: 'trip_1',
      observationId: 'obs_1',
      assessmentId: 'a1',
      assessmentRevision: 1,
      type: 'INFEASIBILITY' as const,
      semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      title: 't',
      description: 'd',
      status: 'OPEN' as const,
      urgency: 'HIGH' as const,
      detectedBy: 'USER' as const,
      detectedAt: '2026-07-25T15:00:00Z',
      assessmentStatus: 'EXECUTION_BLOCK' as const,
      verificationStatus: 'VERIFIED' as const,
      evidenceIds: ['e1'],
      preview: {
        corridor: 'DECISION' as const,
        previewRef: 'decision:look_dp_obs_1_r1',
        label: '查看安全方案',
      },
      constraintBridgeKey: 'OFFICIAL_IS_FROAD_2WD',
      writesPlanVersion: false as const,
    };
    const rfc = projectLookToRfc001DecisionProblem({ look });
    expect(rfc.problemId).toBe(look.problemId);
    expect(rfc.triggerEventId).toBe(lookTriggerEventId('obs_1'));
    expect(rfc.type).toBe('FEASIBILITY_FAILURE');
    expect(rfc.semanticCapability).toBe('ROAD_SEGMENT_RESTRICTED');
    expect(rfc.status).toBe('OPEN');
  });

  it('context resolver falls back to pending / look_local without stores', async () => {
    const resolver = new LookTripDecisionContextResolver();
    const ctx = await resolver.resolve('trip_x', 'obs_y');
    expect(ctx.planVersionId).toBe('PLAN_VERSION_PENDING_LOOK');
    expect(ctx.worldStateSnapshotId).toBe('ws_look_obs_y');
    expect(ctx.source.planVersion).toBe('pending');
    expect(ctx.source.snapshot).toBe('look_local');
  });

  it('context resolver prefers effective plan + latest snapshot', async () => {
    const planStore = {
      getEffectivePlanVersionId: async () => 'pv_effective_1',
    };
    const worldStore = {
      readStore: async () => ({
        assertions: [],
        snapshots: [
          {
            snapshotId: 'wss_old',
            revision: '1',
            capturedAt: '2026-07-24T00:00:00Z',
            assertionIds: [],
          },
          {
            snapshotId: 'wss_latest',
            revision: '2',
            capturedAt: '2026-07-25T12:00:00Z',
            assertionIds: [],
          },
        ],
        events: [],
      }),
    };
    const resolver = new LookTripDecisionContextResolver(
      planStore as never,
      worldStore as never,
    );
    const ctx = await resolver.resolve('trip_1', 'obs_1');
    expect(ctx.planVersionId).toBe('pv_effective_1');
    expect(ctx.worldStateSnapshotId).toBe('wss_latest');
    expect(ctx.source).toEqual({
      planVersion: 'effective',
      snapshot: 'latest',
    });
  });

  it('bridge projects with resolved context and invalidates read model', async () => {
    const lookStore = new LookDecisionProblemStore();
    const rfcWriter = new InMemoryRfc001DecisionProblemWriter();
    const resolver = new LookTripDecisionContextResolver(
      {
        getEffectivePlanVersionId: async () => 'pv_look_test',
      } as never,
      {
        readStore: async () => ({
          assertions: [],
          snapshots: [
            {
              snapshotId: 'wss_look_test',
              revision: '1',
              capturedAt: '2026-07-25T10:00:00Z',
              assertionIds: [],
            },
          ],
          events: [],
        }),
      } as never,
    );
    const invalidated: string[] = [];
    const readModel = {
      invalidateCache: (tripId: string) => {
        invalidated.push(tripId);
      },
    };
    const projection = new LookRfc001ProjectionService(
      rfcWriter,
      resolver,
      readModel as never,
    );
    const bridge = new ObservationAssessmentBridgeService(
      lookStore,
      projection,
      rfcWriter,
    );

    const first = await bridge.attachDecisionProblem({
      tripId: 'trip_1',
      observationId: 'obs_1',
      assessment: sampleAssessment(),
    });
    expect(first.problem?.writesPlanVersion).toBe(false);

    const rfcItems = rfcWriter.list('trip_1');
    expect(rfcItems).toHaveLength(1);
    expect(rfcItems[0]?.planVersionId).toBe('pv_look_test');
    expect(rfcItems[0]?.worldStateSnapshotId).toBe('wss_look_test');
    expect(rfcItems[0]?.triggerEventId).toBe(lookTriggerEventId('obs_1'));
    expect(invalidated).toContain('trip_1');

    const second = await bridge.attachDecisionProblem({
      tripId: 'trip_1',
      observationId: 'obs_1',
      assessment: sampleAssessment({ assessmentRevision: 2 }),
    });
    expect(rfcWriter.list('trip_1')).toHaveLength(1);
    expect(second.problem!.problemId).toBe(first.problem!.problemId);
    expect(JSON.stringify(second.assessment.actions)).not.toMatch(/APPLY/);
  });
});
