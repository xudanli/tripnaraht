import type { McpToolRuntimeEnvelope } from '../../agent/assistants/planning-assistant/services/mcp-agent-executor.service';
import { buildAuthorityAuditTrace } from './build-authority-audit-trace.util';
import {
  classifyAgenticToolSideEffect,
  isAgenticMutationWriteGuardActive,
  isAgenticMutationWriteGuardEnforce,
  isAgenticSideEffectReadOnly,
  resolveAgenticMutationWriteGuardMode,
  type ToolSideEffect,
} from './agentic-tool-side-effect.util';
import type { PartialMutationEnvelope } from './canonical-mutation-commit-guard.util';
import { validateMutationAuthority } from './canonical-mutation-commit-guard.util';
import type { MutationDenialReasonCode } from './mutation-authority-envelope-v1.types';

export type AgenticToolMutationGateInput = {
  mcpToolName: string;
  tripId?: string;
  mutationAuthorityEnvelope?: PartialMutationEnvelope | null;
};

export type AgenticToolMutationGateResult = {
  allowed: boolean;
  sideEffect: ToolSideEffect;
  reasonCodes: MutationDenialReasonCode[];
  holdEnvelope?: McpToolRuntimeEnvelope;
};

function buildMutationBlockedEnvelope(
  mcpToolName: string,
  sideEffect: ToolSideEffect,
  reasonCodes: string[],
): McpToolRuntimeEnvelope {
  return {
    success: false,
    data: {
      _system_status: 'MUTATION_AUTHORITY_DENIED',
      mcpToolName,
      side_effect: sideEffect,
      reason_codes: reasonCodes,
      instruction:
        '该工具会修改行程或产生外部副作用，Fast Path 下须携带 MutationAuthorityEnvelope 并经 CanonicalMutationCommitGuard 放行。',
    },
    error: 'MUTATION_AUTHORITY_DENIED',
    sideEffects: { blocked: true, side_effect: sideEffect },
    confidence: 0,
  };
}

/**
 * Pre-dispatch gate: TRIP_MUTATION / UNKNOWN / EXTERNAL_ACTION require authority when enforce.
 */
export function evaluateAgenticToolMutationGate(
  input: AgenticToolMutationGateInput,
): AgenticToolMutationGateResult {
  const sideEffect = classifyAgenticToolSideEffect(input.mcpToolName);

  if (!isAgenticMutationWriteGuardActive()) {
    return { allowed: true, sideEffect, reasonCodes: [] };
  }

  if (isAgenticSideEffectReadOnly(sideEffect)) {
    return { allowed: true, sideEffect, reasonCodes: [] };
  }

  const tripId = input.tripId?.trim();
  if (!tripId && sideEffect === 'TRIP_MUTATION') {
    return {
      allowed: false,
      sideEffect,
      reasonCodes: ['ENVELOPE_INCOMPLETE'],
      holdEnvelope: buildMutationBlockedEnvelope(input.mcpToolName, sideEffect, [
        'ENVELOPE_INCOMPLETE',
      ]),
    };
  }

  if (sideEffect === 'EXTERNAL_ACTION') {
    const reasonCodes: MutationDenialReasonCode[] = ['WRITE_GUARD_DENY'];
    if (!isAgenticMutationWriteGuardEnforce()) {
      return { allowed: true, sideEffect, reasonCodes: [] };
    }
    return {
      allowed: false,
      sideEffect,
      reasonCodes,
      holdEnvelope: buildMutationBlockedEnvelope(input.mcpToolName, sideEffect, reasonCodes),
    };
  }

  if (sideEffect === 'UNKNOWN') {
    if (!isAgenticMutationWriteGuardEnforce()) {
      return { allowed: true, sideEffect, reasonCodes: [] };
    }
    return {
      allowed: false,
      sideEffect,
      reasonCodes: ['CANONICAL_AUTHORITY_UNAVAILABLE'],
      holdEnvelope: buildMutationBlockedEnvelope(input.mcpToolName, sideEffect, [
        'CANONICAL_AUTHORITY_UNAVAILABLE',
      ]),
    };
  }

  // TRIP_MUTATION — must pass full envelope validation
  const envelope: PartialMutationEnvelope = input.mutationAuthorityEnvelope ?? {
    tripId: tripId ?? '',
    decisionId: '',
    expectedTripVersion: undefined,
    constraintEvaluation: {
      evaluationId: '',
      verdict: 'BLOCK',
      hardConstraintViolations: ['CONSTRAINT_EVALUATION_MISSING'],
    },
    evidenceSnapshot: { snapshotId: '', capturedAt: new Date().toISOString() },
    writeAuthority: { verdict: 'DENY', reasonCodes: ['CANONICAL_AUTHORITY_UNAVAILABLE'] },
    executionSource: {
      routeClass: 'FAST_PATH',
      orchestrationMode: 'Agentic',
    },
  };

  const validation = validateMutationAuthority(envelope);
  if (validation.allowed && !isAgenticMutationWriteGuardEnforce()) {
    return { allowed: true, sideEffect, reasonCodes: [] };
  }
  if (validation.allowed) {
    return { allowed: true, sideEffect, reasonCodes: [] };
  }

  return {
    allowed: false,
    sideEffect,
    reasonCodes: validation.reasonCodes,
    holdEnvelope: buildMutationBlockedEnvelope(
      input.mcpToolName,
      sideEffect,
      validation.reasonCodes,
    ),
  };
}

export type AgenticTraceMutationScan = {
  attemptedMutationTools: string[];
  blockedMutationTools: string[];
  hasSuccessfulMutation: boolean;
};

export function scanAgenticTraceForMutationTools(
  trace:
    | {
        steps?: Array<{
          tool_results?: Array<{ envelope?: McpToolRuntimeEnvelope | unknown; tool_call_id?: string }>;
        }>;
      }
    | undefined,
): AgenticTraceMutationScan {
  const attemptedMutationTools: string[] = [];
  const blockedMutationTools: string[] = [];
  let hasSuccessfulMutation = false;

  for (const step of trace?.steps ?? []) {
    for (const tr of step.tool_results ?? []) {
      const env = tr.envelope as McpToolRuntimeEnvelope | undefined;
      if (!env) continue;
      const data = env.data as Record<string, unknown> | null;
      const mcpToolName = String(data?.mcpToolName ?? '');
      const sideEffect = mcpToolName
        ? classifyAgenticToolSideEffect(mcpToolName)
        : ('UNKNOWN' as ToolSideEffect);

      if (!isAgenticSideEffectReadOnly(sideEffect)) {
        if (env.success) {
          hasSuccessfulMutation = true;
          attemptedMutationTools.push(mcpToolName || 'unknown');
        } else if (env.error === 'MUTATION_AUTHORITY_DENIED') {
          blockedMutationTools.push(mcpToolName || 'unknown');
        }
      }
    }
  }

  return { attemptedMutationTools, blockedMutationTools, hasSuccessfulMutation };
}

export function buildAgenticFastPathAuthorityAudit(input: {
  trace: AgenticTraceMutationScan;
  tripId?: string;
}): ReturnType<typeof buildAuthorityAuditTrace> {
  const mutationIntent =
    input.trace.attemptedMutationTools.length > 0 ||
    input.trace.blockedMutationTools.length > 0;
  return buildAuthorityAuditTrace({
    routeClass: 'FAST_PATH',
    orchestrationMode: 'Agentic',
    mutationIntent,
    mutationAttempted: mutationIntent,
    mutationCommitted: input.trace.hasSuccessfulMutation,
    constraintGatewayRequired: mutationIntent,
    constraintGatewayInvoked: input.trace.blockedMutationTools.length > 0,
    writeGuardRequired: mutationIntent,
    writeGuardInvoked: true,
    writeGuardVerdict: input.trace.hasSuccessfulMutation ? 'ALLOW' : 'DENY',
    reasonCodes: input.trace.hasSuccessfulMutation
      ? ['AGENTIC_MUTATION_EXECUTED_WITHOUT_ENVELOPE']
      : input.trace.blockedMutationTools.length > 0
        ? ['MUTATION_BLOCKED_AT_DISPATCH']
        : [],
  });
}

export { resolveAgenticMutationWriteGuardMode };
