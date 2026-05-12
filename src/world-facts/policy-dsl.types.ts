/**
 * Policy DSL v1 — 治理层统一语义：软偏置 / 硬约束 / 覆盖策略 + 可追溯优先级。
 */

import type { ExecutionPlanningContext } from './execution-planning-context.types';

/** 策略输入：当前由 ExecutionPlanningContext 承载（executionHistory + worldSignals + hints） */
export type PolicyInputContext = ExecutionPlanningContext;

export type PolicyLayerKind = 'soft_bias' | 'hard_constraint' | 'override';

/** 单条策略追踪（审计 / 运营面板 / 前端 explain） */
export interface PolicyTraceEntry {
  ruleId: string;
  kind: PolicyLayerKind;
  /** 越小越靠前（展示顺序）；override 通常 10–40，soft/hard 在 per-route 评估里单给 */
  priority: number;
  message: string;
}

/** Override 类策略聚合结果（例：RD selection 缓存绕过） */
export interface PolicyOverrideEvaluation {
  bypassSelectionCache: boolean;
  trace: PolicyTraceEntry[];
  /** 当前生效的策略配置版本（Configuration Plane） */
  policyRevision: string;
  /** 配置来源：default / file / env:… */
  policyConfigSources: string[];
  /** Registry 中的策略包 id（若启用 Policy Data System） */
  policyBundleId?: string;
  /** Domain Router 命中的 rule id */
  policyRoutingRuleId?: string;
}
