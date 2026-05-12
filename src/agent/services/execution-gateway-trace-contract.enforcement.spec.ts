import { assertExecutionGatewayPostReturnContract, ExecutionGatewayContractViolation } from './execution-gateway-trace-contract.enforcement';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { buildSemanticModelSnapshotDescriptor } from '../runtime/testing/semantic-model-snapshot-descriptor';
import { buildOrchestrationExecutionTraceV1 } from '../contracts/orchestration-execution-trace-v1.types';
import { EXECUTION_MODEL_RUNTIME_ROUTER } from '../runtime/execution-model-runtime-router';
import {
  buildCidSemanticViewV1,
  computeExecutionSemanticFingerprintV1,
  parseChangeImpactDescriptorV1,
} from '../contracts/execution-os-change-impact-descriptor.v1';

describe('assertExecutionGatewayPostReturnContract', () => {
  const fp = buildSemanticModelSnapshotDescriptor().fingerprint;
  const snap = '11111111-1111-4111-8111-111111111111';
  const router = EXECUTION_MODEL_RUNTIME_ROUTER.select({
    snapshotId: snap,
    executionModelVersion: undefined,
    allowUpgrade: false,
    runtimeHint: null,
  });

  const mkTrace = () =>
    buildOrchestrationExecutionTraceV1({
      snapshotId: snap,
      modelFingerprint: fp,
      selectedExecutionModelVersion: router.selectedExecutionModelVersion,
      selectionReason: router.reason,
      runtimeHint: null,
      route: {
        task_type: 'GENERIC_QA',
        route_policy_resolved: 'LEGACY',
        intent_mode_requested: 'AUTO',
        intent_mode_resolved: 'GENERIC_QA',
      },
    });

  const baseRequest = (): RouteAndRunRequestDto => ({
    request_id: 'r1',
    user_id: 'anonymous',
    message: 'hi',
  });

  const cidPayload = {
    schemaId: 'agent.execution_os.change_impact_descriptor@v1',
    version: 1,
    classification: 'GOVERNANCE' as const,
    impacts: {
      traceSchema: false,
      memoryBinding: false,
      replayDeterminism: false,
      governanceHash: true,
    },
    summary: 'test cid on trace alignment',
  };

  function traceAxis(
    trace: ReturnType<typeof mkTrace>,
    cid?: Record<string, unknown>,
  ): Record<string, unknown> {
    const cidParsed = cid ? parseChangeImpactDescriptorV1(cid) : null;
    return {
      execution_semantic_fingerprint_v1: computeExecutionSemanticFingerprintV1({
        modelFingerprint: trace.model_fingerprint,
        routeDecisionPath: trace.route_decision_path,
        changeImpactDescriptor: cidParsed,
      }),
      ...(cidParsed
        ? {
            change_impact_descriptor_v1: cidParsed,
            cid_semantic_view_v1: buildCidSemanticViewV1(cidParsed),
          }
        : {}),
    };
  }

  it('passes when trace, bindings, and fingerprint align', () => {
    const trace = mkTrace();
    const request = baseRequest();
    (request as any).__memoryExecutionBinding = {
      snapshot_id: snap,
      snapshot_version: 1,
      request_id: request.request_id,
    };
    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: { route: 'SYSTEM1_RAG' } as any,
      result: { status: 'OK', answer_text: 'x', payload: {} as any },
      explain: {} as any,
      observability: {
        latency_ms: 1,
        execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
        trace: {
          execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
          execution_trace_v1: trace,
          ...traceAxis(trace),
        },
      } as any,
    };
    expect(assertExecutionGatewayPostReturnContract({ request, response })).toEqual({});
  });

  it('throws when execution_trace_v1 is missing on OK', () => {
    const request = baseRequest();
    (request as any).__memoryExecutionBinding = { snapshot_id: snap, snapshot_version: 1, request_id: 'r1' };
    const response: RouteAndRunResponseDto = {
      request_id: 'r1',
      route: {} as any,
      result: { status: 'OK', answer_text: 'x', payload: {} as any },
      explain: {} as any,
      observability: {
        latency_ms: 1,
        execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: 'r1' },
        trace: {},
      } as any,
    };
    expect(() => assertExecutionGatewayPostReturnContract({ request, response })).toThrow(
      ExecutionGatewayContractViolation,
    );
  });

  it('skips when NEED_MORE_INFO', () => {
    const request = baseRequest();
    const response: RouteAndRunResponseDto = {
      request_id: 'r1',
      route: {} as any,
      result: { status: 'NEED_MORE_INFO', answer_text: 'x', payload: {} as any },
      explain: {} as any,
      observability: { latency_ms: 1, trace: {} } as any,
    };
    expect(() => assertExecutionGatewayPostReturnContract({ request, response })).not.toThrow();
  });

  it('requires trace.change_impact_descriptor_v1 when request carries CID', () => {
    const trace = mkTrace();
    const request = baseRequest();
    request.options = { change_impact_descriptor_v1: cidPayload };
    (request as any).__memoryExecutionBinding = {
      snapshot_id: snap,
      snapshot_version: 1,
      request_id: request.request_id,
    };
    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: {} as any,
      result: { status: 'OK', answer_text: 'x', payload: {} as any },
      explain: {} as any,
      observability: {
        latency_ms: 1,
        execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
        trace: {
          execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
          execution_trace_v1: trace,
          ...traceAxis(trace),
        },
      } as any,
    };
    expect(() => assertExecutionGatewayPostReturnContract({ request, response })).toThrow(
      ExecutionGatewayContractViolation,
    );
  });

  it('passes when request CID matches trace.change_impact_descriptor_v1', () => {
    const trace = mkTrace();
    const request = baseRequest();
    request.options = { change_impact_descriptor_v1: cidPayload };
    (request as any).__memoryExecutionBinding = {
      snapshot_id: snap,
      snapshot_version: 1,
      request_id: request.request_id,
    };
    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: {} as any,
      result: { status: 'OK', answer_text: 'x', payload: {} as any },
      explain: {} as any,
      observability: {
        latency_ms: 1,
        execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
        trace: {
          execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
          execution_trace_v1: trace,
          ...traceAxis(trace, cidPayload),
        },
      } as any,
    };
    expect(assertExecutionGatewayPostReturnContract({ request, response })).toEqual({});
  });

  it('legacy mode allows missing semantic fingerprint and records suppressed warning', () => {
    const trace = mkTrace();
    const request = baseRequest();
    request.options = { trace_compatibility_mode: 'legacy' };
    (request as any).__memoryExecutionBinding = {
      snapshot_id: snap,
      snapshot_version: 1,
      request_id: request.request_id,
    };
    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: { route: 'SYSTEM1_RAG' } as any,
      result: { status: 'OK', answer_text: 'x', payload: {} as any },
      explain: {} as any,
      observability: {
        latency_ms: 1,
        execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
        trace: {
          execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
          execution_trace_v1: trace,
        },
      } as any,
    };
    const ack = assertExecutionGatewayPostReturnContract({ request, response });
    expect(ack.execution_trace_compatibility_v1?.mode).toBe('legacy');
    expect(ack.execution_trace_compatibility_v1?.suppressed_warnings).toContain(
      'EXECUTION_SEMANTIC_FINGERPRINT_MISSING_OR_SHORT',
    );
  });

  it('legacy mode still rejects fingerprint mismatch when fingerprint field is present', () => {
    const trace = mkTrace();
    const request = baseRequest();
    request.options = { trace_compatibility_mode: 'legacy' };
    (request as any).__memoryExecutionBinding = {
      snapshot_id: snap,
      snapshot_version: 1,
      request_id: request.request_id,
    };
    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: { route: 'SYSTEM1_RAG' } as any,
      result: { status: 'OK', answer_text: 'x', payload: {} as any },
      explain: {} as any,
      observability: {
        latency_ms: 1,
        execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
        trace: {
          execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
          execution_trace_v1: trace,
          execution_semantic_fingerprint_v1: '0'.repeat(64),
        },
      } as any,
    };
    expect(() => assertExecutionGatewayPostReturnContract({ request, response })).toThrow(
      ExecutionGatewayContractViolation,
    );
  });

  it('legacy mode allows TRACE_CID_MISSING when request carries CID but trace omits descriptor', () => {
    const trace = mkTrace();
    const request = baseRequest();
    request.options = { trace_compatibility_mode: 'legacy', change_impact_descriptor_v1: cidPayload };
    (request as any).__memoryExecutionBinding = {
      snapshot_id: snap,
      snapshot_version: 1,
      request_id: request.request_id,
    };
    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: { route: 'SYSTEM1_RAG' } as any,
      result: { status: 'OK', answer_text: 'x', payload: {} as any },
      explain: {} as any,
      observability: {
        latency_ms: 1,
        execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
        trace: {
          execution_memory_binding: { snapshot_id: snap, snapshot_version: 1, request_id: request.request_id },
          execution_trace_v1: trace,
        },
      } as any,
    };
    const ack = assertExecutionGatewayPostReturnContract({ request, response });
    expect(ack.execution_trace_compatibility_v1?.suppressed_warnings).toContain('TRACE_CID_MISSING');
    expect(ack.execution_trace_compatibility_v1?.suppressed_warnings).toContain(
      'EXECUTION_SEMANTIC_FINGERPRINT_MISSING_OR_SHORT',
    );
  });
});
