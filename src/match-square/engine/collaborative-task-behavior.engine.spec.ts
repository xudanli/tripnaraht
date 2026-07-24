import type { CollaborativeTaskFlywheelMetadata } from './collaborative-task-behavior.engine';
import { applyCollaborativeTaskBehaviorEvent } from './collaborative-task-behavior.engine';
import { COLLABORATIVE_TASK_FLYWHEEL_VERSION } from '../types/recruitment-task-flywheel.types';

function basePlan(): CollaborativeTaskFlywheelMetadata {
  return {
    version: COLLABORATIVE_TASK_FLYWHEEL_VERSION,
    recruitmentPostId: 'post-1',
    dispatchedAt: new Date(Date.now() - 3600_000).toISOString(),
    tasks: [
      {
        taskId: 'task-1',
        templateId: 'ford_gear_shared_checklist',
        title: '复核涉水装备',
        description: '上传清单',
        assigneeUserId: 'driver-1',
        assigneeRoleLabel: '老司机',
        priority: 'critical',
        status: 'pending',
        triggeredBy: { vibeChipIds: ['glacier_river_ford'], milestoneIds: [] },
        behaviorCaptureEnabled: true,
        revisionCount: 0,
      },
    ],
    behaviorLog: [],
  };
}

describe('applyCollaborativeTaskBehaviorEvent', () => {
  it('allows assignee to confirm pending task', () => {
    const result = applyCollaborativeTaskBehaviorEvent({
      plan: basePlan(),
      taskId: 'task-1',
      action: 'confirm',
      actorUserId: 'driver-1',
      actorRole: 'member',
    });

    expect(result.task.status).toBe('confirmed');
    expect(result.dnaReasons).toContain('TASK_CHAIN_CONFIRMED');
    expect(result.plan.behaviorLog).toHaveLength(1);
    expect(result.task.responseLatencyMs).toBeGreaterThan(0);
  });

  it('allows captain rollback after confirm', () => {
    let plan = basePlan();
    plan = applyCollaborativeTaskBehaviorEvent({
      plan,
      taskId: 'task-1',
      action: 'confirm',
      actorUserId: 'driver-1',
      actorRole: 'member',
    }).plan;

    const result = applyCollaborativeTaskBehaviorEvent({
      plan,
      taskId: 'task-1',
      action: 'rollback',
      actorUserId: 'captain-1',
      actorRole: 'captain',
      note: '涉水杖型号需统一',
    });

    expect(result.task.status).toBe('rolled_back');
    expect(result.task.revisionCount).toBe(1);
    expect(result.dnaReasons).toContain('TASK_CHAIN_ROLLED_BACK');
  });

  it('rejects confirm from unrelated member', () => {
    expect(() =>
      applyCollaborativeTaskBehaviorEvent({
        plan: basePlan(),
        taskId: 'task-1',
        action: 'confirm',
        actorUserId: 'other-1',
        actorRole: 'member',
      }),
    ).toThrow(/负责人或队长/);
  });

  it('allows captain ack_timeout on pending task', () => {
    const result = applyCollaborativeTaskBehaviorEvent({
      plan: basePlan(),
      taskId: 'task-1',
      action: 'ack_timeout',
      actorUserId: 'captain-1',
      actorRole: 'captain',
    });

    expect(result.task.status).toBe('timed_out');
    expect(result.dnaReasons).toContain('TASK_CHAIN_TIMEOUT');
  });
});
