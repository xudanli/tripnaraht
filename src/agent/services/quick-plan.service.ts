/**
 * 快速规划服务
 * 实现单次澄清 + 预览行程 + 一键确认
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { SmartInferenceService, InferenceResult } from './smart-inference.service';
import { GateCoordinatorService, GateCheckResult } from './gate-coordinator.service';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { TripDraftService } from '../../trips/services/trip-draft.service';
import { CreateTripDraftDto, TravelStyle, IntensityLevel, TransportMode } from '../../trips/dto/trip-draft.dto';
import type { DraftDay } from '../../trips/dto/trip-draft.dto';
import { NarrativeThemeGeneratorService } from '../../trips/narrative-engine/services/narrative-theme-generator.service';
import { NarrativeThemeService } from '../../trips/narrative-engine/services/narrative-theme.service';
import { encodeTravelStoryform, defaultReflectionMode } from '../../trips/narrative-engine/encoders/travel-dna.encoder';
import { inferNarrativeIntakeFromText } from '../../trips/narrative-engine/utils/narrative-intake-inference.util';
import { isNarrativeThemeV1Enabled } from '../../trips/narrative-engine/guards/narrative-feature.guard';
import type {
  NarrativeIntakeInput,
  ThemeCandidate,
  TripNarrativeThemeMetadata,
} from '../../trips/narrative-engine/types/travel-storyform.types';
import {
  buildExperienceUnderstandingFromNl,
  type TravelUnderstandingCard,
} from '../../trips/experience-fulfillment';
import {
  buildExperienceExplanationFromUnderstanding,
} from '../../trips/experience-fulfillment/utils/experience-explanation.util';
import type { ExperienceExplanationCard } from '../../trips/experience-fulfillment/types/experience-explanation.types';
import type { ItineraryPresentationBundle } from '../../trips/experience-fulfillment/types/itinerary-presentation.types';

export interface QuickPlanNarrativeBlock {
  enabled: boolean;
  intake: NarrativeIntakeInput;
  candidates: ThemeCandidate[];
  generationRequestId: string;
  regenerateCount: number;
  expiresAt: string;
}

export interface QuickPlanRequest {
  userInput: string;
  existingRequest?: Partial<TripPlanRequest>;
  /** 可选：显式 narrative intake；缺省则从 userInput 推断 */
  narrativeIntake?: NarrativeIntakeInput;
  /** 设为 true 跳过叙事主题生成 */
  skipNarrative?: boolean;
}

export interface QuickPlanResponse {
  // 系统理解
  understanding: {
    destination: string;
    tripType: string;
    keyInterests: string[];
  };

  // 默认假设（带置信度）
  assumptions: {
    destination: { value: string; confidence: number; source: string };
    days: { value: number; confidence: number; source: string };
    date_range: { value: any; confidence: number; source: string };
    transport: { value: string; confidence: number; source: string };
    style: { value: string; confidence: number; source: string };
    intensity: { value: string; confidence: number; source: string };
  };

  // 风险提示
  risks: {
    type: 'warning' | 'info';
    message: string;
    suggestedAction?: string;
  }[];

  // 预览行程
  preview: {
    days: DraftDay[];
    summary: string;
    totalDistance?: number;
    estimatedCost?: number;
    /** PRD §13.3 日程展示层 */
    itineraryPresentation?: ItineraryPresentationBundle;
  };

  // 修改入口
  modificationOptions: {
    canModify: string[];
    quickActions: {
      label: string;
      action: string;
      param: string;
    }[];
  };

  // 元数据
  metadata: {
    quickPlanId: string;
    overallConfidence: number;
    needsConfirmation: boolean;
    estimatedGenerationTime: number;
  };

  /** 叙事主题候选（NARRATIVE_THEME_V1=true 且未 skip） */
  narrative?: QuickPlanNarrativeBlock;

  /** PRD §9.2 旅行理解卡（体验原子 + 结构化摘要） */
  experienceUnderstanding?: TravelUnderstandingCard;

  /** PRD §13.5 四级确定性用户文案 */
  experienceExplanation?: ExperienceExplanationCard;
}

export interface ConfirmPlanRequest {
  quickPlanId: string;
  confirmations: {
    date_range?: { start_date: string; end_date: string };
    acceptLongDrive?: boolean;
    acceptBudget?: number;
    customModifications?: Record<string, any>;
  };
  /** 选定叙事主题（来自 quickPlan.narrative.candidates） */
  narrative?: {
    themeId: string;
    generationRequestId: string;
  };
  /** 若已创建 Trip，直接持久化主题到 Trip.metadata */
  tripId?: string;
}

export interface ConfirmPlanResponse {
  draft: {
    days: DraftDay[];
    warnings: string[];
  };
  usedAssumptions: any;
  appliedModifications: any;
  /** 已选叙事主题（含 tripId 持久化后的结果） */
  narrativeTheme?: TripNarrativeThemeMetadata;
}

interface CachedQuickPlan {
  response: QuickPlanResponse;
  narrative?: QuickPlanNarrativeBlock;
}

@Injectable()
export class QuickPlanService {
  private readonly logger = new Logger(QuickPlanService.name);
  private readonly quickPlanCache = new Map<string, CachedQuickPlan>();

  constructor(
    private readonly smartInference: SmartInferenceService,
    private readonly gateCoordinator: GateCoordinatorService,
    private readonly tripDraftService: TripDraftService,
    @Optional() private readonly narrativeGenerator?: NarrativeThemeGeneratorService,
    @Optional() private readonly narrativeThemeService?: NarrativeThemeService,
  ) {}

  /**
   * 快速规划：单次澄清 + 预览行程
   */
  async quickPlan(request: QuickPlanRequest): Promise<QuickPlanResponse> {
    const startTime = Date.now();
    const quickPlanId = this.generateQuickPlanId();

    this.logger.log(`开始快速规划: ${request.userInput}`);

    // 1. 智能推断默认值
    const inference = await this.smartInference.inferDefaults(
      request.userInput,
      request.existingRequest,
    );

    // 2. Gate检查（并行执行Rule和Config Gate）
    const tripRequest = this.buildTripRequest(inference);
    const gateResult = await this.gateCoordinator.executeGateCheck(tripRequest);

    // 3. 生成预览行程（实际调用 TripDraftService）
    const preview = await this.generatePreview(inference, gateResult);

    // 4. 构建风险提示
    const risks = this.buildRisks(gateResult, inference);

    // 5. 构建修改选项
    const modificationOptions = this.buildModificationOptions(inference);

    // 6. 构建系统理解
    const understanding = this.buildUnderstanding(request.userInput, inference);

    const experienceUnderstanding = buildExperienceUnderstandingFromNl({
      text: request.userInput,
      partialParams: {
        tripDays: inference.days.value,
        transport: inference.transport.value,
        vehicleType: inference.transport.value === 'car' ? 'UNKNOWN' : undefined,
      },
    });

    const response: QuickPlanResponse = {
      understanding,
      experienceUnderstanding,
      experienceExplanation: buildExperienceExplanationFromUnderstanding(experienceUnderstanding),
      assumptions: {
        destination: {
          value: inference.destination.value,
          confidence: inference.destination.confidence,
          source: inference.destination.source,
        },
        days: {
          value: inference.days.value,
          confidence: inference.days.confidence,
          source: inference.days.source,
        },
        date_range: {
          value: inference.date_range.value,
          confidence: inference.date_range.confidence,
          source: inference.date_range.source,
        },
        transport: {
          value: inference.transport.value,
          confidence: inference.transport.confidence,
          source: inference.transport.source,
        },
        style: {
          value: inference.style.value,
          confidence: inference.style.confidence,
          source: inference.style.source,
        },
        intensity: {
          value: inference.intensity.value,
          confidence: inference.intensity.confidence,
          source: inference.intensity.source,
        },
      },
      risks,
      preview,
      modificationOptions,
      metadata: {
        quickPlanId,
        overallConfidence: inference.overallConfidence,
        needsConfirmation: inference.overallConfidence < 0.8,
        estimatedGenerationTime: Date.now() - startTime,
      },
    };

    const narrative = await this.buildNarrativeBlock(
      request,
      inference.destination.value,
      inference.days.value,
    );
    if (narrative) {
      response.narrative = narrative;
    }

    this.quickPlanCache.set(quickPlanId, { response, narrative });

    this.logger.log(
      `快速规划完成: ${quickPlanId}, 耗时${Date.now() - startTime}ms, 置信度${inference.overallConfidence}`,
    );

    return response;
  }

  /**
   * 确认并生成最终行程
   */
  async confirmPlan(request: ConfirmPlanRequest): Promise<ConfirmPlanResponse> {
    const cached = this.quickPlanCache.get(request.quickPlanId);
    if (!cached) {
      throw new Error('Quick plan not found or expired');
    }

    this.logger.log(`确认快速规划: ${request.quickPlanId}`);

    const cachedResponse = cached.response;
    const finalRequest = this.applyConfirmations(cachedResponse, request.confirmations);

    const draft = await this.tripDraftService.generateDraft(finalRequest);

    let narrativeTheme: TripNarrativeThemeMetadata | undefined;
    if (
      request.narrative &&
      cached.narrative &&
      cached.narrative.generationRequestId === request.narrative.generationRequestId
    ) {
      const candidate = cached.narrative.candidates.find(
        (c) => c.id === request.narrative!.themeId,
      );
      if (candidate && request.tripId && this.narrativeThemeService) {
        narrativeTheme = await this.narrativeThemeService.applyThemeDirect(
          request.tripId,
          candidate,
          cached.narrative.intake,
          {
            generationRequestId: cached.narrative.generationRequestId,
            regenerateCount: cached.narrative.regenerateCount,
          },
        );
      } else if (candidate) {
        narrativeTheme = {
          schemaVersion: 1,
          selectedThemeId: candidate.id,
          title: candidate.title,
          tagline: candidate.tagline,
          arcTemplate: candidate.arcTemplate,
          reflectionMode: defaultReflectionMode(candidate.arcTemplate),
          intakeSnapshot: cached.narrative.intake,
          selectedAt: new Date().toISOString(),
          generationRequestId: cached.narrative.generationRequestId,
          regenerateCount: cached.narrative.regenerateCount,
        };
      }
    }

    this.quickPlanCache.delete(request.quickPlanId);

    return {
      draft: {
        days: draft.draftDays,
        warnings: draft.validationWarnings || [],
      },
      usedAssumptions: cachedResponse.assumptions,
      appliedModifications: request.confirmations,
      narrativeTheme,
    };
  }

  /**
   * 构建叙事主题块（quick-plan 零摩擦 intake）
   */
  private async buildNarrativeBlock(
    request: QuickPlanRequest,
    destination: string,
    tripDays: number,
  ): Promise<QuickPlanNarrativeBlock | undefined> {
    if (
      request.skipNarrative ||
      !isNarrativeThemeV1Enabled() ||
      !this.narrativeGenerator
    ) {
      return undefined;
    }

    const intake =
      request.narrativeIntake ?? inferNarrativeIntakeFromText(request.userInput);
    const storyform = encodeTravelStoryform({
      intake,
      trip: { destination, tripDays },
    });
    const candidates = await this.narrativeGenerator.generate(storyform);
    const generationRequestId = this.generateQuickPlanId();
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    return {
      enabled: true,
      intake,
      candidates,
      generationRequestId,
      regenerateCount: 0,
      expiresAt,
    };
  }

  /**
   * 构建TripPlanRequest
   */
  private buildTripRequest(inference: InferenceResult): TripPlanRequest {
    const dateRange = inference.date_range.value;
    return {
      request_id: 'quick-plan-' + Date.now(),
      origin: '0,0',
      destination: inference.destination.value,
      days: inference.days.value,
      date_range: (dateRange.start_date && dateRange.end_date)
        ? { start_date: dateRange.start_date, end_date: dateRange.end_date } as any
        : undefined,
      mode: 'transit' as any,
    };
  }

  /**
   * 生成预览行程（实际调用 TripDraftService）
   */
  private async generatePreview(
    inference: InferenceResult,
    gateResult: GateCheckResult,
  ): Promise<QuickPlanResponse['preview']> {
    try {
      // 如果有 Critical Blocker，返回空预览
      if (gateResult.hasCriticalBlocker) {
        return {
          days: [],
          summary: '由于安全或可达性问题，无法生成预览行程',
        };
      }

      // 构建 CreateTripDraftDto
      const dto: CreateTripDraftDto = {
        destination: inference.destination.value,
        days: inference.days.value,
        style: this.mapStyle(inference.style.value),
        intensity: this.mapIntensity(inference.intensity.value),
        transport: this.mapTransport(inference.transport.value),
        draftRuntimeMode: 'ALGO', // 使用算法模式快速生成预览
      };

      // 添加日期范围（如果有）
      const dateRange = inference.date_range.value;
      if (dateRange.start_date && dateRange.end_date) {
        dto.startDate = dateRange.start_date;
        dto.endDate = dateRange.end_date;
      }

      // 调用 TripDraftService 生成预览
      const draft = await this.tripDraftService.generateDraft(dto);

      // 构建预览响应
      const totalDistance = this.estimateTotalDistance(draft.draftDays);
      const estimatedCost = this.estimateCost(draft.draftDays, inference.days.value);

      return {
        days: draft.draftDays,
        summary: this.buildSummary(draft.draftDays, inference),
        totalDistance,
        estimatedCost,
        itineraryPresentation: draft.itineraryPresentation,
      };
    } catch (error) {
      this.logger.error(`生成预览失败: ${error}`);
      // 降级：返回简化预览
      return {
        days: [],
        summary: `${inference.days.value}天${inference.destination.value}之旅（预览生成失败，请确认后重新生成）`,
      };
    }
  }

  /**
   * 构建风险提示
   */
  private buildRisks(
    gateResult: GateCheckResult,
    inference: InferenceResult,
  ): QuickPlanResponse['risks'] {
    const risks: QuickPlanResponse['risks'] = [];

    // 添加Gate检查的风险
    for (const result of gateResult.results) {
      if (!result.passed && result.blocker) {
        risks.push({
          type: result.blocker.severity === 'critical' ? 'warning' : 'info',
          message: result.blocker.message,
          suggestedAction: result.blocker.suggestedAction,
        });
      }
    }

    // 添加低置信度风险
    if (inference.overallConfidence < 0.5) {
      risks.push({
        type: 'warning',
        message: '您的需求较为模糊，建议确认以下假设',
        suggestedAction: '请检查并修改默认假设',
      });
    }

    return risks;
  }

  /**
   * 构建修改选项
   */
  private buildModificationOptions(
    inference: InferenceResult,
  ): QuickPlanResponse['modificationOptions'] {
    const canModify: string[] = [];
    const quickActions: QuickPlanResponse['modificationOptions']['quickActions'] = [];

    // 根据置信度决定哪些可以修改
    if (inference.days.confidence < 0.9) {
      canModify.push('days');
      quickActions.push({
        label: '增加1天',
        action: 'increase_days',
        param: '1',
      });
      quickActions.push({
        label: '减少1天',
        action: 'decrease_days',
        param: '1',
      });
    }

    if (inference.transport.confidence < 0.9) {
      canModify.push('transport');
      quickActions.push({
        label: '改为公共交通',
        action: 'change_transport',
        param: 'transit',
      });
    }

    if (inference.style.confidence < 0.9) {
      canModify.push('style');
      quickActions.push({
        label: '更注重美食',
        action: 'change_style',
        param: 'food',
      });
    }

    if (inference.date_range.confidence < 0.5) {
      canModify.push('date_range');
    }

    return {
      canModify,
      quickActions,
    };
  }

  /**
   * 构建系统理解
   */
  private buildUnderstanding(
    userInput: string,
    inference: InferenceResult,
  ): QuickPlanResponse['understanding'] {
    // 简化版：基于推断结果构建理解
    const destinationMap: Record<string, string> = {
      IS: '冰岛',
      JP: '日本',
      CN: '中国',
      FR: '法国',
      IT: '意大利',
      GB: '英国',
    };

    const styleMap: Record<string, string> = {
      nature: '自然风光',
      culture: '文化探索',
      food: '美食体验',
      citywalk: '城市漫步',
      photography: '摄影',
      adventure: '冒险',
    };

    return {
      destination: destinationMap[inference.destination.value] || inference.destination.value,
      tripType: `${inference.days.value}天${styleMap[inference.style.value] || inference.style.value}之旅`,
      keyInterests: this.extractKeyInterests(userInput, inference),
    };
  }

  /**
   * 提取关键兴趣点
   */
  private extractKeyInterests(
    userInput: string,
    inference: InferenceResult,
  ): string[] {
    const interests: string[] = [];

    // 基于风格添加兴趣
    const styleInterests: Record<string, string[]> = {
      nature: ['自然风光', '户外活动'],
      culture: ['历史文化', '博物馆'],
      food: ['当地美食', '特色餐厅'],
      citywalk: ['城市探索', '购物'],
      photography: ['摄影', '景点'],
      adventure: ['冒险', '户外'],
    };

    const styleInterestsList = styleInterests[inference.style.value] || [];
    interests.push(...styleInterestsList);

    // 基于用户输入提取（简化版）
    if (userInput.includes('瀑布')) interests.push('瀑布');
    if (userInput.includes('冰川')) interests.push('冰川');
    if (userInput.includes('温泉')) interests.push('温泉');
    if (userInput.includes('博物馆')) interests.push('博物馆');
    if (userInput.includes('美食')) interests.push('美食');

    return [...new Set(interests)].slice(0, 5); // 最多5个
  }

  /**
   * 应用用户确认
   */
  private applyConfirmations(
    cached: QuickPlanResponse,
    confirmations: ConfirmPlanRequest['confirmations'],
  ): CreateTripDraftDto {
    const dto: CreateTripDraftDto = {
      destination: cached.assumptions.destination.value,
      days: cached.assumptions.days.value,
      style: this.mapStyle(cached.assumptions.style.value),
      intensity: this.mapIntensity(cached.assumptions.intensity.value),
      transport: this.mapTransport(cached.assumptions.transport.value),
      draftRuntimeMode: 'ALGO',
    };

    if (confirmations.date_range) {
      dto.startDate = confirmations.date_range.start_date;
      dto.endDate = confirmations.date_range.end_date;
    } else {
      const dateRange = cached.assumptions.date_range.value;
      if (dateRange.start_date && dateRange.end_date) {
        dto.startDate = dateRange.start_date;
        dto.endDate = dateRange.end_date;
      }
    }

    if (confirmations.customModifications) {
      Object.assign(dto, confirmations.customModifications);
    }

    return dto;
  }

  /**
   * 生成快速规划ID
   */
  private generateQuickPlanId(): string {
    return `qp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 映射风格字符串到枚举
   */
  private mapStyle(style: string): TravelStyle {
    const styleMap: Record<string, TravelStyle> = {
      nature: TravelStyle.NATURE,
      culture: TravelStyle.CULTURE,
      food: TravelStyle.FOOD,
      citywalk: TravelStyle.CITYWALK,
      photography: TravelStyle.PHOTOGRAPHY,
      adventure: TravelStyle.ADVENTURE,
      balanced: TravelStyle.CULTURE, // 默认
    };
    return styleMap[style] || TravelStyle.CULTURE;
  }

  /**
   * 映射强度字符串到枚举
   */
  private mapIntensity(intensity: string): IntensityLevel {
    const intensityMap: Record<string, IntensityLevel> = {
      relaxed: IntensityLevel.RELAXED,
      balanced: IntensityLevel.BALANCED,
      intense: IntensityLevel.INTENSE,
    };
    return intensityMap[intensity] || IntensityLevel.BALANCED;
  }

  /**
   * 映射交通方式字符串到枚举
   */
  private mapTransport(transport: string): TransportMode {
    const transportMap: Record<string, TransportMode> = {
      walk: TransportMode.WALK,
      transit: TransportMode.TRANSIT,
      car: TransportMode.CAR,
    };
    return transportMap[transport] || TransportMode.TRANSIT;
  }

  /**
   * 估算总距离
   */
  private estimateTotalDistance(days: DraftDay[]): number {
    let totalDistance = 0;
    for (const day of days) {
      const slots = day.slots;
      const items: any[] = [
        slots.morning,
        slots.lunch,
        slots.afternoon,
        slots.dinner,
        slots.evening,
      ].filter(Boolean);
      for (const item of items) {
        if (item.evidence?.distance) {
          totalDistance += item.evidence.distance;
        }
      }
    }
    return totalDistance;
  }

  /**
   * 估算费用
   */
  private estimateCost(days: DraftDay[], totalDays: number): number {
    // 简化估算：每天基础费用 + 每个景点费用
    let dailyCost = 50; // 基础费用（住宿+交通）
    let attractionCost = 0;
    for (const day of days) {
      const slots = day.slots;
      const items: any[] = [
        slots.morning,
        slots.lunch,
        slots.afternoon,
        slots.dinner,
        slots.evening,
      ].filter(Boolean);
      attractionCost += items.length * 20; // 每个景点平均20
    }
    return (dailyCost * totalDays) + attractionCost;
  }

  /**
   * 构建行程摘要
   */
  private buildSummary(days: DraftDay[], inference: InferenceResult): string {
    let totalItems = 0;
    for (const day of days) {
      const slots = day.slots;
      const items: any[] = [
        slots.morning,
        slots.lunch,
        slots.afternoon,
        slots.dinner,
        slots.evening,
      ].filter(Boolean);
      totalItems += items.length;
    }
    const destinationMap: Record<string, string> = {
      IS: '冰岛',
      JP: '日本',
      CN: '中国',
      FR: '法国',
      IT: '意大利',
      GB: '英国',
    };
    const destName = destinationMap[inference.destination.value] || inference.destination.value;
    return `${inference.days.value}天${destName}之旅，共${totalItems}个景点`;
  }

  /**
   * 清理过期缓存
   */
  clearExpiredCache(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [id] of this.quickPlanCache.entries()) {
      const timestamp = parseInt(id.split('_')[1], 10);
      if (now - timestamp > maxAge) {
        this.quickPlanCache.delete(id);
      }
    }
  }
}
