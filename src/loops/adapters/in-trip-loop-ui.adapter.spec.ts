import { buildInTripLoopUiView } from './in-trip-loop-ui.adapter';
import type { InTripRecoveryLoopResult } from '../types/in-trip-recovery.types';

describe('in-trip-loop-ui.adapter', () => {
  it('builds three-layer UI for awaiting approval', () => {
    const result: InTripRecoveryLoopResult = {
      loopRunId: 'loop_in_trip_1',
      status: 'WAITING_FOR_HUMAN',
      runtimeState: 'WAITING_FOR_HUMAN',
      before: {
        verdictStatus: 'AT_RISK',
        openEnvironmentEvents: 1,
        redEvents: 1,
        delayMinutes: 55,
        atRiskItems: 2,
        onTrack: false,
      },
      after: {
        verdictStatus: 'AT_RISK',
        openEnvironmentEvents: 1,
        redEvents: 1,
        delayMinutes: 55,
        atRiskItems: 2,
        onTrack: false,
      },
      iterations: [
        {
          sequence: 1,
          triggerKind: 'TRAFFIC_DELAY',
          environmentEventId: 'env-1',
          triggerTitle: '道路延误 55 分钟',
          proposal: {
            planId: 'plan-skip-lunch',
            title: '跳过午餐停留点，改为沿途简餐',
            actionType: 'in_trip_plan',
          },
          validation: {
            passed: true,
            lateProbabilityBefore: 0.68,
            lateProbabilityAfter: 0.14,
          },
          decision: 'CONTINUE',
          attemptedPlans: ['plan-skip-lunch'],
        },
      ],
      recommendedPlans: [
        {
          environmentEventId: 'env-1',
          planId: 'plan-skip-lunch',
          title: '跳过午餐停留点，改为沿途简餐',
          actionType: 'in_trip_plan',
          triggerKind: 'TRAFFIC_DELAY',
        },
      ],
      requiresApproval: true,
    };

    const ui = buildInTripLoopUiView(result);
    expect(ui.headline).toContain('变化');
    expect(ui.layers.happened).toContain('55');
    expect(ui.layers.impact).toContain('迟到概率');
    expect(ui.primaryAction?.label).toBe('采用调整');
  });
});
