/**
 * 七类 Runtime 默认 Capability / Authority 矩阵（Sprint 1 冻结子集）。
 */

import type {
  AgentAuthority,
  AgentCapability,
  AgentTaskType,
  AgentVerificationPolicy,
} from './agent-task-contract.types';

export type RuntimeCapabilityProfile = {
  taskType: AgentTaskType;
  authority: AgentAuthority;
  verificationPolicy: AgentVerificationPolicy;
  allow: AgentCapability[];
  deny: AgentCapability[];
  completionCondition: string;
};

const QUERY_DENY: AgentCapability[] = [
  'PLAN',
  'OPTIMIZE',
  'REPAIR',
  'CREATE_PROPOSAL',
  'CREATE_DECISION',
  'APPLY',
  'SOLVER',
  'VERIFY',
  'GATE_EVAL',
  'EXTERNAL_ACTION',
];

const QUERY_ALLOW: AgentCapability[] = [
  'READ_TRIP',
  'QUERY_ACCOMMODATION',
  'QUERY_TIMELINE',
  'QUERY_RISK',
  'QUERY_READINESS',
  'SUMMARIZE',
  'ANSWER',
];

export const RUNTIME_CAPABILITY_PROFILES: Record<AgentTaskType, RuntimeCapabilityProfile> = {
  TRIP_QUERY: {
    taskType: 'TRIP_QUERY',
    authority: 'READ_ONLY',
    verificationPolicy: 'DATA_CHECK',
    allow: QUERY_ALLOW,
    deny: QUERY_DENY,
    completionCondition: 'ANSWER_RETURNED',
  },
  GENERAL_RESEARCH: {
    taskType: 'GENERAL_RESEARCH',
    authority: 'READ_ONLY',
    verificationPolicy: 'DATA_CHECK',
    allow: ['READ_TRIP', 'SUMMARIZE', 'ANSWER'],
    deny: QUERY_DENY,
    completionCondition: 'ANSWER_RETURNED',
  },
  DECISION_SUPPORT: {
    taskType: 'DECISION_SUPPORT',
    authority: 'DECISION_COMMIT',
    verificationPolicy: 'GATE',
    allow: [
      'READ_TRIP',
      'SUMMARIZE',
      'ANSWER',
      'CREATE_DECISION',
      'GATE_EVAL',
      'SOLVER',
    ],
    deny: ['PLAN', 'OPTIMIZE', 'REPAIR', 'APPLY', 'EXTERNAL_ACTION'],
    completionCondition: 'DECISION_COMMITTED_OR_NEED_SELECT',
  },
  ITINERARY_ADJUST: {
    taskType: 'ITINERARY_ADJUST',
    authority: 'DRAFT_REQUIRED',
    verificationPolicy: 'VERIFY',
    allow: [
      'READ_TRIP',
      'SUMMARIZE',
      'ANSWER',
      'PLAN',
      'OPTIMIZE',
      'REPAIR',
      'CREATE_PROPOSAL',
      'SOLVER',
      'VERIFY',
      'GATE_EVAL',
    ],
    deny: ['EXTERNAL_ACTION', 'APPLY'],
    completionCondition: 'DRAFT_WAITING_CONFIRM_OR_APPLIED',
  },
  LIVE_EXECUTION: {
    taskType: 'LIVE_EXECUTION',
    authority: 'STRONG_CONFIRMATION',
    verificationPolicy: 'GATE',
    allow: [
      'READ_TRIP',
      'QUERY_TIMELINE',
      'QUERY_RISK',
      'SUMMARIZE',
      'ANSWER',
      'CREATE_PROPOSAL',
      'GATE_EVAL',
      'VERIFY',
    ],
    deny: ['PLAN', 'OPTIMIZE', 'APPLY'],
    completionCondition: 'LIVE_CONCLUSION_RETURNED',
  },
  CONTENT_IMPORT: {
    taskType: 'CONTENT_IMPORT',
    authority: 'DRAFT_REQUIRED',
    verificationPolicy: 'DATA_CHECK',
    allow: ['READ_TRIP', 'SUMMARIZE', 'ANSWER', 'CREATE_PROPOSAL'],
    deny: ['APPLY', 'EXTERNAL_ACTION', 'PLAN'],
    completionCondition: 'IMPORT_DRAFT_WAITING_CONFIRM',
  },
  TEAM_ACTION: {
    taskType: 'TEAM_ACTION',
    authority: 'DRAFT_REQUIRED',
    verificationPolicy: 'GATE',
    allow: ['READ_TRIP', 'SUMMARIZE', 'ANSWER', 'EXTERNAL_ACTION'],
    deny: ['PLAN', 'OPTIMIZE', 'REPAIR', 'APPLY'],
    completionCondition: 'TEAM_ACTION_RESOLVED',
  },
};

export function getRuntimeCapabilityProfile(taskType: AgentTaskType): RuntimeCapabilityProfile {
  return RUNTIME_CAPABILITY_PROFILES[taskType];
}
