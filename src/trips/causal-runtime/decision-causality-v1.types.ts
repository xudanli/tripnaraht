/**
 * Decision causality schema v1 — extends v0 audit spine with CausalDecisionTuple.
 */

import type { DecisionCausalityRecordV0 } from '../reality-kernel/decision-causality.types';
import type { CausalDecisionTuple } from './causal-decision-tuple.types';

export const DECISION_CAUSALITY_SCHEMA_V1 = 'tripnara/decision-causality/v1' as const;

export interface DecisionCausalityRecordV1
  extends Omit<DecisionCausalityRecordV0, 'schema'> {
  schema: typeof DECISION_CAUSALITY_SCHEMA_V1;
  /** Causal flywheel unit — optional on legacy ticks until builders populate it. */
  causal_decision?: CausalDecisionTuple;
}

export type DecisionCausalityRecord = DecisionCausalityRecordV0 | DecisionCausalityRecordV1;

export function isDecisionCausalityRecordV1(
  record: DecisionCausalityRecord,
): record is DecisionCausalityRecordV1 {
  return record.schema === DECISION_CAUSALITY_SCHEMA_V1;
}
