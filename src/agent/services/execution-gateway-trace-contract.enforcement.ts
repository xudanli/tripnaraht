// src/agent/services/execution-gateway-trace-contract.enforcement.ts
/**
 * route_and_run 成功出口硬门禁：trace v1 完整、memory binding 三者一致、指纹与宿主 descriptor 对齐、路由器字段落 trace。
 * @see semantic-validation-contract.md §16
 */
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { OrchestrationExecutionTraceV1 } from '../contracts/orchestration-execution-trace-v1.types';
import {
  ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID,
  ORCHESTRATION_EXECUTION_TRACE_V1_VERSION,
} from '../contracts/orchestration-execution-trace-v1.types';
import { buildSemanticModelSnapshotDescriptor } from '../runtime/testing/semantic-model-snapshot-descriptor';
import type { ExecutionModelRuntimeRouterReason } from '../runtime/execution-model-runtime-router';
import {
  computeExecutionGatewayContractGovernanceRuleSetHashV1,
  EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED,
} from '../contracts/execution-gateway-contract-governance.v1';
import {
  CID_AXIS_VERSION,
  computeExecutionSemanticFingerprintV1,
  parseChangeImpactDescriptorV1,
  serializeChangeImpactDescriptorForCompare,
} from '../contracts/execution-os-change-impact-descriptor.v1';
import {
  resolveTraceCompatibilityMode,
  TRACE_COMPATIBILITY_ACK_SCHEMA_ID,
} from './execution-gateway-trace-compatibility.util';

const ROUTER_REASONS: ReadonlySet<ExecutionModelRuntimeRouterReason> = new Set([
  'exact_match',
  'upgrade_allowed',
  'fallback',
]);

export class ExecutionGatewayContractViolation extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutionGatewayContractViolation';
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function extractTraceV1(response: RouteAndRunResponseDto): OrchestrationExecutionTraceV1 | undefined {
  const obs = response.observability as Record<string, unknown> | undefined;
  const trace = obs?.trace as Record<string, unknown> | undefined;
  const t = trace?.execution_trace_v1;
  if (!t || typeof t !== 'object' || Array.isArray(t)) return undefined;
  return t as OrchestrationExecutionTraceV1;
}

function requestMemoryBindingSnapshotId(request: RouteAndRunRequestDto): string | undefined {
  const b =
    ((request as any).__memoryExecutionBinding as { snapshot_id?: string } | undefined) ??
    undefined;
  const id = b?.snapshot_id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
}

/**
 * 对「已附着 observability」的成功响应执行契约校验；不满足则抛 {@link ExecutionGatewayContractViolation}。
 * 短路类响应（dry_run、NEED_MORE_INFO、REDIRECT_REQUIRED、FAILED 等）跳过。
 */
export type ExecutionGatewayPostReturnContractAck = {
  /** legacy 模式下放宽的契约检查（仅观测；默认 `cid-aware` 不写入） */
  execution_trace_compatibility_v1?: {
    schemaId: typeof TRACE_COMPATIBILITY_ACK_SCHEMA_ID;
    version: 1;
    mode: 'legacy';
    suppressed_warnings: string[];
    cid_axis_version: typeof CID_AXIS_VERSION;
  };
};

export function assertExecutionGatewayPostReturnContract(params: {
  request: RouteAndRunRequestDto;
  response: RouteAndRunResponseDto;
}): ExecutionGatewayPostReturnContractAck {
  const { request, response } = params;
  const suppressedWarnings: string[] = [];
  const compat = resolveTraceCompatibilityMode(request);

  if (request.options?.dry_run === true) {
    return {};
  }

  const status = response.result?.status;
  if (
    status === 'NEED_MORE_INFO' ||
    status === 'NEED_CONSENT' ||
    status === 'NEED_CONFIRMATION' ||
    status === 'REDIRECT_REQUIRED' ||
    status === 'FAILED' ||
    status === 'TIMEOUT'
  ) {
    return {};
  }

  const execTrace = extractTraceV1(response);
  if (!execTrace) {
    throw new ExecutionGatewayContractViolation(
      'EXECUTION_TRACE_V1_MISSING',
      'observability.trace.execution_trace_v1 is required for this route_and_run outcome',
    );
  }

  if (
    execTrace.schemaId !== ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID ||
    execTrace.version !== ORCHESTRATION_EXECUTION_TRACE_V1_VERSION
  ) {
    throw new ExecutionGatewayContractViolation(
      'EXECUTION_TRACE_V1_SCHEMA',
      `unsupported execution_trace_v1 schema: ${String(execTrace.schemaId)} v${String(execTrace.version)}`,
    );
  }

  if (!isNonEmptyString(execTrace.snapshot_id)) {
    throw new ExecutionGatewayContractViolation('SNAPSHOT_ID_EMPTY', 'execution_trace_v1.snapshot_id must be non-empty');
  }

  const expectedFp = buildSemanticModelSnapshotDescriptor().fingerprint;
  if (execTrace.model_fingerprint !== expectedFp) {
    throw new ExecutionGatewayContractViolation(
      'MODEL_FINGERPRINT_MISMATCH',
      'execution_trace_v1.model_fingerprint must match host semantic model descriptor (ledger material)',
    );
  }

  if (!isNonEmptyString(execTrace.selected_execution_model_version)) {
    throw new ExecutionGatewayContractViolation(
      'ROUTER_OUTPUT_MISSING',
      'execution_trace_v1.selected_execution_model_version is required',
    );
  }

  if (!isNonEmptyString(execTrace.selection_reason) || !ROUTER_REASONS.has(execTrace.selection_reason)) {
    throw new ExecutionGatewayContractViolation(
      'ROUTER_OUTPUT_MISSING',
      'execution_trace_v1.selection_reason must be a valid router reason',
    );
  }

  const traceSnap = execTrace.snapshot_id.trim();
  const reqBind = requestMemoryBindingSnapshotId(request);
  if (!reqBind) {
    throw new ExecutionGatewayContractViolation(
      'MEMORY_BINDING_MISSING',
      'request execution memory binding (snapshot_id) missing — cannot verify replay anchor',
    );
  }
  if (reqBind !== traceSnap) {
    throw new ExecutionGatewayContractViolation(
      'MEMORY_BINDING_MISMATCH',
      'execution_memory_binding.snapshot_id must equal execution_trace_v1.snapshot_id',
    );
  }

  const obs = response.observability as Record<string, unknown> | undefined;
  const topBind = (obs?.execution_memory_binding as { snapshot_id?: string } | undefined)?.snapshot_id;
  if (!isNonEmptyString(topBind) || topBind.trim() !== traceSnap) {
    throw new ExecutionGatewayContractViolation(
      'MEMORY_BINDING_MISSING',
      'observability.execution_memory_binding.snapshot_id must be present and equal execution_trace_v1.snapshot_id',
    );
  }

  const traceObj = obs?.trace as Record<string, unknown> | undefined;
  const traceBind = (traceObj?.execution_memory_binding as { snapshot_id?: string } | undefined)?.snapshot_id;
  if (!isNonEmptyString(traceBind) || traceBind.trim() !== traceSnap) {
    throw new ExecutionGatewayContractViolation(
      'MEMORY_BINDING_MISSING',
      'observability.trace.execution_memory_binding.snapshot_id must be present and equal execution_trace_v1.snapshot_id',
    );
  }

  const fpSem = traceObj?.execution_semantic_fingerprint_v1;
  const cidParsedForFp =
    traceObj?.change_impact_descriptor_v1 != null
      ? parseChangeImpactDescriptorV1(traceObj.change_impact_descriptor_v1)
      : null;
  const recomputedFp = computeExecutionSemanticFingerprintV1({
    modelFingerprint: execTrace.model_fingerprint,
    routeDecisionPath: execTrace.route_decision_path,
    changeImpactDescriptor: cidParsedForFp,
  });

  if (compat === 'cid-aware') {
    if (typeof fpSem !== 'string' || fpSem.length < 32) {
      throw new ExecutionGatewayContractViolation(
        'EXECUTION_SEMANTIC_FINGERPRINT_MISSING',
        'observability.trace.execution_semantic_fingerprint_v1 must be present (execution semantic axis)',
      );
    }
    if (recomputedFp !== fpSem) {
      throw new ExecutionGatewayContractViolation(
        'EXECUTION_SEMANTIC_FINGERPRINT_MISMATCH',
        'execution_semantic_fingerprint_v1 must match recomputation from execution_trace_v1 + optional CID',
      );
    }
  } else {
    if (typeof fpSem === 'string' && fpSem.length >= 32) {
      if (recomputedFp !== fpSem) {
        throw new ExecutionGatewayContractViolation(
          'EXECUTION_SEMANTIC_FINGERPRINT_MISMATCH',
          'execution_semantic_fingerprint_v1 must match recomputation from execution_trace_v1 + optional CID',
        );
      }
    } else {
      suppressedWarnings.push('EXECUTION_SEMANTIC_FINGERPRINT_MISSING_OR_SHORT');
    }
  }

  const cidReqRaw = request.options?.change_impact_descriptor_v1;
  if (cidReqRaw != null) {
    const reqParsed = parseChangeImpactDescriptorV1(cidReqRaw);
    const cidOnTrace = traceObj?.change_impact_descriptor_v1;
    if (cidOnTrace == null) {
      if (compat === 'cid-aware') {
        throw new ExecutionGatewayContractViolation(
          'TRACE_CID_MISSING',
          'request.options.change_impact_descriptor_v1 was set but observability.trace.change_impact_descriptor_v1 is missing',
        );
      }
      suppressedWarnings.push('TRACE_CID_MISSING');
    } else {
      const onTraceParsed = parseChangeImpactDescriptorV1(cidOnTrace);
      if (
        serializeChangeImpactDescriptorForCompare(reqParsed) !==
        serializeChangeImpactDescriptorForCompare(onTraceParsed)
      ) {
        throw new ExecutionGatewayContractViolation(
          'TRACE_CID_MISMATCH',
          'observability.trace.change_impact_descriptor_v1 must equal parsed request.options.change_impact_descriptor_v1',
        );
      }
    }
  }

  if (request.options?.orchestration_replay_strict_seal === true) {
    const fu = (response.observability as { fallback_used?: boolean } | undefined)?.fallback_used;
    if (fu === true) {
      throw new ExecutionGatewayContractViolation(
        'REPLAY_STRICT_SEAL_VIOLATION',
        'orchestration_replay_strict_seal forbids orchestration mode fallback (fallback_used)',
      );
    }
  }

  const liveHash = computeExecutionGatewayContractGovernanceRuleSetHashV1();
  if (liveHash !== EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED) {
    throw new ExecutionGatewayContractViolation(
      'GOVERNANCE_RULE_SET_DRIFT',
      'execution contract governance rule_set_hash does not match pinned EXPECTED — bump material or constant after intentional rule change',
    );
  }

  if (compat === 'legacy') {
    return {
      execution_trace_compatibility_v1: {
        schemaId: TRACE_COMPATIBILITY_ACK_SCHEMA_ID,
        version: 1,
        mode: 'legacy',
        suppressed_warnings: suppressedWarnings,
        cid_axis_version: CID_AXIS_VERSION,
      },
    };
  }
  return {};
}
