// src/agent/context-engine/constants/token-budget.constants.ts
/**
 * Token 预算常量
 *
 * Context Orchestrator 原则：60% 上下文填充，保留推理空间
 * 参考：docs/CONTEXT_ORCHESTRATOR_IMPLEMENTATION_PLAN.md
 */

/**  Context Package 分配到的上下文窗口（实际 prompt 中 context 部分的上限） */
export const CONTEXT_PACKAGE_WINDOW = 6_000;

/** 填充比例：永远不要塞满，保留推理空间 */
export const CONTEXT_FILL_RATIO = 0.6;

/** 默认 Token 预算 = 窗口 × 60% */
export const DEFAULT_TOKEN_BUDGET = Math.floor(CONTEXT_PACKAGE_WINDOW * CONTEXT_FILL_RATIO);
