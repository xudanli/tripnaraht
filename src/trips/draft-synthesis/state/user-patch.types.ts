import type { DraftSlot } from './trip-draft-state.types';

/** 用户反馈统一为可重放的结构补丁，避免「整表重算」丢历史 */
export type UserPatchType =
  | 'replace_place'
  | 'remove_slot'
  | 'add_constraint'
  | 'change_intensity'
  | 'lock_place'
  | 'prefer_zone';

export interface UserPatch {
  type: UserPatchType;
  day?: number;
  slot?: DraftSlot;
  /** replace_place / lock_place */
  targetPlaceId?: number;
  newPlaceId?: number;
  /** add_constraint */
  constraintText?: string;
  /** change_intensity */
  intensity?: string;
  /** prefer_zone */
  zone?: string;
  reason?: string;
}
