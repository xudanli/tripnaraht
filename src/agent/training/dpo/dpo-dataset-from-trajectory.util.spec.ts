import { trajectoriesToDpoPreferenceRecords } from './dpo-dataset-from-trajectory.util';
import type { RLTrajectory } from '../interfaces/trajectory.interface';

describe('trajectoriesToDpoPreferenceRecords', () => {
  it('应按分数选 chosen / rejected', () => {
    const t: RLTrajectory = {
      trajectory_id: 't1',
      request_id: 'r1',
      steps: [
        {
          step_index: 0,
          state: { user_request: 'Plan a weekend' } as any,
          action: {
            action_type: 'PLAN_GENERATE',
            action_params: {},
            alternatives_considered: [
              { option: 'Plan A cheap', score: 0.4 },
              { option: 'Plan B fast', score: 0.9 },
            ],
          } as any,
          reward: { total_reward: 0.5, reward_signals: [] },
          timestamp: new Date().toISOString(),
        },
      ],
      metadata: {} as any,
    };
    const rows = trajectoriesToDpoPreferenceRecords([t]);
    expect(rows).toHaveLength(1);
    expect(rows[0].chosen).toContain('Plan B');
    expect(rows[0].rejected).toContain('Plan A');
    expect(rows[0].prompt).toContain('weekend');
  });

  it('无 alternatives 时应跳过', () => {
    const t: RLTrajectory = {
      trajectory_id: 't2',
      steps: [
        {
          step_index: 0,
          state: {} as any,
          action: { action_type: 'PLAN_GENERATE', action_params: {} } as any,
          reward: { total_reward: 0, reward_signals: [] },
          timestamp: new Date().toISOString(),
        },
      ],
      metadata: {} as any,
    };
    expect(trajectoriesToDpoPreferenceRecords([t])).toEqual([]);
  });
});
