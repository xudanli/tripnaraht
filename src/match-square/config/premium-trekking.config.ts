/** Premium Trekking & Expedition — 与左侧「🏃 徒步」入口 / Vibe 剧本联动 */

export const PREMIUM_TREKKING_SCENE_ID = 'premium_trekking' as const;

export type PremiumTrekkingSceneId = typeof PREMIUM_TREKKING_SCENE_ID;

/** 前端左侧菜单 id（image_e422c5 徒步入口） */
export const PREMIUM_TREKKING_MENU_ID = 'hiking' as const;

export const PREMIUM_TREKKING_SCRIPT_IDS = [
  'iceland_laugavegur_heavy_trek',
  'chuanxi_heavy_trek',
  'light_trek_dyl_retreat',
  'weekend_fast_light_trek',
] as const;

export type PremiumTrekkingScriptId = (typeof PREMIUM_TREKKING_SCRIPT_IDS)[number];

export const PREMIUM_TREKKING_SCENE = {
  id: PREMIUM_TREKKING_SCENE_ID,
  menuId: PREMIUM_TREKKING_MENU_ID,
  label: 'Premium Trekking & Expedition',
  labelZh: '高端硬核徒步',
  description:
    '极端环境下的社会化成熟度、抗压韧性与情绪底线验证 — 冰岛兰格维格重装 / 川西 DEM 行军 / DYL 轻装隐居 / Fast&Light 速攀',
  scriptIds: [...PREMIUM_TREKKING_SCRIPT_IDS],
} as const;

const PREMIUM_TREK_SCRIPT_SET = new Set<string>(PREMIUM_TREKKING_SCRIPT_IDS);

export function isPremiumTrekkingScriptId(
  scriptId: string | null | undefined,
): scriptId is PremiumTrekkingScriptId {
  return scriptId != null && PREMIUM_TREK_SCRIPT_SET.has(scriptId);
}

export function resolvePremiumTrekkingSceneCategory(
  scriptId: string | null | undefined,
): PremiumTrekkingSceneId | null {
  return isPremiumTrekkingScriptId(scriptId) ? PREMIUM_TREKKING_SCENE_ID : null;
}

export function listPremiumTrekkingSceneOption() {
  return {
    id: PREMIUM_TREKKING_SCENE.id,
    menuId: PREMIUM_TREKKING_SCENE.menuId,
    label: PREMIUM_TREKKING_SCENE.labelZh,
    description: PREMIUM_TREKKING_SCENE.description,
    scriptIds: [...PREMIUM_TREKKING_SCENE.scriptIds],
  };
}
