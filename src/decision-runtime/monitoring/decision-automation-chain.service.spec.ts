import { DecisionAutomationChainService } from './decision-automation-chain.service';
import { evaluateDecisionAutomation } from '../authorization/utils/decision-automation-policy.util';

describe('DecisionAutomationChainService', () => {
  const autoExecuteMetadata = {
    travelDecisionContract: {
      automation: {
        defaultLevel: 'AUTO_EXECUTE_CONDITIONAL',
        autoAllowed: ['weather_hazard_replan'],
        confirmationRequired: ['change_lodging', 'change_intercity_route'],
      },
    },
  };

  it('skips road problems under default automation policy', () => {
    const result = evaluateDecisionAutomation({
      automation: autoExecuteMetadata.travelDecisionContract.automation as never,
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE:evt_1',
      semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
      enforcement: 'BLOCK',
    });
    expect(result.autoApplyEligible).toBe(false);
  });

  it('auto-applies when gateway returns APPLY', async () => {
    process.env.DECISION_AUTOMATION_CHAIN_ENABLED = '1';

    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({
          metadata: autoExecuteMetadata,
          budgetConfig: {},
        })),
        update: jest.fn(async () => ({})),
      },
    } as never;

    const readModel = {
      getProblemDetail: jest.fn(async () => ({
        problem: {
          semanticKey: 'WEATHER_ACTIVITY_PROHIBITED:evt_1',
          enforcement: 'REQUIRE_ADJUSTMENT',
          type: 'FEASIBILITY_FAILURE',
        },
        actions: [
          {
            actionId: 'cand_indoor',
            title: '室内备选',
            summary: '改为室内活动',
            allowed: true,
            requiresConfirmation: false,
            expectedImpact: { affectedDays: [2] },
          },
          {
            actionId: 'original',
            allowed: true,
            requiresConfirmation: false,
          },
        ],
      })),
    } as never;

    const gateway = {
      submitResolution: jest.fn(async () => ({ nextStep: 'APPLY' })),
      applyResolution: jest.fn(async () => ({ revalidation: { status: 'PASSED' } })),
    } as never;

    const service = new DecisionAutomationChainService(prisma, gateway, readModel);
    const outcome = await service.tryAutoApplyProblem('trip_1', 'problem_1');

    expect(outcome.status).toBe('APPLIED');
    expect(outcome.changeSummary).toContain('可撤销');
    expect(outcome.changeLogId).toMatch(/^acl_/);
    expect(gateway.submitResolution).toHaveBeenCalled();
    expect(gateway.applyResolution).toHaveBeenCalled();
    expect(prisma.trip.update).toHaveBeenCalled();

    delete process.env.DECISION_AUTOMATION_CHAIN_ENABLED;
  });

  it('resolves semantic key from semanticCapability when detail omits semanticKey', async () => {
    process.env.DECISION_AUTOMATION_CHAIN_ENABLED = '1';

    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({
          metadata: autoExecuteMetadata,
          budgetConfig: {},
        })),
        update: jest.fn(async () => ({})),
      },
    } as never;

    const readModel = {
      getProblemDetail: jest.fn(async () => ({
        problem: {
          semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
          type: 'FEASIBILITY_FAILURE',
          triggerEventId: 'evt_1',
          enforcement: 'REQUIRE_ADJUSTMENT',
        },
        actions: [{ actionId: 'cand_indoor', allowed: true }],
      })),
    } as never;

    const gateway = {
      submitResolution: jest.fn(async () => ({ nextStep: 'APPLY' })),
      applyResolution: jest.fn(async () => ({ revalidation: { status: 'PASSED' } })),
    } as never;

    const service = new DecisionAutomationChainService(prisma, gateway, readModel);
    const outcome = await service.tryAutoApplyProblem('trip_1', 'problem_1');

    expect(outcome.status).toBe('APPLIED');
    delete process.env.DECISION_AUTOMATION_CHAIN_ENABLED;
  });
});
