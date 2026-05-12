// src/agent/runtime/testing/semantic-contract-drift.types.ts
/**
 * 契约 guard 专用：统一语义漂移日志形态（非 taxonomy、不 fail CI）。
 * @see semantic-validation-contract.md
 */
export type SemanticContractDriftCategory = 'mode_mismatch' | 'lines_mismatch' | 'topology_mismatch';

export interface SemanticContractDriftEvent {
  type: 'semantic_contract_drift';
  category: SemanticContractDriftCategory;
  message: string;
  context?: {
    facadeStage?: string;
    role?: string;
    spanId?: string;
  };
}
