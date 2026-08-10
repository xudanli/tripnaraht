/**
 * 方案骨架实例化 + 维度填充（P0 规则评估，非综合分）。
 */

import { createHash, randomUUID } from 'crypto';
import { getDecisionDefinition } from './decision-registry';
import {
  TRAVEL_DECISION_PROBLEM_SCHEMA_ID,
  type DimensionLevel,
  type OptionDimensionResult,
  type OptionFeasibility,
  type TravelDecisionOption,
  type TravelDecisionProblem,
} from './travel-decision.types';

export type DecisionBuildContext = {
  tripId: string;
  /** 行程天数（若可知） */
  dayCount?: number | null;
  /** 是否冬季窗口（粗判） */
  winterLikely?: boolean;
  /** 已选车型提示 */
  vehicleHint?: string | null;
  /** 用户原文（用于推荐理由） */
  message?: string;
};

function dim(
  dimension: OptionDimensionResult['dimension'],
  level: DimensionLevel,
  direction: OptionDimensionResult['direction'],
  explanation: string,
  confidence: OptionDimensionResult['confidence'] = 'MEDIUM',
): OptionDimensionResult {
  return { dimension, level, direction, explanation, confidence };
}

function instantiateOptions(
  decisionKey: string,
  ctx: DecisionBuildContext,
): TravelDecisionOption[] {
  const def = getDecisionDefinition(decisionKey);
  if (!def) return [];

  const days = ctx.dayCount ?? null;
  const winter = ctx.winterLikely === true;
  const vehicle = String(ctx.vehicleHint ?? '').toLowerCase();

  return def.optionSkeleton.map((sk) => {
    let feasibility: OptionFeasibility = 'FEASIBLE';
    const blocking: string[] = [];
    const required: string[] = [];
    const dimensions: OptionDimensionResult[] = [];
    let recommended = false;

    if (decisionKey === 'TRIP_SCOPE') {
      if (sk.optionId === 'SOUTH_COAST') {
        dimensions.push(
          dim('SAFETY', 'HIGH', 'POSITIVE', '主路为主，季节与天气弹性更大'),
          dim('TIME', 'LOW', 'POSITIVE', '日均驾驶压力较低'),
          dim('FATIGUE', 'LOW', 'POSITIVE', '适合含低体能成员'),
          dim('EXPERIENCE', 'HIGH', 'POSITIVE', '南岸高光可做深'),
          dim('COST', 'MEDIUM', 'NEUTRAL', '住宿与油费通常可控'),
        );
        recommended = !days || days <= 10;
      } else if (sk.optionId === 'RING_ROAD') {
        if (days != null && days < 10) {
          feasibility = 'NEEDS_CONFIRMATION';
          required.push('建议至少 10–12 天，或接受大量赶路');
        }
        if (winter) {
          feasibility = days != null && days < 12 ? 'BLOCKED' : 'NEEDS_CONFIRMATION';
          if (feasibility === 'BLOCKED') {
            blocking.push('冬季短日照 + 天数不足，完整环岛稳定性差');
          }
        }
        dimensions.push(
          dim('SAFETY', winter ? 'LOW' : 'MEDIUM', 'NEGATIVE', '北部与东线更依赖天气窗口'),
          dim('TIME', 'VERY_HIGH', 'NEGATIVE', '日均车程显著上升'),
          dim('FATIGUE', 'HIGH', 'NEGATIVE', '连续赶路风险高'),
          dim('EXPERIENCE', 'VERY_HIGH', 'POSITIVE', '覆盖最全'),
          dim('COST', 'HIGH', 'NEGATIVE', '住宿周转与油费更高'),
        );
      } else if (sk.optionId === 'SOUTH_PLUS_SNAEFELLSNES') {
        dimensions.push(
          dim('SAFETY', 'MEDIUM', 'NEUTRAL', '仍以主路为主，斯奈山需看风浪'),
          dim('TIME', 'MEDIUM', 'NEUTRAL', '比纯南岸多 1–2 段车程'),
          dim('FATIGUE', 'MEDIUM', 'NEUTRAL', '折中负荷'),
          dim('EXPERIENCE', 'HIGH', 'POSITIVE', '增加半岛多样性'),
          dim('COST', 'MEDIUM', 'NEUTRAL', '比环岛低、比纯南岸略高'),
        );
        recommended = days != null && days >= 8 && days <= 12;
      }
    } else if (decisionKey === 'VEHICLE_ROAD_FIT') {
      if (sk.optionId === '2WD') {
        if (/f-?road|高地/i.test(ctx.message ?? '')) {
          feasibility = 'FEASIBLE_WITH_CHANGES';
          required.push('需删除或改写仅四驱可达路段');
        }
        dimensions.push(
          dim('SAFETY', winter ? 'LOW' : 'MEDIUM', 'NEGATIVE', '碎石与侧风余量较小'),
          dim('COST', 'LOW', 'POSITIVE', '日租通常最低'),
          dim('FLEXIBILITY', 'LOW', 'NEGATIVE', '路线选择受限'),
          dim('EXPERIENCE', 'MEDIUM', 'NEUTRAL', '主路景点足够'),
        );
      } else if (sk.optionId === '4WD') {
        dimensions.push(
          dim('SAFETY', 'HIGH', 'POSITIVE', '碎石与冬季更稳妥'),
          dim('COST', 'MEDIUM', 'NEGATIVE', '日租高于两驱'),
          dim('FLEXIBILITY', 'HIGH', 'POSITIVE', '保留更多路段选项'),
          dim('EXPERIENCE', 'HIGH', 'POSITIVE', '可覆盖更广候选'),
        );
        recommended = true;
      } else {
        dimensions.push(
          dim('SAFETY', 'VERY_HIGH', 'POSITIVE', '恶劣路况余量最大'),
          dim('COST', 'HIGH', 'NEGATIVE', '预算最高'),
          dim('FLEXIBILITY', 'VERY_HIGH', 'POSITIVE', '高地 / 严苛路段弹性'),
          dim('EXPERIENCE', 'HIGH', 'POSITIVE', '解锁边缘体验'),
        );
      }
    } else if (decisionKey === 'ACCOMMODATION_MOVEMENT') {
      if (sk.optionId === 'HUB_STAY') {
        dimensions.push(
          dim('FATIGUE', 'LOW', 'POSITIVE', '少搬家，早晨启动成本低'),
          dim('TIME', 'MEDIUM', 'NEGATIVE', '可能产生往返车程'),
          dim('COST', 'MEDIUM', 'NEUTRAL', '长住折扣 vs 油费'),
          dim('EXPERIENCE', 'MEDIUM', 'NEUTRAL', '辐射范围内深度游'),
          dim('FLEXIBILITY', 'MEDIUM', 'NEUTRAL', '据点选定后弹性下降'),
        );
        recommended = /少换|不想换/.test(ctx.message ?? '');
      } else if (sk.optionId === 'FOLLOW_ROUTE') {
        dimensions.push(
          dim('FATIGUE', 'MEDIUM', 'NEGATIVE', '频繁 check-in'),
          dim('TIME', 'LOW', 'POSITIVE', '单日驾驶更短'),
          dim('COST', 'MEDIUM', 'NEUTRAL', '多段住宿单价可能更高'),
          dim('EXPERIENCE', 'HIGH', 'POSITIVE', '跟随路线前沿'),
          dim('FLEXIBILITY', 'HIGH', 'POSITIVE', '易随天气改点'),
        );
        recommended = /少开车|开太久|减少驾驶/.test(ctx.message ?? '');
      } else {
        dimensions.push(
          dim('FATIGUE', 'LOW', 'POSITIVE', '仅搬迁一次左右'),
          dim('TIME', 'MEDIUM', 'NEUTRAL', '两段内车程可控'),
          dim('COST', 'MEDIUM', 'NEUTRAL', '折中'),
          dim('EXPERIENCE', 'HIGH', 'POSITIVE', '覆盖两个区域'),
          dim('FLEXIBILITY', 'MEDIUM', 'NEUTRAL', '中等弹性'),
        );
        if (!recommended) recommended = true;
      }
    } else if (decisionKey === 'GLACIER_HIKE') {
      if (sk.optionId === 'JOIN') {
        dimensions.push(
          dim('EXPERIENCE', 'VERY_HIGH', 'POSITIVE', '高光体验'),
          dim('FATIGUE', 'HIGH', 'NEGATIVE', '需良好体能与天气窗口'),
          dim('COST', 'HIGH', 'NEGATIVE', '向导团费用不低'),
          dim('TIME', 'HIGH', 'NEGATIVE', '通常占用半天以上'),
          dim('SAFETY', 'MEDIUM', 'NEUTRAL', '需合规向导与装备'),
        );
      } else if (sk.optionId === 'SKIP') {
        dimensions.push(
          dim('EXPERIENCE', 'MEDIUM', 'NEUTRAL', '仍可看冰河湖与黑沙滩'),
          dim('FATIGUE', 'LOW', 'POSITIVE', '强度低'),
          dim('COST', 'LOW', 'POSITIVE', '无团费'),
          dim('TIME', 'LOW', 'POSITIVE', '日程更松'),
          dim('SAFETY', 'HIGH', 'POSITIVE', '风险面更小'),
        );
        recommended = /体力|累|老人|孩子/.test(ctx.message ?? '');
      } else {
        dimensions.push(
          dim('EXPERIENCE', 'HIGH', 'POSITIVE', '靠近冰川氛围'),
          dim('FATIGUE', 'LOW', 'POSITIVE', '不上冰'),
          dim('COST', 'LOW', 'POSITIVE', '费用低'),
          dim('TIME', 'MEDIUM', 'NEUTRAL', '短停即可'),
          dim('SAFETY', 'HIGH', 'POSITIVE', '风险可控'),
        );
        if (!/体力|累/.test(ctx.message ?? '')) recommended = true;
      }
    } else {
      /** 通用：按骨架顺序给中性维度，首项推荐（非 BLOCK） */
      for (const d of def.dimensionProfile) {
        dimensions.push(dim(d, 'MEDIUM', 'NEUTRAL', `${sk.label_zh}在${d}上的典型影响`, 'LOW'));
      }
      recommended = def.optionSkeleton[0]?.optionId === sk.optionId;
    }

    /** 车型上下文：已标明两驱时，高地向 4WD 推荐加权 */
    if (decisionKey === 'VEHICLE_ROAD_FIT' && /2wd|两驱/.test(vehicle) && sk.optionId === '4WD') {
      recommended = true;
    }

    return {
      optionId: sk.optionId,
      label_zh: sk.label_zh,
      summary_zh: sk.strategy_zh,
      feasibility,
      ...(blocking.length ? { blockingReasons_zh: blocking } : {}),
      ...(required.length ? { requiredChanges_zh: required } : {}),
      dimensions,
      recommended: feasibility === 'BLOCKED' ? false : recommended,
      consequences_zh:
        feasibility === 'BLOCKED'
          ? blocking
          : feasibility === 'FEASIBLE_WITH_CHANGES'
            ? required
            : undefined,
    };
  });
}

function pickRecommendation(
  options: TravelDecisionOption[],
  decisionKey: string,
  ctx: DecisionBuildContext,
): TravelDecisionProblem['recommendation'] {
  const feasible = options.filter((o) => o.feasibility !== 'BLOCKED');
  const preferred =
    feasible.find((o) => o.recommended) ??
    feasible.find((o) => o.feasibility === 'FEASIBLE') ??
    feasible[0];
  if (!preferred) return undefined;

  const def = getDecisionDefinition(decisionKey);
  let reason = `综合安全、时间与体验，更建议「${preferred.label_zh}」。`;
  if (decisionKey === 'TRIP_SCOPE' && preferred.optionId === 'SOUTH_COAST') {
    reason =
      ctx.dayCount != null
        ? `行程约 ${ctx.dayCount} 天时，南岸深度更能保住核心体验并控制驾驶负荷。`
        : '在天数与驾驶负荷不确定时，南岸深度是更稳妥的可执行范围。';
  }
  if (decisionKey === 'VEHICLE_ROAD_FIT' && preferred.optionId === '4WD') {
    reason = '四驱在碎石路与季节余量上更稳妥，且不必上到最高预算档。';
  }
  if (decisionKey === 'ACCOMMODATION_MOVEMENT') {
    reason = `你的表述同时关心住宿稳定与驾驶负荷，「${preferred.label_zh}」更能显式固化优化目标。`;
  }

  return {
    optionId: preferred.optionId,
    reason_zh: reason,
    confidence: preferred.dimensions.some((d) => d.confidence === 'LOW') ? 'MEDIUM' : 'HIGH',
    decisiveDimensions: def?.dimensionProfile.slice(0, 3),
  };
}

export function buildTravelDecisionProblem(
  decisionKey: string,
  ctx: DecisionBuildContext,
): TravelDecisionProblem | null {
  const def = getDecisionDefinition(decisionKey);
  if (!def) return null;

  const options = instantiateOptions(decisionKey, ctx);
  if (!options.length) return null;

  /** 互斥推荐：只留一个 recommended */
  const rec = pickRecommendation(options, decisionKey, ctx);
  for (const o of options) {
    o.recommended = rec ? o.optionId === rec.optionId && o.feasibility !== 'BLOCKED' : false;
  }

  const decisionId = `tdp_${createHash('sha1')
    .update(`${ctx.tripId}|${decisionKey}|${Date.now()}|${randomUUID()}`)
    .digest('hex')
    .slice(0, 16)}`;

  return {
    schema_id: TRAVEL_DECISION_PROBLEM_SCHEMA_ID,
    decisionId,
    tripId: ctx.tripId,
    decisionKey,
    category: def.category,
    state: rec ? 'RECOMMENDED' : 'OPTIONS_READY',
    subject: {
      title_zh: def.title_zh,
      question_zh: def.question_zh,
      reason_zh: def.reason_zh,
    },
    scope: { tripLevel: true },
    options,
    ...(rec ? { recommendation: rec } : {}),
    persistenceTarget: def.persistenceTarget,
    downstreamDraftHint_zh:
      def.persistenceTarget === 'TRIP_PREFERENCE' || def.persistenceTarget === 'ITINERARY_DRAFT'
        ? '选择写入后，如行程与策略不一致，可再生成调整草案（不会静默 Apply）。'
        : undefined,
  };
}

/** 卡片用：维度 → 短文案等级 */
export function dimensionLevelToZh(level: DimensionLevel): string {
  switch (level) {
    case 'VERY_LOW':
      return '很低';
    case 'LOW':
      return '较低';
    case 'MEDIUM':
      return '中等';
    case 'HIGH':
      return '较高';
    case 'VERY_HIGH':
      return '很高';
    default:
      return '中等';
  }
}

export function optionDimensionsForCard(opt: TravelDecisionOption): {
  safety?: string;
  time?: string;
  budget?: string;
  energy?: string;
  experience?: string;
} {
  const out: Record<string, string> = {};
  for (const d of opt.dimensions) {
    const zh = `${dimensionLevelToZh(d.level)} · ${d.explanation}`;
    if (d.dimension === 'SAFETY') out.safety = zh;
    if (d.dimension === 'TIME') out.time = zh;
    if (d.dimension === 'COST') out.budget = zh;
    if (d.dimension === 'FATIGUE') out.energy = zh;
    if (d.dimension === 'EXPERIENCE') out.experience = zh;
  }
  return out;
}
