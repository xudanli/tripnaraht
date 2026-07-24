import { ModuleRef } from '@nestjs/core';
import { GuardianFeasibilityCollectorService } from './guardian-feasibility-collector.service';
import { GuardianConstraintProvider } from '../providers/guardian-constraint.provider';

describe('GuardianFeasibilityCollectorService', () => {
  it('CAS-016: collects non-PASS workspace assertions as canonical', async () => {
    const workspaceList = jest.fn().mockResolvedValue([
      {
        constraintAssertions: [
          {
            assertionId: 'ga_1',
            workspaceId: 'ws_1',
            actor: 'ABU',
            affectedEntityRefs: [],
            affectedPlanItemIds: [],
            verdict: 'BLOCK',
            constraintCode: 'ROAD_SEGMENT_UNAVAILABLE',
            reasonCodes: ['ROAD_CLOSED'],
            evidenceRefs: [],
            ruleVersion: '1',
            confidence: 0.9,
            overridable: false,
            semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ]);

    const moduleRef = {
      get: jest.fn().mockReturnValue({ list: workspaceList }),
    } as unknown as ModuleRef;

    const collector = new GuardianFeasibilityCollectorService(
      moduleRef,
      new GuardianConstraintProvider(),
    );

    const assertions = await collector.collectCanonicalAssertions('trip-1');
    expect(assertions).toHaveLength(1);
    expect(assertions[0].evaluator.engine).toBe('guardian-assertion');
    expect(assertions[0].status).toBe('BLOCK');
  });
});
