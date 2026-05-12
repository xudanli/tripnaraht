import type { AgentContribution } from './agent.types';

/**
 * 基于候选 id 生成可解释的专职 Agent 主张（工程占位，非独立推理）。
 */
export function defaultAgentContributions(planIds: string[]): AgentContribution[] {
  const ids = new Set(planIds);
  return [
    {
      agent: 'PLANNER',
      supportedPlanIds: [...ids].filter((id) => id === 'ALGO_ONLY' || id === 'MERGED'),
      note: '路线聚类 / 时间可行性优先：偏好算法骨架与融合方案',
    },
    {
      agent: 'EXPERIENCE',
      supportedPlanIds: [...ids].filter((id) => id === 'LLM_ONLY' || id === 'MERGED'),
      note: '叙事与风格一致：偏好 LLM 草案与融合方案',
    },
    {
      agent: 'CONSTRAINT',
      supportedPlanIds: [...ids],
      note: '对全部候选做可行性与风险守门（见 ConstraintReport）',
    },
  ];
}
