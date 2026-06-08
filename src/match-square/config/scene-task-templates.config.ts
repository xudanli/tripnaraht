/**
 * PRD 3.13 — 场景任务模板库（Vibe / 里程碑 / 剧本 → 物理协同任务）
 */

import type { CollaborativeTaskPriority } from '../types/recruitment-task-flywheel.types';

export interface SceneTaskTemplate {
  templateId: string;
  title: string;
  description: string;
  priority: CollaborativeTaskPriority;
  /** vibe chip id 命中任一即激活 */
  vibeChipIds?: readonly string[];
  /** orchestration milestone eventId 命中任一即激活 */
  milestoneIds?: readonly string[];
  /** recruitment_script_id 命中即激活 */
  scriptIds?: readonly string[];
  /** 作为噪音对冲任务（pre-match 推荐） */
  mitigatesNoise?: boolean;
  behaviorCaptureEnabled?: boolean;
}

export const SCENE_TASK_TEMPLATES: readonly SceneTaskTemplate[] = [
  {
    templateId: 'satellite_dem_offline_verify',
    title: '核对全队卫星电话预载频段与 DEM 离线数据包',
    description:
      '在出发前确认卫星电话频段、离线 GIS 瓦片与 12.5m DEM 包已预载至全队设备；队长锁定清单后不可静默跳过。',
    priority: 'critical',
    vibeChipIds: ['dem_blind_nav', 'dem_digital_elevation'],
    milestoneIds: ['fjordungakvisl_ford_gear_check'],
    scriptIds: ['iceland_laugavegur_heavy_trek'],
    behaviorCaptureEnabled: true,
  },
  {
    templateId: 'ford_gear_shared_checklist',
    title: '复核全队涉水鞋与涉水杖备选公摊',
    description:
      '依据路线模板强涉水节点（如 Fjórðungakvísl），上传涉水装备清单并由队长锁定或提出回滚修订。',
    priority: 'critical',
    vibeChipIds: ['glacier_river_ford'],
    milestoneIds: ['fjordungakvisl_ford_gear_check', 'glacier_melt_ford_window'],
    scriptIds: ['iceland_laugavegur_heavy_trek'],
    behaviorCaptureEnabled: true,
  },
  {
    templateId: 'pre_trip_safety_blueprint',
    title: '行前安全蓝图交付任务',
    description:
      '为对冲行中断网/盲导焦虑，在出发前交付个人安全蓝图（联络窗口、撤退点、装备自检签名）。',
    priority: 'high',
    mitigatesNoise: true,
    behaviorCaptureEnabled: true,
  },
  {
    templateId: 'shared_gear_ledger',
    title: '公摊装备分摊与轧差确认',
    description: '帐篷/炉具/急救包等公摊装备责任到人，行前完成分摊签字。',
    priority: 'normal',
    vibeChipIds: ['self_supported_camping', 'burnwash_full'],
    behaviorCaptureEnabled: true,
  },
  {
    templateId: 'dyl_canvas_evening_prep',
    title: '营地夜间 DYL 画布素材预载',
    description: '安吉 DNA / 心理疗愈线：预载电子画布与离线素材包，确认营地静谧时段契约。',
    priority: 'normal',
    vibeChipIds: ['dyl_life_design'],
    scriptIds: ['anji_dna_light_camp'],
    behaviorCaptureEnabled: false,
  },
  {
    templateId: 'self_drive_contract_sign',
    title: '自驾违章与责任契约签署',
    description: '自驾招募：确认违章处理、轮换驾驶与保险授权契约。',
    priority: 'high',
    vibeChipIds: ['self_drive_legal'],
    behaviorCaptureEnabled: true,
  },
];

export function resolveActiveTaskTemplates(input: {
  vibeChipIds: string[];
  milestoneIds: string[];
  recruitmentScriptId: string | null;
  mitigatingOnly?: boolean;
}): SceneTaskTemplate[] {
  const chipSet = new Set(input.vibeChipIds);
  const milestoneSet = new Set(input.milestoneIds);
  const scriptId = input.recruitmentScriptId;

  return SCENE_TASK_TEMPLATES.filter((tpl) => {
    if (input.mitigatingOnly && !tpl.mitigatesNoise) return false;

    const chipHit = tpl.vibeChipIds?.some((id) => chipSet.has(id)) ?? false;
    const milestoneHit = tpl.milestoneIds?.some((id) => milestoneSet.has(id)) ?? false;
    const scriptHit = scriptId && tpl.scriptIds?.includes(scriptId) ? true : false;

    if (tpl.mitigatesNoise && input.mitigatingOnly) return true;
    return chipHit || milestoneHit || scriptHit;
  });
}
