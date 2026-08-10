import {
  enrichAssessmentWithDecisionProblem,
  resolvePreviewCorridor,
  shouldOpenDecisionProblem,
} from './observation-action.builder';
import { LookDecisionProblemStore } from './look-decision-problem.store';
import { ObservationAssessmentBridgeService } from './observation-assessment.bridge.service';
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
      { type: 'ACKNOWLEDGE', label: '联系求助' },
    ],
    verificationStatus: 'VERIFIED',
    writesPlanVersion: false,
    authority: 'OFFICIAL_CORROBORATED',
    contextHash: 'lch_test_sample',
    ...overrides,
  };
}

describe('NARA Look S4 DecisionProblem bridge', () => {
  it('routes F-road mismatch to Repair Preview corridor', () => {
    const p = resolvePreviewCorridor({
      semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      assessmentStatus: 'EXECUTION_BLOCK',
    });
    expect(p.corridor).toBe('REPAIR');
    expect(p.previewRef).toBe('repair:TERRAIN_F_ROAD_UNFIT');
  });

  it('prefers existing DecisionProblem id (Q2 priority 1)', () => {
    const p = resolvePreviewCorridor({
      semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      assessmentStatus: 'EXECUTION_BLOCK',
      existingProblemId: 'look_dp_obs_1_r1',
    });
    expect(p.corridor).toBe('DECISION');
    expect(p.previewRef).toBe('decision:look_dp_obs_1_r1');
  });

  it('does not open DecisionProblem for plain INFO', () => {
    expect(
      shouldOpenDecisionProblem(
        sampleAssessment({
          status: 'INFO',
          decisionProblem: undefined,
          verificationStatus: 'UNVERIFIED',
        }),
      ),
    ).toBe(false);
  });

  it('bridge upserts problem and enriches assessment', async () => {
    const bridge = new ObservationAssessmentBridgeService(
      new LookDecisionProblemStore(),
    );
    const { assessment, problem } = await bridge.attachDecisionProblem({
      tripId: 'trip_1',
      observationId: 'obs_1',
      assessment: sampleAssessment(),
    });
    expect(problem).toBeDefined();
    expect(problem!.writesPlanVersion).toBe(false);
    expect(problem!.constraintBridgeKey).toBe('OFFICIAL_IS_FROAD_2WD');
    expect(assessment.decisionProblem?.linkedDecisionProblemId).toBe(
      problem!.problemId,
    );
    // With existing id on second resolve inside bridge → DECISION corridor
    expect(assessment.actions[0]?.type).toBe('PREVIEW');
    if (assessment.actions[0]?.type === 'PREVIEW') {
      expect(assessment.actions[0].previewRef).toBe(
        `decision:${problem!.problemId}`,
      );
    }
    expect(assessment.writesPlanVersion).toBe(false);
  });

  it('enrichAssessment never invents APPLY', () => {
    const problem = {
      problemId: 'p1',
      tripId: 't1',
      observationId: 'o1',
      assessmentId: 'a1',
      assessmentRevision: 1,
      type: 'INFEASIBILITY' as const,
      semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      title: 'x',
      description: 'y',
      status: 'OPEN' as const,
      urgency: 'HIGH' as const,
      detectedBy: 'USER' as const,
      detectedAt: new Date().toISOString(),
      assessmentStatus: 'EXECUTION_BLOCK' as const,
      verificationStatus: 'VERIFIED' as const,
      evidenceIds: [],
      preview: {
        corridor: 'REPAIR' as const,
        previewRef: 'repair:TERRAIN_F_ROAD_UNFIT',
        label: '查看安全方案',
      },
      writesPlanVersion: false as const,
    };
    const enriched = enrichAssessmentWithDecisionProblem(
      sampleAssessment(),
      problem,
    );
    expect(
      enriched.actions.every((a) => (a as { type: string }).type !== 'APPLY'),
    ).toBe(true);
  });
});
