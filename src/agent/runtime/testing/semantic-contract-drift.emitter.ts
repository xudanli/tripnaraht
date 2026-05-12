// src/agent/runtime/testing/semantic-contract-drift.emitter.ts
import { Logger } from '@nestjs/common';
import type { SemanticContractDriftCategory, SemanticContractDriftEvent } from './semantic-contract-drift.types';

const GUARD_STAGE = 'validateSemanticExecutionGraph.contract_guard';

export function emitSemanticContractDrift(
  logger: Logger,
  category: SemanticContractDriftCategory,
  message: string,
  context?: Omit<NonNullable<SemanticContractDriftEvent['context']>, 'facadeStage'>,
): void {
  const ev: SemanticContractDriftEvent = {
    type: 'semantic_contract_drift',
    category,
    message,
    context: { facadeStage: GUARD_STAGE, ...context },
  };
  logger.warn(JSON.stringify(ev));
}
