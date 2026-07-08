/**
 * Merge Decision Semantics causality into Agent memory_contract / ledger_healing observability.
 */

import type { MemoryContractObservabilityV1 } from '../../../agent/memory/services/memory-context-assembler.service';
import type { LedgerHealingObservabilityV1 } from '../../../agent/memory/decision-ledger/ledger-healing-observability.util';
import type { DecisionLedgerCausalityConsoleV1 } from './decision-ledger-console-read.util';

export type MemoryContractWithDecisionLedgerV1 = MemoryContractObservabilityV1 & {
  decision_ledger_causality?: Pick<
    DecisionLedgerCausalityConsoleV1,
    'revision' | 'trip_id' | 'ledger_node_to_decision_id' | 'links' | 'decision_records_count'
  >;
};

export function mergeDecisionLedgerCausalityIntoMemoryContractObs(
  memContractObs: MemoryContractObservabilityV1,
  causality: DecisionLedgerCausalityConsoleV1,
): MemoryContractWithDecisionLedgerV1 {
  const layers = [...memContractObs.layers];
  if (!layers.includes('decision_ledger_causality_hydrated')) {
    layers.push('decision_ledger_causality_hydrated');
  }

  return {
    ...memContractObs,
    layers,
    decision_ledger_causality: {
      revision: causality.revision,
      trip_id: causality.trip_id,
      ledger_node_to_decision_id: causality.ledger_node_to_decision_id,
      links: causality.links,
      decision_records_count: causality.decision_records_count,
    },
  };
}

export type LedgerHealingObservabilityWithDecisionsV1 = LedgerHealingObservabilityV1 & {
  /** INVALIDATED / affected 节点 → 用户 Decision Semantics decisionId */
  user_decision_by_node_id?: Record<string, string>;
};

export function enrichLedgerHealingObsWithDecisionCausality(
  healing: LedgerHealingObservabilityV1,
  causality: DecisionLedgerCausalityConsoleV1,
): LedgerHealingObservabilityWithDecisionsV1 {
  const index = causality.ledger_node_to_decision_id;
  const affected = healing.affected_node_ids ?? [];
  const user_decision_by_node_id: Record<string, string> = {};

  for (const nodeId of affected) {
    const decisionId = index[nodeId];
    if (decisionId) user_decision_by_node_id[nodeId] = decisionId;
  }

  if (!Object.keys(user_decision_by_node_id).length && !Object.keys(index).length) {
    return healing;
  }

  return {
    ...healing,
    user_decision_by_node_id: Object.keys(user_decision_by_node_id).length
      ? user_decision_by_node_id
      : index,
  };
}
