import type { LoopIterationDecision } from './loop-definition.types';

export interface LoopIterationRecord {
  id: string;
  loopRunId: string;
  sequence: number;
  observedState: Record<string, unknown>;
  diagnosis: Record<string, unknown>;
  proposedAction: Record<string, unknown>;
  validationResult: Record<string, unknown>;
  decision: LoopIterationDecision;
  modelUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
  };
  createdAt: string;
}
