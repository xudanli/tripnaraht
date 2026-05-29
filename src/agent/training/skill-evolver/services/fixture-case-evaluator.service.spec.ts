import { FixtureCaseEvaluatorService } from './fixture-case-evaluator.service';
import type { EvolvableSkill, SkillTrajectory } from '../interfaces/skill-evolver.types';

describe('FixtureCaseEvaluatorService', () => {
  const svc = new FixtureCaseEvaluatorService();

  const skill: EvolvableSkill = {
    skillId: 'api_calling',
    name: 'API',
    version: 1,
    content: '',
    body: '检查参数与重试；勿记录 api_key',
    frontmatter: { skill_id: 'api_calling', name: 'API', version: 1 },
    tags: [],
    applicableScenarios: [],
    filePath: '/tmp/x.md',
    artifactType: 'markdown_skill',
  };

  const traj: SkillTrajectory = {
    trajectoryId: 't1',
    skillId: 'api_calling',
    skillVersion: 1,
    taskIds: ['t1'],
    steps: [
      {
        stepIndex: 0,
        observation: '401',
        thought: '检查参数',
        action: '验证 api_key 后重试',
        result: 'ok',
        timestamp: new Date().toISOString(),
      },
    ],
    taskCompleted: true,
    createdAt: new Date().toISOString(),
  };

  it('scores with assertions', () => {
    const score = svc.scoreTrajectory(traj, skill, [
      { type: 'skill_body_contains', value: '重试', weight: 1 },
      { type: 'trajectory_contains', value: '参数', weight: 1 },
      { type: 'task_completed', value: 'true', weight: 1 },
    ]);
    expect(score).toBeGreaterThan(50);
  });

  it('lists failed assertion descriptions', () => {
    const failed = svc.describeFailedAssertions(traj, skill, [
      { type: 'trajectory_contains', value: 'allow', weight: 1 },
      { type: 'task_completed', value: 'true', weight: 1 },
    ]);
    expect(failed).toContain('trajectory_contains="allow"');
    expect(failed).not.toContain('task_completed="true"');
  });
});
