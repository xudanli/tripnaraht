/**
 * 主链编排协议 — 节点序 / 子图 / 短路 / 确认点 SSOT
 * 文档：ORCHESTRATION_MAIN_CHAIN_PROTOCOL.md
 * 边表：graph/edges/main-chain.edges.ts · plan-verify-loop.edges.ts
 * 预算：orchestration-governance-matrix.constants.ts
 */

import type { OrchestrationNodeId } from './graph/orchestration-graph.types';
import { MAIN_CHAIN_STATIC_EDGES } from './graph/edges/main-chain.edges';
import { PLAN_VERIFY_LOOP_EDGES, PLAN_VERIFY_LOOP_ENTRY } from './graph/edges/plan-verify-loop.edges';
import { PRE_PLAN_NODE_ORDER } from './graph/pre-plan-graph.runner';

/** pre_plan 子图节点序（与 PRE_PLAN_NODE_ORDER 同源） */
export const MAIN_CHAIN_PRE_PLAN_NODES: readonly OrchestrationNodeId[] = [
  'intake',
  'state_update',
  'research',
  'poi_selection',
  'gate_eval',
  'context_build',
] as const;

/** plan_gen 独立段（pre_plan 与 plan_verify 之间） */
export const MAIN_CHAIN_PLAN_GEN_NODE: OrchestrationNodeId = 'plan_gen';

/** plan_verify 子图入口与节点 */
export const MAIN_CHAIN_PLAN_VERIFY_ENTRY: OrchestrationNodeId = PLAN_VERIFY_LOOP_ENTRY;
export const MAIN_CHAIN_PLAN_VERIFY_NODES: readonly OrchestrationNodeId[] = [
  'optimize',
  'verify',
  'repair',
] as const;

/** post_plan 节点序 */
export const MAIN_CHAIN_POST_PLAN_NODES: readonly OrchestrationNodeId[] = [
  'narrate',
  'feedback',
  'hallucination',
] as const;

/**
 * 完整主链观测序（含中间节点；不含条件环上的二次 research）。
 * 与边表 happy-path + plan_verify 入口 / post_plan 对齐。
 */
export const MAIN_CHAIN_OBSERVED_NODE_ORDER: readonly OrchestrationNodeId[] = [
  ...MAIN_CHAIN_PRE_PLAN_NODES,
  MAIN_CHAIN_PLAN_GEN_NODE,
  ...MAIN_CHAIN_PLAN_VERIFY_NODES.filter((n) => n !== 'repair'),
  ...MAIN_CHAIN_POST_PLAN_NODES,
] as const;

export type MainChainShortCircuitId =
  | 'intake_hard_gap_clarify'
  | 'intake_structured_clarify'
  | 'research_transport_clarify'
  | 'gate_block'
  | 'gate_need_user_confirm'
  | 'plan_gen_empty_draft'
  | 'verify_fatal'
  | 'repair_count_exceeded'
  | 'repair_utility_decay'
  | 'plan_verify_step_budget'
  | 'return_to_research_budget_exceeded'
  | 'hallucination_hard_fact_conflict';

export interface MainChainShortCircuitSpec {
  id: MainChainShortCircuitId;
  fromNode: OrchestrationNodeId | 'plan_verify_loop';
  terminal: 'NEED_MORE_INFO' | 'NEED_CONFIRMATION' | 'FAILED' | 'BLOCKED';
  summary: string;
}

/** 冻结短路表（产品语义；实现细节见协议 MD） */
export const MAIN_CHAIN_SHORT_CIRCUITS: readonly MainChainShortCircuitSpec[] = [
  {
    id: 'intake_hard_gap_clarify',
    fromNode: 'intake',
    terminal: 'NEED_MORE_INFO',
    summary: '硬缺口（日期/目的地/人数等）→ 澄清，跳过 RESEARCH',
  },
  {
    id: 'intake_structured_clarify',
    fromNode: 'intake',
    terminal: 'NEED_MORE_INFO',
    summary: '结构化澄清卡（F-road / 旺季 / 选日槽等）',
  },
  {
    id: 'research_transport_clarify',
    fromNode: 'research',
    terminal: 'NEED_MORE_INFO',
    summary: '交通证据仍 degraded 且建议澄清 → 再注入 clarify',
  },
  {
    id: 'gate_block',
    fromNode: 'gate_eval',
    terminal: 'BLOCKED',
    summary: 'GATE BLOCK → 禁止 PLAN_GEN',
  },
  {
    id: 'gate_need_user_confirm',
    fromNode: 'gate_eval',
    terminal: 'NEED_CONFIRMATION',
    summary: 'GATE NEED_USER_CONFIRM（含 Abu REJECT）→ 短路 PLAN_GEN',
  },
  {
    id: 'plan_gen_empty_draft',
    fromNode: 'plan_gen',
    terminal: 'NEED_MORE_INFO',
    summary: '空草案 → 澄清终端，跳过 OPTIMIZE/VERIFY/NARRATE',
  },
  {
    id: 'verify_fatal',
    fromNode: 'verify',
    terminal: 'FAILED',
    summary: 'VERIFY fatal → terminal_failed，不 NARRATE',
  },
  {
    id: 'repair_count_exceeded',
    fromNode: 'repair',
    terminal: 'NEED_CONFIRMATION',
    summary: 'REPAIR 次数耗尽 → repair_halt_confirmation',
  },
  {
    id: 'repair_utility_decay',
    fromNode: 'repair',
    terminal: 'NEED_CONFIRMATION',
    summary: '效用连续下降 → utility_decay_halt_confirmation',
  },
  {
    id: 'plan_verify_step_budget',
    fromNode: 'plan_verify_loop',
    terminal: 'FAILED',
    summary: 'plan-verify 图步数耗尽 → PLAN_VERIFY_LOOP_STEP_BUDGET',
  },
  {
    id: 'hallucination_hard_fact_conflict',
    fromNode: 'hallucination',
    terminal: 'FAILED',
    summary: '硬事实冲突 / 检测器缺席且含事实声明 → 阻断 DONE',
  },
] as const;

export type MainChainUserConfirmPointId =
  | 'gate_abu_reject'
  | 'gate_readiness_must_soft'
  | 'gate_dre_neptune_marathon'
  | 'repair_halt'
  | 'utility_decay_halt'
  | 'negotiation_tradeoff'
  | 'flawed_draft_opt_in';

export interface MainChainUserConfirmPointSpec {
  id: MainChainUserConfirmPointId;
  resultStatus: 'NEED_CONFIRMATION' | 'NEED_MORE_INFO' | 'OK_WITH_BANNER';
  summary: string;
}

export const MAIN_CHAIN_USER_CONFIRM_POINTS: readonly MainChainUserConfirmPointSpec[] = [
  {
    id: 'gate_abu_reject',
    resultStatus: 'NEED_CONFIRMATION',
    summary: 'Abu REJECT 升格 NEED_USER_CONFIRM，禁止自动 PLAN_GEN',
  },
  {
    id: 'gate_readiness_must_soft',
    resultStatus: 'NEED_MORE_INFO',
    summary: 'Readiness must / 软约束可经澄清或 ADJUST_REQUIRED 继续',
  },
  {
    id: 'gate_dre_neptune_marathon',
    resultStatus: 'NEED_CONFIRMATION',
    summary: 'Dr.Dre REJECT + Neptune REPLACE（马拉松锚点）→ 用户确认',
  },
  {
    id: 'repair_halt',
    resultStatus: 'NEED_CONFIRMATION',
    summary: 'REPAIR 预算耗尽默认澄清（非静默瑕疵 SUCCESS）',
  },
  {
    id: 'utility_decay_halt',
    resultStatus: 'NEED_CONFIRMATION',
    summary: 'REPAIR 效用衰减上限 → 澄清',
  },
  {
    id: 'negotiation_tradeoff',
    resultStatus: 'NEED_CONFIRMATION',
    summary: 'trade-off 超阈值 → confirm_negotiation 卫星写回',
  },
  {
    id: 'flawed_draft_opt_in',
    resultStatus: 'OK_WITH_BANNER',
    summary: '仅 allow_flawed_draft_narrate=true 时才允许瑕疵草案 SUCCESS',
  },
] as const;

/** 从静态边表推导的 happy-path next 映射（契约测试用） */
export function buildMainChainHappyPathNextMap(): Map<OrchestrationNodeId, OrchestrationNodeId | 'END'> {
  const m = new Map<OrchestrationNodeId, OrchestrationNodeId | 'END'>();
  for (const e of MAIN_CHAIN_STATIC_EDGES) {
    m.set(e.from, e.to);
  }
  for (const e of PLAN_VERIFY_LOOP_EDGES) {
    if (e.reason === 'happy_path' || e.reason === 'repair_reverify') {
      m.set(e.from, e.to);
    }
  }
  return m;
}

/** 协议冻结版本 — Breaking 变更必须 bump */
export const MAIN_CHAIN_PROTOCOL_VERSION = '1.0.0' as const;

/** 契约：协议导出的 pre_plan 序必须与 runner 常量一致 */
export function assertPrePlanOrderAligned(): boolean {
  if (MAIN_CHAIN_PRE_PLAN_NODES.length !== PRE_PLAN_NODE_ORDER.length) return false;
  return MAIN_CHAIN_PRE_PLAN_NODES.every((n, i) => n === PRE_PLAN_NODE_ORDER[i]);
}
