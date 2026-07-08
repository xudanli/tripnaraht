/**
 * 硬约束 catalog — POST /constraints 按 source.templateId 创建
 */

import type {
  TripConstraint,
  TripConstraintCategory,
  TripConstraintOperator,
  TripConstraintScope,
  TripConstraintType,
  StoredUnifiedConstraint,
} from '../types/trip-constraint.types';
import { TRIP_CONSTRAINT_LEGACY_IDS } from '../types/trip-constraint.types';
import {
  SOFT_PRIORITY_HIGH,
  SOFT_PRIORITY_LOW,
  SOFT_PRIORITY_MEDIUM,
  intensityFromPriority,
  normalizeSoftPriorityPatch,
} from './soft-constraint-priority.util';

export interface ConstraintTemplateDefinition {
  templateId: string;
  defaultName: string;
  description?: string;
  category: TripConstraintCategory;
  type: TripConstraintType;
  scope: TripConstraintScope;
  operator: TripConstraintOperator;
  defaultValue: Record<string, unknown>;
  allowRelaxation: boolean;
  unit?: string;
  /** SOFT 默认重要程度（1–10） */
  defaultPriority?: number;
  solverRuleKind?: string;
  buildJudgmentRule: (value: Record<string, unknown>) => string;
  displayValue?: (value: Record<string, unknown>) => string | undefined;
}

const LEGACY_PATCH_ONLY_TEMPLATE_IDS = new Set([
  'no_night_drive',
  'max_daily_drive',
  'budget_total',
  'time_range',
  'travelers',
  'transport_mode',
  'must_places',
  'avoid_places',
  'daily_walk_limit',
  'max_segment_distance',
]);

function tpl(
  partial: Omit<ConstraintTemplateDefinition, 'buildJudgmentRule'> & {
    judgmentRule: string | ((value: Record<string, unknown>) => string);
    displayValue?: string | ((value: Record<string, unknown>) => string | undefined);
  },
): ConstraintTemplateDefinition {
  const buildJudgmentRule =
    typeof partial.judgmentRule === 'function'
      ? partial.judgmentRule
      : () => partial.judgmentRule as string;
  const displayValue =
    typeof partial.displayValue === 'function'
      ? partial.displayValue
      : partial.displayValue
        ? () => partial.displayValue as string
        : undefined;
  const { judgmentRule: _j, displayValue: _d, ...rest } = partial;
  return { ...rest, buildJudgmentRule, displayValue };
}

const CONSTRAINT_TEMPLATE_CATALOG: ConstraintTemplateDefinition[] = [
  tpl({
    templateId: 'earliest_departure',
    defaultName: '最早出发时间',
    category: 'TIME',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'AFTER',
    defaultValue: { time: '08:00' },
    allowRelaxation: false,
    judgmentRule: (v) => `每日出发不早于 ${String(v.time ?? '08:00')}`,
    displayValue: (v) => String(v.time ?? '08:00'),
  }),
  tpl({
    templateId: 'latest_end',
    defaultName: '最晚结束时间',
    category: 'TIME',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'BEFORE',
    defaultValue: { time: '22:00' },
    allowRelaxation: false,
    judgmentRule: (v) => `每日活动结束不晚于 ${String(v.time ?? '22:00')}`,
    displayValue: (v) => String(v.time ?? '22:00'),
  }),
  tpl({
    templateId: 'max_daily_activity',
    defaultName: '每日活动上限',
    category: 'TIME',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'LTE',
    defaultValue: { maxHours: 10 },
    allowRelaxation: true,
    unit: 'hour',
    judgmentRule: (v) => `单日活动时长不超过 ${Number(v.maxHours ?? 10)} 小时`,
    displayValue: (v) => `${Number(v.maxHours ?? 10)} 小时/天`,
  }),
  tpl({
    templateId: 'required_rest',
    defaultName: '强制休息',
    category: 'TIME',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'GTE',
    defaultValue: { minRestMinutes: 60 },
    allowRelaxation: false,
    unit: 'minute',
    judgmentRule: (v) => `每日至少安排 ${Number(v.minRestMinutes ?? 60)} 分钟休息`,
    displayValue: (v) => `${Number(v.minRestMinutes ?? 60)} 分钟/天`,
  }),
  tpl({
    templateId: 'fixed_appointments',
    defaultName: '固定预约',
    category: 'TIME',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'CONTAINS',
    defaultValue: { appointments: [] as unknown[] },
    allowRelaxation: false,
    judgmentRule: (v) => {
      const n = Array.isArray(v.appointments) ? v.appointments.length : 0;
      return n > 0 ? `${n} 个固定预约不可挪动` : '固定预约时间不可变更';
    },
  }),
  tpl({
    templateId: 'activity_budget',
    defaultName: '活动预算',
    category: 'BUDGET',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'LTE',
    defaultValue: { total: 5000, currency: 'CNY' },
    allowRelaxation: true,
    judgmentRule: (v) =>
      `活动支出不超过 ${Number(v.total ?? 5000)} ${String(v.currency ?? 'CNY')}`,
    displayValue: (v) => `${Number(v.total ?? 5000)} ${String(v.currency ?? 'CNY')}`,
  }),
  tpl({
    templateId: 'allow_budget_overrun',
    defaultName: '允许预算超支',
    description: '允许临时超出总预算，以保留体验弹性',
    category: 'BUDGET',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'EQ',
    defaultValue: { allowed: true },
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'budget',
    judgmentRule: (v) => (v.allowed ? '允许临时超支' : '不允许预算超支'),
  }),
  tpl({
    templateId: 'budget_overrun_tolerance',
    defaultName: '预算超支容忍度',
    category: 'BUDGET',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'LTE',
    defaultValue: { overrunTolerancePct: 5 },
    allowRelaxation: true,
    judgmentRule: (v) => `总预算超支不超过 ${Number(v.overrunTolerancePct ?? 5)}%`,
    displayValue: (v) => `${Number(v.overrunTolerancePct ?? 5)}%`,
  }),
  tpl({
    templateId: 'elderly_walk_limit',
    defaultName: '老人步行上限',
    category: 'MEMBER',
    type: 'HARD',
    scope: { type: 'MEMBER_GROUP' },
    operator: 'LTE',
    defaultValue: { maxKm: 3 },
    allowRelaxation: true,
    unit: 'km',
    judgmentRule: (v) => `老人每日步行不超过 ${Number(v.maxKm ?? 3)} km`,
    displayValue: (v) => `${Number(v.maxKm ?? 3)} km/天`,
  }),
  tpl({
    templateId: 'child_nap_time',
    defaultName: '儿童午睡',
    category: 'MEMBER',
    type: 'HARD',
    scope: { type: 'MEMBER_GROUP' },
    operator: 'CONTAINS',
    defaultValue: { startTime: '13:00', durationMinutes: 90 },
    allowRelaxation: true,
    judgmentRule: (v) =>
      `每日 ${String(v.startTime ?? '13:00')} 起安排约 ${Number(v.durationMinutes ?? 90)} 分钟午睡`,
  }),
  tpl({
    templateId: 'accessibility',
    defaultName: '无障碍要求',
    category: 'MEMBER',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'EQ',
    defaultValue: { wheelchairAccessible: true, noStairs: true },
    allowRelaxation: false,
    judgmentRule: () => '行程须满足轮椅可达、避免长时间楼梯',
  }),
  tpl({
    templateId: 'motion_sickness',
    defaultName: '晕车限制',
    category: 'MEMBER',
    type: 'HARD',
    scope: { type: 'MEMBER_GROUP' },
    operator: 'LTE',
    defaultValue: { maxContinuousDriveMinutes: 120 },
    allowRelaxation: true,
    unit: 'minute',
    judgmentRule: (v) =>
      `连续乘车不超过 ${Number(v.maxContinuousDriveMinutes ?? 120)} 分钟`,
  }),
  tpl({
    templateId: 'no_unpaved_road',
    defaultName: '不走非铺装路',
    category: 'SAFETY',
    type: 'HARD',
    scope: { type: 'ROUTE_SEGMENT' },
    operator: 'EQ',
    defaultValue: { unpavedAllowed: false },
    allowRelaxation: false,
    judgmentRule: () => '路线不得包含非铺装 / F 路路段',
  }),
  tpl({
    templateId: 'no_bad_weather',
    defaultName: '恶劣天气不出行',
    category: 'SAFETY',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'EQ',
    defaultValue: { minWeatherScore: 60 },
    allowRelaxation: true,
    judgmentRule: (v) => `恶劣天气评分低于 ${Number(v.minWeatherScore ?? 60)} 时不安排户外驾驶`,
  }),
  tpl({
    templateId: 'no_high_risk_activity',
    defaultName: '禁止高风险活动',
    category: 'SAFETY',
    type: 'HARD',
    scope: { type: 'TRIP' },
    operator: 'NOT_IN',
    defaultValue: { blockedTags: ['high_risk', 'glacier_walk'] },
    allowRelaxation: false,
    judgmentRule: () => '不得安排冰川徒步等高风险活动',
  }),
  tpl({
    templateId: 'no_unverified_route',
    defaultName: '禁止未验证路线',
    category: 'SAFETY',
    type: 'HARD',
    scope: { type: 'ROUTE_SEGMENT' },
    operator: 'EQ',
    defaultValue: { requireVerifiedRoute: true },
    allowRelaxation: false,
    judgmentRule: () => '仅使用已通过道路/证据验证的路线',
  }),
  // —— SOFT catalog（soft_prefer）——
  tpl({
    templateId: 'minimize_hotel_changes',
    defaultName: '少换酒店',
    description: '尽量连续住同一家酒店，减少搬运行李与换宿摩擦',
    category: 'ACCOMMODATION',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_HIGH,
    solverRuleKind: 'lodging_continuity',
    judgmentRule: () => '尽量连续住同一家酒店',
  }),
  tpl({
    templateId: 'budget_soft',
    defaultName: '控制预算',
    description: '在可接受范围内控制活动与交通支出',
    category: 'BUDGET',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_HIGH,
    solverRuleKind: 'budget',
    judgmentRule: () => '尽量控制活动与交通支出',
  }),
  tpl({
    templateId: 'elderly_rest',
    defaultName: '老人下午休息',
    description: '为老人/长者安排下午休息时段',
    category: 'MEMBER',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: { startTime: '14:00', durationMinutes: 90 },
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_HIGH,
    solverRuleKind: 'time_window',
    judgmentRule: () => '下午为老人安排休息',
  }),
  tpl({
    templateId: 'lunch_time_window',
    defaultName: '午餐时间窗',
    description: '午餐尽量安排在 12:00–13:30',
    category: 'TIME',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: { startTime: '12:00', endTime: '13:30' },
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'time_window',
    judgmentRule: () => '午餐尽量在 12:00–13:30',
  }),
  tpl({
    templateId: 'max_major_pois_per_day',
    defaultName: '每日主要景点上限',
    description: '单日主要景点不超过 3 个，避免行程过满',
    category: 'ACTIVITY',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'LTE',
    defaultValue: { maxCount: 3 },
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'daily_count',
    judgmentRule: (v) => `每日主要景点不超过 ${Number(v.maxCount ?? 3)} 个`,
  }),
  tpl({
    templateId: 'daily_free_time',
    defaultName: '每日自由时间',
    description: '每天保留约 1 小时自由缓冲',
    category: 'TIME',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'GTE',
    defaultValue: { minMinutes: 60 },
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'time_budget',
    judgmentRule: (v) => `每日保留至少 ${Number(v.minMinutes ?? 60)} 分钟自由时间`,
  }),
  tpl({
    templateId: 'avoid_early',
    defaultName: '尽量避免早起',
    description: '非必要不安排过早出发',
    category: 'TIME',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'AFTER',
    defaultValue: { earliestTime: '08:30' },
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'time_window',
    judgmentRule: (v) => `尽量 ${String(v.earliestTime ?? '08:30')} 后再出发`,
  }),
  tpl({
    templateId: 'avoid_backtracking',
    defaultName: '不走回头路',
    description: '路线尽量单向推进，减少折返',
    category: 'TRANSPORT',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'route_shape',
    judgmentRule: () => '路线尽量不走回头路',
  }),
  tpl({
    templateId: 'prefer_nature_scenery',
    defaultName: '多自然景观',
    description: '优先安排自然景观类 POI',
    category: 'ACTIVITY',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'poi_preference',
    judgmentRule: () => '尽量多安排自然景观',
  }),
  tpl({
    templateId: 'less_shopping',
    defaultName: '少购物',
    description: '减少购物停留，把时间留给体验',
    category: 'ACTIVITY',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_LOW,
    solverRuleKind: 'poi_preference',
    judgmentRule: () => '尽量减少购物停留',
  }),
  tpl({
    templateId: 'sunset_photography',
    defaultName: '日落摄影',
    description: '为日落摄影保留傍晚时段与机位',
    category: 'ACTIVITY',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_LOW,
    solverRuleKind: 'time_window',
    judgmentRule: () => '尽量保留日落摄影时段',
  }),
  tpl({
    templateId: 'aurora_photo',
    defaultName: '极光摄影',
    description: '为极光观测/拍摄保留夜间窗口',
    category: 'ACTIVITY',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_LOW,
    solverRuleKind: 'time_window',
    judgmentRule: () => '尽量保留极光摄影窗口',
  }),
  tpl({
    templateId: 'prefer_local_food',
    defaultName: '本地美食',
    description: '优先安排当地特色餐饮',
    category: 'ACTIVITY',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'poi_preference',
    judgmentRule: () => '尽量多安排本地美食',
  }),
  tpl({
    templateId: 'avoid_crowds',
    defaultName: '避开车流/人流高峰',
    description: '尽量避开高峰时段与拥挤景点',
    category: 'ACTIVITY',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'crowd_avoidance',
    judgmentRule: () => '尽量避开拥挤时段',
  }),
  tpl({
    templateId: 'attractions_over_shopping',
    defaultName: '景点优先于购物',
    description: '时间冲突时优先景点体验而非购物',
    category: 'ACTIVITY',
    type: 'SOFT',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    defaultValue: {},
    allowRelaxation: true,
    unit: 'score',
    defaultPriority: SOFT_PRIORITY_MEDIUM,
    solverRuleKind: 'poi_preference',
    judgmentRule: () => '景点体验优先于购物',
  }),
];

const TEMPLATE_BY_ID = new Map(
  CONSTRAINT_TEMPLATE_CATALOG.map((t) => [t.templateId, t]),
);

export function getConstraintTemplate(
  templateId: string,
): ConstraintTemplateDefinition | undefined {
  return TEMPLATE_BY_ID.get(templateId);
}

export function listConstraintTemplateIds(): string[] {
  return CONSTRAINT_TEMPLATE_CATALOG.map((t) => t.templateId);
}

export function listSoftConstraintTemplateIds(): string[] {
  return CONSTRAINT_TEMPLATE_CATALOG.filter((t) => t.type === 'SOFT').map((t) => t.templateId);
}

/** JSON Schema / OpenAPI 代码生成 — 与 TS registry SSOT 同步 */
export interface ConstraintTemplateCatalogEntry {
  templateId: string;
  constraintId: string;
  defaultName: string;
  description?: string;
  category: TripConstraintCategory;
  type: TripConstraintType;
  sectionKey: 'hard_must_satisfy' | 'soft_prefer';
  scope: TripConstraintScope;
  operator: TripConstraintOperator;
  defaultValue: Record<string, unknown>;
  allowRelaxation: boolean;
  unit?: string;
  defaultPriority?: number;
  defaultIntensity?: number;
  solverRuleKind?: string;
  legacyPatchOnly?: boolean;
  judgmentRuleSample?: string;
}

export interface ConstraintTemplateCatalogDocument {
  $schema?: string;
  schemaId: 'tripnara.constraint_template_catalog@v1';
  version: number;
  generatedFrom: string;
  templates: ConstraintTemplateCatalogEntry[];
}

export function exportConstraintTemplateCatalog(
  schemaUri = './constraint-template-registry.schema.json',
): ConstraintTemplateCatalogDocument {
  return {
    $schema: schemaUri,
    schemaId: 'tripnara.constraint_template_catalog@v1',
    version: 1,
    generatedFrom: 'utils/constraint-template-registry.util.ts',
    templates: CONSTRAINT_TEMPLATE_CATALOG.map((def) => ({
      templateId: def.templateId,
      constraintId: constraintIdFromTemplate(def.templateId),
      defaultName: def.defaultName,
      description: def.description,
      category: def.category,
      type: def.type,
      sectionKey: def.type === 'SOFT' ? 'soft_prefer' : 'hard_must_satisfy',
      scope: def.scope,
      operator: def.operator,
      defaultValue: { ...def.defaultValue, templateId: def.templateId },
      allowRelaxation: def.allowRelaxation,
      unit: def.unit,
      defaultPriority: def.defaultPriority,
      defaultIntensity:
        def.defaultPriority != null ? intensityFromPriority(def.defaultPriority) : undefined,
      solverRuleKind: def.solverRuleKind,
      legacyPatchOnly: isLegacyPatchOnlyTemplate(def.templateId),
      judgmentRuleSample: def.buildJudgmentRule(def.defaultValue),
    })),
  };
}

export function isLegacyPatchOnlyTemplate(templateId: string): boolean {
  return LEGACY_PATCH_ONLY_TEMPLATE_IDS.has(templateId);
}

export function constraintIdFromTemplate(templateId: string): string {
  return `c_tpl_${templateId}`;
}

export function mergeTemplateValue(
  def: ConstraintTemplateDefinition,
  patch: unknown,
): Record<string, unknown> {
  const base = { ...def.defaultValue, templateId: def.templateId };
  if (!patch || typeof patch !== 'object') return base;
  return { ...base, ...(patch as Record<string, unknown>) };
}

export function buildStoredTemplateConstraint(input: {
  def: ConstraintTemplateDefinition;
  dtoValue?: unknown;
  dtoPriority?: number;
  dtoName?: string;
  dtoDescription?: string;
  dtoCategory?: TripConstraint['category'];
  dtoScope?: TripConstraintScope;
  dtoOperator?: TripConstraintOperator;
  dtoType?: TripConstraintType;
  dtoAllowRelaxation?: boolean;
  dtoUnit?: string;
  userId: string;
  stableId: string;
  sourceType?: TripConstraint['source']['type'];
}): StoredUnifiedConstraint {
  const mergedValue = mergeTemplateValue(input.def, input.dtoValue);
  const normalized =
    input.def.type === 'SOFT'
      ? normalizeSoftPriorityPatch({
          priority: input.dtoPriority,
          value: mergedValue,
          defaultPriority: input.def.defaultPriority,
        })
      : { priority: input.dtoPriority, value: mergedValue };
  const type = input.dtoType ?? input.def.type;
  return {
    id: input.stableId,
    name: input.dtoName || input.def.defaultName,
    description: input.dtoDescription ?? input.def.description,
    category: input.dtoCategory ?? input.def.category,
    type,
    status: type === 'HARD' || type === 'SOFT' ? 'ACTIVE' : 'DRAFT',
    scope: input.dtoScope ?? input.def.scope,
    operator: input.dtoOperator ?? input.def.operator,
    value: normalized.value,
    unit: input.dtoUnit ?? input.def.unit,
    priority: normalized.priority,
    allowRelaxation: input.dtoAllowRelaxation ?? input.def.allowRelaxation,
    locked: false,
    source: {
      type: input.sourceType ?? 'USER',
      sourceId: input.userId,
      templateId: input.def.templateId,
    },
    visibility: 'TEAM',
    createdBy: input.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function projectCatalogTemplateForBff(
  c: TripConstraint,
  def: ConstraintTemplateDefinition,
): { judgmentRule: string; displayValue?: string; value: Record<string, unknown> } {
  const raw =
    c.value && typeof c.value === 'object'
      ? (c.value as Record<string, unknown>)
      : def.defaultValue;
  const judgmentRule = def.buildJudgmentRule(raw);
  const violation =
    c.type === 'HARD' && !c.allowRelaxation ? '阻断执行' : '需确认后调整';
  return {
    judgmentRule,
    displayValue: def.displayValue?.(raw),
    value: {
      ...raw,
      templateId: def.templateId,
      judgmentRule,
      violationResult: violation,
      rule: judgmentRule,
      violation,
    },
  };
}

export const LEGACY_SYNTHETIC_TEMPLATE_IDS = {
  no_night_drive: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
  max_daily_drive: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE,
  budget_total: TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL,
} as const;
