import type { TravelContextSnapshot } from '../../../travel-context/domain/travel-context.types';
import type { TravelContextHarnessAssertion } from '../../protocol/harness-case.types';
import { harnessAssert } from '../../protocol/run-travel-context-harness.util';
import {
  AGENT_GROUNDING_PRESETS,
  buildAgentRunTrace,
  type AgentRunTrace,
} from '../../protocol/agent-run-trace.types';

export function buildThreePersonaTraces(snapshot: TravelContextSnapshot): AgentRunTrace[] {
  return [
    buildAgentRunTrace({
      ...AGENT_GROUNDING_PRESETS.ABU,
      snapshot,
      includedDomains: [...AGENT_GROUNDING_PRESETS.ABU.includeDomains],
    }),
    buildAgentRunTrace({
      ...AGENT_GROUNDING_PRESETS.DR_DRE,
      snapshot,
      includedDomains: [...AGENT_GROUNDING_PRESETS.DR_DRE.includeDomains],
    }),
    buildAgentRunTrace({
      ...AGENT_GROUNDING_PRESETS.NEPTUNE,
      snapshot,
      includedDomains: [...AGENT_GROUNDING_PRESETS.NEPTUNE.includeDomains],
    }),
  ];
}

/** AGENT-GROUNDING-CROSS-001 — 三人格同一轮必须引用同一 Context Revision */
export function assertAgentGroundingCross001(
  traces: AgentRunTrace[],
): TravelContextHarnessAssertion[] {
  if (traces.length === 0) {
    return [
      harnessAssert({
        name: 'agent_traces_non_empty',
        pass: false,
        message: 'No agent traces provided',
      }),
    ];
  }

  const [first, ...rest] = traces;
  const assertions: TravelContextHarnessAssertion[] = [
    harnessAssert({
      name: 'agent_traces_count_three',
      pass: traces.length === 3,
      expected: 3,
      actual: traces.length,
    }),
  ];

  for (const trace of rest) {
    assertions.push(
      harnessAssert({
        name: `same_context_${trace.agentId}`,
        pass: trace.contextId === first!.contextId,
        expected: first!.contextId,
        actual: trace.contextId,
      }),
      harnessAssert({
        name: `same_snapshot_${trace.agentId}`,
        pass: trace.snapshotId === first!.snapshotId,
        expected: first!.snapshotId,
        actual: trace.snapshotId,
      }),
      harnessAssert({
        name: `same_revision_${trace.agentId}`,
        pass: trace.revision === first!.revision,
        expected: first!.revision,
        actual: trace.revision,
      }),
    );
  }

  return assertions;
}

/** AGENT-GROUNDING-ABU-001 — 道路安全须含 world + contract 域 */
export function assertAgentGroundingAbu001(trace: AgentRunTrace): TravelContextHarnessAssertion[] {
  const domains = new Set(trace.includedDomains);
  return [
    harnessAssert({
      name: 'abu_includes_world',
      pass: domains.has('world'),
      expected: true,
      actual: [...domains],
    }),
    harnessAssert({
      name: 'abu_includes_contract',
      pass: domains.has('contract'),
      expected: true,
      actual: [...domains],
    }),
  ];
}

/** AGENT-GROUNDING-DRE-001 — 节奏判断须含 participants */
export function assertAgentGroundingDre001(trace: AgentRunTrace): TravelContextHarnessAssertion[] {
  const domains = new Set(trace.includedDomains);
  return [
    harnessAssert({
      name: 'dre_includes_participants',
      pass: domains.has('participants'),
      expected: true,
      actual: [...domains],
    }),
    harnessAssert({
      name: 'dre_includes_plan',
      pass: domains.has('plan'),
      expected: true,
      actual: [...domains],
    }),
  ];
}
