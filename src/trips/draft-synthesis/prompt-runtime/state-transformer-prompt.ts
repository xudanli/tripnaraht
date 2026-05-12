import type { TripDraftState } from '../state/trip-draft-state.types';

/**
 * State Transformer Prompt（下一阶段替换「一次性生成」编排）
 * LLM 角色：基于当前 TripDraftState 做增量更新，而非重算整条行程。
 */
export function renderStateTransformerPrompt(state: TripDraftState, candidatesCompactJson: string): string {
  const stateJson = JSON.stringify(state, null, 2);
  return `你是 TripNARA 的 Draft State 生成器（State Transformer），不是完整路径规划器。

你的任务：
- 基于当前 TripDraftState
- 更新并生成下一版本 state（单一 JSON）
- 不允许在无理由时清空或重发明整条行程

========================
当前状态（TripDraftState）：
${stateJson}

候选池（Topology / 紧凑候选）：
${candidatesCompactJson}

规则：
1. 只修改必要的 slot / 字段
2. 保持已有合理选择（除非与约束冲突）
3. 不得重复已有 placeId（除非策略明确允许）
4. 优先优化地理连续性，而不是重排全部天
5. 不确定时使用 deferred 或低 confidence / validationRequired

输出：
- 完整更新后的 TripDraftState JSON（version 应为 ${state.version + 1}）

禁止输出 Markdown，仅输出 JSON。`;
}
