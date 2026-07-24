/**
 * Map repair candidate operations → product execution capability (BFF).
 */

import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { ExecutionCapability } from '../../decision-semantics/types/decision-semantics.types';
import type { PlanOperation } from '../contracts/plan-operation.types';

/** Operation kinds the RFC-001 itinerary materializer can apply without manual steps. */
const MATERIALIZER_AUTO_KINDS = new Set<PlanOperation['kind']>([
  'ADD_ITEM',
  'REMOVE_ITEM',
  'REPLACE_ITEM',
  'CHANGE_ROUTE',
]);

export function resolveRepairCandidateExecutionCapability(
  candidate: Pick<Rfc001RepairCandidate, 'proposedOperations' | 'generationMethod'>,
): ExecutionCapability {
  const ops = candidate.proposedOperations ?? [];
  if (ops.length === 0) return 'GUIDED_MANUAL';

  const autoCount = ops.filter((op) => MATERIALIZER_AUTO_KINDS.has(op.kind)).length;
  if (autoCount === ops.length) return 'DIRECT';
  if (autoCount > 0) return 'PARTIAL';
  return 'GUIDED_MANUAL';
}
