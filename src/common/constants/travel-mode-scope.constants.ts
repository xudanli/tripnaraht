/**
 * 产品范围：当前仅支持自驾。
 * 前端 catalog / 待确认项 / 约束摘要均以此为准；未显式传入时由后端默认补齐。
 */
export const DEFAULT_PACING_TRAVEL_MODE = 'DRIVING' as const;
export const DEFAULT_GUIDE_TRANSPORT_MODE = 'self_drive' as const;
export const DEFAULT_WORKBENCH_TRAVEL_MODE = 'self_drive' as const;

export const EXPOSED_TRAVEL_MODE_OPTIONS = [
  { id: DEFAULT_WORKBENCH_TRAVEL_MODE, label: '自驾' },
] as const;

export const EXPOSED_AGENT_TRANSPORT_MODES = [
  { value: 'DRIVE', label_zh: '自驾', label_en: 'Drive', aliases: ['开车'] },
] as const;

export const EXPOSED_PLANNING_WORKBENCH_TRAVEL_MODES = [
  DEFAULT_WORKBENCH_TRAVEL_MODE,
] as const;

export const DEFAULT_EXPLORATION_VEHICLE_TYPE = '2WD_COMPACT_SUV' as const;

/** Plan Studio 约束卡片：交通行固定自驾且不对用户暴露编辑入口 */
export const TRANSPORT_CONSTRAINT_BFF = {
  label: '自驾',
  editable: false as const,
  hidden: true as const,
  scope: 'self_drive_only' as const,
};

const LEGACY_GUIDE_TRANSPORT_ALIASES = new Set([
  'bus',
  'tour',
  'mixed',
  'unknown',
  'public_transit',
  'walking',
  'walk',
  'transit',
]);

/** Guide-to-Plan：非自驾值归一为默认自驾（兼容历史会话） */
export function normalizeGuideTransportMode(
  mode?: string | null,
): typeof DEFAULT_GUIDE_TRANSPORT_MODE {
  if (!mode || LEGACY_GUIDE_TRANSPORT_ALIASES.has(mode)) {
    return DEFAULT_GUIDE_TRANSPORT_MODE;
  }
  return DEFAULT_GUIDE_TRANSPORT_MODE;
}
