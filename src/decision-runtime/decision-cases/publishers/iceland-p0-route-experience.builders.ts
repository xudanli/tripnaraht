/**
 * Iceland P0 — route load / scope / experience DecisionCase builders.
 */

import type { TradeoffDimension } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type {
  DecisionEligibilitySnapshot,
  StoredDecisionCase,
  StoredDecisionCaseOption,
} from '../contracts/decision-case.types';
import {
  buildMaterialityScore,
  emptyMaterialityBreakdown,
} from '../materiality/decision-materiality.util';
import { applyEligibilityToOptionExecutable } from '../eligibility/decision-eligibility.util';
import type { EligibilityResult } from '../eligibility/decision-eligibility.types';
import {
  SEMANTIC_EXCESSIVE_DRIVE,
  SEMANTIC_GLACIER_EXPERIENCE,
  SEMANTIC_HIGH_IMPACT_EXPERIENCE,
  SEMANTIC_LANDING_LONG_DRIVE,
  SEMANTIC_RING_VS_SOUTH,
} from './iceland-p0-case.builders';

export function toEligibilitySnapshot(
  result: EligibilityResult,
): DecisionEligibilitySnapshot {
  return {
    eligible: result.eligible,
    reason: result.reason,
    softWarnings: result.softWarnings,
    checks: result.checks.map((c) => ({
      code: c.code,
      dimension: c.dimension,
      passed: c.passed,
      detail: c.detail,
    })),
    eligibleOptionIds: result.eligibleOptionIds,
  };
}

function dim(
  dimension: TradeoffDimension['dimension'],
  direction: TradeoffDimension['direction'],
  explanation: string,
): TradeoffDimension {
  return { dimension, direction, explanation };
}

export function excessiveDriveCaseProblemId(tripId: string, dayIndex?: number): string {
  return dayIndex != null ? `dc_drive_${tripId}_d${dayIndex}` : `dc_drive_${tripId}`;
}

export function landingDriveCaseProblemId(tripId: string): string {
  return `dc_landing_${tripId}`;
}

export function ringVsSouthCaseProblemId(tripId: string): string {
  return `dc_ring_south_${tripId}`;
}

export function glacierExperienceCaseProblemId(tripId: string): string {
  return `dc_glacier_${tripId}`;
}

export function highImpactExperienceCaseProblemId(
  tripId: string,
  kind: HighImpactExperienceKind,
): string {
  return `dc_exp_${kind}_${tripId}`;
}

export type HighImpactExperienceKind =
  | 'whale'
  | 'silfra'
  | 'snowmobile'
  | 'super_jeep';

export function buildExcessiveDailyDriveCase(input: {
  tripId: string;
  dayIndex: number;
  driveHours: number;
  dayLimitHours: number;
  reason: string;
}): StoredDecisionCase {
  const now = new Date().toISOString();
  const materiality = buildMaterialityScore({
    ...emptyMaterialityBreakdown(),
    time: 3,
    safety: 2,
    fitness: 2,
    budget: 1,
  });

  return {
    problemId: excessiveDriveCaseProblemId(input.tripId, input.dayIndex),
    tripId: input.tripId,
    semanticKey: SEMANTIC_EXCESSIVE_DRIVE,
    sourceKind: 'RULE_TRIGGER',
    requiredness: 'IMPORTANT',
    domain: 'SCHEDULE',
    scope: 'DAY',
    actionKind: 'SPLIT',
    materiality,
    enrichmentStage: 'ENRICHED',
    published: true,
    writebackTargets: ['LODGING', 'ITINERARY', 'ROUTE'],
    title: '维持长距离驾驶，还是增加一晚住宿？',
    summary: `第 ${input.dayIndex + 1} 天预计驾驶约 ${input.driveHours.toFixed(1)} 小时（上限 ${input.dayLimitHours} 小时）。${input.reason}`,
    type: 'RISK',
    dimension: 'SCHEDULE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    workflowStatus: 'WAITING_DECISION',
    options: [
      {
        optionId: 'drive_keep',
        type: 'ALTERNATIVE',
        title: '保持现状',
        description: '接受当日长驾驶，注意轮班与休息。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('TIME', 'UNCHANGED', '日程不变'),
          dim('FATIGUE', 'WORSEN', '疲劳风险更高'),
        ],
        writebackPayload: { keepLongDrive: true, dayIndex: input.dayIndex },
      },
      {
        optionId: 'drive_drop_poi',
        type: 'REPAIR',
        title: '减少一个景点',
        description: '删减当日最次要停留，缩短驾驶与执行时长。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('TIME', 'IMPROVE', '当日负荷下降'),
          dim('POI_COVERAGE', 'WORSEN', '少一个停留'),
        ],
        writebackPayload: { dropPoi: true, dayIndex: input.dayIndex },
      },
      {
        optionId: 'drive_midway_lodge',
        type: 'ALTERNATIVE',
        title: '更换中途住宿',
        description: '在中段增加一晚，把超长日拆成两天。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('COST', 'WORSEN', '多一晚住宿'),
          dim('FATIGUE', 'IMPROVE', '单日驾驶更短'),
          dim('FLEXIBILITY', 'IMPROVE', '天气扰动恢复更好'),
        ],
        writebackPayload: { addLodgingNight: true, dayIndex: input.dayIndex },
      },
      {
        optionId: 'drive_move_next',
        type: 'PLAN_B',
        title: '将部分景点移到次日',
        description: '保持住宿点，移动部分 POI。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('TIME', 'IMPROVE', '分散负荷'),
          dim('FLEXIBILITY', 'UNCHANGED', '总天数不变'),
        ],
        writebackPayload: { shiftPoisToNextDay: true, dayIndex: input.dayIndex },
      },
      {
        optionId: 'drive_rotate_drivers',
        type: 'ALTERNATIVE',
        title: '改为两名司机轮换',
        description: '保持路线，降低单人疲劳。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('SAFETY', 'IMPROVE', '轮班降低困倦风险'),
          dim('GROUP_FAIRNESS', 'IMPROVE', '驾驶负担分摊'),
        ],
        writebackPayload: { rotateDrivers: true, dayIndex: input.dayIndex },
      },
    ],
    evidenceRefs: [
      `day:${input.dayIndex}`,
      `drive_hours:${input.driveHours}`,
      'sdr:SDR-101',
      'safetravel:fatigue',
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildLandingLongDriveCase(input: {
  tripId: string;
  arrivalHint: string;
  day1DriveHours: number;
  eligibility?: EligibilityResult;
  materialityBoost?: { fitness?: number; team?: number; safety?: number };
}): StoredDecisionCase {
  const now = new Date().toISOString();
  const boost = input.materialityBoost ?? {};
  const materiality = buildMaterialityScore({
    ...emptyMaterialityBreakdown(),
    safety: Math.min(3, 3 + (boost.safety ?? 0)),
    fitness: Math.min(3, 2 + (boost.fitness ?? 0)),
    time: 2,
    budget: 1,
    team: boost.team ?? 0,
  });

  const decisionCase: StoredDecisionCase = {
    problemId: landingDriveCaseProblemId(input.tripId),
    tripId: input.tripId,
    semanticKey: SEMANTIC_LANDING_LONG_DRIVE,
    sourceKind: 'RULE_TRIGGER',
    requiredness: 'IMPORTANT',
    domain: 'SCHEDULE',
    scope: 'DAY',
    actionKind: 'SELECT',
    materiality,
    enrichmentStage: 'ENRICHED',
    published: true,
    writebackTargets: ['LODGING', 'ITINERARY', 'ROUTE'],
    title: '落地后直接前往南岸，还是先在机场附近休息？',
    summary: `${input.arrivalHint}；第 1 天计划驾驶约 ${input.day1DriveHours.toFixed(1)} 小时。夜航/时差下长途驾驶风险升高（SafeTravel）。`,
    type: 'RISK',
    dimension: 'SCHEDULE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    workflowStatus: 'WAITING_DECISION',
    options: [
      {
        optionId: 'landing_drive_now',
        type: 'ALTERNATIVE',
        title: '落地后直接开往南岸',
        description: '节省一晚住宿，但有效旅行第一天易疲劳。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('COST', 'IMPROVE', '少一晚住宿'),
          dim('FATIGUE', 'WORSEN', '夜航后立即长途'),
          dim('TIME', 'IMPROVE', '当天覆盖更多里程'),
        ],
        writebackPayload: { landingMode: 'DRIVE_SOUTH_IMMEDIATE' },
      },
      {
        optionId: 'landing_rest_near_airport',
        type: 'REPAIR',
        title: '先在机场附近休息一晚',
        description: '降低疲劳驾驶风险，次日再出发南岸。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('COST', 'WORSEN', '多一晚近机场住宿'),
          dim('SAFETY', 'IMPROVE', '避免落地即长途'),
          dim('POI_COVERAGE', 'WORSEN', '少半天南岸时间'),
        ],
        writebackPayload: { landingMode: 'REST_NEAR_AIRPORT', addAirportLodging: true },
      },
      {
        optionId: 'landing_short_day1',
        type: 'ALTERNATIVE',
        title: '缩短第一天，只到近处停留',
        description: '保留当天部分南岸点，提前入住。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('FATIGUE', 'IMPROVE', '驾驶缩短'),
          dim('POI_COVERAGE', 'WORSEN', '第一天深度下降'),
        ],
        writebackPayload: { landingMode: 'SHORT_DAY1' },
      },
    ],
    evidenceRefs: [
      'flight:international_arrival',
      'day:0',
      'safetravel:jetlag',
      'gate:eligibility',
    ],
    createdAt: now,
    updatedAt: now,
  };

  if (input.eligibility) {
    decisionCase.eligibility = toEligibilitySnapshot(input.eligibility);
    if (input.eligibility.softWarnings.length) {
      decisionCase.summary = `${decisionCase.summary} ${input.eligibility.softWarnings[0]}`;
    }
  }
  return decisionCase;
}

export function buildRingVsSouthCase(input: {
  tripId: string;
  tripDays: number;
  minRingDays: number;
  avgDriveHours: number;
  dayLimitHours: number;
  eligibility?: EligibilityResult;
  materialityBoost?: { fitness?: number; team?: number; safety?: number };
}): StoredDecisionCase {
  const now = new Date().toISOString();
  const boost = input.materialityBoost ?? {};
  const materiality = buildMaterialityScore({
    ...emptyMaterialityBreakdown(),
    time: 3,
    fitness: Math.min(3, 2 + (boost.fitness ?? 0)),
    budget: 1,
    irreversibility: 1,
    team: boost.team ?? 0,
    safety: boost.safety ?? 0,
  });

  const decisionCase: StoredDecisionCase = {
    problemId: ringVsSouthCaseProblemId(input.tripId),
    tripId: input.tripId,
    semanticKey: SEMANTIC_RING_VS_SOUTH,
    sourceKind: 'RULE_TRIGGER',
    requiredness: 'IMPORTANT',
    domain: 'ROUTE',
    scope: 'TRIP',
    actionKind: 'SELECT',
    materiality,
    enrichmentStage: 'ENRICHED',
    published: true,
    writebackTargets: ['ROUTE', 'LODGING', 'ITINERARY'],
    title: '有限天数内环岛，还是聚焦南岸？',
    summary: `当前 ${input.tripDays} 天计划环岛（建议至少 ${input.minRingDays} 天）；日均驾驶约 ${input.avgDriveHours.toFixed(1)} 小时（上限 ${input.dayLimitHours}）。此为范围选择，不是不可行硬封锁。`,
    type: 'PREFERENCE_CONFLICT',
    dimension: 'STRUCTURE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    workflowStatus: 'WAITING_DECISION',
    options: [
      {
        optionId: 'scope_keep_ring',
        type: 'ALTERNATIVE',
        title: '仍走环岛（压缩停留）',
        description: '覆盖更多区域，但停留浅、扰动恢复能力弱。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('POI_COVERAGE', 'IMPROVE', '区域覆盖广'),
          dim('FATIGUE', 'WORSEN', '日均驾驶高'),
          dim('FLEXIBILITY', 'WORSEN', '天气扰动缓冲小'),
        ],
        writebackPayload: { routeScope: 'RING_COMPRESSED' },
      },
      {
        optionId: 'scope_south_coast',
        type: 'ALTERNATIVE',
        title: '改为南岸往返聚焦',
        description: '把天数用在深度停留，降低驾驶负荷。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('FATIGUE', 'IMPROVE', '驾驶负荷下降'),
          dim('POI_COVERAGE', 'WORSEN', '不覆盖全岛'),
          dim('SCENERY', 'IMPROVE', '南岸停留更深'),
        ],
        writebackPayload: { routeScope: 'SOUTH_COAST_FOCUS' },
      },
      {
        optionId: 'scope_hybrid',
        type: 'PLAN_B',
        title: '南岸 + 西边短支线',
        description: '放弃完整环岛，保留部分西峡湾/斯奈山取舍空间。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('FLEXIBILITY', 'IMPROVE', '范围更可调'),
          dim('TIME', 'UNCHANGED', '总天数不变'),
        ],
        writebackPayload: { routeScope: 'SOUTH_PLUS_WEST_SPUR' },
      },
    ],
    evidenceRefs: [
      `trip_days:${input.tripDays}`,
      `min_ring_days:${input.minRingDays}`,
      `avg_drive:${input.avgDriveHours}`,
      'gate:eligibility',
    ],
    createdAt: now,
    updatedAt: now,
  };

  if (input.eligibility) {
    decisionCase.eligibility = toEligibilitySnapshot(input.eligibility);
    if (input.eligibility.softWarnings.length) {
      decisionCase.summary = `${decisionCase.summary} ${input.eligibility.softWarnings[0]}`;
    }
  }
  return decisionCase;
}

/** 同一冰川体验槽：徒步 / 短线 / 冰洞 / 观景 */
export function buildGlacierExperienceCase(input: {
  tripId: string;
  materialityBoost?: boolean;
  eligibility?: EligibilityResult;
}): StoredDecisionCase {
  const now = new Date().toISOString();
  const materiality = buildMaterialityScore({
    ...emptyMaterialityBreakdown(),
    budget: input.materialityBoost ? 3 : 2,
    time: 3,
    fitness: 2,
    bookingUrgency: input.materialityBoost ? 2 : 1,
    safety: 1,
  });

  const options = glacierOptions();
  if (input.eligibility) {
    applyEligibilityToOptionExecutable(options, input.eligibility);
  }

  const decisionCase: StoredDecisionCase = {
    problemId: glacierExperienceCaseProblemId(input.tripId),
    tripId: input.tripId,
    semanticKey: SEMANTIC_GLACIER_EXPERIENCE,
    sourceKind: 'OPPORTUNITY',
    requiredness: materiality.total >= 9 ? 'BLOCKING' : 'IMPORTANT',
    domain: 'EXPERIENCE',
    scope: 'ACTIVITY',
    actionKind: 'SELECT',
    materiality,
    enrichmentStage: 'ENRICHED',
    published: true,
    writebackTargets: ['ITINERARY', 'BOOKING_INTENT'],
    title: '选择哪种冰川体验？',
    summary: '路线靠近多个冰川产品；合并为一个决策，避免冰洞/徒步分卡刷屏。',
    type: 'PREFERENCE_CONFLICT',
    dimension: 'EXPERIENCE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    workflowStatus: 'WAITING_DECISION',
    options,
    evidenceRefs: [
      'route:glacier_zone',
      'pref:adventure',
      'official:guided_glacier',
      'gate:eligibility',
      'gate:materiality>=6',
    ],
    createdAt: now,
    updatedAt: now,
  };

  if (input.eligibility) {
    decisionCase.eligibility = toEligibilitySnapshot(input.eligibility);
  }
  return decisionCase;
}

function glacierOptions(): StoredDecisionCaseOption[] {
  return [
    {
      optionId: 'glacier_hike',
      type: 'ALTERNATIVE',
      title: '冰川徒步',
      description: '体能中高，约 3–5 小时，需向导与装备。',
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'WORSEN', '费用中等偏上'),
        dim('TIME', 'WORSEN', '占用大半天'),
        dim('SCENERY', 'IMPROVE', '冰面行走体验'),
      ],
      writebackPayload: { glacierProduct: 'HIKE' },
    },
    {
      optionId: 'glacier_short',
      type: 'ALTERNATIVE',
      title: '短线冰川体验',
      description: '体能中，约 2–3 小时，更轻量。',
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'WORSEN', '费用中等'),
        dim('TIME', 'WORSEN', '占用 2–3 小时'),
        dim('FATIGUE', 'UNCHANGED', '负荷低于长线徒步'),
      ],
      writebackPayload: { glacierProduct: 'SHORT' },
    },
    {
      optionId: 'glacier_ice_cave',
      type: 'ALTERNATIVE',
      title: '冰洞',
      description: '季节性强，约 3–4 小时，视觉体验突出。',
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'WORSEN', '费用中高'),
        dim('CERTAINTY', 'WORSEN', '天气/季节依赖强'),
        dim('SCENERY', 'IMPROVE', '冰洞视觉'),
      ],
      writebackPayload: { glacierProduct: 'ICE_CAVE' },
    },
    {
      optionId: 'glacier_viewpoint',
      type: 'PLAN_B',
      title: '冰川观景',
      description: '不上冰川，30–60 分钟，费用低。',
      requiresConfirmation: false,
      tradeoffs: [
        dim('COST', 'IMPROVE', '费用低'),
        dim('TIME', 'IMPROVE', '占用短'),
        dim('SCENERY', 'UNCHANGED', '仅远观'),
      ],
      writebackPayload: { glacierProduct: 'VIEWPOINT' },
    },
    {
      optionId: 'glacier_skip',
      type: 'DEFER',
      title: '暂不加入',
      description: '保留为推荐，不改当前行程。',
      requiresConfirmation: false,
      tradeoffs: [],
      writebackPayload: { glacierProduct: 'NONE' },
    },
  ];
}

const HIGH_IMPACT_COPY: Record<
  HighImpactExperienceKind,
  { title: string; summary: string; subjectRef: string }
> = {
  whale: {
    title: '是否增加观鲸？选择哪个出发地？',
    summary: '路线靠近观鲸出发区域；需调整半天计划、晕船适配与天气取消弹性。',
    subjectRef: 'experience:whale',
  },
  silfra: {
    title: '是否加入 Silfra 浮潜？',
    summary: '行程经过 Þingvellir；涉及资格、装备、预订与当天停留时间。',
    subjectRef: 'experience:silfra',
  },
  snowmobile: {
    title: '自驾观景，还是升级雪地摩托？',
    summary: '用预算换普通自驾无法获得的可达性与体验。',
    subjectRef: 'experience:snowmobile',
  },
  super_jeep: {
    title: '自驾高地，还是参加 Super Jeep？',
    summary: '普通车辆难以到达核心区域时，跟团可换取可达性。',
    subjectRef: 'experience:super_jeep',
  },
};

export function buildHighImpactExperienceCase(input: {
  tripId: string;
  kind: HighImpactExperienceKind;
  eligibility?: EligibilityResult;
}): StoredDecisionCase {
  const now = new Date().toISOString();
  const copy = HIGH_IMPACT_COPY[input.kind];
  const materiality = buildMaterialityScore({
    ...emptyMaterialityBreakdown(),
    budget: 2,
    time: 2,
    bookingUrgency: 2,
    fitness: input.kind === 'silfra' || input.kind === 'snowmobile' ? 2 : 1,
    safety: 1,
  });

  const options: StoredDecisionCaseOption[] =
    input.kind === 'whale'
      ? [
          {
            optionId: 'whale_reykjavik',
            type: 'ALTERNATIVE',
            title: '雷克雅未克出发',
            description: '半日观鲸，需调整市区当天计划。',
            requiresConfirmation: true,
            tradeoffs: [
              dim('COST', 'WORSEN', '费用中高'),
              dim('TIME', 'WORSEN', '占用半天'),
            ],
            writebackPayload: { experience: 'whale', departure: 'Reykjavik' },
          },
          {
            optionId: 'whale_husavik',
            type: 'ALTERNATIVE',
            title: 'Husavík 出发',
            description: '北岸经典出发地，影响北线住宿与当天路线。',
            requiresConfirmation: true,
            tradeoffs: [
              dim('SCENERY', 'IMPROVE', '经典观鲸港'),
              dim('TIME', 'WORSEN', '占用半天并牵动北线'),
            ],
            writebackPayload: { experience: 'whale', departure: 'Husavik' },
          },
          {
            optionId: 'whale_skip',
            type: 'DEFER',
            title: '暂不加入',
            description: '保留推荐，不进行程。',
            requiresConfirmation: false,
            tradeoffs: [],
            writebackPayload: { experience: 'whale', add: false },
          },
        ]
      : [
          {
            optionId: `exp_${input.kind}_add`,
            type: 'ALTERNATIVE',
            title: '加入体验',
            description: copy.summary,
            requiresConfirmation: true,
            tradeoffs: [
              dim('COST', 'WORSEN', '预算上升'),
              dim('TIME', 'WORSEN', '占用半天左右'),
            ],
            writebackPayload: { experience: input.kind, add: true },
          },
          {
            optionId: `exp_${input.kind}_skip`,
            type: 'DEFER',
            title: '暂不加入',
            description: '保留为推荐。',
            requiresConfirmation: false,
            tradeoffs: [],
            writebackPayload: { experience: input.kind, add: false },
          },
        ];

  if (input.eligibility && !input.eligibility.eligible) {
    for (const opt of options) {
      if (!opt.optionId.endsWith('_skip')) {
        opt.executable = false;
        opt.description = `${opt.description}（不可选：${input.eligibility.reason ?? '资格不足'}）`;
      }
    }
  }

  const decisionCase: StoredDecisionCase = {
    problemId: highImpactExperienceCaseProblemId(input.tripId, input.kind),
    tripId: input.tripId,
    semanticKey: SEMANTIC_HIGH_IMPACT_EXPERIENCE,
    sourceKind: 'OPPORTUNITY',
    requiredness: 'IMPORTANT',
    domain: 'EXPERIENCE',
    scope: 'ACTIVITY',
    actionKind: 'SELECT',
    materiality,
    enrichmentStage: 'ENRICHED',
    published: true,
    writebackTargets: ['ITINERARY', 'BOOKING_INTENT'],
    title: copy.title,
    summary: copy.summary,
    type: 'PREFERENCE_CONFLICT',
    dimension: 'EXPERIENCE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    workflowStatus: 'WAITING_DECISION',
    options,
    evidenceRefs: [
      `subject:${copy.subjectRef}`,
      'gate:eligibility',
      'gate:materiality>=6',
    ],
    createdAt: now,
    updatedAt: now,
  };

  if (input.eligibility) {
    decisionCase.eligibility = toEligibilitySnapshot(input.eligibility);
  }
  return decisionCase;
}
