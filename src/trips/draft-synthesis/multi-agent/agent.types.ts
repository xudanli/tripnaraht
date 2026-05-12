/**
 * 专职 Agent 角色（与现有引擎映射：Planner≈route/algo，Experience≈LLM，Constraint≈sim/gate）。
 */
export type AgentRole = 'PLANNER' | 'EXPERIENCE' | 'CONSTRAINT';

export type ConflictKind =
  | 'TIME'
  | 'EXPERIENCE_ROUTE'
  | 'RISK'
  | 'COST'
  | 'OTHER';

export type ViolationSeverity = 'blocking' | 'soft';

export interface ConstraintViolation {
  kind: ConflictKind;
  severity: ViolationSeverity;
  detail: string;
}

export interface AgentContribution {
  agent: AgentRole;
  /** 该角色「主张」的 planId 子集（来自 Pareto 候选 id） */
  supportedPlanIds: string[];
  note: string;
}
