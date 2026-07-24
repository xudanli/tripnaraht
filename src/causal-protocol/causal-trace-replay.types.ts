import type { CausalStoryView } from './causal-story-view.types';
import type { CausalTraceReference } from './causal-trace-reference.types';
import type { CanonicalCausalTraceV1 } from './causal-trace.types';

export const CAUSAL_TRACE_REPLAY_SCHEMA = 'tripnara.causal_trace_replay@v1' as const;

export interface CausalTraceReplayView {
  schemaId: typeof CAUSAL_TRACE_REPLAY_SCHEMA;
  tripId: string;
  problemId: string;
  generatedAt: string;
  ref: CausalTraceReference;
  trace: CanonicalCausalTraceV1;
  causalStoryView: CausalStoryView;
  guardianCausalStoryView: CausalStoryView;
}
