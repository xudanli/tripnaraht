/**
 * RFC-001 Phase 0 — Reason Code metadata (cross-system semantic primary keys).
 */

import type { Rfc001FinalAction } from '../contracts/decision-record.types';

export type ReasonCodeDomain =
  | 'EVIDENCE'
  | 'ABU'
  | 'DRDRE'
  | 'NEPTUNE'
  | 'DECISION'
  | 'RUNTIME'
  | 'EXECUTION'
  | 'AUTHORIZATION';

export type ReasonCodeSeverity = 'INFO' | 'WARNING' | 'BLOCKING' | 'FATAL';

export type ReasonCodeActor = 'ABU' | 'DRDRE' | 'NEPTUNE' | 'DECISION_CORE' | 'RUNTIME' | 'SYSTEM';

export interface ReasonCodeDefinition {
  code: string;
  domain: ReasonCodeDomain;
  severity: ReasonCodeSeverity;
  overridable: boolean;
  allowedFinalActions: Rfc001FinalAction[];
  primaryActor: ReasonCodeActor;
  /** User-facing template key (PersonaShell projection) */
  userTemplateKey: string;
  requiresEvidence: boolean;
  requiresHumanConfirmation: boolean;
  description: string;
}

export const RFC001_REASON_CODES = {
  // Evidence
  EVIDENCE_STALE: 'EVIDENCE_STALE',
  EVIDENCE_CONFLICT: 'EVIDENCE_CONFLICT',
  EVIDENCE_INSUFFICIENT: 'EVIDENCE_INSUFFICIENT',
  // Abu
  ROAD_SEGMENT_CLOSED: 'ROAD_SEGMENT_CLOSED',
  ROAD_SEGMENT_RESTRICTED: 'ROAD_SEGMENT_RESTRICTED',
  WEATHER_HIGH_WIND: 'WEATHER_HIGH_WIND',
  ACTIVITY_GUIDE_REQUIRED: 'ACTIVITY_GUIDE_REQUIRED',
  POI_UNAVAILABLE: 'POI_UNAVAILABLE',
  TIME_WINDOW_INFEASIBLE: 'TIME_WINDOW_INFEASIBLE',
  // Dr.Dre
  INSUFFICIENT_TRANSFER_BUFFER: 'INSUFFICIENT_TRANSFER_BUFFER',
  EXCESSIVE_DAILY_LOAD: 'EXCESSIVE_DAILY_LOAD',
  INSUFFICIENT_RECOVERY: 'INSUFFICIENT_RECOVERY',
  // Neptune
  NO_FEASIBLE_REPAIR: 'NO_FEASIBLE_REPAIR',
  // Decision
  CANDIDATE_BLOCKED_BY_HARD_CONSTRAINT: 'CANDIDATE_BLOCKED_BY_HARD_CONSTRAINT',
  CANDIDATE_DOMINATED: 'CANDIDATE_DOMINATED',
  USER_PREFERENCE_INSUFFICIENT: 'USER_PREFERENCE_INSUFFICIENT',
  HUMAN_CONFIRMATION_REQUIRED: 'HUMAN_CONFIRMATION_REQUIRED',
  // Authorization
  EXTERNAL_SIDE_EFFECT_REQUIRES_AUTHORIZATION: 'EXTERNAL_SIDE_EFFECT_REQUIRES_AUTHORIZATION',
  // Execution
  EXECUTION_PARTIAL: 'EXECUTION_PARTIAL',
  COMPENSATION_REQUIRED: 'COMPENSATION_REQUIRED',
  // Runtime
  WORLD_STATE_STALE: 'WORLD_STATE_STALE',
} as const;

export type Rfc001ReasonCode = (typeof RFC001_REASON_CODES)[keyof typeof RFC001_REASON_CODES];

export const REASON_CODE_REGISTRY: Record<Rfc001ReasonCode, ReasonCodeDefinition> = {
  [RFC001_REASON_CODES.EVIDENCE_STALE]: {
    code: RFC001_REASON_CODES.EVIDENCE_STALE,
    domain: 'EVIDENCE',
    severity: 'WARNING',
    overridable: false,
    allowedFinalActions: ['DEFER_TO_HUMAN', 'NO_ACTION'],
    primaryActor: 'RUNTIME',
    userTemplateKey: 'reason.evidence_stale',
    requiresEvidence: true,
    requiresHumanConfirmation: false,
    description: 'Evidence exceeded validUntil; re-fetch or defer',
  },
  [RFC001_REASON_CODES.EVIDENCE_CONFLICT]: {
    code: RFC001_REASON_CODES.EVIDENCE_CONFLICT,
    domain: 'EVIDENCE',
    severity: 'BLOCKING',
    overridable: false,
    allowedFinalActions: ['DEFER_TO_HUMAN', 'REJECT'],
    primaryActor: 'RUNTIME',
    userTemplateKey: 'reason.evidence_conflict',
    requiresEvidence: true,
    requiresHumanConfirmation: true,
    description: 'Authoritative sources disagree; conservative handling required',
  },
  [RFC001_REASON_CODES.EVIDENCE_INSUFFICIENT]: {
    code: RFC001_REASON_CODES.EVIDENCE_INSUFFICIENT,
    domain: 'EVIDENCE',
    severity: 'WARNING',
    overridable: false,
    allowedFinalActions: ['DEFER_TO_HUMAN', 'NO_ACTION'],
    primaryActor: 'RUNTIME',
    userTemplateKey: 'reason.evidence_insufficient',
    requiresEvidence: false,
    requiresHumanConfirmation: true,
    description: 'Not enough evidence for high-impact judgment',
  },
  [RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED]: {
    code: RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED,
    domain: 'ABU',
    severity: 'BLOCKING',
    overridable: false,
    allowedFinalActions: ['REJECT', 'REPLACE', 'DEFER_TO_HUMAN'],
    primaryActor: 'ABU',
    userTemplateKey: 'reason.road_segment_closed',
    requiresEvidence: true,
    requiresHumanConfirmation: false,
    description: 'Road segment is closed; original route infeasible',
  },
  [RFC001_REASON_CODES.ROAD_SEGMENT_RESTRICTED]: {
    code: RFC001_REASON_CODES.ROAD_SEGMENT_RESTRICTED,
    domain: 'ABU',
    severity: 'WARNING',
    overridable: true,
    allowedFinalActions: ['ADJUST', 'REPLACE', 'DEFER_TO_HUMAN'],
    primaryActor: 'ABU',
    userTemplateKey: 'reason.road_segment_restricted',
    requiresEvidence: true,
    requiresHumanConfirmation: true,
    description: 'Road segment has restrictions (4x4, permit, seasonal)',
  },
  [RFC001_REASON_CODES.WEATHER_HIGH_WIND]: {
    code: RFC001_REASON_CODES.WEATHER_HIGH_WIND,
    domain: 'ABU',
    severity: 'BLOCKING',
    overridable: false,
    allowedFinalActions: ['REJECT', 'REPLACE', 'DEFER_TO_HUMAN'],
    primaryActor: 'ABU',
    userTemplateKey: 'reason.weather_high_wind',
    requiresEvidence: true,
    requiresHumanConfirmation: false,
    description: 'Outdoor activity prohibited due to high wind',
  },
  [RFC001_REASON_CODES.ACTIVITY_GUIDE_REQUIRED]: {
    code: RFC001_REASON_CODES.ACTIVITY_GUIDE_REQUIRED,
    domain: 'ABU',
    severity: 'WARNING',
    overridable: true,
    allowedFinalActions: ['ADJUST', 'REPLACE', 'DEFER_TO_HUMAN'],
    primaryActor: 'ABU',
    userTemplateKey: 'reason.activity_guide_required',
    requiresEvidence: true,
    requiresHumanConfirmation: true,
    description: 'Activity requires certified guide under local rules',
  },
  [RFC001_REASON_CODES.POI_UNAVAILABLE]: {
    code: RFC001_REASON_CODES.POI_UNAVAILABLE,
    domain: 'ABU',
    severity: 'BLOCKING',
    overridable: false,
    allowedFinalActions: ['REJECT', 'REPLACE', 'ADJUST'],
    primaryActor: 'ABU',
    userTemplateKey: 'reason.poi_unavailable',
    requiresEvidence: true,
    requiresHumanConfirmation: false,
    description: 'POI closed or unavailable for planned window',
  },
  [RFC001_REASON_CODES.TIME_WINDOW_INFEASIBLE]: {
    code: RFC001_REASON_CODES.TIME_WINDOW_INFEASIBLE,
    domain: 'ABU',
    severity: 'BLOCKING',
    overridable: false,
    allowedFinalActions: ['REJECT', 'ADJUST', 'REPLACE'],
    primaryActor: 'ABU',
    userTemplateKey: 'reason.time_window_infeasible',
    requiresEvidence: true,
    requiresHumanConfirmation: false,
    description: 'Arrival or activity window cannot be satisfied',
  },
  [RFC001_REASON_CODES.INSUFFICIENT_TRANSFER_BUFFER]: {
    code: RFC001_REASON_CODES.INSUFFICIENT_TRANSFER_BUFFER,
    domain: 'DRDRE',
    severity: 'WARNING',
    overridable: true,
    allowedFinalActions: ['ADJUST', 'DEFER_TO_HUMAN'],
    primaryActor: 'DRDRE',
    userTemplateKey: 'reason.insufficient_transfer_buffer',
    requiresEvidence: false,
    requiresHumanConfirmation: false,
    description: 'Transfer or drive buffer below safe minimum',
  },
  [RFC001_REASON_CODES.EXCESSIVE_DAILY_LOAD]: {
    code: RFC001_REASON_CODES.EXCESSIVE_DAILY_LOAD,
    domain: 'DRDRE',
    severity: 'WARNING',
    overridable: true,
    allowedFinalActions: ['ADJUST', 'DEFER_TO_HUMAN', 'REPLACE'],
    primaryActor: 'DRDRE',
    userTemplateKey: 'reason.excessive_daily_load',
    requiresEvidence: false,
    requiresHumanConfirmation: false,
    description: 'Daily physical or schedule load exceeds sustainable threshold',
  },
  [RFC001_REASON_CODES.INSUFFICIENT_RECOVERY]: {
    code: RFC001_REASON_CODES.INSUFFICIENT_RECOVERY,
    domain: 'DRDRE',
    severity: 'WARNING',
    overridable: true,
    allowedFinalActions: ['ADJUST', 'DEFER_TO_HUMAN'],
    primaryActor: 'DRDRE',
    userTemplateKey: 'reason.insufficient_recovery',
    requiresEvidence: false,
    requiresHumanConfirmation: false,
    description: 'Recovery time between intense segments insufficient',
  },
  [RFC001_REASON_CODES.NO_FEASIBLE_REPAIR]: {
    code: RFC001_REASON_CODES.NO_FEASIBLE_REPAIR,
    domain: 'NEPTUNE',
    severity: 'BLOCKING',
    overridable: false,
    allowedFinalActions: ['REJECT', 'DEFER_TO_HUMAN'],
    primaryActor: 'NEPTUNE',
    userTemplateKey: 'reason.no_feasible_repair',
    requiresEvidence: false,
    requiresHumanConfirmation: true,
    description: 'No intent-preserving repair candidate within constraints',
  },
  [RFC001_REASON_CODES.CANDIDATE_BLOCKED_BY_HARD_CONSTRAINT]: {
    code: RFC001_REASON_CODES.CANDIDATE_BLOCKED_BY_HARD_CONSTRAINT,
    domain: 'DECISION',
    severity: 'BLOCKING',
    overridable: false,
    allowedFinalActions: ['REJECT', 'REPLACE', 'DEFER_TO_HUMAN'],
    primaryActor: 'DECISION_CORE',
    userTemplateKey: 'reason.candidate_blocked',
    requiresEvidence: true,
    requiresHumanConfirmation: false,
    description: 'Candidate excluded by non-overridable BLOCK assertion',
  },
  [RFC001_REASON_CODES.CANDIDATE_DOMINATED]: {
    code: RFC001_REASON_CODES.CANDIDATE_DOMINATED,
    domain: 'DECISION',
    severity: 'INFO',
    overridable: true,
    allowedFinalActions: ['ALLOW', 'ADJUST', 'REPLACE'],
    primaryActor: 'DECISION_CORE',
    userTemplateKey: 'reason.candidate_dominated',
    requiresEvidence: false,
    requiresHumanConfirmation: false,
    description: 'Candidate strictly dominated on utility vector',
  },
  [RFC001_REASON_CODES.USER_PREFERENCE_INSUFFICIENT]: {
    code: RFC001_REASON_CODES.USER_PREFERENCE_INSUFFICIENT,
    domain: 'DECISION',
    severity: 'WARNING',
    overridable: true,
    allowedFinalActions: ['DEFER_TO_HUMAN'],
    primaryActor: 'DECISION_CORE',
    userTemplateKey: 'reason.preference_insufficient',
    requiresEvidence: false,
    requiresHumanConfirmation: true,
    description: 'User preference cannot stably rank Pareto frontier',
  },
  [RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED]: {
    code: RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED,
    domain: 'DECISION',
    severity: 'WARNING',
    overridable: false,
    allowedFinalActions: ['DEFER_TO_HUMAN'],
    primaryActor: 'DECISION_CORE',
    userTemplateKey: 'reason.human_confirmation_required',
    requiresEvidence: false,
    requiresHumanConfirmation: true,
    description: 'Authorization policy requires explicit user confirmation',
  },
  [RFC001_REASON_CODES.EXTERNAL_SIDE_EFFECT_REQUIRES_AUTHORIZATION]: {
    code: RFC001_REASON_CODES.EXTERNAL_SIDE_EFFECT_REQUIRES_AUTHORIZATION,
    domain: 'AUTHORIZATION',
    severity: 'BLOCKING',
    overridable: false,
    allowedFinalActions: ['DEFER_TO_HUMAN', 'NO_ACTION'],
    primaryActor: 'DECISION_CORE',
    userTemplateKey: 'reason.external_side_effect',
    requiresEvidence: false,
    requiresHumanConfirmation: true,
    description: 'Action has external side effect requiring L4 authorization',
  },
  [RFC001_REASON_CODES.EXECUTION_PARTIAL]: {
    code: RFC001_REASON_CODES.EXECUTION_PARTIAL,
    domain: 'EXECUTION',
    severity: 'FATAL',
    overridable: false,
    allowedFinalActions: ['NO_ACTION'],
    primaryActor: 'RUNTIME',
    userTemplateKey: 'reason.execution_partial',
    requiresEvidence: false,
    requiresHumanConfirmation: true,
    description: 'Multi-step execution partially succeeded',
  },
  [RFC001_REASON_CODES.COMPENSATION_REQUIRED]: {
    code: RFC001_REASON_CODES.COMPENSATION_REQUIRED,
    domain: 'EXECUTION',
    severity: 'FATAL',
    overridable: false,
    allowedFinalActions: ['NO_ACTION'],
    primaryActor: 'RUNTIME',
    userTemplateKey: 'reason.compensation_required',
    requiresEvidence: false,
    requiresHumanConfirmation: true,
    description: 'Failed step requires compensating command',
  },
  [RFC001_REASON_CODES.WORLD_STATE_STALE]: {
    code: RFC001_REASON_CODES.WORLD_STATE_STALE,
    domain: 'RUNTIME',
    severity: 'WARNING',
    overridable: false,
    allowedFinalActions: ['DEFER_TO_HUMAN', 'NO_ACTION'],
    primaryActor: 'RUNTIME',
    userTemplateKey: 'reason.world_state_stale',
    requiresEvidence: true,
    requiresHumanConfirmation: false,
    description: 'Workspace or decision input bound to superseded world state',
  },
};

export function getReasonCodeDefinition(code: string): ReasonCodeDefinition | undefined {
  return REASON_CODE_REGISTRY[code as Rfc001ReasonCode];
}

export function assertKnownReasonCodes(codes: string[]): void {
  const unknown = codes.filter((c) => !getReasonCodeDefinition(c));
  if (unknown.length) {
    throw new Error(`Unknown RFC-001 reason codes: ${unknown.join(', ')}`);
  }
}

export function isHardBlockReason(code: string): boolean {
  const def = getReasonCodeDefinition(code);
  return def?.severity === 'BLOCKING' || def?.severity === 'FATAL';
}
