/**
 * 风险↔约束绑定：约束模板目录（Admin 下拉真源）
 *
 * 真源约定（A）：CODE_REGISTRY
 * - id 与 TripConstraint 合成 ID / LEGACY_IDS / OFFICIAL_IS 完全一致
 * - 与 DEFAULT_RISK_CONSTRAINT_BINDINGS.constraintTemplateId 同源校验
 * - 运行时 Enrichment / Feasibility / Constraints / Advisory / Apply 消费同一套 ID
 */

import {
  TRIP_CONSTRAINT_LEGACY_IDS,
  TRIP_CONSTRAINT_OFFICIAL_IS_IDS,
} from '../../trip-constraint-solver/types/trip-constraint.types';
import { DEFAULT_RISK_CONSTRAINT_BINDINGS } from './execution-risk-constraint-binding.defaults';

export type ConstraintTemplateStatus = 'ENABLED' | 'DISABLED' | 'DEPRECATED';
export type ConstraintTemplateSource = 'CODE_REGISTRY' | 'DB' | 'PACKAGE';

export type RiskConstraintTemplateDef = {
  id: string;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  notesZh: string;
  constraintCategory: string;
  constraintType: string;
  feasibilityDimension: string | null;
  executionGate: string | null;
  violationClass: string | null;
  blocked: boolean;
  priority: number;
  status: ConstraintTemplateStatus;
  source: ConstraintTemplateSource;
};

const L = TRIP_CONSTRAINT_LEGACY_IDS;
const O = TRIP_CONSTRAINT_OFFICIAL_IS_IDS;

/**
 * 可绑定的约束模板目录（含 seed 用到的全部 ID + 常用 legacy/official 供扩展绑定）
 */
export const EXECUTION_RISK_CONSTRAINT_TEMPLATES: RiskConstraintTemplateDef[] = [
  {
    id: O.WIND_SAFETY,
    labelZh: '官方风力安全',
    labelEn: 'Official wind safety',
    descriptionZh: '官方风力安全门槛未满足时硬阻断',
    notesZh: '官方风力安全，硬阻断',
    constraintCategory: 'SAFETY',
    constraintType: 'EXTERNAL',
    feasibilityDimension: 'environment',
    executionGate: 'STOP',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    priority: 10,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: O.RED_ALERT,
    labelZh: '官方红色警报',
    labelEn: 'Official red alert',
    descriptionZh: '火山/气象红色警报时硬阻断相关行程',
    notesZh: '官方红色警报约束',
    constraintCategory: 'SAFETY',
    constraintType: 'EXTERNAL',
    feasibilityDimension: 'environment',
    executionGate: 'STOP',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    priority: 5,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: O.FROAD_2WD,
    labelZh: 'F 路车辆准入',
    labelEn: 'F-road vehicle access',
    descriptionZh: '2WD 禁止进入 F 路及高地 track',
    notesZh: 'F 路车辆准入官方规则',
    constraintCategory: 'TRANSPORT',
    constraintType: 'EXTERNAL',
    feasibilityDimension: 'transport',
    executionGate: 'STOP',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    priority: 12,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: O.WINTER_FROAD,
    labelZh: '冬季 F 路关闭',
    labelEn: 'Winter F-road closure',
    descriptionZh: '冬季高地/F 路季节性关闭时硬约束',
    notesZh: '冬季 F 路季节性关闭',
    constraintCategory: 'TRANSPORT',
    constraintType: 'EXTERNAL',
    feasibilityDimension: 'transport',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    priority: 14,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.WORLD_FEASIBILITY,
    labelZh: '世界态可行性',
    labelEn: 'World feasibility',
    descriptionZh: '行前世界状态与方案可执行性综合验证',
    notesZh: '世界态可行性约束',
    constraintCategory: 'WORLD_STATE',
    constraintType: 'EXTERNAL',
    feasibilityDimension: 'environment',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    priority: 20,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.MAX_DAILY_DRIVE,
    labelZh: '日驾上限',
    labelEn: 'Max daily drive',
    descriptionZh: '单日驾驶时长/距离上限，超时需改线或强制休息',
    notesZh: '日驾上限/强制休息',
    constraintCategory: 'TRANSPORT',
    constraintType: 'HARD',
    feasibilityDimension: 'transport',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_TIME',
    blocked: true,
    priority: 15,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.NO_NIGHT_DRIVE,
    labelZh: '禁止夜驾',
    labelEn: 'No night drive',
    descriptionZh: '日落后禁止驾驶；日照不足时提前收车',
    notesZh: '禁止夜驾/提前收车',
    constraintCategory: 'TIME',
    constraintType: 'HARD',
    feasibilityDimension: 'schedule',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_TIME',
    blocked: true,
    priority: 15,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.TIME_RANGE,
    labelZh: '行程时间窗',
    labelEn: 'Trip time range',
    descriptionZh: '行程起止日期与预订/活动时间窗',
    notesZh: '日程/预订时间窗',
    constraintCategory: 'TIME',
    constraintType: 'SOFT',
    feasibilityDimension: 'booking',
    executionGate: 'AT_RISK',
    violationClass: 'HARD_BOOKING',
    blocked: false,
    priority: 40,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.MAX_SEGMENT_DISTANCE,
    labelZh: '单段距离上限',
    labelEn: 'Max segment distance',
    descriptionZh: '单段行程距离上限',
    notesZh: '单段距离硬约束',
    constraintCategory: 'TRANSPORT',
    constraintType: 'HARD',
    feasibilityDimension: 'transport',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_TIME',
    blocked: true,
    priority: 25,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.DAILY_WALK_LIMIT,
    labelZh: '日步行上限',
    labelEn: 'Daily walk limit',
    descriptionZh: '成员日步行负荷上限',
    notesZh: '日步行/疲劳约束',
    constraintCategory: 'MEMBER',
    constraintType: 'HARD',
    feasibilityDimension: 'team_fit',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_MEMBER',
    blocked: true,
    priority: 28,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.TRANSPORT_MODE,
    labelZh: '交通方式',
    labelEn: 'Transport mode',
    descriptionZh: '行程交通方式约束（自驾/公共交通等）',
    notesZh: '交通方式约束',
    constraintCategory: 'TRANSPORT',
    constraintType: 'HARD',
    feasibilityDimension: 'transport',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_TIME',
    blocked: true,
    priority: 30,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.BUDGET_TOTAL,
    labelZh: '总预算',
    labelEn: 'Total budget',
    descriptionZh: '行程总预算硬/软上限',
    notesZh: '预算约束',
    constraintCategory: 'BUDGET',
    constraintType: 'HARD',
    feasibilityDimension: 'schedule',
    executionGate: 'AT_RISK',
    violationClass: 'SOFT',
    blocked: false,
    priority: 50,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.TRAVELERS,
    labelZh: '出行人数',
    labelEn: 'Travelers',
    descriptionZh: '团队人数与成员构成约束',
    notesZh: '成员/人数约束',
    constraintCategory: 'MEMBER',
    constraintType: 'HARD',
    feasibilityDimension: 'team_fit',
    executionGate: 'AT_RISK',
    violationClass: 'HARD_MEMBER',
    blocked: false,
    priority: 45,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.PACING_LEVEL,
    labelZh: '行程节奏',
    labelEn: 'Pacing level',
    descriptionZh: '行程节奏强度（轻松/适中/紧凑）',
    notesZh: '节奏约束',
    constraintCategory: 'ACTIVITY',
    constraintType: 'SOFT',
    feasibilityDimension: 'team_fit',
    executionGate: 'AT_RISK',
    violationClass: 'SOFT',
    blocked: false,
    priority: 55,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.MUST_PLACES,
    labelZh: '必去地点',
    labelEn: 'Must places',
    descriptionZh: '必去 POI / 地点清单',
    notesZh: '必去地点约束',
    constraintCategory: 'DESTINATION',
    constraintType: 'HARD',
    feasibilityDimension: 'itinerary_completeness',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_BOOKING',
    blocked: true,
    priority: 35,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.AVOID_PLACES,
    labelZh: '避开地点',
    labelEn: 'Avoid places',
    descriptionZh: '需避开的地点清单',
    notesZh: '避开地点约束',
    constraintCategory: 'DESTINATION',
    constraintType: 'SOFT',
    feasibilityDimension: 'itinerary_completeness',
    executionGate: 'AT_RISK',
    violationClass: 'SOFT',
    blocked: false,
    priority: 60,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.PLANNING_POLICY,
    labelZh: '规划策略',
    labelEn: 'Planning policy',
    descriptionZh: '规划策略包绑定',
    notesZh: '规划策略约束',
    constraintCategory: 'CUSTOM',
    constraintType: 'SOFT',
    feasibilityDimension: 'schedule',
    executionGate: 'AT_RISK',
    violationClass: 'SOFT',
    blocked: false,
    priority: 70,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
  {
    id: L.LUNCH_STRATEGY,
    labelZh: '午餐策略',
    labelEn: 'Lunch strategy',
    descriptionZh: '午餐时段与策略',
    notesZh: '午餐策略约束',
    constraintCategory: 'ACTIVITY',
    constraintType: 'SOFT',
    feasibilityDimension: 'schedule',
    executionGate: 'AT_RISK',
    violationClass: 'SOFT',
    blocked: false,
    priority: 75,
    status: 'ENABLED',
    source: 'CODE_REGISTRY',
  },
];

const BY_ID = new Map(EXECUTION_RISK_CONSTRAINT_TEMPLATES.map((t) => [t.id, t]));

export function getConstraintTemplateDef(id: string): RiskConstraintTemplateDef | undefined {
  return BY_ID.get(id);
}

export function listConstraintTemplateDefs(query: {
  q?: string;
  /** undefined → ENABLED；null/'all' → 不过滤；其它 → 精确匹配 */
  status?: string | null;
  constraintCategory?: string;
} = {}): RiskConstraintTemplateDef[] {
  let items = [...EXECUTION_RISK_CONSTRAINT_TEMPLATES];
  if (query.status === null || query.status === 'all' || query.status === '*') {
    // 不过滤 status
  } else {
    const st = query.status ?? 'ENABLED';
    items = items.filter((t) => t.status === st);
  }
  if (query.constraintCategory) {
    items = items.filter((t) => t.constraintCategory === query.constraintCategory);
  }
  if (query.q?.trim()) {
    const q = query.q.trim().toLowerCase();
    items = items.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.labelZh.toLowerCase().includes(q) ||
        t.labelEn.toLowerCase().includes(q) ||
        t.descriptionZh.toLowerCase().includes(q) ||
        t.notesZh.toLowerCase().includes(q),
    );
  }
  return items.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/** seed / create 校验：模板必须在目录中（DISABLED/DEPRECATED 仍可解析回显） */
export function assertConstraintTemplateIdKnown(id: string): RiskConstraintTemplateDef {
  const def = BY_ID.get(id);
  if (!def) {
    throw new Error(`Unknown constraintTemplateId: ${id}`);
  }
  return def;
}

/** 验收：seed 中全部 constraintTemplateId ⊆ 目录 */
export function assertSeedTemplatesCoveredByCatalog(): string[] {
  const missing: string[] = [];
  for (const seed of DEFAULT_RISK_CONSTRAINT_BINDINGS) {
    if (!BY_ID.has(seed.constraintTemplateId)) {
      missing.push(seed.constraintTemplateId);
    }
  }
  return missing;
}
