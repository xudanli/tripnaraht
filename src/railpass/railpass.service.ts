// src/railpass/railpass.service.ts

/**
 * RailPass Service - 主服务
 * 
 * 统一对外接口，整合各个引擎
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  EligibilityResult,
  PassRecommendation,
  ReservationPlanResult,
  TravelDayCalculationResult,
  ComplianceValidationResult,
  RailPassProfile,
  RailSegment,
  ReservationTask,
} from './interfaces/railpass.interface';
import { EligibilityEngineService } from './services/eligibility-engine.service';
import { PassSelectionEngineService } from './services/pass-selection-engine.service';
import { ReservationDecisionEngineService } from './services/reservation-decision-engine.service';
import { ReservationOrchestrationService } from './services/reservation-orchestration.service';
import { TravelDayCalculationEngineService } from './services/travel-day-calculation-engine.service';
import { ComplianceValidatorService } from './services/compliance-validator.service';
import { ExecutabilityCheckService } from './services/executability-check.service';
import { PlanRegenerationService, RegeneratePlanResult } from './services/plan-regeneration.service';
import { RailPassRuleEngineService } from './rules/railpass-rule-engine.service';
import { PassCoverageCheckerService } from './services/pass-coverage-checker.service';
import { ReservationChannelPolicyService } from './services/reservation-channel-policy.service';
import { CoverageCheckResult } from './services/pass-coverage-checker.service';
import { RuleEvaluationResult } from './rules/railpass-rule-engine.service';
import { ExecutabilityCheckOverview, HighRiskAlert } from './interfaces/executability-check.interface';
import { PassProfileWizardDto } from './dto/pass-profile-wizard.dto';
import { CheckExecutabilityDto, RegeneratePlanDto } from './dto/executability-check.dto';

@Injectable()
export class RailPassService {
  private readonly logger = new Logger(RailPassService.name);

  constructor(
    private readonly eligibilityEngine: EligibilityEngineService,
    private readonly passSelectionEngine: PassSelectionEngineService,
    private readonly reservationDecisionEngine: ReservationDecisionEngineService,
    private readonly reservationOrchestrator: ReservationOrchestrationService,
    private readonly travelDayCalculator: TravelDayCalculationEngineService,
    private readonly complianceValidator: ComplianceValidatorService,
    private readonly executabilityCheckService: ExecutabilityCheckService,
    private readonly planRegenerationService: PlanRegenerationService,
    private readonly ruleEngine: RailPassRuleEngineService,
    private readonly coverageChecker: PassCoverageCheckerService,
    private readonly channelPolicyService: ReservationChannelPolicyService,
  ) {}

  /**
   * 合规检查
   */
  async checkEligibility(args: {
    residencyCountry: string;
    travelCountries: string[];
    isCrossResidencyCountry?: boolean;
    departureDate: string;
  }): Promise<EligibilityResult> {
    return this.eligibilityEngine.checkEligibility(args);
  }

  /**
   * 推荐 Pass
   */
  async recommendPass(args: {
    residencyCountry: string;
    travelCountries: string[];
    estimatedRailSegments: number;
    crossCountryCount: number;
    isDailyTravel: boolean;
    stayMode: 'city_hopping' | 'stay_extended';
    budgetSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    tripDurationDays: number;
    tripDateRange: { start: string; end: string };
    passFamily: 'EURAIL' | 'INTERRAIL';
    preferences?: {
      preferFlexibility?: boolean;
      preferMobile?: boolean;
      preferFirstClass?: boolean;
    };
    sampleSegments?: RailSegment[];
  }): Promise<PassRecommendation> {
    return this.passSelectionEngine.recommendPass(args, args.sampleSegments);
  }

  /**
   * 检查单个 segment 的订座需求
   */
  async checkReservation(segment: RailSegment) {
    return this.reservationDecisionEngine.checkReservation(segment);
  }

  /**
   * 规划订座任务
   */
  async planReservations(args: {
    segments: RailSegment[];
    userPreferences?: {
      maxReservationFee?: number;
      preferNoReservation?: boolean;
    };
  }): Promise<ReservationPlanResult> {
    return this.reservationOrchestrator.planReservations(args);
  }

  /**
   * 模拟 Travel Day 消耗
   */
  async simulateTravelDays(args: {
    segments: RailSegment[];
    passProfile: RailPassProfile;
  }): Promise<TravelDayCalculationResult> {
    return this.travelDayCalculator.simulateTravelDays(args);
  }

  /**
   * 验证合规性
   */
  async validateCompliance(args: {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks?: any[];
  }): Promise<ComplianceValidationResult> {
    return this.complianceValidator.validateCompliance(args);
  }

  /**
   * 生成用户友好的解释
   */
  generateUserExplanation(result: ComplianceValidationResult): string {
    return this.complianceValidator.generateUserExplanation(result);
  }

  /**
   * 可执行性检查（总览卡片）
   */
  async checkExecutability(dto: CheckExecutabilityDto): Promise<ExecutabilityCheckOverview> {
    const placeNamesMap = dto.placeNames 
      ? new Map(Object.entries(dto.placeNames).map(([k, v]) => [Number(k), v]))
      : undefined;

    return this.executabilityCheckService.checkExecutability({
      passProfile: dto.passProfile,
      segments: dto.segments,
      reservationTasks: dto.reservationTasks,
      placeNames: placeNamesMap,
    });
  }

  /**
   * 生成高风险提示
   */
  async generateHighRiskAlerts(dto: CheckExecutabilityDto): Promise<HighRiskAlert[]> {
    return this.executabilityCheckService.generateHighRiskAlerts({
      passProfile: dto.passProfile,
      segments: dto.segments,
      reservationTasks: dto.reservationTasks,
    });
  }

  /**
   * 完成 PassProfile 向导
   */
  async completePassProfile(dto: PassProfileWizardDto) {
    // 先检查合规性（Q1）
    const eligibility = await this.eligibilityEngine.checkEligibility({
      residencyCountry: dto.residencyCountry,
      travelCountries: dto.passType === 'ONE_COUNTRY' && dto.oneCountryCode 
        ? [dto.oneCountryCode] 
        : [], // 这里应该从 Trip 获取实际旅行国家
      departureDate: dto.validityStartDate || new Date().toISOString().split('T')[0],
    });

    // 构建 RailPassProfile
    const passProfile: RailPassProfile = {
      residencyCountry: dto.residencyCountry,
      passFamily: eligibility.recommendedPassFamily,
      passType: dto.passType,
      validityType: dto.validityType,
      travelDaysTotal: dto.validityType === 'FLEXI' ? dto.travelDaysTotal : undefined,
      homeCountryOutboundUsed: 0,
      homeCountryInboundUsed: 0,
      class: dto.class || 'SECOND',
      mobileOrPaper: dto.mobileOrPaper || undefined as any, // 允许未知
      validityStartDate: dto.validityStartDate || new Date().toISOString().split('T')[0],
      validityEndDate: dto.validityEndDate || new Date().toISOString().split('T')[0],
    };

    // TODO: 保存到数据库

    return {
      passProfile,
      eligibility,
      missingInfo: this.getMissingInfo(passProfile),
    };
  }

  /**
   * 改方案
   */
  async regeneratePlan(dto: RegeneratePlanDto): Promise<{
    segments: RailSegment[];
    reservationTasks: ReservationTask[];
    changes: Array<{
      segmentId: string;
      changeType: string;
      reason: string;
    }>;
    metrics: any;
    explanation: string;
  }> {
    // TODO: 从 Trip 获取 passProfile、segments、reservationTasks
    // 这里需要实际实现从数据库或传入参数获取这些数据
    
    // 临时：需要前端传入完整数据，或从 Trip 加载
    throw new Error('regeneratePlan 需要 passProfile、segments、reservationTasks 参数。请使用 regeneratePlanWithData 方法');
  }

  /**
   * 改方案（带数据）
   */
  async regeneratePlanWithData(args: {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks: ReservationTask[];
    strategy: 'MORE_STABLE' | 'MORE_ECONOMICAL' | 'MORE_AFFORDABLE' | 'CUSTOM';
    customParams?: {
      avoidMandatoryReservations?: boolean;
      minimizeTravelDays?: boolean;
      maxReservationFee?: number;
    };
  }) {
    return this.planRegenerationService.regeneratePlan(args);
  }

  /**
   * 获取缺失信息
   */
  private getMissingInfo(profile: RailPassProfile): string[] {
    const missing: string[] = [];
    if (!profile.mobileOrPaper) {
      missing.push('载体类型（mobile/paper）');
    }
    if (profile.validityType === 'FLEXI' && !profile.travelDaysTotal) {
      missing.push('Travel Days 总数');
    }
    return missing;
  }

  /**
   * 检查 Pass 覆盖
   */
  async checkCoverage(
    segment: RailSegment,
    passProfile: RailPassProfile
  ): Promise<CoverageCheckResult> {
    return this.coverageChecker.checkCoverage(segment, passProfile);
  }

  /**
   * 获取订座渠道策略
   */
  async getReservationChannels(segments: RailSegment[]) {
    return this.channelPolicyService.generateBookingChecklist(segments);
  }

  /**
   * 评估规则
   */
  async evaluateRules(args: {
    segments: RailSegment[];
    passProfile: RailPassProfile;
    reservationTasks?: ReservationTask[];
    travelDayResult?: {
      totalDaysUsed: number;
      daysByDate: Record<string, any>;
    };
  }): Promise<RuleEvaluationResult> {
    return this.ruleEngine.evaluateRules(args);
  }
}
