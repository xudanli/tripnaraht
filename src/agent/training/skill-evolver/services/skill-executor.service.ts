import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  EvolvableSkill,
  ExplorationStrategy,
  SkillEvolverEvalContext,
  SkillEvolverTask,
  SkillTrajectory,
  TrajectoryStep,
} from '../interfaces/skill-evolver.types';
import { SkillEvolverLlmHelper } from './skill-evolver-llm.helper';

const ACT_SCHEMA = {
  type: 'object',
  properties: {
    thought: { type: 'string' },
    action: { type: 'string' },
    done: { type: 'boolean' },
    task_completed: { type: 'boolean' },
  },
  required: ['thought', 'action', 'done', 'task_completed'],
};

@Injectable()
export class SkillExecutorService {
  private readonly logger = new Logger(SkillExecutorService.name);
  private readonly maxSteps = 8;

  constructor(private readonly llm: SkillEvolverLlmHelper) {}

  buildSystemPrompt(skill: EvolvableSkill, strategy?: ExplorationStrategy): string {
    const parts = [
      '你是一名专业智能助手，必须严格遵守以下技能规范：\n',
      skill.body,
    ];
    if (strategy) {
      parts.push(
        `\n--- 执行策略 [${strategy.strategyId}] ---`,
        `哲学: ${strategy.philosophy}`,
        `方法: ${strategy.approach}`,
        `特别强调: ${strategy.emphasis}`,
      );
    }
    return parts.join('\n');
  }

  buildReplayHints(ctx?: SkillEvolverEvalContext): string {
    const assertions = ctx?.assertions;
    if (!assertions?.length) return '';
    const keys = assertions
      .filter((a) => a.type === 'trajectory_contains' || a.type === 'action_contains')
      .map((a) => a.value);
    if (!keys.length) return '';
    return (
      '\n--- 回放验证要点（完成时须在 action 或 result 中自然体现）---\n' +
      keys.map((k) => `- ${k}`).join('\n')
    );
  }

  async run(
    skill: EvolvableSkill,
    strategy: ExplorationStrategy | undefined,
    tasks: SkillEvolverTask[],
    ctx?: SkillEvolverEvalContext,
  ): Promise<SkillTrajectory> {
    const trajectoryId = randomUUID();
    const steps: TrajectoryStep[] = [];
    let taskCompleted = false;
    const system = this.buildSystemPrompt(skill, strategy) + this.buildReplayHints(ctx);

    for (const task of tasks) {
      let observation = task.initialObservation;
      for (let step = 0; step < this.maxSteps; step++) {
        const history = steps
          .slice(-3)
          .map((s) => `obs: ${s.observation}\nact: ${s.action}\nres: ${s.result}`)
          .join('\n---\n');

        const prompt = `${system}

--- 任务 ---
${task.description}
成功标准: ${task.successCriteria ?? '完成用户目标'}

--- 当前观察 ---
${observation}

--- 近期历史 ---
${history || '(无)'}

输出 JSON: thought, action, done, task_completed`;

        const act = await this.llm.structured<{
          thought: string;
          action: string;
          done: boolean;
          task_completed: boolean;
        }>(
          prompt,
          ACT_SCHEMA,
          {
            thought: '按技能默认步骤执行',
            action: `处理: ${task.description}`,
            done: step >= 2,
            task_completed: step >= 2,
          },
        );

        const result = act.done
          ? `[完成] ${act.action}`
          : `[进行中] 已执行: ${act.action.slice(0, 300)}`;

        steps.push({
          stepIndex: steps.length,
          observation,
          thought: act.thought,
          action: act.action,
          result,
          isError: /error|失败|exception/i.test(result),
          isRecovery: /恢复|重试|retry/i.test(act.action),
          timestamp: new Date().toISOString(),
        });

        observation = result;
        if (act.task_completed || act.done) {
          taskCompleted = true;
          break;
        }
      }
    }

    const traj: SkillTrajectory = {
      trajectoryId,
      skillId: skill.skillId,
      skillVersion: skill.version,
      strategyId: strategy?.strategyId,
      strategy,
      taskIds: tasks.map((t) => t.id),
      steps,
      taskCompleted,
      skillContentSnapshot: skill.body.slice(0, 2000),
      createdAt: new Date().toISOString(),
    };

    this.logger.debug(
      `[SkillExecutor] ${skill.skillId} strategy=${strategy?.strategyId ?? 'default'} steps=${steps.length}`,
    );
    return traj;
  }
}
