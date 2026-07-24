import { Injectable, Logger } from '@nestjs/common';
import type {
  EvolvableSkill,
  ExplorationStrategy,
  SkillEvolverTask,
} from '../interfaces/skill-evolver.types';
import { SkillEvolverLlmHelper } from './skill-evolver-llm.helper';

const STRATEGY_SCHEMA = {
  type: 'object',
  properties: {
    strategies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          strategy_id: { type: 'string' },
          philosophy: { type: 'string' },
          approach: { type: 'string' },
          emphasis: { type: 'string' },
          risk: { type: 'string' },
        },
        required: ['strategy_id', 'philosophy', 'approach', 'emphasis', 'risk'],
      },
    },
  },
  required: ['strategies'],
};

@Injectable()
export class StrategyExplorerService {
  private readonly logger = new Logger(StrategyExplorerService.name);

  constructor(private readonly llm: SkillEvolverLlmHelper) {}

  async generate(skill: EvolvableSkill, taskBatch: SkillEvolverTask[], k = 4): Promise<ExplorationStrategy[]> {
    const taskDesc = taskBatch.map((t) => `- [${t.id}] ${t.description}`).join('\n');
    const prompt = `你是策略设计专家。根据技能与任务，设计 ${k} 个显著不同的执行策略（结构化，非 temperature 采样）。

--- 当前技能 ---
${skill.body.slice(0, 6000)}

--- 任务 ---
${taskDesc}

每个策略需覆盖不同权衡（速度/准确、保守/激进、全局/局部等）。
以 JSON 返回 strategies 数组，字段：strategy_id, philosophy, approach, emphasis, risk。`;

    const fallback = this.fallbackStrategies(k);
    const result = await this.llm.structured<{ strategies: Array<Record<string, string>> }>(
      prompt,
      STRATEGY_SCHEMA,
      { strategies: fallback.map((s) => ({
        strategy_id: s.strategyId,
        philosophy: s.philosophy,
        approach: s.approach,
        emphasis: s.emphasis,
        risk: s.risk,
      })) },
    );

    const strategies = (result.strategies ?? []).slice(0, k).map((s, i) => ({
      strategyId: s.strategy_id || String.fromCharCode(65 + i),
      philosophy: s.philosophy ?? '',
      approach: s.approach ?? '',
      emphasis: s.emphasis ?? '',
      risk: s.risk ?? '',
    }));

    while (strategies.length < k) {
      const fb = fallback[strategies.length];
      if (fb) strategies.push(fb);
    }

    this.logger.log(`[StrategyExplorer] generated ${strategies.length} strategies for ${skill.skillId}`);
    return strategies.slice(0, k);
  }

  private fallbackStrategies(k: number): ExplorationStrategy[] {
    const base: ExplorationStrategy[] = [
      {
        strategyId: 'A',
        philosophy: '稳妥优先，逐步验证',
        approach: '每步先检查前置条件再行动',
        emphasis: '错误处理与回滚',
        risk: '可能步骤偏多',
      },
      {
        strategyId: 'B',
        philosophy: '速度优先，快速试错',
        approach: '并行尝试多种路径，早失败早调整',
        emphasis: '缩短反馈环',
        risk: '可能遗漏边界情况',
      },
      {
        strategyId: 'C',
        philosophy: '全局最优，先规划后执行',
        approach: '先列出完整计划再逐步执行',
        emphasis: '依赖关系与顺序',
        risk: '计划可能过度复杂',
      },
      {
        strategyId: 'D',
        philosophy: '最小变更，贴近技能原文',
        approach: '严格按技能步骤顺序执行',
        emphasis: '技能遵守度',
        risk: '对异常场景反应慢',
      },
    ];
    return base.slice(0, k);
  }
}
