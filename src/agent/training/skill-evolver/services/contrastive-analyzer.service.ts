import { Injectable, Logger } from '@nestjs/common';
import type {
  ContrastiveDelta,
  EvolvableSkill,
  SkillTrajectory,
} from '../interfaces/skill-evolver.types';
import { SkillEvolverLlmHelper } from './skill-evolver-llm.helper';

const DELTA_SCHEMA = {
  type: 'object',
  properties: {
    success_factors: { type: 'array', items: { type: 'string' } },
    root_causes: { type: 'array', items: { type: 'string' } },
    skill_additions: { type: 'array', items: { type: 'string' } },
    skill_modifications: { type: 'array', items: { type: 'string' } },
    skill_deletions: { type: 'array', items: { type: 'string' } },
    emphasis_items: { type: 'array', items: { type: 'string' } },
    execution_lapses: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'success_factors',
    'root_causes',
    'skill_additions',
    'skill_modifications',
    'skill_deletions',
    'emphasis_items',
    'execution_lapses',
  ],
};

@Injectable()
export class ContrastiveAnalyzerService {
  private readonly logger = new Logger(ContrastiveAnalyzerService.name);

  constructor(private readonly llm: SkillEvolverLlmHelper) {}

  formatTrajectory(traj: SkillTrajectory): string {
    return traj.steps
      .map(
        (s, i) =>
          `Step ${i + 1}: obs=${s.observation.slice(0, 200)} action=${s.action.slice(0, 200)} result=${s.result.slice(0, 200)}`,
      )
      .join('\n');
  }

  async analyze(
    bestTraj: SkillTrajectory,
    worstTraj: SkillTrajectory,
    skill: EvolvableSkill,
    failedAssertions?: string[],
  ): Promise<ContrastiveDelta> {
    const assertionBlock =
      failedAssertions?.length ?
        `\n未通过的回放断言（技能修订应帮助执行时满足）:\n${failedAssertions.map((a) => `- ${a}`).join('\n')}\n`
      : '';

    const prompt = `对比两条执行轨迹（Δr = φ(τ+) − φ(τ−)），输出技能改进信号。
${assertionBlock}
最佳轨迹 score=${bestTraj.score ?? '?'}:
${this.formatTrajectory(bestTraj)}

最差轨迹 score=${worstTraj.score ?? '?'}:
${this.formatTrajectory(worstTraj)}

当前技能摘要:
${skill.body.slice(0, 4000)}

区分：技能缺陷 vs 执行失误（execution_lapses 只强调不修改核心规则）。
JSON 字段：success_factors, root_causes, skill_additions, skill_modifications, skill_deletions, emphasis_items, execution_lapses`;

    const empty: ContrastiveDelta = {
      successFactors: [],
      rootCauses: [],
      skillAdditions: [],
      skillModifications: [],
      skillDeletions: [],
      emphasisItems: [],
      executionLapses: [],
    };

    const raw = await this.llm.structured<Record<string, string[]>>(
      prompt,
      DELTA_SCHEMA,
      {
        success_factors: [],
        root_causes: [],
        skill_additions: [],
        skill_modifications: [],
        skill_deletions: [],
        emphasis_items: [],
        execution_lapses: [],
      },
    );

    const delta: ContrastiveDelta = {
      successFactors: raw.success_factors ?? [],
      rootCauses: raw.root_causes ?? [],
      skillAdditions: raw.skill_additions ?? [],
      skillModifications: raw.skill_modifications ?? [],
      skillDeletions: raw.skill_deletions ?? [],
      emphasisItems: raw.emphasis_items ?? [],
      executionLapses: raw.execution_lapses ?? [],
    };

    this.logger.log(
      `[ContrastiveAnalyzer] ${skill.skillId}: +${delta.skillAdditions.length} additions, ${delta.executionLapses.length} lapses`,
    );
    return delta;
  }
}
