/**
 * Admin v1 — metadata.hikingDetailOverride
 * 与 TripNara Admin `hiking-detail-override` 契约对齐
 */

export type HikingDetailOverrideRiskRow = {
  id: string;
  label?: string;
  labelCN?: string;
  value: string;
  level?: 'low' | 'medium' | 'high' | string;
  notes?: string;
};

export type HikingDetailOverrideHardGate = {
  id: string;
  title?: string;
  titleZh?: string;
  description?: string;
  ruleZh?: string;
  severity?: 'low' | 'medium' | 'high' | string;
  category?: string;
  threshold?: string;
};

export type HikingDetailOverrideEmergency = {
  rescuePhone?: string;
  registrationPoint?: string;
  registrationPointZh?: string;
  rangerContact?: string;
  notes?: string;
};

export type HikingDetailOverrideAccess = {
  byCar?: string;
  byBus?: string;
  byShuttle?: string;
  notes?: string;
  driving?: Record<string, unknown>;
  transit?: Record<string, unknown>;
};

export type HikingDetailOverrideSupplyPoiRef = {
  id: string;
  nameCN?: string;
  nameEN?: string;
  subCategory?: string;
  lat?: number;
  lng?: number;
  role?: string;
};

export type HikingDetailOverrideShelter = {
  id: string;
  nameCN?: string;
  nameEN?: string;
  type?: string;
  lat?: number;
  lng?: number;
  bookingRequired?: boolean;
  feeZh?: string;
};

export type HikingDetailOverrideTimeWindow = {
  suggestedDeparture?: string;
  suggestedDepartTime?: string;
  lastReturnBus?: string;
  notes?: string;
  sunsetBufferMin?: number;
  daylightHoursNoteZh?: string;
};

/** 运营可配 — 准备清单分组（与 hikingDetail.checklistTemplates / HikePlan prep 对齐） */
export type HikingDetailOverrideChecklistItem = {
  id: string;
  labelZh?: string;
  name?: string;
  nameCN?: string;
  required?: boolean;
};

export type HikingDetailOverrideChecklistGroup = {
  id: string;
  category: 'gear' | 'safety' | 'logistics' | 'permits' | 'essential' | string;
  titleZh?: string;
  items: HikingDetailOverrideChecklistItem[];
};

/** 运营可配 — 行前许可 */
export type HikingDetailOverridePermit = {
  id: string;
  titleZh?: string;
  name?: string;
  nameCN?: string;
  required?: boolean;
  bookingUrl?: string;
  noteZh?: string;
};

export type HikingDetailOverrideV1 = {
  riskMatrix?: HikingDetailOverrideRiskRow[] | null;
  hardGates?: HikingDetailOverrideHardGate[] | null;
  emergency?: HikingDetailOverrideEmergency | null;
  access?: HikingDetailOverrideAccess | null;
  supplyPois?: HikingDetailOverrideSupplyPoiRef[] | null;
  shelters?: HikingDetailOverrideShelter[] | null;
  timeWindow?: HikingDetailOverrideTimeWindow | null;
  /** 准备页装备清单模板（整段替换代码种子） */
  checklistTemplates?: HikingDetailOverrideChecklistGroup[] | null;
  /** 准备页许可模板（整段替换） */
  permits?: HikingDetailOverridePermit[] | null;
  alternatives?: Record<string, unknown> | null;
  source?: string;
  updatedAt?: string;
};

export type HikingDetailOverrideResponse = {
  routeDirectionId: number;
  hikingDetailOverride: HikingDetailOverrideV1;
  updatedAt: string | null;
  source: string | null;
};

export const HIKING_DETAIL_OVERRIDE_SOURCE = 'TripNara_Admin_HikingDetailOverride';

export const RISK_PATCH_KEYS = ['riskMatrix', 'hardGates', 'emergency'] as const;
export const LOGISTICS_PATCH_KEYS = [
  'access',
  'supplyPois',
  'shelters',
  'timeWindow',
] as const;
export const PREP_PATCH_KEYS = ['checklistTemplates', 'permits'] as const;
