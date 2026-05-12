export type {
  ExecutionProof,
  ExecutionProofWitness,
  TraceSegment,
  TraceSegmentKind,
} from './execution-proof.types';
export { EXECUTION_PROOF_SCHEMA_VERSION } from './execution-proof.types';

export {
  buildExecutionProof,
  hashOverlayFramesCommitment,
  recomputeHashesFromWitness,
  type BuildExecutionProofInput,
} from './build-execution-proof';
