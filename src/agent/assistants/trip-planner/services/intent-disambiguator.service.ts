// src/agent/assistants/trip-planner/services/intent-disambiguator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  TripPlannerIntent,
  TripPlannerState,
} from '../interfaces/trip-planner.interface';
import {
  IntentUncertainty,
  ResolvedAction,
  DisambiguationResult,
  ClarificationRequest,
  ClarificationOption,
  ItineraryGap,
  QUERY_KEYWORDS,
  ADD_KEYWORDS,
} from '../interfaces/intent-uncertainty.interface';
import { ContextAnalyzerService } from './context-analyzer.service';

/**
 * 意图消歧服务
 * 
 * 职责：
 * 1. 分析用户意图的不确定性
 * 2. 结合行程上下文解析真实意图
 * 3. 生成澄清问题（当意图不明确时）
 * 4. 主动发现并提示相关缺口
 */
@Injectable()
export class IntentDisambiguatorService {
  private readonly logger = new Logger(IntentDisambiguatorService.name);

  constructor(
    private readonly contextAnalyzer: ContextAnalyzerService,
  ) {}

  /**
   * 解析意图不确定性 - 主入口
   */
  async disambiguate(
    message: string,
    intent: TripPlannerIntent,
    state: TripPlannerState,
  ): Promise<DisambiguationResult> {
    this.logger.debug(`[意图消歧] 分析: "${message.substring(0, 50)}...", intent=${intent}`);

    const diagnostics: DisambiguationResult['diagnostics'] = {
      detectedKeywords: [],
      explicitAction: null,
      relatedGaps: [],
      analysisPath: [],
    };

    // 1. 检测行程缺口
    const gaps = this.contextAnalyzer.detectGaps(state.tripContext);
    diagnostics.relatedGaps = gaps;
    diagnostics.analysisPath.push(`检测到 ${gaps.length} 个缺口`);

    // 2. 检测消息中的明确动作指令
    const explicitAction = this.detectExplicitAction(message);
    diagnostics.explicitAction = explicitAction;
    diagnostics.analysisPath.push(`明确动作: ${explicitAction || '无'}`);

    // 3. 分析请求与缺口的关联
    const gapAnalysis = this.contextAnalyzer.analyzeRequestGapRelation(message, intent, gaps);
    diagnostics.analysisPath.push(`缺口关联: ${gapAnalysis.related ? '是' : '否'}`);

    // 4. 根据分析结果决定处理方式
    const result = this.resolveUncertainty(
      message,
      intent,
      state,
      gaps,
      gapAnalysis,
      explicitAction,
    );

    result.diagnostics = diagnostics;
    result.originalIntent = intent;

    this.logger.debug(`[意图消歧] 结果: uncertainty=${result.uncertainty}, confidence=${result.confidence}`);

    return result;
  }

  /**
   * 检测消息中的明确动作指令
   */
  private detectExplicitAction(message: string): 'QUERY' | 'ADD' | null {
    // 检测添加关键词（优先级更高）
    if (ADD_KEYWORDS.some(k => message.includes(k))) {
      return 'ADD';
    }

    // 检测查询关键词
    if (QUERY_KEYWORDS.some(k => message.includes(k))) {
      return 'QUERY';
    }

    return null;
  }

  /**
   * 解决不确定性
   */
  private resolveUncertainty(
    message: string,
    intent: TripPlannerIntent,
    state: TripPlannerState,
    gaps: ItineraryGap[],
    gapAnalysis: ReturnType<ContextAnalyzerService['analyzeRequestGapRelation']>,
    explicitAction: 'QUERY' | 'ADD' | null,
  ): DisambiguationResult {
    
    // 🆕 Case 0: 明确的操作类意图 - 直接执行，不需要澄清
    const clearIntents: TripPlannerIntent[] = [
      'OPTIMIZE_ROUTE',      // 优化路线
      'ADJUST_PACE',         // 调整节奏
      'REBALANCE_DAYS',      // 重新平衡
      'REPLACE_POI',         // 替换景点
      'CHECK_FEASIBILITY',   // 检查可行性
      'CREATE_CHECKLIST',    // 创建清单
      'EXPORT_ITINERARY',    // 导出行程
      'SHARE_TRIP',          // 分享行程
      'SHOW_OVERVIEW',       // 显示概览
      'UNDO_CHANGE',         // 撤销
      'PLAN_TRANSPORT',      // 规划交通
      'COMPARE_OPTIONS',     // 对比选项
    ];

    if (clearIntents.includes(intent)) {
      this.logger.debug(`[意图消歧] 明确意图，直接执行: ${intent}`);
      return {
        uncertainty: IntentUncertainty.CLEAR,
        confidence: 0.95,
        originalIntent: intent,
        resolvedIntent: { action: 'EXECUTE', intent },
      };
    }
    
    // Case 1: 有明确的"添加"指令
    if (explicitAction === 'ADD') {
      return this.handleExplicitAdd(message, state, gaps, gapAnalysis);
    }

    // Case 2: 有明确的"查询"指令
    if (explicitAction === 'QUERY') {
      // 即使是查询，也检查是否有相关缺口可以提示
      if (gapAnalysis.related && gapAnalysis.bestMatch) {
        return this.handleQueryWithGapDiscovery(message, intent, gapAnalysis);
      }

      return {
        uncertainty: IntentUncertainty.CLEAR,
        confidence: 0.95,
        originalIntent: intent,
        resolvedIntent: { action: 'QUERY' },
      };
    }

    // Case 3: ASK_QUESTION / GET_SUGGESTION 意图 - 视为查询
    if (intent === 'ASK_QUESTION' || intent === 'GET_SUGGESTION') {
      if (gapAnalysis.related && gapAnalysis.bestMatch) {
        return this.handleQueryWithGapDiscovery(message, intent, gapAnalysis);
      }
      return {
        uncertainty: IntentUncertainty.CLEAR,
        confidence: 0.85,
        originalIntent: intent,
        resolvedIntent: { action: 'QUERY' },
      };
    }

    // Case 4: 没有明确指令，但发现 CRITICAL 级别的相关缺口
    if (gapAnalysis.related && gapAnalysis.bestMatch?.severity === 'CRITICAL') {
      return this.handleCriticalGapDiscovery(message, intent, gapAnalysis);
    }

    // Case 5: 没有明确指令，但发现 SUGGESTED 级别的相关缺口
    if (gapAnalysis.related && gapAnalysis.bestMatch) {
      return this.handleSuggestedGapDiscovery(message, intent, gapAnalysis);
    }

    // Case 6: ADD_ACTIVITY / ARRANGE_MEALS / FILL_FREE_TIME - 需要澄清
    if (['ADD_ACTIVITY', 'ARRANGE_MEALS', 'FILL_FREE_TIME', 'ADD_HOTEL'].includes(intent)) {
      return this.handleAmbiguousAction(message, intent, state);
    }

    // Case 7: GENERAL_CHAT 或其他 - 不需要澄清
    return {
      uncertainty: IntentUncertainty.CLEAR,
      confidence: 0.7,
      originalIntent: intent,
      resolvedIntent: { action: 'EXECUTE', intent },
    };
  }

  /**
   * 处理明确的添加指令
   */
  private handleExplicitAdd(
    message: string,
    state: TripPlannerState,
    gaps: ItineraryGap[],
    gapAnalysis: ReturnType<ContextAnalyzerService['analyzeRequestGapRelation']>,
  ): DisambiguationResult {
    
    // 如果有匹配的缺口，自动填入目标
    if (gapAnalysis.related && gapAnalysis.bestMatch) {
      const gap = gapAnalysis.bestMatch;
      return {
        uncertainty: IntentUncertainty.CLEAR,
        confidence: 0.9,
        originalIntent: 'ADD_ACTIVITY',
        resolvedIntent: {
          action: 'ADD_TO_ITINERARY',
          target: {
            dayNumber: gap.dayNumber,
            timeSlot: gap.timeSlot,
          },
        },
        contextDiscovery: {
          foundGap: true,
          gap,
          confidence: gapAnalysis.confidence,
          suggestion: `将添加到${this.contextAnalyzer.formatGapDescription(gap)}`,
          shouldPrompt: false,
        },
      };
    }

    // 没有匹配的缺口，但用户想添加 → 需要指定目标
    return {
      uncertainty: IntentUncertainty.AMBIGUOUS_TARGET,
      confidence: 0.7,
      originalIntent: 'ADD_ACTIVITY',
      clarificationNeeded: this.generateTargetClarification(message, state, gaps),
    };
  }

  /**
   * 处理查询但发现缺口的情况（温和提示）
   */
  private handleQueryWithGapDiscovery(
    message: string,
    intent: TripPlannerIntent,
    gapAnalysis: ReturnType<ContextAnalyzerService['analyzeRequestGapRelation']>,
  ): DisambiguationResult {
    const gap = gapAnalysis.bestMatch!;

    return {
      uncertainty: IntentUncertainty.CLEAR,
      confidence: 0.85,
      originalIntent: intent,
      resolvedIntent: { action: 'QUERY' },
      // 附带发现信息，但不强制澄清
      contextDiscovery: {
        foundGap: true,
        gap,
        confidence: gapAnalysis.confidence,
        suggestion: `我注意到${this.contextAnalyzer.formatGapDescription(gap)}`,
        shouldPrompt: gap.severity === 'CRITICAL', // 只有 CRITICAL 才主动提示
      },
    };
  }

  /**
   * 处理发现 CRITICAL 缺口的情况（主动提示）
   */
  private handleCriticalGapDiscovery(
    message: string,
    intent: TripPlannerIntent,
    gapAnalysis: ReturnType<ContextAnalyzerService['analyzeRequestGapRelation']>,
  ): DisambiguationResult {
    const gap = gapAnalysis.bestMatch!;
    const gapDesc = this.contextAnalyzer.formatGapDescription(gap);

    return {
      uncertainty: IntentUncertainty.AMBIGUOUS_NEED,
      confidence: 0.8,
      originalIntent: intent,
      contextDiscovery: {
        foundGap: true,
        gap,
        confidence: gapAnalysis.confidence,
        suggestion: `我注意到${gapDesc}`,
        shouldPrompt: true,
      },
      clarificationNeeded: {
        question: `我注意到${gapDesc}，是想让我帮您安排吗？`,
        context: this.getGapContextExplanation(gap),
        options: [
          {
            id: 'add_to_gap',
            label: `是的，帮我安排${this.getGapActionLabel(gap)}`,
            action: 'ADD_TO_ITINERARY',
            params: {
              dayNumber: gap.dayNumber,
              timeSlot: gap.timeSlot,
              gapId: gap.id,
            },
            style: 'primary',
          },
          {
            id: 'just_query',
            label: '不用，我只是想了解一下',
            action: 'QUERY',
            style: 'secondary',
          },
        ],
        allowFreeText: true,
      },
    };
  }

  /**
   * 处理发现 SUGGESTED 缺口的情况（轻量提示）
   */
  private handleSuggestedGapDiscovery(
    message: string,
    intent: TripPlannerIntent,
    gapAnalysis: ReturnType<ContextAnalyzerService['analyzeRequestGapRelation']>,
  ): DisambiguationResult {
    const gap = gapAnalysis.bestMatch!;
    const gapDesc = this.contextAnalyzer.formatGapDescription(gap);

    return {
      uncertainty: IntentUncertainty.AMBIGUOUS_ACTION,
      confidence: 0.7,
      originalIntent: intent,
      contextDiscovery: {
        foundGap: true,
        gap,
        confidence: gapAnalysis.confidence,
        suggestion: `顺便提一下，${gapDesc}`,
        shouldPrompt: false, // 不强制提示，但在响应中附带
      },
      clarificationNeeded: {
        question: `您是想了解相关信息，还是想把它加到行程里呢？`,
        options: [
          {
            id: 'just_query',
            label: '只是了解一下',
            action: 'QUERY',
            style: 'secondary',
          },
          {
            id: 'add_to_itinerary',
            label: '帮我加到行程里',
            description: gap ? `添加到第${gap.dayNumber}天` : undefined,
            action: 'ADD_TO_ITINERARY',
            params: gap ? {
              dayNumber: gap.dayNumber,
              timeSlot: gap.timeSlot,
              gapId: gap.id,
            } : undefined,
            style: 'primary',
          },
        ],
        allowFreeText: true,
      },
    };
  }

  /**
   * 处理动作不明确的情况
   */
  private handleAmbiguousAction(
    message: string,
    intent: TripPlannerIntent,
    _state: TripPlannerState,
  ): DisambiguationResult {
    return {
      uncertainty: IntentUncertainty.AMBIGUOUS_ACTION,
      confidence: 0.6,
      originalIntent: intent,
      // 默认先当作查询，但提供选项
      resolvedIntent: { action: 'QUERY' },
      clarificationNeeded: {
        question: '您是想了解相关信息，还是想把它加到行程里呢？',
        options: [
          {
            id: 'just_query',
            label: '只是了解一下',
            action: 'QUERY',
            style: 'secondary',
          },
          {
            id: 'add_to_itinerary',
            label: '帮我加到行程里',
            action: 'ADD_TO_ITINERARY',
            style: 'primary',
          },
        ],
        allowFreeText: true,
      },
    };
  }

  /**
   * 生成目标位置澄清
   */
  private generateTargetClarification(
    message: string,
    state: TripPlannerState,
    gaps: ItineraryGap[],
  ): ClarificationRequest {
    const options: ClarificationOption[] = [];

    // 从缺口生成选项
    const relevantGaps = gaps.slice(0, 3); // 最多3个选项
    for (const gap of relevantGaps) {
      options.push({
        id: `gap_${gap.id}`,
        label: `第${gap.dayNumber}天${gap.timeSlot.start}`,
        description: this.contextAnalyzer.formatGapDescription(gap),
        action: 'ADD_TO_ITINERARY',
        params: {
          dayNumber: gap.dayNumber,
          timeSlot: gap.timeSlot,
          gapId: gap.id,
        },
      });
    }

    // 添加"让我选择"选项
    options.push({
      id: 'manual',
      label: '让我自己指定时间',
      action: 'ADD_TO_ITINERARY',
      style: 'secondary',
    });

    return {
      question: '您想把它加到哪个时间段？',
      options,
      allowFreeText: true,
    };
  }

  /**
   * 获取缺口上下文解释
   */
  private getGapContextExplanation(gap: ItineraryGap): string {
    const parts: string[] = [];

    if (gap.context.dayTheme) {
      parts.push(`第${gap.dayNumber}天的主题是"${gap.context.dayTheme}"`);
    }

    if (gap.context.beforeActivity) {
      parts.push(`之前的活动是${gap.context.beforeActivity.name}`);
    }

    if (gap.context.afterActivity) {
      parts.push(`之后要去${gap.context.afterActivity.name}`);
    }

    return parts.length > 0 ? parts.join('，') : '';
  }

  /**
   * 获取缺口动作标签
   */
  private getGapActionLabel(gap: ItineraryGap): string {
    switch (gap.type) {
      case 'MEAL':
        return '用餐';
      case 'HOTEL':
        return '住宿';
      case 'TRANSPORT':
        return '交通';
      case 'ACTIVITY':
      case 'FREE_TIME':
        return '活动';
      default:
        return '';
    }
  }

  // ==================== 用户响应处理 ====================

  /**
   * 处理用户对澄清问题的响应
   */
  handleClarificationResponse(
    userResponse: string,
    clarificationRequest: ClarificationRequest,
    state: TripPlannerState,
  ): DisambiguationResult {
    // 1. 检查是否选择了预设选项
    const selectedOption = this.matchSelectedOption(userResponse, clarificationRequest.options);

    if (selectedOption) {
      return {
        uncertainty: IntentUncertainty.CLEAR,
        confidence: 0.95,
        originalIntent: 'GENERAL_CHAT',
        resolvedIntent: {
          action: selectedOption.action,
          target: selectedOption.params ? {
            dayNumber: selectedOption.params.dayNumber!,
            timeSlot: selectedOption.params.timeSlot,
            itemId: selectedOption.params.targetItemId,
          } : undefined,
        },
      };
    }

    // 2. 自由文本输入 - 尝试解析
    if (clarificationRequest.allowFreeText) {
      return this.parseFreetextResponse(userResponse, state);
    }

    // 3. 无法解析
    return {
      uncertainty: IntentUncertainty.AMBIGUOUS_ACTION,
      confidence: 0.3,
      originalIntent: 'GENERAL_CHAT',
      clarificationNeeded: {
        question: '抱歉，我没有理解您的选择。请选择一个选项或重新描述：',
        options: clarificationRequest.options,
        allowFreeText: true,
      },
    };
  }

  /**
   * 匹配用户选择的选项
   */
  private matchSelectedOption(
    userResponse: string,
    options: ClarificationOption[],
  ): ClarificationOption | null {
    const normalized = userResponse.toLowerCase().trim();

    for (const option of options) {
      // 精确匹配标签
      if (option.label.toLowerCase() === normalized) {
        return option;
      }

      // 部分匹配
      if (option.label.toLowerCase().includes(normalized) ||
          normalized.includes(option.label.toLowerCase())) {
        return option;
      }

      // 关键词匹配
      if (option.action === 'QUERY' && 
          ['了解', '看看', '不用', '不'].some(k => normalized.includes(k))) {
        return option;
      }

      if (option.action === 'ADD_TO_ITINERARY' &&
          ['是', '好', '加', '安排', '帮我'].some(k => normalized.includes(k))) {
        return option;
      }
    }

    return null;
  }

  /**
   * 解析自由文本响应
   */
  private parseFreetextResponse(
    userResponse: string,
    state: TripPlannerState,
  ): DisambiguationResult {
    // 尝试提取日期/时间信息
    const dayMatch = userResponse.match(/第(\d+)天/);
    const timeMatch = userResponse.match(/(\d{1,2})[:\：]?(\d{2})?/);

    if (dayMatch) {
      const dayNumber = parseInt(dayMatch[1], 10);
      const timeSlot = timeMatch ? {
        start: `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`,
        end: `${(parseInt(timeMatch[1], 10) + 2).toString().padStart(2, '0')}:${timeMatch[2] || '00'}`,
      } : undefined;

      return {
        uncertainty: IntentUncertainty.CLEAR,
        confidence: 0.8,
        originalIntent: 'ADD_ACTIVITY',
        resolvedIntent: {
          action: 'ADD_TO_ITINERARY',
          target: {
            dayNumber,
            timeSlot,
          },
        },
      };
    }

    // 无法解析
    return {
      uncertainty: IntentUncertainty.AMBIGUOUS_TARGET,
      confidence: 0.4,
      originalIntent: 'ADD_ACTIVITY',
      clarificationNeeded: {
        question: '请告诉我想添加到第几天？',
        options: state.tripContext.days.slice(0, 5).map(day => ({
          id: `day_${day.dayNumber}`,
          label: `第${day.dayNumber}天 - ${day.theme || day.date}`,
          action: 'ADD_TO_ITINERARY' as ResolvedAction,
          params: { dayNumber: day.dayNumber },
        })),
        allowFreeText: true,
      },
    };
  }
}
