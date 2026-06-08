/**
 * PRD 3.13 — 任务派发 × 角色权重矩阵
 */

import type { SceneRoleAnchorId } from '../types/recruitment-task-flywheel.types';

export type TaskAssigneePreference =
  | 'captain'
  | 'highest_control'
  | 'istp_executor'
  | 'co_planning_deputy'
  | 'noise_anchored_member'
  | 'member_slot_index_1';

export interface TaskRoleDispatchRule {
  templateId: string;
  prefer: TaskAssigneePreference;
  fallback: TaskAssigneePreference;
}

export const TASK_ROLE_DISPATCH_RULES: readonly TaskRoleDispatchRule[] = [
  {
    templateId: 'satellite_dem_offline_verify',
    prefer: 'captain',
    fallback: 'highest_control',
  },
  {
    templateId: 'ford_gear_shared_checklist',
    prefer: 'istp_executor',
    fallback: 'member_slot_index_1',
  },
  {
    templateId: 'pre_trip_safety_blueprint',
    prefer: 'noise_anchored_member',
    fallback: 'member_slot_index_1',
  },
  {
    templateId: 'shared_gear_ledger',
    prefer: 'co_planning_deputy',
    fallback: 'member_slot_index_1',
  },
  {
    templateId: 'dyl_canvas_evening_prep',
    prefer: 'co_planning_deputy',
    fallback: 'member_slot_index_1',
  },
  {
    templateId: 'self_drive_contract_sign',
    prefer: 'captain',
    fallback: 'highest_control',
  },
];

export const SCENE_ROLE_ANCHOR_LABELS: Record<SceneRoleAnchorId, string> = {
  blind_box_follower: '🧩 盲盒跟从者',
  hardcore_executor: '🛠️ 硬核执行者',
  co_planning_deputy: '📋 协同副手',
  atmosphere_energizer: '🎭 气氛组',
  safety_blueprint_owner: '🛡️ 安全蓝图负责人',
};

export function resolveTaskDispatchRule(templateId: string): TaskRoleDispatchRule | null {
  return TASK_ROLE_DISPATCH_RULES.find((r) => r.templateId === templateId) ?? null;
}
