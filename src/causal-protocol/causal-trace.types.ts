import type {
  CausalCalibrationV1,
  CausalEffectV1,
  CausalFactRef,
  CausalOptionRef,
  CausalProblemRef,
} from './causal-trace-node.types';

export const CANONICAL_CAUSAL_TRACE_SCHEMA = 'tripnara.canonical_causal_trace@v1' as const;

export type CanonicalCausalTraceStatus =
  | 'PREVIEW'
  | 'SELECTED'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'CALIBRATED'
  | 'STALE';

export interface CanonicalCausalTraceV1 {
  schema: typeof CANONICAL_CAUSAL_TRACE_SCHEMA;
  traceId: string;
  tripId: string;
  worldStateVersion: string;
  createdAt: string;
  updatedAt: string;

  trigger: {
    type: string;
    source: string;
    observedAt: string;
  };

  facts: CausalFactRef[];
  effects: CausalEffectV1[];
  problems: CausalProblemRef[];
  options: CausalOptionRef[];

  selectedOptionId?: string;
  executionRef?: string;
  outcomeRef?: string;
  calibration?: CausalCalibrationV1;

  status: CanonicalCausalTraceStatus;
}
