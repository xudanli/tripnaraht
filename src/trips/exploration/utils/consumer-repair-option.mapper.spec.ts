import { mapDecisionActionsToConsumerRepairOptions } from './consumer-repair-option.mapper';
import type { DecisionAction } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';

describe('consumer-repair-option.mapper', () => {
  it('maps gateway actions to consumer repair options', () => {
    const actions: DecisionAction[] = [
      {
        actionId: 'opt_upgrade_vehicle',
        type: 'CHANGE_RESOURCE',
        source: 'CANONICAL',
        title: '升级车辆',
        summary: '更换为符合 F 路要求的四驱 SUV',
        expectedImpact: { budgetDelta: 120, durationDelta: 0, feasibilityDelta: 0.4 },
        requiresConfirmation: true,
        allowed: true,
      },
      {
        actionId: 'opt_reroute',
        type: 'CHANGE_ROUTE',
        source: 'CANONICAL',
        title: '调整路线',
        summary: '绕开 F208，改走南岸公路',
        expectedImpact: { durationDelta: 45, feasibilityDelta: 0.2 },
        requiresConfirmation: true,
        allowed: true,
      },
    ];

    const options = mapDecisionActionsToConsumerRepairOptions(actions);
    expect(options).toHaveLength(2);
    expect(options[0]?.optionId).toBe('opt_upgrade_vehicle');
    expect(options[0]?.canApply).toBe(true);
    expect(options[0]?.preserves.length).toBeGreaterThan(0);
    expect(options[1]?.impact.drivingDeltaMinutes).toBe(45);
  });
});
