/**
 * Context Budget Manager Service
 *
 * Phase 4: Context Engine 工业化 - 集中管理 Token 预算
 * 职责：60% 填充原则、按 phase/agent 差异化预算
 *
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { Injectable } from '@nestjs/common';
import {
  ContextBudgetInput,
  ContextBudgetOutput,
  IContextBudgetManager,
} from '../interfaces/context-budget.interface';
import {
  CONTEXT_PACKAGE_WINDOW,
  CONTEXT_FILL_RATIO,
  DEFAULT_TOKEN_BUDGET,
} from '../constants/token-budget.constants';

/** phase/agent 差异化预算（可扩展） */
const PHASE_AGENT_BUDGET_OVERRIDES: Record<string, number> = {
  // 示例：planning 阶段可给更多预算
  // 'planning:PLANNER': 4500,
};

@Injectable()
export class ContextBudgetManagerService implements IContextBudgetManager {
  getBudget(input?: ContextBudgetInput): ContextBudgetOutput {
    const phase = input?.phase ?? '';
    const agent = input?.agent ?? '';
    const modelContextWindow = input?.modelContextWindow ?? CONTEXT_PACKAGE_WINDOW;

    const key = `${phase}:${agent}`;
    const override = PHASE_AGENT_BUDGET_OVERRIDES[key];
    const tokenBudget = override ?? Math.floor(modelContextWindow * CONTEXT_FILL_RATIO);

    return {
      tokenBudget,
      fillRatio: CONTEXT_FILL_RATIO,
    };
  }

  /** 获取默认预算（向后兼容） */
  getDefaultBudget(): number {
    return DEFAULT_TOKEN_BUDGET;
  }
}
