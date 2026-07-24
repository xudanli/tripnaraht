import type { TravelContextDomain } from '../domain/travel-context.constants';
import type { TravelContextStage } from '../domain/travel-context.constants';

/** RFC-003 §8.3 + §9.5 — Agent grounding anchor from Travel Context */
export interface TravelContextAgentGrounding {
  contextId: string;
  snapshotId: string;
  revision: number;
  stage: TravelContextStage;
  agentId: string;
  taskType: string;
  includedDomains: TravelContextDomain[];
  excludedDomains?: TravelContextDomain[];
  domainSlices: Partial<Record<TravelContextDomain, unknown>>;
  factRefs: string[];
  constraintRefs: string[];
}

export interface TravelContextAgentBindingInput {
  contextId?: string;
  tripId?: string;
  userId?: string;
  revision?: number;
  agent: string;
  task?: string;
  includeDomains?: TravelContextDomain[];
  includePrivate?: boolean;
}
