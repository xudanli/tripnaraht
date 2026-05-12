export type RepairActionType =
  | 'replace_place'
  | 'move_slot'
  | 'split_day'
  | 'remove_activity'
  | 'insert_rest_buffer'
  | 'change_zone';

export type RepairFailureClass = 'hard' | 'soft';

export interface StandardizedRepairAction {
  type: RepairActionType;
  day: number;
  slot?: string;
  placeId?: number;
  fromZone?: string;
  toZone?: string;
  class: RepairFailureClass;
  /** Gate / convergence 引用原因码 */
  reasonCode?: string;
}
