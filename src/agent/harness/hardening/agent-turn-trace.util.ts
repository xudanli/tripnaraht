/**
 * Harness Hardening — AgentTurnTrace。
 * Task → Context → Evidence → Runtime → Capability → Gate/Verify → Result → Action
 */

import type { AgentTaskContractV1 } from '../agent-task-contract.types';
import { projectAgentTaskContractForTrace } from '../compile-agent-task-contract.util';
import type { EvidenceFactV1 } from './evidence.contract';
import { classifyEvidenceBucket } from './evidence.contract';
import type { HarnessRuntimeId } from './runtime-transition.contract';

export const AGENT_TURN_TRACE_SCHEMA = 'nara.agent_turn_trace@v1' as const;

export type AgentTurnTraceV1 = {
  schemaId: typeof AGENT_TURN_TRACE_SCHEMA;
  version: 1;
  turnId: string;
  task: Record<string, unknown>;
  context: {
    registryKey?: string;
    required: string[];
    acquiredKeys: string[];
  };
  evidence: {
    facts: EvidenceFactV1[];
    bucket: ReturnType<typeof classifyEvidenceBucket>;
  };
  runtime: {
    selected: HarnessRuntimeId;
    previous?: HarnessRuntimeId;
    transitionOk: boolean;
    transitionReason?: string;
  };
  capability: {
    attempted: string[];
    denied: string[];
    allow: string[];
  };
  gateVerify: {
    gateOk?: boolean;
    verifyOk?: boolean;
    notesZh: string[];
  };
  result: {
    status: string;
    conclusionStrength?: string;
    answerPreviewZh?: string;
  };
  action: {
    appliedToItinerary: boolean;
    actionId?: string;
    unauthorizedWriteAttempt: boolean;
  };
};

export function buildAgentTurnTrace(input: {
  contract: AgentTaskContractV1;
  runtimeSelected: HarnessRuntimeId;
  runtimePrevious?: HarnessRuntimeId;
  transitionOk?: boolean;
  transitionReason?: string;
  acquiredContextKeys?: string[];
  evidence?: EvidenceFactV1[];
  attemptedCapabilities?: string[];
  deniedCapabilities?: string[];
  gateOk?: boolean;
  verifyOk?: boolean;
  gateNotesZh?: string[];
  resultStatus: string;
  conclusionStrength?: string;
  answerPreviewZh?: string;
  appliedToItinerary?: boolean;
  actionId?: string;
  unauthorizedWriteAttempt?: boolean;
}): AgentTurnTraceV1 {
  const evidence = input.evidence ?? [];
  return {
    schemaId: AGENT_TURN_TRACE_SCHEMA,
    version: 1,
    turnId: input.contract.turnId,
    task: projectAgentTaskContractForTrace(input.contract),
    context: {
      registryKey: input.contract.scope.contextRegistryKey,
      required: [...(input.contract.contextPolicy.required ?? [])],
      acquiredKeys: input.acquiredContextKeys ?? [],
    },
    evidence: {
      facts: evidence,
      bucket: classifyEvidenceBucket(evidence),
    },
    runtime: {
      selected: input.runtimeSelected,
      previous: input.runtimePrevious,
      transitionOk: input.transitionOk !== false,
      transitionReason: input.transitionReason,
    },
    capability: {
      attempted: input.attemptedCapabilities ?? [],
      denied: input.deniedCapabilities ?? [],
      allow: [...input.contract.capabilities.allow],
    },
    gateVerify: {
      gateOk: input.gateOk,
      verifyOk: input.verifyOk,
      notesZh: input.gateNotesZh ?? [],
    },
    result: {
      status: input.resultStatus,
      conclusionStrength: input.conclusionStrength,
      answerPreviewZh: input.answerPreviewZh?.slice(0, 240),
    },
    action: {
      appliedToItinerary: input.appliedToItinerary === true,
      actionId: input.actionId,
      unauthorizedWriteAttempt: input.unauthorizedWriteAttempt === true,
    },
  };
}

export function projectAgentTurnTraceForObservability(
  trace: AgentTurnTraceV1,
): Record<string, unknown> {
  return {
    schema_id: trace.schemaId,
    turn_id: trace.turnId,
    task_type: (trace.task as any).taskType,
    runtime: trace.runtime.selected,
    transition_ok: trace.runtime.transitionOk,
    evidence_bucket: trace.evidence.bucket,
    capability_denied: trace.capability.denied,
    applied_to_itinerary: trace.action.appliedToItinerary,
    unauthorized_write_attempt: trace.action.unauthorizedWriteAttempt,
    result_status: trace.result.status,
  };
}
