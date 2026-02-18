/**
 * Context Budget Manager 接口
 *
 * Phase 4: Context Engine 工业化 - Token 预算分配、策略选择
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

/** ContextBudgetManager 输入 */
export interface ContextBudgetInput {
  phase?: string;
  agent?: string;
  modelContextWindow?: number;
}

/** ContextBudgetManager 输出 */
export interface ContextBudgetOutput {
  tokenBudget: number;
  fillRatio: number;
}

/** ContextBudgetManager 能力接口 */
export interface IContextBudgetManager {
  getBudget(input?: ContextBudgetInput): ContextBudgetOutput;
}
