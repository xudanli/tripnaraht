import { randomUUID } from 'crypto';
import type {
  ExecutionTrace,
  ExecutionTraceStep,
  ExecutionTraceStepType,
} from '../contracts/execution-trace.types';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ExecutionDecision, ExecutionEngineType } from '../contracts/execution-control-policy.types';
import type { ArtifactReplayConfidence } from '../contracts/artifact-replay-confidence.types';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import type { RuntimeExecutionAnomaly } from '../contracts/runtime-execution-profile.validation.types';

export function newExecutionTraceId(): string {
  return randomUUID();
}

export interface ExecutionTraceEnvelope {
  traceId: string;
  artifactId: string;
  decision: ExecutionDecision;
  engine: ExecutionEngineType;
  provenance: ReplayProvenance;
  confidence: ArtifactReplayConfidence;
  anomalies: RuntimeExecutionAnomaly[];
}

/**
 * Append-only trace emission during execution — execution becomes trace emission process.
 */
export class ExecutionTraceEmitter {
  private readonly steps: ExecutionTraceStep[] = [];
  private seq = 0;

  constructor(private readonly envelope: ExecutionTraceEnvelope) {}

  emit(params: {
    type: ExecutionTraceStepType;
    input: unknown;
    output: unknown;
    stepId?: string;
    metadata?: ExecutionTraceStep['metadata'];
  }): void {
    this.seq += 1;
    const stepId = params.stepId ?? `${this.envelope.traceId}:${this.seq}`;
    this.steps.push({
      stepId,
      type: params.type,
      input: params.input,
      output: params.output,
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });
  }

  seal(): ExecutionTrace {
    return {
      traceId: this.envelope.traceId,
      artifactId: this.envelope.artifactId,
      decision: this.envelope.decision,
      engine: this.envelope.engine,
      steps: [...this.steps],
      provenance: this.envelope.provenance,
      confidence: this.envelope.confidence,
      anomalies: [...this.envelope.anomalies],
      timestamp: Date.now(),
    };
  }
}

/** Attach sealed trace to response observability (call after execution completes). */
export function attachExecutionTraceToResponse(
  response: RouteAndRunResponseDto,
  trace: ExecutionTrace,
): void {
  response.observability = {
    ...response.observability,
    execution_trace: trace,
  };
}
