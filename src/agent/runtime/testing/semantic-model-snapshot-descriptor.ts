// src/agent/runtime/testing/semantic-model-snapshot-descriptor.ts
/**
 * 语义执行模型快照描述符：回归基线锚、CI 版本门控、compare(A,B) 的「模型身份」侧。
 * @see semantic-validation-contract.md §10
 */
import { executionTimelineInputHash } from '../execution-timeline-hash.util';
import topology from './fixtures/semantic-replay-golden-path/execution_graph_topology.json';
import {
  EXECUTION_MODEL_VERSION,
  SEMANTIC_VALIDATION_CONTRACT_REVISION,
  SEMANTIC_VALIDATION_RESULT_SCHEMA_ID,
  SEMANTIC_VALIDATION_RESULT_VERSION,
} from './semantic-validation-result-schema';

export type SemanticModelSnapshotDescriptor = {
  executionModelVersion: typeof EXECUTION_MODEL_VERSION;
  schemaId: typeof SEMANTIC_VALIDATION_RESULT_SCHEMA_ID;
  contractRevision: typeof SEMANTIC_VALIDATION_CONTRACT_REVISION;
  /** sha256（canonical JSON，见契约 §10）；不含事件载荷 */
  fingerprint: string;
};

function fingerprintMaterial(): Record<string, unknown> {
  const fixturesRevision = (topology as { fixtures_revision?: string }).fixtures_revision ?? '';
  return {
    contractRevision: SEMANTIC_VALIDATION_CONTRACT_REVISION,
    executionModelVersion: EXECUTION_MODEL_VERSION,
    schemaId: SEMANTIC_VALIDATION_RESULT_SCHEMA_ID,
    topologyFixturesRevision: String(fixturesRevision),
    validationResultVersion: SEMANTIC_VALIDATION_RESULT_VERSION,
  };
}

export function buildSemanticModelSnapshotDescriptor(): SemanticModelSnapshotDescriptor {
  const fingerprint = executionTimelineInputHash(fingerprintMaterial()) ?? '';
  return {
    executionModelVersion: EXECUTION_MODEL_VERSION,
    schemaId: SEMANTIC_VALIDATION_RESULT_SCHEMA_ID,
    contractRevision: SEMANTIC_VALIDATION_CONTRACT_REVISION,
    fingerprint,
  };
}
