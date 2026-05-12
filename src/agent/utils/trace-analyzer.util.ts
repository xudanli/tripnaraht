import type { ExecutionDecision, ExecutionEngineType } from '../contracts/execution-control-policy.types';
import type { ExecutionKernel } from '../contracts/execution-semantic-field.types';
import type { ExecutionTrace, ExecutionTraceStep } from '../contracts/execution-trace.types';
import type { PolicyDeviation, TraceAnalysisResult } from '../contracts/policy-correction.types';
import { executionToolDepthToLegacyDepth, legacyTierToKernel } from './legacy-execution-projection.util';

function lastKernelSelectOutput(trace: ExecutionTrace): ExecutionKernel | undefined {
  for (let i = trace.steps.length - 1; i >= 0; i--) {
    const s = trace.steps[i] as ExecutionTraceStep;
    if (s.type !== 'ENGINE_SELECT') continue;
    const out = s.output as { kernel?: ExecutionKernel; engine?: ExecutionEngineType } | undefined;
    if (out?.kernel) return out.kernel;
    if (out?.engine) return legacyTierToKernel(out.engine);
  }
  return undefined;
}

/** Heuristic depth from tool-call count + declared ECPS depth (relative scale). */
export function inferToolDepthObserved(params: {
  toolCallCount: number;
  declaredDepth: ExecutionDecision['toolDepth'];
}): 'NONE' | 'LIGHT' | 'FULL' {
  const { toolCallCount, declaredDepth: _declaredDepth } = params;
  if (toolCallCount <= 0) return 'NONE';
  if (toolCallCount <= 2) return 'LIGHT';
  return 'FULL';
}

function depthDominates(expected: 'NONE' | 'LIGHT' | 'FULL', observed: 'NONE' | 'LIGHT' | 'FULL'): boolean {
  const rank = { NONE: 0, LIGHT: 1, FULL: 2 };
  return rank[observed] > rank[expected];
}

/**
 * Compare an authoritative ECPS expectation against a sealed execution trace.
 *
 * When the trace only contains ECPS_EVAL + ARTIFACT_READ (dedup short path), observations stay aligned with decision.
 */
export function analyzeExecutionTrace(params: {
  expectedDecision: ExecutionDecision;
  trace: ExecutionTrace;
}): TraceAnalysisResult {
  const { expectedDecision, trace } = params;
  const deviationSignals: PolicyDeviation[] = [];

  const observedKernel = lastKernelSelectOutput(trace) ?? trace.decision.kernel;
  if (observedKernel !== expectedDecision.kernel) {
    deviationSignals.push({
      kind: 'ROUTING_DEVIATION',
      detail: 'ECPS kernel does not match trace-emitted kernel selection',
      expected: expectedDecision.kernel,
      actual: observedKernel,
    });
  }

  if (trace.decision.confidenceGate !== trace.confidence.band) {
    deviationSignals.push({
      kind: 'CONFIDENCE_MISMATCH',
      detail: 'Decision confidenceGate band differs from artifact replay confidence band at trace seal',
      expected: trace.decision.confidenceGate,
      actual: trace.confidence.band,
    });
  }

  const toolCallCount = trace.steps.filter((s) => s.type === 'TOOL_CALL').length;
  const observedDepth = inferToolDepthObserved({
    toolCallCount,
    declaredDepth: expectedDecision.toolDepth,
  });
  const expectedLegacyDepth = executionToolDepthToLegacyDepth(expectedDecision.toolDepth);
  if (depthDominates(expectedLegacyDepth, observedDepth)) {
    deviationSignals.push({
      kind: 'TOOL_DEPTH_MISMATCH',
      detail: 'Observed tool-call depth exceeds ECPS toolDepth plan',
      expected: expectedDecision.toolDepth,
      actual: { toolCallCount, inferredDepth: observedDepth },
    });
  }

  if (expectedDecision.mode === 'REUSE') {
    const writes = trace.steps.filter((s) => s.type === 'ARTIFACT_WRITE').length;
    if (writes > 0 || toolCallCount > 0) {
      deviationSignals.push({
        kind: 'REPLAY_VIOLATION',
        detail: 'REUSE mode trace contains writes or tool calls (non read-only replay)',
        expected: 'READ_ONLY_REPLAY',
        actual: { artifactWrites: writes, toolCalls: toolCallCount },
      });
    }
  }

  return {
    artifactId: trace.artifactId,
    expectedDecision,
    actualExecution: trace,
    deviationSignals,
  };
}
