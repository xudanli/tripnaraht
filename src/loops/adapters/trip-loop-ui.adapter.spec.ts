import { buildTripLoopUiView } from './trip-loop-ui.adapter';
import type { ReadinessRepairLoopResult } from '../types/loop-run.types';

describe('trip-loop-ui.adapter', () => {
  const baseSnapshot = {
    readinessScore: 62,
    hardBlockers: 2,
    mustHandleCount: 2,
    suggestAdjustCount: 1,
    canStartExecute: false,
    verdictStatus: 'NOT_EXECUTABLE',
  };

  it('builds awaiting_approval phase with issue cards', () => {
    const result: ReadinessRepairLoopResult = {
      loopRunId: 'loop_1',
      status: 'WAITING_FOR_HUMAN',
      runtimeState: 'WAITING_FOR_HUMAN',
      before: baseSnapshot,
      after: { ...baseSnapshot, readinessScore: 70 },
      iterations: [
        {
          sequence: 1,
          issueId: 'issue-1',
          blockerId: 'blocker-1',
          issueTitle: '冰川徒步时间冲突',
          proposal: {
            optionId: 'adjust_time',
            title: '将冰川徒步提前至 09:00',
            actionType: 'adjust_time',
          },
          validation: {
            passed: true,
            previewStatus: 'preview',
            feasibilityScoreBefore: 62,
            feasibilityScoreAfter: 78,
          },
          decision: 'CONTINUE',
          attemptedOptions: ['adjust_time', 'change_restaurant'],
        },
      ],
      recommendedPatches: [
        {
          issueId: 'issue-1',
          blockerId: 'blocker-1',
          optionId: 'adjust_time',
          title: '将冰川徒步提前至 09:00',
          actionType: 'adjust_time',
          previewStatus: 'preview',
        },
      ],
      requiresApproval: true,
      stopReason: 'patches_ready_for_approval',
    };

    const ui = buildTripLoopUiView(result);
    expect(ui.phase).toBe('awaiting_approval');
    expect(ui.progress.totalChecks).toBe(5);
    expect(ui.issueCards).toHaveLength(1);
    expect(ui.issueCards[0].recommendation).toContain('09:00');
    expect(ui.primaryAction?.patchCount).toBe(1);
  });

  it('builds completed phase when executable', () => {
    const result: ReadinessRepairLoopResult = {
      loopRunId: 'loop_2',
      status: 'COMPLETED',
      runtimeState: 'MONITORING',
      before: { ...baseSnapshot, hardBlockers: 0, mustHandleCount: 0, readinessScore: 90, canStartExecute: true, verdictStatus: 'EXECUTABLE' },
      after: { ...baseSnapshot, hardBlockers: 0, mustHandleCount: 0, readinessScore: 90, canStartExecute: true, verdictStatus: 'EXECUTABLE' },
      iterations: [],
      recommendedPatches: [],
      requiresApproval: false,
    };

    const ui = buildTripLoopUiView(result);
    expect(ui.phase).toBe('completed');
    expect(ui.headline).toContain('已通过');
  });
});
