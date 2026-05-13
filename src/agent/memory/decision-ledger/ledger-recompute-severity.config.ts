import type { LedgerActionType, LedgerNode } from './decision-ledger.types';

/** 次生 INVALIDATED 若落在此集合，编排器短路升阶，避免 LLM 小循环「越抹越黑」 */
export const HARD_CONSTRAINT_ACTION_TYPES: LedgerActionType[] = ['LOGISTICS', 'WORLD'];

/**
 * 判定本次 id 列表（通常为 secondaryInvalidated）是否触及硬约束类节点。
 */
export function containsHardConstraintViolation(invalidatedIds: string[], nodes: LedgerNode[]): boolean {
  if (invalidatedIds.length === 0) return false;
  const idSet = new Set(invalidatedIds);
  return nodes.some(
    n => idSet.has(n.nodeId) && HARD_CONSTRAINT_ACTION_TYPES.includes(n.actionType),
  );
}
