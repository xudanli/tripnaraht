/**
 * Iceland P0 DecisionCase builders — shells + enrichment options.
 */

import type { TradeoffDimension } from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  INSURANCE_FORDING_EXCLUSION_NOTE,
  type StoredDecisionCase,
  type StoredDecisionCaseOption,
} from '../contracts/decision-case.types';
import {
  buildMaterialityScore,
  emptyMaterialityBreakdown,
} from '../materiality/decision-materiality.util';

export const SEMANTIC_VEHICLE_ROAD_FIT = 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT';
export const SEMANTIC_RENTAL_INSURANCE = 'REQUIRED_CHOICE.RENTAL_INSURANCE';
export const SEMANTIC_FROAD_MISMATCH = 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH';
export const SEMANTIC_EXCESSIVE_DRIVE = 'RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE';
export const SEMANTIC_LANDING_LONG_DRIVE = 'RULE_TRIGGER.LANDING_LONG_DRIVE';
export const SEMANTIC_RING_VS_SOUTH = 'RULE_TRIGGER.RING_VS_SOUTH_SCOPE';
export const SEMANTIC_GLACIER_EXPERIENCE = 'OPPORTUNITY.GLACIER_EXPERIENCE';
export const SEMANTIC_HIGH_IMPACT_EXPERIENCE = 'OPPORTUNITY.HIGH_IMPACT_EXPERIENCE';

export function vehicleCaseProblemId(tripId: string): string {
  return `dc_vehicle_${tripId}`;
}

export function insuranceCaseProblemId(tripId: string): string {
  return `dc_insurance_${tripId}`;
}

export function froadCaseProblemId(tripId: string, roadId = 'F-road'): string {
  const safe = roadId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `dc_froad_${tripId}_${safe}`;
}

function dim(
  dimension: TradeoffDimension['dimension'],
  direction: TradeoffDimension['direction'],
  explanation: string,
): TradeoffDimension {
  return { dimension, direction, explanation };
}

export function buildVehicleShellCase(tripId: string, now = new Date().toISOString()): StoredDecisionCase {
  const materiality = buildMaterialityScore({
    ...emptyMaterialityBreakdown(),
    safety: 3,
    budget: 2,
    irreversibility: 2,
    time: 1,
  });

  return {
    problemId: vehicleCaseProblemId(tripId),
    tripId,
    semanticKey: SEMANTIC_VEHICLE_ROAD_FIT,
    sourceKind: 'REQUIRED_CHOICE',
    requiredness: 'BLOCKING',
    domain: 'TRANSPORT',
    scope: 'TRIP',
    actionKind: 'SELECT',
    materiality,
    enrichmentStage: 'SHELL',
    published: true,
    writebackTargets: ['VEHICLE', 'ROUTE'],
    title: '这趟行程需要什么车型？',
    summary: '车型待确认。路线草案生成后将补充 F-road / 行李 / 高风适应性影响。',
    type: 'PREFERENCE_CONFLICT',
    dimension: 'TRANSPORT',
    enforcement: 'BLOCK',
    workflowStatus: 'ASSESSING',
    options: buildVehicleShellOptions(),
    evidenceRefs: ['trigger:TRIP_CREATED'],
    createdAt: now,
    updatedAt: now,
  };
}

function buildVehicleShellOptions(): StoredDecisionCaseOption[] {
  return [
    {
      optionId: 'vehicle_2wd',
      type: 'ALTERNATIVE',
      title: '两驱小型车',
      description: '环岛主路、南岸常规路线；不进入 F-road。',
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'IMPROVE', '租金与油耗较低'),
        dim('SAFETY', 'WORSEN', '不可进入高地 / F-road'),
        dim('FLEXIBILITY', 'WORSEN', '路线自由度受限'),
      ],
      writebackPayload: { vehicleType: '2WD', fRoadAllowed: false },
    },
    {
      optionId: 'vehicle_4wd_suv',
      type: 'ALTERNATIVE',
      title: '普通四驱 SUV',
      description: '部分碎石路与常规高地边缘；并非所有 F-road 都适合。',
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'WORSEN', '租金中等'),
        dim('SAFETY', 'IMPROVE', '碎石与侧风稳定性更好'),
        dim('FLEXIBILITY', 'IMPROVE', '可进入部分非复杂 F-road'),
      ],
      writebackPayload: { vehicleType: '4WD', fRoadAllowed: 'PARTIAL' },
    },
    {
      optionId: 'vehicle_4wd_large',
      type: 'ALTERNATIVE',
      title: '大型四驱',
      description: '高地路线与复杂路况；油耗与租金较高。',
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'WORSEN', '租金与油耗高'),
        dim('SAFETY', 'IMPROVE', '更适配复杂高地'),
        dim('FLEXIBILITY', 'IMPROVE', '高地可达性最好'),
      ],
      writebackPayload: { vehicleType: '4WD', fRoadCapability: 'LARGE', fRoadAllowed: true },
    },
    {
      optionId: 'vehicle_skip_highlands',
      type: 'PLAN_B',
      title: '放弃自驾高地，改跟团',
      description: '保留主线自驾；高地体验改 Super Jeep / 当地跟团。',
      requiresConfirmation: true,
      tradeoffs: [
        dim('SAFETY', 'IMPROVE', '减少高地自驾风险'),
        dim('COST', 'WORSEN', '跟团费用中高'),
        dim('SCENERY', 'UNCHANGED', '高地体验由向导车完成'),
      ],
      writebackPayload: { vehicleType: '2WD', highlandsMode: 'TOUR_ONLY', fRoadAllowed: false },
    },
  ];
}

export function enrichVehicleCase(
  existing: StoredDecisionCase,
  ctx: { hasFRoad: boolean; gravelShareHint?: string; windExposure?: boolean },
): StoredDecisionCase {
  const now = new Date().toISOString();
  const extras: string[] = [];
  if (ctx.hasFRoad) extras.push('路线草案包含 F-road / 高地段');
  if (ctx.gravelShareHint) extras.push(ctx.gravelShareHint);
  if (ctx.windExposure) extras.push('途经高风暴露区域，车身稳定性影响体验');

  return {
    ...existing,
    enrichmentStage: 'ENRICHED',
    workflowStatus: existing.resolvedOptionId ? existing.workflowStatus : 'WAITING_DECISION',
    summary:
      extras.length > 0
        ? `${extras.join('；')}。请确认车型边界，系统将按车型重新验证路线。`
        : '路线已就绪。请确认车型边界，系统将按车型重新验证路线。',
    evidenceRefs: [
      ...new Set([
        ...existing.evidenceRefs,
        ...(ctx.hasFRoad ? ['route:froad'] : []),
        ...(ctx.windExposure ? ['route:high_wind'] : []),
      ]),
    ],
    updatedAt: now,
  };
}

export function buildInsuranceShellCase(tripId: string, now = new Date().toISOString()): StoredDecisionCase {
  const materiality = buildMaterialityScore({
    ...emptyMaterialityBreakdown(),
    safety: 2,
    budget: 2,
    irreversibility: 2,
    bookingUrgency: 1,
  });

  return {
    problemId: insuranceCaseProblemId(tripId),
    tripId,
    semanticKey: SEMANTIC_RENTAL_INSURANCE,
    sourceKind: 'REQUIRED_CHOICE',
    requiredness: 'BLOCKING',
    domain: 'INSURANCE',
    scope: 'TRIP',
    actionKind: 'SELECT',
    materiality,
    enrichmentStage: 'SHELL',
    published: true,
    writebackTargets: ['INSURANCE'],
    title: '选择哪种租车保险？',
    summary: '保险待确认。路线、季节与车型基本确定后将补充碎石 / 高风 / 高地风险暴露。',
    type: 'PREFERENCE_CONFLICT',
    dimension: 'BOOKING',
    enforcement: 'BLOCK',
    workflowStatus: 'ASSESSING',
    options: buildInsuranceShellOptions(false),
    evidenceRefs: ['trigger:TRIP_CREATED'],
    createdAt: now,
    updatedAt: now,
  };
}

function buildInsuranceShellOptions(enriched: boolean): StoredDecisionCaseOption[] {
  const exposureLine = enriched
    ? '已按当前路线风险暴露生成比较。'
    : '路线未就绪时仅为通用比较。';

  return [
    {
      optionId: 'insurance_basic',
      type: 'ALTERNATIVE',
      title: '基础 CDW',
      description: `${exposureLine}仅碰撞险；碎石 / 涉水 / 底盘多不覆盖。${INSURANCE_FORDING_EXCLUSION_NOTE}`,
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'IMPROVE', '保费最低'),
        dim('SAFETY', 'WORSEN', '碎石与底盘缺口大'),
        dim('FLEXIBILITY', 'WORSEN', '偏远路段风险自负'),
      ],
      writebackPayload: { coverageTier: 'BASIC', fordingExcluded: true },
    },
    {
      optionId: 'insurance_standard',
      type: 'ALTERNATIVE',
      title: '标准套餐（含碎石 GP）',
      description: `${exposureLine}碰撞 + 碎石常见覆盖；${INSURANCE_FORDING_EXCLUSION_NOTE}`,
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'UNCHANGED', '保费中等'),
        dim('SAFETY', 'IMPROVE', '南岸碎石路更稳妥'),
        dim('FLEXIBILITY', 'UNCHANGED', '仍需避开涉水'),
      ],
      writebackPayload: { coverageTier: 'STANDARD', fordingExcluded: true },
    },
    {
      optionId: 'insurance_full',
      type: 'ALTERNATIVE',
      title: '全险 / 低起赔',
      description: `${exposureLine}碰撞、碎石、底盘常见声明覆盖；${INSURANCE_FORDING_EXCLUSION_NOTE}`,
      requiresConfirmation: true,
      tradeoffs: [
        dim('COST', 'WORSEN', '保费最高'),
        dim('SAFETY', 'IMPROVE', '常规损失覆盖最全'),
        dim('FLEXIBILITY', 'UNCHANGED', '仍不可依赖保险过河'),
      ],
      writebackPayload: {
        coverageTier: 'FULL',
        fordingExcluded: true,
        fordingExclusionNote: INSURANCE_FORDING_EXCLUSION_NOTE,
      },
    },
  ];
}

export function enrichInsuranceCase(
  existing: StoredDecisionCase,
  ctx: {
    gravelRisk: boolean;
    highWind: boolean;
    highlands: boolean;
    vehicleConfirmed: boolean;
  },
): StoredDecisionCase {
  if (!ctx.vehicleConfirmed && existing.enrichmentStage === 'SHELL') {
    return existing;
  }

  const bits: string[] = [];
  if (ctx.gravelRisk) bits.push('碎石路暴露');
  if (ctx.highWind) bits.push('高风区域');
  if (ctx.highlands) bits.push('高地 / F-road');
  bits.push(INSURANCE_FORDING_EXCLUSION_NOTE);

  return {
    ...existing,
    enrichmentStage: 'ENRICHED',
    workflowStatus: existing.resolvedOptionId ? existing.workflowStatus : 'WAITING_DECISION',
    summary: `风险暴露：${bits.join('；')}`,
    options: buildInsuranceShellOptions(true),
    evidenceRefs: [
      ...new Set([
        ...existing.evidenceRefs,
        ...(ctx.gravelRisk ? ['route:gravel'] : []),
        ...(ctx.highWind ? ['route:high_wind'] : []),
        ...(ctx.highlands ? ['route:froad'] : []),
        'policy:fording_exclusion',
      ]),
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function buildFroadMismatchCase(input: {
  tripId: string;
  roadId: string;
  vehicleType: string;
  reason: string;
}): StoredDecisionCase {
  const now = new Date().toISOString();
  const materiality = buildMaterialityScore({
    ...emptyMaterialityBreakdown(),
    safety: 3,
    time: 2,
    irreversibility: 2,
    budget: 1,
  });

  return {
    problemId: froadCaseProblemId(input.tripId, input.roadId),
    tripId: input.tripId,
    semanticKey: SEMANTIC_FROAD_MISMATCH,
    sourceKind: 'RULE_TRIGGER',
    requiredness: 'BLOCKING',
    domain: 'ROUTE',
    scope: 'SEGMENT',
    actionKind: 'SELECT',
    materiality,
    enrichmentStage: 'ENRICHED',
    published: true,
    writebackTargets: ['VEHICLE', 'ROUTE', 'ITINERARY'],
    title: '保留高地自驾，还是改为普通道路 / 跟团？',
    summary: `${input.reason}（当前车型 ${input.vehicleType}）。`,
    type: 'RISK',
    dimension: 'TRANSPORT',
    enforcement: 'BLOCK',
    workflowStatus: 'WAITING_DECISION',
    options: [
      {
        optionId: 'froad_upgrade_vehicle',
        type: 'REPAIR',
        title: '升级车辆，保留路线',
        description: '更换更大能力四驱后保留该高地段。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('COST', 'WORSEN', '租金上升'),
          dim('SAFETY', 'IMPROVE', '车路匹配改善'),
        ],
        writebackPayload: { vehicleType: '4WD', fRoadCapability: 'LARGE', keepFRoad: true },
      },
      {
        optionId: 'froad_reroute',
        type: 'ALTERNATIVE',
        title: '更换普通道路',
        description: '去掉不可通行 F-road，改走主路。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('SAFETY', 'IMPROVE', '避开高地门禁'),
          dim('SCENERY', 'WORSEN', '失去高地段体验'),
        ],
        writebackPayload: { keepFRoad: false, routeMode: 'MAIN_ROADS' },
      },
      {
        optionId: 'froad_super_jeep',
        type: 'PLAN_B',
        title: '当天参加 Super Jeep 跟团',
        description: '自驾停在可达点，高地由改装车完成。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('COST', 'WORSEN', '跟团费用'),
          dim('SAFETY', 'IMPROVE', '专业车辆与向导'),
        ],
        writebackPayload: { highlandsMode: 'SUPER_JEEP', keepFRoad: false },
      },
      {
        optionId: 'froad_drop_area',
        type: 'CANCEL',
        title: '删除该区域',
        description: '从行程中移除该高地 / F-road 区段。',
        requiresConfirmation: true,
        tradeoffs: [
          dim('TIME', 'IMPROVE', '减少不确定驾驶'),
          dim('SCENERY', 'WORSEN', '体验损失最大'),
        ],
        writebackPayload: { dropHighlands: true, keepFRoad: false },
      },
    ],
    evidenceRefs: [`road:${input.roadId}`, `vehicle:${input.vehicleType}`, 'sdr:SDR-001'],
    createdAt: now,
    updatedAt: now,
  };
}
