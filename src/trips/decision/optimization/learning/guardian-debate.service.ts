// src/trips/decision/optimization/learning/guardian-debate.service.ts
/**
 * Guardian 辩论服务
 * 
 * Phase 3 核心：实现多智能体内部辩论系统
 * 
 * 流程：
 * 1. 各人格独立评估计划
 * 2. 检测分歧
 * 3. 多轮辩论
 * 4. 协商投票
 * 5. 生成最终决策
 */

import { Injectable, Logger } from '@nestjs/common';
import { RoutePlanDraft, WorldModelContext } from '../../shared/world-model.types';
import { ObjectiveFunctionService } from '../objective-function.service';
import { TdfpmCalculatorService, TdfpmDayContext, TdfpmResult } from '../../services/tdfpm-calculator.service';
import { ObjectiveEvaluationResult, ObjectiveFunctionWeights } from '../objective-function.interface';
import {
  PersonaValues,
  PersonaEvaluation,
  DebateArgument,
  DebateRound,
  VoteResult,
  NegotiationResult,
  NegotiationConfig,
  DEFAULT_NEGOTIATION_CONFIG,
  DRIVING_ESTIMATION_CONFIG,
  DRIVING_SAFETY_CONFIG,
  ROAD_FATIGUE_FACTOR_MAP,
  ABU_VALUES,
  DRE_VALUES,
  NEPTUNE_VALUES,
} from './guardian-persona.interface';
import {
  buildHardConstraintVetoSummary,
  countHardViolations,
  resolveHardConstraintVeto,
} from './guardian-decision-policy.util';

@Injectable()
export class GuardianDebateService {
  private readonly logger = new Logger(GuardianDebateService.name);

  /** 本次协商的 TDFPM 按天结果（negotiate 中填充） */
  private tdfpmPerDay = new Map<number, TdfpmResult>();

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
    private readonly tdfpm: TdfpmCalculatorService,
  ) {}

  /**
   * 执行完整的协商流程
   */
  async negotiate(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    config: NegotiationConfig = DEFAULT_NEGOTIATION_CONFIG
  ): Promise<NegotiationResult> {
    // 参数验证
    if (!plan) {
      throw new Error('协商失败: plan 参数不能为空。请提供有效的 RoutePlanDraft 对象');
    }
    if (!plan.tripId) {
      throw new Error('协商失败: plan.tripId 不能为空。请确保计划对象包含有效的 tripId');
    }
    if (!world) {
      throw new Error('协商失败: world 参数不能为空。请提供有效的 WorldModelContext 对象');
    }
    
    this.logger.log(`[GuardianDebate] 开始多智能体协商: ${plan.tripId}`);

    // 1. 基础评估
    const baseEvaluation = this.objectiveFunction.evaluate(plan, world);

    // 1.5. 预计算 TDFPM 按天疲劳（用于 identifyDayLevelConcerns 与 fatiguePrediction）
    this.tdfpmPerDay = this.computeTdfpmForPlan(plan, world, baseEvaluation);

    // 2. 各人格独立评估
    const evaluations = this.evaluateWithAllPersonas(plan, world, baseEvaluation);

    // 2.5 硬约束 / Abu BLOCK：不可进入投票或多数决
    const hardVeto = resolveHardConstraintVeto(evaluations, baseEvaluation);
    if (hardVeto === 'REJECT') {
      this.logger.warn(
        `[GuardianDebate] 硬约束否决: ${buildHardConstraintVetoSummary(baseEvaluation)}`,
      );
      return this.buildHardConstraintVetoResult(evaluations, baseEvaluation);
    }
    
    // 3. 检测分歧
    const initialConsensus = this.calculateConsensus(evaluations);
    this.logger.debug(`[GuardianDebate] 初始共识度: ${(initialConsensus * 100).toFixed(1)}%`);
    
    // 如果初始共识高，跳过辩论
    if (initialConsensus >= config.consensusThreshold) {
      return this.buildQuickConsensusResult(evaluations, initialConsensus, baseEvaluation);
    }
    
    // 4. 多轮辩论
    const debateRounds = await this.conductDebate(
      plan,
      world,
      evaluations,
      config
    );
    
    // 5. 投票
    const votes = this.conductVoting(
      plan,
      world,
      evaluations,
      debateRounds,
      config
    );
    
    // 6. 汇总结果
    const finalConsensus = this.calculateFinalConsensus(evaluations, debateRounds);
    const decision = this.determineDecision(
      votes,
      finalConsensus,
      config,
      evaluations,
      baseEvaluation,
    );
    
    return this.buildNegotiationResult(
      evaluations,
      debateRounds,
      votes,
      finalConsensus,
      decision,
      config
    );
  }

  /**
   * 各人格独立评估
   */
  private evaluateWithAllPersonas(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    baseEvaluation: ObjectiveEvaluationResult
  ): PersonaEvaluation[] {
    return [
      this.evaluateAsPersona(ABU_VALUES, plan, world, baseEvaluation),
      this.evaluateAsPersona(DRE_VALUES, plan, world, baseEvaluation),
      this.evaluateAsPersona(NEPTUNE_VALUES, plan, world, baseEvaluation),
    ];
  }

  /**
   * 作为特定人格评估
   */
  private evaluateAsPersona(
    values: PersonaValues,
    plan: RoutePlanDraft,
    world: WorldModelContext,
    baseEvaluation: ObjectiveEvaluationResult
  ): PersonaEvaluation {
    // 1. 应用人格权重偏好计算效用
    const adjustedWeights = this.applyWeightBias(values.weightBias);
    const personalUtility = this.calculateWeightedUtility(baseEvaluation, adjustedWeights);
    
    // 2. 识别核心关注点（维度级 + 按天/时段细化）
    const concerns = [
      ...this.identifyPersonaConcerns(values, baseEvaluation),
      ...this.identifyDayLevelConcerns(plan, world, baseEvaluation),
    ];
    
    // 3. 识别正面方面
    const positives = this.identifyPositiveAspects(values, baseEvaluation);
    
    // 4. 生成建议
    const suggestions = this.generatePersonaSuggestions(values, baseEvaluation, world);
    
    // 5. 确定立场（Abu + 硬约束 → STRONG_OPPOSE，不可被投票稀释）
    let stance = this.determineStance(personalUtility, concerns.length);
    if (values.persona === 'ABU' && countHardViolations(baseEvaluation) > 0) {
      stance = 'STRONG_OPPOSE';
    }
    
    // 6. 生成推理过程
    const reasoning = this.generateReasoning(values, baseEvaluation, personalUtility);
    
    return {
      persona: values.persona,
      utility: personalUtility,
      primaryConcerns: concerns,
      positiveAspects: positives,
      suggestedAdjustments: suggestions,
      stance,
      confidence: this.calculateConfidence(baseEvaluation, values),
      reasoning,
    };
  }

  /**
   * 应用权重偏好
   */
  private applyWeightBias(bias: Partial<ObjectiveFunctionWeights>): ObjectiveFunctionWeights {
    const baseWeights = this.objectiveFunction.weights;
    const adjusted = { ...baseWeights };
    
    for (const [key, delta] of Object.entries(bias)) {
      if (key in adjusted) {
        (adjusted as any)[key] = Math.max(0, (adjusted as any)[key] + (delta as number));
      }
    }
    
    // 归一化
    const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(adjusted)) {
      (adjusted as any)[key] /= sum;
    }
    
    return adjusted;
  }

  /**
   * 计算加权效用
   */
  private calculateWeightedUtility(
    evaluation: ObjectiveEvaluationResult,
    weights: ObjectiveFunctionWeights
  ): number {
    const breakdown = evaluation.breakdown;
    
    const positive = 
      weights.safety * breakdown.safetyScore +
      weights.experienceDensity * breakdown.experienceScore +
      weights.philosophyAlignment * breakdown.philosophyScore +
      weights.timeSlack * breakdown.timeSlackScore;
    
    const negative = 
      weights.fatigueRisk * breakdown.fatigueRiskPenalty +
      weights.weatherRisk * breakdown.weatherRiskPenalty +
      weights.budgetOverrun * breakdown.budgetOverrunPenalty +
      weights.pacingVariance * breakdown.pacingVariancePenalty;
    
    return Math.max(0, Math.min(1, positive - negative));
  }

  /**
   * 识别人格关注点（维度级：安全/疲劳/天气/节奏等）
   * 按天/时段细化见 identifyDayLevelConcerns。
   */
  private identifyPersonaConcerns(
    values: PersonaValues,
    evaluation: ObjectiveEvaluationResult
  ): string[] {
    const concerns: string[] = [];
    const breakdown = evaluation.breakdown;
    const constraints = evaluation.constraints || { hardViolations: [], softViolations: [] };
    
    // Abu 关注点
    if (values.persona === 'ABU') {
      if (breakdown.safetyScore < 0.6) {
        concerns.push(`安全性评分较低 (${(breakdown.safetyScore * 100).toFixed(0)}%)`);
      }
      if (breakdown.weatherRiskPenalty > 0.2) {
        concerns.push('存在显著天气风险');
      }
      if ((constraints.hardViolations || []).length > 0) {
        concerns.push(`存在 ${constraints.hardViolations.length} 个硬约束违反`);
      }
    }
    
    // Dre 关注点
    if (values.persona === 'DRE') {
      if (breakdown.fatigueRiskPenalty > 0.2) {
        concerns.push(`疲劳风险偏高 (${(breakdown.fatigueRiskPenalty * 100).toFixed(0)}%)`);
      }
      if (breakdown.pacingVariancePenalty > 0.15) {
        concerns.push('节奏不均衡，存在明显波动');
      }
      if (breakdown.timeSlackScore < 0.5) {
        concerns.push('时间余量不足');
      }
    }
    
    // Neptune 关注点
    if (values.persona === 'NEPTUNE') {
      if (breakdown.philosophyScore < 0.7) {
        concerns.push(`路线哲学匹配度不足 (${(breakdown.philosophyScore * 100).toFixed(0)}%)`);
      }
      if (breakdown.experienceScore < 0.6) {
        concerns.push('体验密度偏低');
      }
    }
    
    return concerns;
  }

  /**
   * 计算个人有效安全驾驶时长（h）
   * DrivingCapacity = Base × SleepFactor × RoadFactor × BreakFactor × StressFactor × AgeFactor
   * 缺少的因子使用 1.0
   */
  private getEffectiveSafeHours(world: WorldModelContext): number {
    const base = DRIVING_SAFETY_CONFIG.baseSafeHours;
    const human = world?.human as {
      age?: number;
      ageGroup?: string;
      metadata?: { drivingFatigueFactors?: { sleepFactor?: number; breakFactor?: number; stressFactor?: number } };
    } | undefined;

    const sleepFactor = human?.metadata?.drivingFatigueFactors?.sleepFactor ?? 1.0;
    const breakFactor = human?.metadata?.drivingFatigueFactors?.breakFactor ?? 1.0;
    const stressFactor = human?.metadata?.drivingFatigueFactors?.stressFactor ?? 1.0;

    const age = human?.age ?? (human?.ageGroup === '60+' ? 65 : human?.ageGroup === '50-59' ? 55 : human?.ageGroup === '40-49' ? 45 : 35);
    const ageFactor = age <= 40 ? 1.0 : age <= 55 ? 0.9 : 0.75;

    const meta = (world?.routeDirection as { metadata?: Record<string, unknown> })?.metadata;
    const roadType =
      (meta?.route_basic_info as { road_type?: string })?.road_type ??
      (meta as { roadType?: string })?.roadType ??
      '';
    const lower = String(roadType).toLowerCase();
    let roadFactor = 1.0;
    for (const [keyword, factor] of Object.entries(ROAD_FATIGUE_FACTOR_MAP)) {
      if (lower.includes(keyword)) {
        roadFactor = factor;
        break;
      }
    }

    return base * sleepFactor * roadFactor * breakFactor * stressFactor * ageFactor;
  }

  /**
   * 根据路线元数据推断平均车速，无法推断时使用配置默认值
   */
  private getDrivingSpeedKmH(world: WorldModelContext): number {
    const meta = (world?.routeDirection as { metadata?: Record<string, unknown> })?.metadata;
    if (!meta) return DRIVING_ESTIMATION_CONFIG.defaultSpeedKmH;

    const roadType =
      (meta.route_basic_info as { road_type?: string })?.road_type ??
      (meta as { roadType?: string }).roadType ??
      '';
    const lower = String(roadType).toLowerCase();

    for (const [keyword, speed] of Object.entries(DRIVING_ESTIMATION_CONFIG.roadTypeSpeedMap)) {
      if (lower.includes(keyword)) return speed;
    }
    return DRIVING_ESTIMATION_CONFIG.defaultSpeedKmH;
  }

  /**
   * 按天计算 TDFPM 疲劳分数（用于 fatiguePrediction 与 identifyDayLevelConcerns）
   */
  private computeTdfpmForPlan(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    baseEvaluation: ObjectiveEvaluationResult
  ): Map<number, TdfpmResult> {
    const map = new Map<number, TdfpmResult>();
    const segments = Array.isArray(plan?.segments) ? plan.segments : [];
    if (segments.length === 0) return map;

    const speedKmH = this.getDrivingSpeedKmH(world);
    const meta = (world?.routeDirection as { metadata?: Record<string, unknown> })?.metadata;
    const roadType =
      (meta?.route_basic_info as { road_type?: string })?.road_type ??
      (meta as { roadType?: string })?.roadType ??
      '';
    const human = world?.human as { metadata?: { drivingFatigueFactors?: { sleepFactor?: number; stressFactor?: number } } } | undefined;
    const stressFactor = human?.metadata?.drivingFatigueFactors?.stressFactor ?? 1.0;
    const cognitiveLoad = stressFactor > 1.2 ? 10 : stressFactor > 1 ? 8 : 5;
    const weatherPenalty = (baseEvaluation?.breakdown?.weatherRiskPenalty ?? 0) * 15;

    const byDay = new Map<number, { distanceKm: number; ascentM: number }>();
    for (const s of segments) {
      const day = Number(s?.dayIndex) || 1;
      const cur = byDay.get(day) ?? { distanceKm: 0, ascentM: 0 };
      cur.distanceKm += Number(s?.distanceKm) || 0;
      cur.ascentM += Number(s?.ascentM) || 0;
      byDay.set(day, cur);
    }

    const dayOrder = Array.from(byDay.keys()).sort((a, b) => a - b);
    for (const dayIndex of dayOrder) {
      const { distanceKm, ascentM } = byDay.get(dayIndex)!;
      const drivingHours = Math.min(distanceKm / speedKmH, 24);

      const ctx: TdfpmDayContext = {
        drivingHours,
        roadType: roadType || undefined,
        departureHour: 8,
        weatherPenalty,
        altitudeM: ascentM >= 600 ? 1000 : ascentM >= 300 ? 500 : undefined,
        cognitiveLoad,
        breakMinutes: 0,
        hasNap: false,
        sleepHours: 8,
      };
      const result = this.tdfpm.computeFatigueScore(ctx);
      map.set(dayIndex, result);
    }
    return map;
  }

  /** 路线 tag 中易受天气影响的活动类型（用于天气建议文案） */
  private static readonly WEATHER_SENSITIVE_TAGS = new Set([
    '徒步', '观景', '冰川', '摄影', '极光', '船游', '皮划艇', '户外', '登山', '登山徒步',
    'hiking', 'viewpoint', 'glacier', 'photography', 'aurora', 'boat', 'kayaking', 'outdoor',
  ]);

  /**
   * 从 plan 的 segment.metadata.activityNames 提取具体活动名称（优先用于天气建议）
   */
  private getPlanActivityNames(plan: RoutePlanDraft): string[] {
    const segments = plan?.segments ?? [];
    const names = new Set<string>();
    for (const seg of segments) {
      const arr = seg?.metadata?.activityNames;
      if (Array.isArray(arr)) {
        for (const n of arr) {
          const s = String(n).trim();
          if (s) names.add(s);
        }
      }
    }
    return [...names].slice(0, 6); // 最多 6 个，避免过长
  }

  /**
   * 从路线 tags 提取易受天气影响的活动类型（用户可读）
   */
  private getWeatherSensitiveActivityTags(world: WorldModelContext): string[] {
    const tags = world?.routeDirection?.tags;
    if (!Array.isArray(tags) || tags.length === 0) return [];
    const matched = tags
      .filter((t) => t && GuardianDebateService.WEATHER_SENSITIVE_TAGS.has(String(t).trim()));
    return [...new Set(matched.map((t) => String(t).trim()))].slice(0, 4); // 最多 4 个
  }

  /**
   * 按天/时段细化关注点（用户可读，如「Day2 驾驶时间较长…」）。
   * 若 plan 由 tripId 加载且 segments 无 distanceKm/ascentM，则仅可能产出天气相关一条。
   */
  private identifyDayLevelConcerns(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    baseEvaluation: ObjectiveEvaluationResult
  ): string[] {
    const out: string[] = [];
    const segments = Array.isArray(plan?.segments) ? plan.segments : [];
    if (segments.length === 0) return out;

    const speedKmH = this.getDrivingSpeedKmH(world);

    const byDay = new Map<number, { distanceKm: number; ascentM: number }>();
    for (const s of segments) {
      const day = Number(s?.dayIndex) || 1;
      const cur = byDay.get(day) ?? { distanceKm: 0, ascentM: 0 };
      cur.distanceKm += Number(s?.distanceKm) || 0;
      cur.ascentM += Number(s?.ascentM) || 0;
      byDay.set(day, cur);
    }

    const effectiveSafeHours = this.getEffectiveSafeHours(world);
    const tripnaraWarningHours = effectiveSafeHours * DRIVING_SAFETY_CONFIG.warningRatio;
    const dangerZoneHours = effectiveSafeHours * DRIVING_SAFETY_CONFIG.dangerRatio;
    const physicalLimitHours = DRIVING_SAFETY_CONFIG.physicalLimitHours;

    const dayOrder = Array.from(byDay.keys()).sort((a, b) => a - b);
    for (const dayIndex of dayOrder) {
      const { distanceKm, ascentM } = byDay.get(dayIndex)!;
      const dayLabel = dayIndex >= 1 ? `Day${dayIndex}` : `第${dayIndex}天`;
      const rawDrivingH = distanceKm / speedKmH;
      const drivingH = Math.min(rawDrivingH, physicalLimitHours);

      if (rawDrivingH > physicalLimitHours) {
        out.push(`${dayLabel} 路程约${Math.round(distanceKm)}km，单日内无法完成，建议拆分日程`);
      } else if (drivingH >= dangerZoneHours) {
        out.push(
          `${dayLabel} 驾驶进入危险区（约 ${drivingH.toFixed(1)}h，≥${dangerZoneHours.toFixed(1)}h 事故率明显上升），强烈建议拆分`
        );
      } else if (drivingH >= effectiveSafeHours) {
        out.push(
          `${dayLabel} 超过安全驾驶上限（约 ${drivingH.toFixed(1)}h，推荐 ≤${effectiveSafeHours.toFixed(1)}h），疲劳风险显著`
        );
      } else if (drivingH >= tripnaraWarningHours) {
        out.push(
          `${dayLabel} 今日行程偏紧（约 ${drivingH.toFixed(1)}h），建议拆分或预留休息`
        );
      }
      if (ascentM >= 600) {
        const a = ascentM >= 1000 ? `${Math.round(ascentM / 100) / 10}km` : `约 ${Math.round(ascentM)}m`;
        out.push(`${dayLabel} 爬升较多（${a}），注意体能分配`);
      }

      // TDFPM 疲劳提示（fatigueScore >= 60 或 recommendation 建议停止）
      const tdfpm = this.tdfpmPerDay.get(dayIndex);
      const urgentRecs = new Set(['REST_NOW', 'SPLIT_DAY', 'STOP_DRIVING']);
      if (
        tdfpm &&
        (tdfpm.fatigueScore >= 60 ||
          (typeof tdfpm.recommendation === 'string' && urgentRecs.has(tdfpm.recommendation)))
      ) {
        const recLabels: Record<string, string> = {
          REST_NOW: '建议休息',
          SPLIT_DAY: '建议拆分日程',
          STOP_DRIVING: '建议停止驾驶',
        };
        const recText = recLabels[tdfpm.recommendation] ?? String(tdfpm.recommendation);
        out.push(`${dayLabel} TDFPM 疲劳指数 ${tdfpm.fatigueScore}（${tdfpm.riskLevel}），${recText}`);
      }
    }

    if ((baseEvaluation.breakdown?.weatherRiskPenalty ?? 0) > 0.15) {
      const activityNames = this.getPlanActivityNames(plan);
      const tags = this.getWeatherSensitiveActivityTags(world);
      const activityHint =
        activityNames.length > 0
          ? `如 ${activityNames.join('、')} 等`
          : tags.length > 0
            ? `您行程中的${tags.join('、')}等活动`
            : '行程中的户外活动（观景、徒步等）';
      out.push(
        `部分日期天气可能不佳。建议：① 把${activityHint}优先安排到预报较好的日子；② 为易受天气影响的项目预留室内备选。点击「去改行程」可查看每日具体活动并调整`
      );
    }

    return out.slice(0, 5);
  }

  /**
   * 识别正面方面
   */
  private identifyPositiveAspects(
    values: PersonaValues,
    evaluation: ObjectiveEvaluationResult
  ): string[] {
    const positives: string[] = [];
    const breakdown = evaluation.breakdown;
    const constraints = evaluation.constraints || { hardViolations: [], softViolations: [] };
    
    if (values.persona === 'ABU') {
      if (breakdown.safetyScore >= 0.8) {
        positives.push('安全性良好');
      }
      if ((constraints.hardViolations || []).length === 0) {
        positives.push('所有硬约束满足');
      }
    }
    
    if (values.persona === 'DRE') {
      if (breakdown.fatigueRiskPenalty < 0.1) {
        positives.push('疲劳风险可控');
      }
      if (breakdown.timeSlackScore >= 0.7) {
        positives.push('时间安排从容');
      }
    }
    
    if (values.persona === 'NEPTUNE') {
      if (breakdown.philosophyScore >= 0.85) {
        positives.push('充分体现路线哲学');
      }
      if (breakdown.experienceScore >= 0.8) {
        positives.push('体验丰富');
      }
    }
    
    return positives;
  }

  /**
   * 生成人格建议
   */
  /** 软约束 ID → 用户可执行的具体建议 */
  private static readonly SOFT_CONSTRAINT_TO_USER_TIP: Record<string, string> = {
    SC_FATIGUE: '某天行程负荷过重，建议拆分该日行程或增加休息时间',
    SC_ROLLING_ASCENT: '连续几天爬升较多，建议调整行程节奏或插入休息日',
    SC_BUDGET: '预算可能超支，建议削减部分活动或选择更经济的住宿/餐饮',
    SC_WEATHER: '天气可能影响部分活动，建议关注预报并为户外项目预留室内备选',
    SC_PHILOSOPHY: '部分安排偏离路线特色，建议优先保留核心体验项目',
  };

  private generatePersonaSuggestions(
    values: PersonaValues,
    evaluation: ObjectiveEvaluationResult,
    _world: WorldModelContext
  ): string[] {
    const suggestions: string[] = [];
    const constraints = evaluation.constraints || { hardViolations: [], softViolations: [] };
    const softViolations = constraints.softViolations || [];

    if (values.persona === 'ABU') {
      for (const v of softViolations) {
        if (v.violationDegree <= 0.3) continue;
        const tip =
          v.repairSuggestion ||
          v.violationExplanation ||
          GuardianDebateService.SOFT_CONSTRAINT_TO_USER_TIP[v.constraintId] ||
          '建议根据具体提示调整行程';
        if (tip && !suggestions.includes(tip)) {
          suggestions.push(tip);
        }
      }
      if (softViolations.length > 0 && suggestions.length === 0) {
        suggestions.push('行程存在若干风险点，建议点击「去改行程」逐一查看并调整');
      }
    }

    if (values.persona === 'DRE') {
      if (evaluation.breakdown.fatigueRiskPenalty > 0.15) {
        suggestions.push('建议拆分高负荷天或插入休息日');
      }
      if (evaluation.breakdown.pacingVariancePenalty > 0.1) {
        suggestions.push('建议重新平衡各天的负荷');
      }
    }

    if (values.persona === 'NEPTUNE') {
      if (evaluation.breakdown.philosophyScore < 0.8) {
        suggestions.push('建议确保核心体验不被削减');
      }
    }

    return suggestions;
  }

  /**
   * 确定立场
   */
  private determineStance(utility: number, concernCount: number): PersonaEvaluation['stance'] {
    if (utility >= 0.8 && concernCount === 0) return 'STRONG_SUPPORT';
    if (utility >= 0.65 && concernCount <= 1) return 'SUPPORT';
    if (utility >= 0.5 && concernCount <= 2) return 'NEUTRAL';
    if (utility >= 0.35) return 'CONCERN';
    return 'STRONG_OPPOSE';
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    evaluation: ObjectiveEvaluationResult,
    values: PersonaValues
  ): number {
    let confidence = 0.7;
    
    // 数据质量影响
    if (evaluation.metrics['hardViolationCount'] !== undefined) {
      confidence += 0.1;
    }
    
    // 人格相关性
    if (values.persona === 'ABU' && evaluation.isFeasible !== undefined) {
      confidence += 0.1;
    }
    
    return Math.min(0.95, confidence);
  }

  /**
   * 生成推理过程
   */
  private generateReasoning(
    values: PersonaValues,
    evaluation: ObjectiveEvaluationResult,
    personalUtility: number
  ): string {
    const personaName = {
      ABU: '守护者 Abu',
      DRE: '节奏大师 Dre',
      NEPTUNE: '哲学守护者 Neptune',
    }[values.persona];
    
    const stanceWord = personalUtility >= 0.7 ? '支持' 
      : personalUtility >= 0.5 ? '谨慎支持'
      : personalUtility >= 0.35 ? '存有顾虑'
      : '反对';
    
    return `作为${personaName}，从${values.coreObjective}的角度出发，我${stanceWord}这个计划。` +
           `基于我的评估标准，效用为 ${(personalUtility * 100).toFixed(0)}%。`;
  }

  /**
   * 计算共识度
   */
  private calculateConsensus(evaluations: PersonaEvaluation[]): number {
    const stanceScores: number[] = evaluations.map(e => {
      switch (e.stance) {
        case 'STRONG_SUPPORT': return 1;
        case 'SUPPORT': return 0.75;
        case 'NEUTRAL': return 0.5;
        case 'CONCERN': return 0.25;
        case 'STRONG_OPPOSE': return 0;
      }
    });
    
    const mean = stanceScores.reduce((a, b) => a + b, 0) / stanceScores.length;
    const variance = stanceScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / stanceScores.length;
    
    // 共识度 = 1 - 标准差（标准差越小共识越高）
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  /**
   * 快速共识结果
   */
  private buildHardConstraintVetoResult(
    evaluations: PersonaEvaluation[],
    baseEvaluation: ObjectiveEvaluationResult,
  ): NegotiationResult {
    return {
      decision: 'REJECT',
      evaluations,
      debateRounds: [],
      votes: evaluations.map((e) => ({
        persona: e.persona,
        vote:
          e.persona === 'ABU' || e.stance === 'STRONG_OPPOSE'
            ? 'REJECT'
            : e.stance === 'CONCERN'
              ? 'ABSTAIN'
              : 'APPROVE',
        weight: e.persona === 'ABU' ? 2 : 1,
        rationale: e.reasoning,
      })),
      consensusLevel: 0,
      keyTradeoffs: [],
      summary: buildHardConstraintVetoSummary(baseEvaluation),
    };
  }

  private buildQuickConsensusResult(
    evaluations: PersonaEvaluation[],
    consensus: number,
    baseEvaluation: ObjectiveEvaluationResult,
  ): NegotiationResult {
    const hardVeto = resolveHardConstraintVeto(evaluations, baseEvaluation);
    if (hardVeto === 'REJECT') {
      return this.buildHardConstraintVetoResult(evaluations, baseEvaluation);
    }

    const avgUtility = evaluations.reduce((sum, e) => sum + e.utility, 0) / evaluations.length;

    return {
      decision: avgUtility >= 0.6 ? 'APPROVE' : 'CONDITIONAL_APPROVE',
      evaluations,
      debateRounds: [],
      votes: evaluations.map(e => ({
        persona: e.persona,
        vote: e.stance === 'STRONG_OPPOSE' ? 'REJECT' 
          : e.stance === 'CONCERN' ? 'ABSTAIN' 
          : 'APPROVE',
        weight: 1,
        rationale: e.reasoning,
      })),
      consensusLevel: consensus,
      keyTradeoffs: [],
      summary: `三位守护者快速达成共识（共识度 ${(consensus * 100).toFixed(0)}%），无需辩论。`,
    };
  }

  /**
   * 执行辩论
   */
  private async conductDebate(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    evaluations: PersonaEvaluation[],
    config: NegotiationConfig
  ): Promise<DebateRound[]> {
    const rounds: DebateRound[] = [];
    let previousArguments: DebateArgument[] = [];
    
    for (let r = 0; r < config.maxDebateRounds; r++) {
      const roundArguments: DebateArgument[] = [];
      
      // 每个人格发言
      for (const evaluation of evaluations) {
        const argument = this.generateArgument(
          evaluation,
          plan,
          world,
          evaluations.filter(e => e.persona !== evaluation.persona),
          previousArguments
        );
        roundArguments.push(argument);
      }
      
      // 计算本轮后的共识变化
      const consensusBefore = rounds.length > 0 
        ? rounds[rounds.length - 1].consensusShift 
        : this.calculateConsensus(evaluations);
      const consensusAfter = this.estimateConsensusAfterRound(roundArguments, evaluations);
      
      // 识别关键分歧
      const disagreements = this.identifyDisagreements(roundArguments);
      
      rounds.push({
        roundNumber: r + 1,
        arguments: roundArguments,
        consensusShift: consensusAfter - consensusBefore,
        keyDisagreements: disagreements,
      });
      
      previousArguments = [...previousArguments, ...roundArguments];
      
      // 检查是否达成共识
      if (consensusAfter >= config.consensusThreshold) {
        this.logger.debug(`[GuardianDebate] 第 ${r + 1} 轮后达成共识`);
        break;
      }
    }
    
    return rounds;
  }

  /**
   * 生成辩论论点
   */
  private generateArgument(
    evaluation: PersonaEvaluation,
    _plan: RoutePlanDraft,
    _world: WorldModelContext,
    otherEvaluations: PersonaEvaluation[],
    _previousArguments: DebateArgument[]
  ): DebateArgument {
    const type = evaluation.stance === 'STRONG_OPPOSE' || evaluation.stance === 'CONCERN'
      ? 'OPPOSE'
      : evaluation.stance === 'STRONG_SUPPORT' || evaluation.stance === 'SUPPORT'
      ? 'SUPPORT'
      : 'CONDITIONAL';
    
    // 找出与其他人格的分歧
    const opposingPersona = otherEvaluations.find(
      e => (e.stance.includes('OPPOSE') && !evaluation.stance.includes('OPPOSE')) ||
           (e.stance.includes('SUPPORT') && !evaluation.stance.includes('SUPPORT'))
    );
    
    let content: string;
    if (type === 'SUPPORT') {
      content = `支持这个计划。${evaluation.positiveAspects.join('，')}。`;
    } else if (type === 'OPPOSE') {
      content = `对这个计划存有顾虑。${evaluation.primaryConcerns.join('；')}。`;
    } else {
      content = `有条件地支持，但建议${evaluation.suggestedAdjustments.join('；')}。`;
    }
    
    return {
      fromPersona: evaluation.persona,
      type,
      content,
      strength: evaluation.confidence * (evaluation.utility > 0.5 ? 0.8 : 0.6),
      evidence: evaluation.primaryConcerns.length > 0 
        ? evaluation.primaryConcerns 
        : evaluation.positiveAspects,
      targetPersona: opposingPersona?.persona,
    };
  }

  /**
   * 估算辩论后的共识度
   */
  private estimateConsensusAfterRound(
    arguments_: DebateArgument[],
    evaluations: PersonaEvaluation[]
  ): number {
    // 简化：如果论点强度接近，共识提高
    const strengths = arguments_.map(a => a.strength);
    const avgStrength = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const variance = strengths.reduce((sum, s) => sum + Math.pow(s - avgStrength, 2), 0) / strengths.length;
    
    const baseConsensus = this.calculateConsensus(evaluations);
    // 方差小 → 共识提高
    return Math.min(1, baseConsensus + (0.3 - variance) * 0.2);
  }

  /** 人格 → 用户可读维度名（用于 keyTradeoffs 展示） */
  private static readonly PERSONA_TO_DIMENSION: Record<string, string> = {
    ABU: '安全',
    DRE: '节奏',
    NEPTUNE: '修复',
  };

  /**
   * 识别分歧（输出用户可读维度名，供界面展示「分歧所在」）
   */
  private identifyDisagreements(arguments_: DebateArgument[]): string[] {
    const disagreements: string[] = [];
    
    const supportArgs = arguments_.filter(a => a.type === 'SUPPORT');
    const opposeArgs = arguments_.filter(a => a.type === 'OPPOSE');
    
    if (supportArgs.length > 0 && opposeArgs.length > 0) {
      const supportDims = [...new Set(
        supportArgs.map(a => GuardianDebateService.PERSONA_TO_DIMENSION[a.fromPersona] || a.fromPersona)
      )].filter(Boolean);
      const opposeDims = [...new Set(
        opposeArgs.map(a => GuardianDebateService.PERSONA_TO_DIMENSION[a.fromPersona] || a.fromPersona)
      )].filter(Boolean);
      if (supportDims.length > 0 && opposeDims.length > 0) {
        const left = supportDims.join('、');
        const right = opposeDims.join('、');
        disagreements.push(`${left}与${right}存在分歧`);
      }
    }
    
    return disagreements;
  }

  /**
   * 投票
   */
  private conductVoting(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    evaluations: PersonaEvaluation[],
    debateRounds: DebateRound[],
    config: NegotiationConfig
  ): VoteResult[] {
    return evaluations.map(evaluation => {
      // 基于辩论可能调整立场
      let adjustedStance = evaluation.stance;
      
      // 如果辩论中有强有力的反驳，可能改变立场
      for (const round of debateRounds) {
        const counterArgs = round.arguments.filter(
          a => a.targetPersona === evaluation.persona && a.type === 'OPPOSE' && a.strength > 0.7
        );
        if (counterArgs.length > 0 && evaluation.stance === 'SUPPORT') {
          adjustedStance = 'NEUTRAL';
        }
      }
      
      // 计算投票权重
      let weight = 1;
      if (config.votingWeightMode === 'DOMAIN_BASED') {
        // Abu 在安全问题上权重更高
        if (evaluation.persona === 'ABU' && evaluation.primaryConcerns.some(c => c.includes('安全'))) {
          weight = 1.5;
        }
        // Dre 在疲劳问题上权重更高
        if (evaluation.persona === 'DRE' && evaluation.primaryConcerns.some(c => c.includes('疲劳'))) {
          weight = 1.3;
        }
      } else if (config.votingWeightMode === 'CONFIDENCE_BASED') {
        weight = evaluation.confidence;
      }
      
      const vote = adjustedStance === 'STRONG_OPPOSE' ? 'REJECT'
        : adjustedStance === 'CONCERN' ? 'ABSTAIN'
        : 'APPROVE';
      
      return {
        persona: evaluation.persona,
        vote,
        weight,
        rationale: evaluation.reasoning,
        conditions: evaluation.suggestedAdjustments.length > 0 
          ? evaluation.suggestedAdjustments 
          : undefined,
      };
    });
  }

  /**
   * 计算最终共识度
   */
  private calculateFinalConsensus(
    evaluations: PersonaEvaluation[],
    debateRounds: DebateRound[]
  ): number {
    let consensus = this.calculateConsensus(evaluations);
    
    // 辩论可能提高共识
    for (const round of debateRounds) {
      consensus += round.consensusShift;
    }
    
    return Math.max(0, Math.min(1, consensus));
  }

  /**
   * 确定最终决定
   */
  private determineDecision(
    votes: VoteResult[],
    consensus: number,
    config: NegotiationConfig,
    evaluations: PersonaEvaluation[],
    baseEvaluation: ObjectiveEvaluationResult,
  ): NegotiationResult['decision'] {
    const hardVeto = resolveHardConstraintVeto(evaluations, baseEvaluation);
    if (hardVeto === 'REJECT') {
      return 'REJECT';
    }

    const abuReject = votes.find((v) => v.persona === 'ABU' && v.vote === 'REJECT');
    if (abuReject && countHardViolations(baseEvaluation) > 0) {
      return 'REJECT';
    }

    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
    const approveWeight = votes
      .filter(v => v.vote === 'APPROVE')
      .reduce((sum, v) => sum + v.weight, 0);
    const rejectWeight = votes
      .filter(v => v.vote === 'REJECT')
      .reduce((sum, v) => sum + v.weight, 0);
    
    const approveRatio = approveWeight / totalWeight;
    const rejectRatio = rejectWeight / totalWeight;
    
    // 需要一致同意
    if (config.requireUnanimity) {
      if (rejectWeight > 0) return 'REJECT';
      if (approveRatio === 1) return 'APPROVE';
      return 'CONDITIONAL_APPROVE';
    }
    
    // 分歧太大，需要人类判断
    if (consensus < config.humanInterventionThreshold) {
      return 'REQUIRES_HUMAN';
    }
    
    // 多数决
    if (approveRatio > 0.6) {
      const hasConditions = votes.some(v => v.conditions && v.conditions.length > 0);
      return hasConditions && config.allowConditionalApproval 
        ? 'CONDITIONAL_APPROVE' 
        : 'APPROVE';
    }
    
    if (rejectRatio > 0.4) {
      return 'REJECT';
    }
    
    return 'CONDITIONAL_APPROVE';
  }

  /**
   * 构建协商结果
   */
  private buildNegotiationResult(
    evaluations: PersonaEvaluation[],
    debateRounds: DebateRound[],
    votes: VoteResult[],
    consensus: number,
    decision: NegotiationResult['decision'],
    _config: NegotiationConfig
  ): NegotiationResult {
    // 收集所有条件
    const allConditions = votes
      .flatMap(v => v.conditions || [])
      .filter((c, i, arr) => arr.indexOf(c) === i);
    
    // 收集关键权衡
    const tradeoffs = debateRounds
      .flatMap(r => r.keyDisagreements)
      .filter((t, i, arr) => arr.indexOf(t) === i);
    
    // 需要人类判断的问题（仅软约束 NEEDS_HUMAN）
    const humanPoints =
      decision === 'REQUIRES_HUMAN'
        ? this.buildHumanDecisionPointStrings(evaluations, tradeoffs)
        : undefined;
    
    // 生成摘要
    const decisionText = {
      APPROVE: '通过',
      REJECT: '拒绝',
      CONDITIONAL_APPROVE: '有条件通过',
      REQUIRES_HUMAN: '需要人类判断',
    }[decision];
    
    const summary = `经过 ${debateRounds.length} 轮辩论，三位守护者最终${decisionText}。` +
                    `共识度 ${(consensus * 100).toFixed(0)}%。` +
                    (allConditions.length > 0 ? `附带 ${allConditions.length} 个条件。` : '');

    const fatiguePrediction = this.tdfpmPerDay.size > 0
      ? Array.from(this.tdfpmPerDay.entries())
          .sort(([a], [b]) => a - b)
          .map(([dayIndex, r]) => ({
            dayIndex,
            fatigueScore: r.fatigueScore,
            riskLevel: r.riskLevel,
            recommendation: r.recommendation,
            confidence: r.confidence,
          }))
      : undefined;

    return {
      decision,
      evaluations,
      debateRounds,
      votes,
      consensusLevel: consensus,
      keyTradeoffs: tradeoffs,
      conditions: allConditions.length > 0 ? allConditions : undefined,
      humanDecisionPoints: humanPoints,
      fatiguePrediction,
      summary,
    };
  }

  /**
   * 获取协商摘要（用于 UI 展示）
   */
  private buildHumanDecisionPointStrings(
    evaluations: PersonaEvaluation[],
    tradeoffs: string[],
  ): string[] {
    const options: string[] = [];
    for (const evaluation of evaluations) {
      for (const adj of evaluation.suggestedAdjustments ?? []) {
        const t = String(adj).trim();
        if (t) options.push(t);
      }
    }
    for (const tradeoff of tradeoffs) {
      const t = String(tradeoff).trim();
      if (t) options.push(t);
    }
    return [...new Set(options)].slice(0, 8);
  }

  getSummaryForDisplay(result: NegotiationResult): {
    decision: string;
    decisionEmoji: string;
    consensus: string;
    personaSummaries: Array<{ persona: string; stance: string; emoji: string }>;
    conditions: string[];
    needsHumanInput: boolean;
  } {
    const decisionMap = {
      APPROVE: { text: '通过', emoji: '✅' },
      REJECT: { text: '拒绝', emoji: '❌' },
      CONDITIONAL_APPROVE: { text: '有条件通过', emoji: '⚠️' },
      REQUIRES_HUMAN: { text: '需要您的判断', emoji: '🤔' },
    };
    
    const stanceEmojiMap = {
      STRONG_SUPPORT: '💚',
      SUPPORT: '👍',
      NEUTRAL: '😐',
      CONCERN: '😟',
      STRONG_OPPOSE: '🛑',
    };
    
    return {
      decision: decisionMap[result.decision].text,
      decisionEmoji: decisionMap[result.decision].emoji,
      consensus: `${(result.consensusLevel * 100).toFixed(0)}%`,
      personaSummaries: result.evaluations.map(e => ({
        persona: { ABU: '守护者', DRE: '节奏师', NEPTUNE: '哲学家' }[e.persona],
        stance: e.stance,
        emoji: stanceEmojiMap[e.stance],
      })),
      conditions: result.conditions || [],
      needsHumanInput: result.decision === 'REQUIRES_HUMAN',
    };
  }
}
