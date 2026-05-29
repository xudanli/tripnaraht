import { Injectable, Logger } from '@nestjs/common';
import type {
  EvolvableSkill,
  SkillEvolverEvalContext,
  SkillEvolverTask,
  SkillTrajectory,
} from '../interfaces/skill-evolver.types';
import { SkillEvolverLlmHelper } from './skill-evolver-llm.helper';
import { SkillExecutorService } from './skill-executor.service';
import { FixtureCaseEvaluatorService } from './fixture-case-evaluator.service';
import { DecisionReplayTrajectoryService } from './decision-replay-trajectory.service';

const ADHERENCE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: '0-100' },
    violations: { type: 'array', items: { type: 'string' } },
  },
  required: ['score'],
};

@Injectable()
export class SkillEvolverEvaluatorService {
  private readonly logger = new Logger(SkillEvolverEvaluatorService.name);

  constructor(
    private readonly llm: SkillEvolverLlmHelper,
    private readonly executor: SkillExecutorService,
    private readonly fixtureEvaluator: FixtureCaseEvaluatorService,
    private readonly decisionReplay: DecisionReplayTrajectoryService,
  ) {}

  async score(
    traj: SkillTrajectory,
    skill?: EvolvableSkill,
    ctx?: SkillEvolverEvalContext,
  ): Promise<number> {
    if (!traj.steps.length && ctx?.mode !== 'decision_replay') return 0;

    const mode = ctx?.mode ?? traj.evalMode ?? 'llm';

    if (mode === 'decision_replay') {
      const fixtureScore = this.fixtureEvaluator.scoreTrajectory(traj, skill, ctx?.assertions);
      const live = ctx?.liveDecisionReplay ?? traj.liveDecisionReplay;
      if (live) {
        const engineBonus = traj.decisionReplayPassed ? 15 : 0;
        const rounded = Math.round(Math.min(100, fixtureScore * 0.85 + engineBonus) * 100) / 100;
        traj.score = rounded;
        traj.evalMode = 'decision_replay';
        traj.liveDecisionReplay = true;
        return rounded;
      }
      const engineScore = traj.decisionReplayPassed ? 100 : 0;
      const rounded = Math.round((engineScore * 0.55 + fixtureScore * 0.45) * 100) / 100;
      traj.score = rounded;
      traj.evalMode = 'decision_replay';
      return rounded;
    }

    if (mode === 'fixture') {
      const rounded = this.fixtureEvaluator.scoreTrajectory(traj, skill, ctx?.assertions);
      traj.score = rounded;
      traj.evalMode = 'fixture';
      return rounded;
    }

    const completion = traj.taskCompleted ? 100 : 0;
    const optimal = 3;
    const efficiency = Math.max(0, Math.min(100, (optimal / Math.max(traj.steps.length, 1)) * 100));
    const errors = traj.steps.filter((s) => s.isError).length;
    const recoveries = traj.steps.filter((s) => s.isRecovery).length;
    const errorHandling = errors === 0 ? 100 : Math.min(100, (recoveries / errors) * 100);
    const adherence = await this.scoreAdherence(traj, skill);

    const weights = {
      task_completion: 0.4,
      step_efficiency: 0.2,
      error_handling: 0.2,
      skill_adherence: 0.2,
    };

    const total =
      completion * weights.task_completion +
      efficiency * weights.step_efficiency +
      errorHandling * weights.error_handling +
      adherence * weights.skill_adherence;

    const rounded = Math.round(total * 100) / 100;
    traj.score = rounded;
    traj.evalMode = 'llm';
    return rounded;
  }

  private async scoreAdherence(traj: SkillTrajectory, skill?: EvolvableSkill): Promise<number> {
    const spec = skill?.body ?? traj.skillContentSnapshot ?? '';
    if (!spec) return 70;

    const stepsText = traj.steps
      .map((s) => `thought: ${s.thought}\naction: ${s.action}\nresult: ${s.result}`)
      .join('\n---\n');

    const prompt = `评估轨迹对技能规范的遵守程度，输出 0-100 的 score。

技能:
${spec.slice(0, 3000)}

轨迹:
${stepsText.slice(0, 3000)}`;

    const raw = await this.llm.structured<{ score: number }>(
      prompt,
      ADHERENCE_SCHEMA,
      { score: traj.taskCompleted ? 75 : 40 },
    );
    return Math.max(0, Math.min(100, raw.score ?? 50));
  }

  async evaluateSkillOnBatch(
    skill: EvolvableSkill,
    taskBatch: SkillEvolverTask[],
    ctx?: SkillEvolverEvalContext,
  ): Promise<{ avgScore: number; trajectories: SkillTrajectory[] }> {
    const scores: number[] = [];
    const trajectories: SkillTrajectory[] = [];

    for (const task of taskBatch) {
      let traj: SkillTrajectory;
      if (ctx?.mode === 'decision_replay' && ctx.sourceE2eCaseId) {
        const e2eId = ctx.sourceE2eCaseId;
        const { trajectory } = await this.decisionReplay.run(e2eId, skill);
        traj = trajectory;
      } else {
        traj = await this.executor.run(skill, undefined, [task], ctx);
      }
      if (ctx?.fixtureCaseId) traj.fixtureCaseId = ctx.fixtureCaseId;
      scores.push(await this.score(traj, skill, ctx));
      trajectories.push(traj);
    }

    if (!scores.length) return { avgScore: 0, trajectories: [] };
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const rounded = Math.round(avg * 100) / 100;
    this.logger.log(
      `[Evaluator] ${skill.skillId} v${skill.version} mode=${ctx?.mode ?? 'llm'} batch avg=${rounded.toFixed(2)}`,
    );
    return { avgScore: rounded, trajectories };
  }

  /** decision_replay 模式：单次 TD E2E 回放轨迹（策略探索对引擎无意义，由 MetaSkillEngine 调用） */
  async runReplayTrajectory(
    skill: EvolvableSkill,
    ctx: SkillEvolverEvalContext,
  ): Promise<SkillTrajectory> {
    if (ctx.mode !== 'decision_replay' || !ctx.sourceE2eCaseId) {
      throw new Error('runReplayTrajectory 需要 mode=decision_replay 且 sourceE2eCaseId');
    }
    const { trajectory } = await this.decisionReplay.run(ctx.sourceE2eCaseId, skill);
    if (ctx.fixtureCaseId) trajectory.fixtureCaseId = ctx.fixtureCaseId;
    return trajectory;
  }

  describeFailedAssertions(
    traj: SkillTrajectory,
    skill: EvolvableSkill,
    ctx?: SkillEvolverEvalContext,
  ): string[] {
    const out: string[] = [];
    if (ctx?.mode === 'fixture' || ctx?.mode === 'decision_replay') {
      out.push(...this.fixtureEvaluator.describeFailedAssertions(traj, skill, ctx.assertions));
    }
    if (ctx?.mode === 'decision_replay' && traj.decisionReplayPassed === false) {
      out.push(`decision_replay passed=false diff=${(traj.decisionReplayDiffSummary ?? '').slice(0, 200)}`);
    }
    return out;
  }
}
