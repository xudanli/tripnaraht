import type { TravelContextDomain } from '../domain/travel-context.constants';
import type { TravelContextSnapshot } from '../domain/travel-context.types';
import type { ContextBlock } from '../../agent/context-engine/types/context-package.types';
import type { TravelContextAgentGrounding } from './travel-context-agent-binding.types';

/** Aligns with harness AGENT_GROUNDING_PRESETS — production agent domain defaults */
export const TRAVEL_CONTEXT_AGENT_DOMAIN_PRESETS: Record<
  string,
  { taskType: string; includeDomains: TravelContextDomain[] }
> = {
  ABU: { taskType: 'ROAD_SAFETY_VALIDATION', includeDomains: ['plan', 'world', 'contract'] },
  DR_DRE: { taskType: 'PACE_EVALUATION', includeDomains: ['plan', 'contract', 'participants'] },
  NEPTUNE: {
    taskType: 'ALTERNATIVE_PLAN_REPAIR',
    includeDomains: ['plan', 'contract', 'decisions'],
  },
  PLANNER: { taskType: 'TRIP_PLANNING', includeDomains: ['intent', 'plan', 'contract', 'world'] },
  GATEKEEPER: {
    taskType: 'CONSTRAINT_VALIDATION',
    includeDomains: ['contract', 'decisions', 'monitoring'],
  },
  CORE_DECISION: {
    taskType: 'DECISION_EVALUATION',
    includeDomains: ['plan', 'decisions', 'world', 'contract'],
  },
};

export function resolveAgentIncludeDomains(
  agent: string,
  task?: string,
  explicit?: TravelContextDomain[],
): { taskType: string; includeDomains: TravelContextDomain[] } {
  if (explicit?.length) {
    return { taskType: task ?? 'CUSTOM', includeDomains: explicit };
  }

  const preset = TRAVEL_CONTEXT_AGENT_DOMAIN_PRESETS[agent.toUpperCase()];
  if (preset) {
    return { taskType: task ?? preset.taskType, includeDomains: [...preset.includeDomains] };
  }

  return {
    taskType: task ?? 'GENERAL',
    includeDomains: ['intent', 'plan', 'world', 'decisions'],
  };
}

export function projectDomainSlice(
  snapshot: TravelContextSnapshot,
  domain: TravelContextDomain,
  includePrivate: boolean,
): unknown {
  switch (domain) {
    case 'intent':
      return snapshot.intent;
    case 'plan':
      return snapshot.plan;
    case 'world':
      return snapshot.world;
    case 'decisions':
      return snapshot.decisions;
    case 'monitoring':
      return snapshot.monitoring;
    case 'contract':
      return snapshot.contract;
    case 'participants':
      return includePrivate
        ? snapshot.participants
        : { publicSummary: snapshot.participants.publicSummary, count: snapshot.participants.count };
    case 'history':
      return { recent: snapshot.history.recent.slice(0, 10), explorationArchive: snapshot.history.explorationArchive };
    default:
      return undefined;
  }
}

export function buildTravelContextGrounding(input: {
  snapshot: TravelContextSnapshot;
  agentId: string;
  taskType: string;
  includeDomains: TravelContextDomain[];
  includePrivate?: boolean;
}): TravelContextAgentGrounding {
  const domainSlices: Partial<Record<TravelContextDomain, unknown>> = {};
  for (const domain of input.includeDomains) {
    domainSlices[domain] = projectDomainSlice(
      input.snapshot,
      domain,
      input.includePrivate ?? false,
    );
  }

  return {
    contextId: input.snapshot.identity.contextId,
    snapshotId: input.snapshot.meta.snapshotId,
    revision: input.snapshot.meta.revision,
    stage: input.snapshot.identity.stage,
    agentId: input.agentId,
    taskType: input.taskType,
    includedDomains: input.includeDomains,
    domainSlices,
    factRefs: input.snapshot.world.facts.map((f) => f.factId),
    constraintRefs: input.snapshot.contract.constraints.map((c) => c.id),
  };
}

export function buildTravelContextContextBlock(grounding: TravelContextAgentGrounding): ContextBlock {
  const text = [
    `Travel Context ${grounding.contextId}`,
    `revision=${grounding.revision}`,
    `stage=${grounding.stage}`,
    `domains=${grounding.includedDomains.join(',')}`,
    `facts=${grounding.factRefs.length}`,
    `constraints=${grounding.constraintRefs.length}`,
  ].join(' | ');

  return {
    key: `travel_context.${grounding.contextId}`,
    type: 'TRAVEL_CONTEXT',
    text,
    data: {
      contextId: grounding.contextId,
      snapshotId: grounding.snapshotId,
      revision: grounding.revision,
      stage: grounding.stage,
      agentId: grounding.agentId,
      taskType: grounding.taskType,
      includedDomains: grounding.includedDomains,
      factRefs: grounding.factRefs,
      constraintRefs: grounding.constraintRefs,
      domainSlices: grounding.domainSlices,
    },
    priority: 95,
    visibility: 'public',
    provenance: {
      source: 'computed',
      identifier: 'travel-context-protocol',
      version: 'rfc-003-v1',
      timestamp: new Date().toISOString(),
    },
    estimatedTokens: Math.ceil(text.length / 4) + 200,
    dataSource: 'COMPUTED',
  };
}
