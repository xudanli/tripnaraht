import { Injectable, Logger } from '@nestjs/common';
import type {
  EvolvableSkill,
  ReplayAssertion,
  SkillTrajectory,
} from '../interfaces/skill-evolver.types';

@Injectable()
export class FixtureCaseEvaluatorService {
  private readonly logger = new Logger(FixtureCaseEvaluatorService.name);

  scoreTrajectory(
    traj: SkillTrajectory,
    skill: EvolvableSkill | undefined,
    assertions: ReplayAssertion[] | undefined,
  ): number {
    const builtIn = this.builtinScore(traj, skill);
    if (!assertions?.length) {
      return builtIn;
    }

    let totalWeight = 0;
    let earned = 0;
    for (const a of assertions) {
      const w = a.weight ?? 1;
      totalWeight += w;
      if (this.checkAssertion(a, traj, skill)) earned += w;
    }
    const assertionScore = totalWeight > 0 ? (earned / totalWeight) * 100 : builtIn;
    const blended = Math.round((builtIn * 0.3 + assertionScore * 0.7) * 100) / 100;
    this.logger.debug(
      `[FixtureEvaluator] traj=${traj.trajectoryId} builtin=${builtIn} assertion=${assertionScore} blended=${blended}`,
    );
    return blended;
  }

  /** 返回未通过断言的可读描述，供 contrastive edit 提示 */
  describeFailedAssertions(
    traj: SkillTrajectory,
    skill: EvolvableSkill | undefined,
    assertions: ReplayAssertion[] | undefined,
  ): string[] {
    if (!assertions?.length) return [];
    return assertions
      .filter((a) => !this.checkAssertion(a, traj, skill))
      .map((a) => `${a.type}="${a.value}"`);
  }

  private builtinScore(traj: SkillTrajectory, skill?: EvolvableSkill): number {
    if (!traj.steps.length) return 0;
    const completion = traj.taskCompleted ? 100 : 20;
    const errors = traj.steps.filter((s) => s.isError).length;
    const errorPenalty = Math.min(40, errors * 15);
    let skillBonus = 0;
    if (skill && traj.steps.some((s) => s.action.toLowerCase().includes('参数'))) {
      skillBonus = 10;
    }
    return Math.max(0, Math.min(100, completion - errorPenalty + skillBonus));
  }

  private checkAssertion(
    a: ReplayAssertion,
    traj: SkillTrajectory,
    skill?: EvolvableSkill,
  ): boolean {
    const hayTraj = traj.steps
      .map((s) => `${s.observation} ${s.thought ?? ''} ${s.action} ${s.result}`)
      .join('\n')
      .toLowerCase();
    const v = a.value.toLowerCase();

    switch (a.type) {
      case 'task_completed':
        return a.value === 'true' ? traj.taskCompleted : !traj.taskCompleted;
      case 'trajectory_contains':
        return hayTraj.includes(v);
      case 'action_contains':
        return traj.steps.some((s) => s.action.toLowerCase().includes(v));
      case 'skill_body_contains':
        return (skill?.body ?? traj.skillContentSnapshot ?? '').toLowerCase().includes(v);
      default:
        return false;
    }
  }
}
