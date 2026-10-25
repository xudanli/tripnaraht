/**
 * 风险知识 ↔ 行程约束：默认桥接种子（全局，knowledgeVersionId=null）
 * 对齐 TripConstraintCategory / LEGACY_IDS / OFFICIAL_IS / FeasibilityDimension
 */

export type RiskConstraintBindingSeed = {
  id: string;
  knowledgeCode: string;
  severityLevel: string | null;
  constraintCategory: string;
  constraintType: string;
  constraintTemplateId: string;
  feasibilityDimension: string | null;
  executionGate: string | null;
  violationClass: string | null;
  blocked: boolean;
  notesZh: string;
  priority: number;
};

export const DEFAULT_RISK_CONSTRAINT_BINDINGS: RiskConstraintBindingSeed[] = [
  {
    id: 'rcb_wind_stop',
    knowledgeCode: 'ENV-WIND-01',
    severityLevel: 'STOP',
    constraintCategory: 'SAFETY',
    constraintType: 'EXTERNAL',
    constraintTemplateId: 'c_official_is_wind_safety',
    feasibilityDimension: 'environment',
    executionGate: 'STOP',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    notesZh: '持续强风达停止阈值 → 官方风力安全约束，硬阻断',
    priority: 10,
  },
  {
    id: 'rcb_wind_replan',
    knowledgeCode: 'ENV-WIND-01',
    severityLevel: 'REPLAN_REQUIRED',
    constraintCategory: 'WORLD_STATE',
    constraintType: 'EXTERNAL',
    constraintTemplateId: 'c_world_feasibility',
    feasibilityDimension: 'environment',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    notesZh: '强风需改线 → 世界态可行性约束',
    priority: 20,
  },
  {
    id: 'rcb_wind_atrisk',
    knowledgeCode: 'ENV-WIND-01',
    severityLevel: 'AT_RISK',
    constraintCategory: 'SAFETY',
    constraintType: 'SOFT',
    constraintTemplateId: 'c_world_feasibility',
    feasibilityDimension: 'environment',
    executionGate: 'AT_RISK',
    violationClass: 'SOFT',
    blocked: false,
    notesZh: '强风有风险 → 软提示，不直接阻断',
    priority: 30,
  },
  {
    id: 'rcb_road_close_stop',
    knowledgeCode: 'ROAD-CLOSE-01',
    severityLevel: 'STOP',
    constraintCategory: 'TRANSPORT',
    constraintType: 'EXTERNAL',
    constraintTemplateId: 'c_world_feasibility',
    feasibilityDimension: 'transport',
    executionGate: 'STOP',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    notesZh: '道路封闭 → 交通可行硬约束',
    priority: 10,
  },
  {
    id: 'rcb_road_ice',
    knowledgeCode: 'ROAD-ICE-01',
    severityLevel: 'REPLAN_REQUIRED',
    constraintCategory: 'TRANSPORT',
    constraintType: 'HARD',
    constraintTemplateId: 'c_max_daily_drive',
    feasibilityDimension: 'transport',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_TIME',
    blocked: true,
    notesZh: '结冰路面 → 压缩日驾/改线',
    priority: 20,
  },
  {
    id: 'rcb_fatigue_driver',
    knowledgeCode: 'MEMBER-FATIGUE-DRIVER-01',
    severityLevel: 'REPLAN_REQUIRED',
    constraintCategory: 'MEMBER',
    constraintType: 'HARD',
    constraintTemplateId: 'c_max_daily_drive',
    feasibilityDimension: 'team_fit',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_MEMBER',
    blocked: true,
    notesZh: '驾驶员疲劳 → 日驾上限/强制休息',
    priority: 15,
  },
  {
    id: 'rcb_daylight',
    knowledgeCode: 'ENV-LIGHT-01',
    severityLevel: 'REPLAN_REQUIRED',
    constraintCategory: 'TIME',
    constraintType: 'HARD',
    constraintTemplateId: 'c_no_night_drive',
    feasibilityDimension: 'schedule',
    executionGate: 'REPLAN_REQUIRED',
    violationClass: 'HARD_TIME',
    blocked: true,
    notesZh: '日照不足 → 禁止夜驾/提前收车',
    priority: 15,
  },
  {
    id: 'rcb_fuel',
    knowledgeCode: 'RESOURCE-FUEL-01',
    severityLevel: 'STOP',
    constraintCategory: 'TRANSPORT',
    constraintType: 'HARD',
    constraintTemplateId: 'c_world_feasibility',
    feasibilityDimension: 'transport',
    executionGate: 'STOP',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    notesZh: '燃油危急 → 资源硬约束阻断',
    priority: 10,
  },
  {
    id: 'rcb_volcano',
    knowledgeCode: 'ENV-VOLC-01',
    severityLevel: 'STOP',
    constraintCategory: 'SAFETY',
    constraintType: 'EXTERNAL',
    constraintTemplateId: 'c_official_is_red_alert',
    feasibilityDimension: 'environment',
    executionGate: 'STOP',
    violationClass: 'HARD_SAFETY',
    blocked: true,
    notesZh: '火山红警 → 官方红色警报约束',
    priority: 5,
  },
  {
    id: 'rcb_booking_window',
    knowledgeCode: 'BOOK-TIME-01',
    severityLevel: 'AT_RISK',
    constraintCategory: 'TIME',
    constraintType: 'SOFT',
    constraintTemplateId: 'c_time_range',
    feasibilityDimension: 'booking',
    executionGate: 'AT_RISK',
    violationClass: 'HARD_BOOKING',
    blocked: false,
    notesZh: '预订时间窗受压 → 日程/预订维度提示',
    priority: 40,
  },
];

export function resolveBindingsForRisk(input: {
  knowledgeCode: string;
  severityLevel?: string | null;
  bindings: Array<{
    knowledgeCode: string;
    severityLevel: string | null;
    status: string;
    priority: number;
    blocked: boolean;
    constraintTemplateId: string;
    constraintCategory: string;
    constraintType: string;
    executionGate: string | null;
    violationClass: string | null;
    feasibilityDimension: string | null;
    notesZh: string | null;
    id: string;
  }>;
}) {
  const level = input.severityLevel ?? null;
  const active = input.bindings
    .filter((b) => b.status === 'ACTIVE' && b.knowledgeCode === input.knowledgeCode)
    .filter((b) => b.severityLevel == null || b.severityLevel === level)
    .sort((a, b) => a.priority - b.priority);

  return {
    knowledgeCode: input.knowledgeCode,
    severityLevel: level,
    bindings: active,
    primary: active[0] ?? null,
    anyBlocked: active.some((b) => b.blocked),
  };
}
