import { mapE2eReplayToTrajectory, runE2eReplayTrajectory } from './decision-replay-trajectory.util';
import { icelandHighlandsDemMissingCase } from '../../../../trips/decision/evaluation/e2e-cases/iceland-highlands.example';
import type { EvolvableSkill } from '../interfaces/skill-evolver.types';

const skill: EvolvableSkill = {
  skillId: 'country_pack.IS',
  name: 'IS',
  version: 1,
  content: '',
  body: 'DEM missing must REJECT',
  frontmatter: { skill_id: 'country_pack.IS', name: 'IS', version: 1 },
  tags: [],
  applicableScenarios: [],
  filePath: '/tmp/is.md',
  artifactType: 'country_pack',
};

describe('decision-replay-trajectory.util', () => {
  it('runs TD fixture replay and maps trajectory', async () => {
    const { trajectory, replay } = await runE2eReplayTrajectory(
      icelandHighlandsDemMissingCase.id,
      skill,
    );
    expect(replay.passed).toBe(true);
    expect(trajectory.decisionReplayPassed).toBe(true);
    expect(trajectory.steps.length).toBeGreaterThan(0);
    expect(trajectory.evalMode).toBe('decision_replay');
  });

  it('mapE2eReplayToTrajectory preserves passed flag', () => {
    const replay = {
      case: icelandHighlandsDemMissingCase,
      passed: false,
      diff: { hasDiff: true, details: [] } as any,
      actual: {
        logs: [],
        finalPlan: { days: 0, allowed: false },
      },
    };
    const traj = mapE2eReplayToTrajectory(replay as any, skill);
    expect(traj.taskCompleted).toBe(false);
    expect(traj.decisionReplayPassed).toBe(false);
  });
});
