import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../../agent/dto/route-and-run.dto';
import type { AgenticToolLoopTrace } from '../../agent/assistants/planning-assistant/services/mcp-agent-executor.service';
import {
  buildAgenticFastPathAuthorityAudit,
  scanAgenticTraceForMutationTools,
} from './agentic-mutation-commit.adapter';
import { isAgenticMutationWriteGuardEnforce } from './agentic-tool-side-effect.util';
import type { AsyncMutationGuardPayloadV1 } from './durable-authority-snapshot-v1.types';

function buildAgenticBlockedPayload(
  reasonCodes: string[],
  userMessage: string,
): AsyncMutationGuardPayloadV1 {
  return {
    schemaId: 'tripnara.async_mutation_guard@v1',
    canCommit: false,
    stage: 'commit',
    reasonCodes: reasonCodes as AsyncMutationGuardPayloadV1['reasonCodes'],
    userMessage,
    statusV2: {
      execution: { status: 'SUCCEEDED' },
      decision: { status: 'PARTIAL' },
      freshness: { status: 'PENDING_VERIFICATION' },
      action: { status: 'BLOCKED' },
    },
  };
}

/**
 * Post–Fast Path guard: block responses that imply trip commit without authority chain.
 */
export function applyAgenticRouteAndRunMutationGuard(input: {
  request: RouteAndRunRequestDto;
  response: RouteAndRunResponseDto;
  agenticTrace?: AgenticToolLoopTrace;
}): RouteAndRunResponseDto {
  const { request, response, agenticTrace } = input;
  const scan = scanAgenticTraceForMutationTools(agenticTrace);
  const audit = buildAgenticFastPathAuthorityAudit({
    trace: scan,
    tripId: request.trip_id?.trim() || undefined,
  });

  const obs = (response.observability ?? {}) as Record<string, unknown>;
  obs.authority_audit_v1 = {
    ...audit,
    agentic_mutation_scan: scan,
  };

  const tripId = request.trip_id?.trim();
  const shouldBlockCommit =
    tripId &&
    isAgenticMutationWriteGuardEnforce() &&
    (scan.hasSuccessfulMutation ||
      (scan.blockedMutationTools.length > 0 && Boolean(request.trip_id)));

  if (!shouldBlockCommit) {
    response.observability = obs as RouteAndRunResponseDto['observability'];
    return response;
  }

  const reasonCodes = scan.hasSuccessfulMutation
    ? ['AGENTIC_MUTATION_EXECUTED_WITHOUT_ENVELOPE']
    : ['MUTATION_BLOCKED_AT_DISPATCH'];

  const guardPayload = buildAgenticBlockedPayload(
    reasonCodes,
    scan.hasSuccessfulMutation
      ? '检测到 Fast Path 在未经正式权威校验的情况下尝试修改行程，结果未写入正式行程。'
      : '已生成工具调用结果，但行程修改类工具已被写入闸门拦截，正式行程未变更。',
  );

  obs.agentic_mutation_guard_v1 = guardPayload;
  const existingPayload = response.result?.payload;
  const payload = {
    ...(existingPayload ?? {
      timeline: [],
      dropped_items: [],
      candidates: [],
      evidence: [],
      robustness: null,
    }),
    canonical_mutation_guard: guardPayload,
    agentic_tool_loop_trace:
      agenticTrace ??
      (existingPayload as Record<string, unknown> | undefined)?.agentic_tool_loop_trace,
  } as RouteAndRunResponseDto['result']['payload'];

  response.result = {
    ...response.result,
    answer_text: `${response.result.answer_text}\n\n${guardPayload.userMessage}`.trim(),
    payload,
  };
  response.observability = obs as RouteAndRunResponseDto['observability'];
  return response;
}
