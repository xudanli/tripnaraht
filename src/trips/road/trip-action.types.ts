/**
 * Trip repair intent — 不直接改 Plan，供 Repair / Neptune / Agent 消费
 */

export type TripAction =
  | { type: 'REMOVE_POI'; poiId: string }
  | { type: 'SHIFT_DAY'; dayId: string; deltaMinutes: number }
  | { type: 'REORDER_SLOT'; slotIds: string[] }
  | { type: 'MARK_INFEASIBLE'; poiId: string };
