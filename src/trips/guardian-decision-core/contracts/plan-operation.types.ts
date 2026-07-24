/**
 * RFC-001 Phase 0 — plan mutations as proposed operations (not effective until authorized).
 */

import type { EntityRef } from './entity-ref.types';

export type PlanOperationKind =
  | 'ADD_ITEM'
  | 'REMOVE_ITEM'
  | 'REPLACE_ITEM'
  | 'MOVE_ITEM'
  | 'CHANGE_ROUTE'
  | 'ADD_BUFFER'
  | 'SHIFT_TIME'
  | 'SPLIT_DAY'
  | 'MERGE_SEGMENT';

export interface PlanOperation {
  operationId: string;
  kind: PlanOperationKind;
  targetRefs: EntityRef[];
  parameters: Record<string, unknown>;
}
