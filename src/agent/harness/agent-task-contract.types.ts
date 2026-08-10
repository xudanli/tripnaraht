/**
 * Agent Task Contract — Harness 第一等对象（Sprint 1）。
 * LLM 建议动作；Harness 以本合同裁定允许做到哪一步。
 */

export const AGENT_TASK_CONTRACT_SCHEMA = 'tripnara.agent_task_contract@v1' as const;

export type AgentTaskType =
  | 'TRIP_QUERY'
  | 'DECISION_SUPPORT'
  | 'ITINERARY_ADJUST'
  | 'LIVE_EXECUTION'
  | 'CONTENT_IMPORT'
  | 'TEAM_ACTION'
  | 'GENERAL_RESEARCH';

export type AgentLifecyclePhase = 'PLANNING' | 'TRAVELING' | 'COMPLETED' | 'UNKNOWN';

export type AgentAuthority =
  | 'READ_ONLY'
  | 'DECISION_COMMIT'
  | 'DRAFT_REQUIRED'
  | 'STRONG_CONFIRMATION';

export type AgentVerificationPolicy = 'NONE' | 'DATA_CHECK' | 'GATE' | 'VERIFY';

/** 能力原子：Runtime Guard 用 assertCapability 校验 */
export type AgentCapability =
  | 'READ_TRIP'
  | 'QUERY_ACCOMMODATION'
  | 'QUERY_TIMELINE'
  | 'QUERY_RISK'
  | 'QUERY_READINESS'
  | 'SUMMARIZE'
  | 'ANSWER'
  | 'PLAN'
  | 'OPTIMIZE'
  | 'REPAIR'
  | 'CREATE_PROPOSAL'
  | 'CREATE_DECISION'
  | 'APPLY'
  | 'SOLVER'
  | 'VERIFY'
  | 'GATE_EVAL'
  | 'EXTERNAL_ACTION';

export type AgentTaskContractHints = {
  intentMode?: string;
  entryPoint?: string;
  uiDayAnchor?: boolean;
  ignoredHints?: string[];
};

export type AgentTaskContractV1 = {
  schemaId: typeof AGENT_TASK_CONTRACT_SCHEMA;
  version: 1;
  taskId: string;
  turnId: string;
  tripId?: string;
  lifecycle: AgentLifecyclePhase;
  taskType: AgentTaskType;
  scope: {
    days?: number[];
    entities?: string[];
    decisionKey?: string;
    contextRegistryKey?: string;
  };
  contextPolicy: {
    required: string[];
    optional: string[];
    freshness?: Record<string, string>;
  };
  capabilities: {
    allow: AgentCapability[];
    deny: AgentCapability[];
  };
  authority: AgentAuthority;
  verificationPolicy: AgentVerificationPolicy;
  completionCondition: string;
  /** 是否允许进入 Full Planning / CLAUDE_SM */
  allowFullPlanning: boolean;
  planningAdmissionReason: string;
  semanticMessage: string;
  hints?: AgentTaskContractHints;
};

export type AssertCapabilityResult =
  | { ok: true }
  | { ok: false; capability: AgentCapability; reason: string; taskType: AgentTaskType };
