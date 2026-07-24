/**
 * RFC-003 §9.3 — Unified Travel Context Harness Case envelope.
 */

import type { TravelContextDomain } from '../../travel-context/domain/travel-context.constants';
import type {
  TravelContextSnapshot,
  WorldFact,
} from '../../travel-context/domain/travel-context.types';

export type {
  TravelContextSnapshot,
  TravelContextViewEnvelope,
  WorldFact,
  OpenDecision,
} from '../../travel-context/domain/travel-context.types';

export type {
  TravelContextDomain,
  TravelContextViewName,
  TravelContextStage,
} from '../../travel-context/domain/travel-context.constants';

export {
  TRAVEL_CONTEXT_DOMAINS,
  TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID,
} from '../../travel-context/domain/travel-context.constants';

export type TravelContextHarnessCategory =
  | 'CONTEXT_ASSEMBLY'
  | 'PROJECTION_CONSISTENCY'
  | 'CONSTRAINT'
  | 'DECISION'
  | 'AUTHORITY'
  | 'REPLANNING'
  | 'AUTOMATION'
  | 'PERMISSION'
  | 'CONCURRENCY'
  | 'REPLAY';

export type TravelContextHarnessTriggerType =
  | 'USER_INTENT'
  | 'WORLD_EVENT'
  | 'AGENT_REQUEST'
  | 'MONITORING_TRIGGER'
  | 'SYSTEM_COMMAND';

export type TravelContextHarnessOutcome =
  | 'APPLIED'
  | 'REJECTED'
  | 'WAITING_USER'
  | 'NO_CHANGE'
  | 'FAILED_SAFE';

export interface TravelContextIntent {
  type: string;
  payload?: Record<string, unknown>;
  basedOnRevision?: number;
}

export interface TravelWorldEvent {
  type: string;
  observedAt?: string;
  sourceId?: string;
  [key: string]: unknown;
}

export interface AgentRunRequest {
  agentId: string;
  taskType: string;
  contextId: string;
  revision: number;
  includeDomains?: TravelContextDomain[];
}

export interface TravelContextHarnessCase {
  caseId: string;
  title: string;
  category: TravelContextHarnessCategory;
  given: {
    contextFixtureId: string;
    expectedBaseRevision?: number;
    contextOverrides?: Partial<TravelContextSnapshot>;
    externalFacts?: WorldFact[];
    authorizationPolicy?: Record<string, unknown>;
  };
  when: {
    triggerType: TravelContextHarnessTriggerType;
    intent?: TravelContextIntent;
    event?: TravelWorldEvent;
    agentRun?: AgentRunRequest;
  };
  expect: {
    outcome: TravelContextHarnessOutcome;
    expectedChangedDomains?: TravelContextDomain[];
    forbiddenChangedDomains?: TravelContextDomain[];
    expectedDecisionStatus?: string;
    expectedEvents?: string[];
    expectedRevisionDelta?: number;
    invariants: string[];
    expectedReasonCodes?: string[];
  };
}

export interface TravelContextHarnessAssertion {
  name: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}

export interface TravelContextHarnessCaseResult {
  caseId: string;
  pass: boolean;
  assertions: TravelContextHarnessAssertion[];
  errors: string[];
  startedAt: string;
  finishedAt: string;
  anchor: import('./execution-anchor.types').HarnessExecutionAnchor;
  invariantResults?: import('../invariants/invariant.types').InvariantResult[];
}
