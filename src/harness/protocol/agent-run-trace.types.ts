import type { TravelContextDomain } from '../../travel-context/domain/travel-context.constants';
import type { TravelContextSnapshot } from '../../travel-context/domain/travel-context.types';

/** RFC-003 §9.5.5 — Agent run grounding trace */
export interface AgentRunTrace {
  agentId: string;
  taskType: string;
  contextId: string;
  snapshotId: string;
  revision: number;
  includedDomains: TravelContextDomain[];
  excludedDomains?: TravelContextDomain[];
  factRefs: string[];
  constraintRefs: string[];
  outputType: 'OBSERVATION' | 'RECOMMENDATION' | 'DECISION_PROPOSAL' | 'ACTION_REQUEST';
}

export const AGENT_GROUNDING_PRESETS = {
  ABU: {
    agentId: 'ABU',
    taskType: 'ROAD_SAFETY_VALIDATION',
    includeDomains: ['plan', 'world', 'contract'] as TravelContextDomain[],
  },
  DR_DRE: {
    agentId: 'DR_DRE',
    taskType: 'PACE_EVALUATION',
    includeDomains: ['plan', 'contract', 'participants'] as TravelContextDomain[],
  },
  NEPTUNE: {
    agentId: 'NEPTUNE',
    taskType: 'ALTERNATIVE_PLAN_REPAIR',
    includeDomains: ['plan', 'contract', 'decisions'] as TravelContextDomain[],
  },
} as const;

export function buildAgentRunTrace(input: {
  agentId: string;
  taskType: string;
  snapshot: TravelContextSnapshot;
  includedDomains: TravelContextDomain[];
  outputType?: AgentRunTrace['outputType'];
}): AgentRunTrace {
  const factRefs = input.snapshot.world.facts.map((f) => f.factId);
  const constraintRefs = input.snapshot.contract.constraints.map((c) => c.id);

  return {
    agentId: input.agentId,
    taskType: input.taskType,
    contextId: input.snapshot.identity.contextId,
    snapshotId: input.snapshot.meta.snapshotId,
    revision: input.snapshot.meta.revision,
    includedDomains: input.includedDomains,
    factRefs,
    constraintRefs,
    outputType: input.outputType ?? 'RECOMMENDATION',
  };
}
