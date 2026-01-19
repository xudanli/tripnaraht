// src/agent/assistants/trip-planner/services/trip-planner.service.ts

/**
 * 行程规划智能助手服务 (V2 增强版)
 * 
 * 定位：已创建行程的全方位智能助手
 * 
 * V2 增强特性：
 * - 集成 StateStoreService 进行会话状态持久化
 * - 集成 Claude Orchestrator 处理复杂任务
 * - 支持多意图识别
 * - 支持修改 diff 和撤销功能
 * - 支持流式响应
 * 
 * 核心能力：
 * 1. 行程优化师 - 调整 POI 顺序、替换景点、优化节奏
 * 2. 行程细化师 - 安排每日具体活动、餐厅、交通
 * 3. 行程顾问 - 回答问题、给建议、风险提示
 * 4. 执行助手 - 预订提醒、行前准备、实时调整
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LlmService } from '../../../../llm/services/llm.service';
import { StateStoreService } from '../../../infra/state-store.service';
import { ClaudeOrchestratorService } from '../../../services/claude-orchestrator.service';
import { ClaudeGatekeeperAgentService } from '../../../services/sub-agents/gatekeeper-agent.service';
import { ClaudeNarratorAgentService } from '../../../services/sub-agents/narrator-agent.service';
import { randomUUID } from 'crypto';
import { Observable, Subject } from 'rxjs';
import {
  TripPlannerIntent,
  TripPlannerPhase,
  TripPlannerState,
  TripPlannerRequest,
  TripPlannerResponse,
  TripContext,
  TripDayContext,
  TripItemContext,
  TripPlannerMessage,
  QuickAction,
  PendingChange,
  DEFAULT_PLANNER_PERSONA,
  // 三人格相关
  GuardianPersona,
  PersonaInsight,
  GuardianEvaluation,
  GUARDIAN_PERSONAS,
  GUARDIAN_PRIORITY,
  Disclaimer,
  // 埋点事件
  GuardianTrackingEventType,
  GuardianTrackingEventUnion,
  GuardianInvokedEvent,
  GuardianInsightShownEvent,
  GuardianWarningIgnoredEvent,
} from '../interfaces/trip-planner.interface';
import {
  IntentUncertainty,
  DisambiguationResult,
  ClarificationRequest,
  ItineraryGap,
} from '../interfaces/intent-uncertainty.interface';
import { ContextAnalyzerService } from './context-analyzer.service';
import { IntentDisambiguatorService } from './intent-disambiguator.service';
import { RouteOptimizationService } from './route-optimization.service';
import { RouteOptimizationEvidence } from '../interfaces/route-optimization.interface';

/**
 * 多意图识别结果
 */
interface IntentAnalysisResult {
  primary: TripPlannerIntent;
  secondary: TripPlannerIntent[];
  confidence: number;
  entities: {
    dayNumber?: number;
    poiName?: string;
    mealType?: string;
    timeRange?: string;
  };
}

/**
 * 流式响应事件
 */
export interface StreamEvent {
  type: 'thinking' | 'content' | 'action' | 'done' | 'error';
  data: {
    content?: string;
    phase?: TripPlannerPhase;
    progress?: number;
    quickActions?: QuickAction[];
    error?: string;
  };
}

@Injectable()
export class TripPlannerService {
  private readonly logger = new Logger(TripPlannerService.name);
  
  // 内存会话缓存（热数据，StateStore 为持久化层）
  private sessionCache: Map<string, TripPlannerState> = new Map();
  
  // 会话过期时间（2小时）
  private readonly SESSION_TTL_MS = 2 * 60 * 60 * 1000;
  
  /**
   * 复杂任务判断配置
   * 
   * 任务复杂度评分规则：
   * - 达到阈值（默认5分）则认为是复杂任务，需要委托给 Claude Orchestrator
   * - 低于阈值则由 TripPlanner 直接处理
   */
  private readonly COMPLEXITY_CONFIG = {
    // 总分阈值：超过此值认为是复杂任务
    threshold: 5,
    
    // 各维度权重
    weights: {
      // 行程规模
      tripScale: {
        daysCount: 1,          // 每天 +1 分
        itemsCount: 0.3,       // 每个活动 +0.3 分
        citiesCount: 2,        // 每个城市 +2 分
      },
      
      // 任务类型复杂度
      taskType: {
        OPTIMIZE_ROUTE: 3,     // 路线优化：需要考虑多POI距离和顺序
        REBALANCE_DAYS: 4,     // 重新平衡：需要重排多天内容
        REPLACE_POI: 2,        // 替换景点：需要找替代方案
        ADJUST_PACE: 2,        // 调整节奏：需要分析整体负载
        PLAN_TRANSPORT: 2,     // 交通规划：需要计算多段路线
        ADD_ACTIVITY: 1,       // 添加活动：相对简单
        ARRANGE_MEALS: 1,      // 安排餐厅：相对简单
        FILL_FREE_TIME: 1,     // 填充空闲：相对简单
        ASK_QUESTION: 0,       // 问答：无复杂度
        GET_SUGGESTION: 0,     // 建议：无复杂度
        CHECK_FEASIBILITY: 2,  // 可行性检查：需要多维度分析
        COMPARE_OPTIONS: 2,    // 对比：需要多维度比较
        CREATE_CHECKLIST: 0,   // 清单：模板化
        EXPORT_ITINERARY: 0,   // 导出：无复杂度
        SHOW_OVERVIEW: 0,      // 概览：无复杂度
        UNDO_CHANGE: 0,        // 撤销：无复杂度
        GENERAL_CHAT: 0,       // 通用：无复杂度
      },
      
      // 特殊因素加分
      specialFactors: {
        hasChildren: 1,        // 带小孩：需要考虑儿童友好
        hasElderly: 1,         // 带老人：需要考虑无障碍/节奏
        multipleIntents: 2,    // 多意图：需要协调处理
        crossDayChange: 2,     // 跨天修改：影响范围大
        budgetSensitive: 1,    // 预算敏感：需要成本计算
      },
    },
  };

  /**
   * 🎭 三人格显现配置
   * 
   * 设计原则：渐进式显现
   * - 默认：三人格在后台运行，NARA 整合输出
   * - 触发显现：当检测到特定场景时，三人格角色会显性出现
   * 
   * 显现时机：
   * 1. Abu (安全守护者) - 发现安全、时间、可达性问题时
   * 2. Dr.Dre (节奏设计师) - 疲劳度超标或节奏不合理时
   * 3. Neptune (空间魔法师) - 需要替代方案或修复计划时
   */
  private readonly GUARDIAN_CONFIG = {
    // 是否启用三人格显现
    enabled: true,
    
    // Abu 触发条件
    abu: {
      // 检测开放时间冲突
      checkOpeningHours: true,
      // 检测危险区域/安全警告
      checkSafetyWarnings: true,
      // 检测可达性问题
      checkAccessibility: true,
      // 严重程度阈值：只有达到此级别才显现
      severityThreshold: 'warning' as 'info' | 'warning' | 'error',
    },
    
    // Dr.Dre 触发条件
    drDre: {
      // 日均步数超过此值时触发
      maxDailySteps: 15000,
      // 日均活动数超过此值时触发
      maxDailyActivities: 6,
      // 疲劳度超过此值时触发 (0-100)
      fatigueThreshold: 70,
      // 检测连续高强度天数
      maxConsecutiveIntenseDays: 2,
    },
    
    // Neptune 触发条件
    neptune: {
      // 当用户说"换一个"等关键词
      replacementKeywords: ['换一个', '换个', '不去了', '改成', '替代', '其他选择'],
      // 当景点不可用时
      checkAvailability: true,
      // 主动提供备选方案
      proactiveAlternatives: true,
    },
    
    // 全员显现场景（重大决策）
    allGuardians: {
      keywords: ['检查一下', '帮我看看有没有问题', '可行吗', '这样安排合理吗'],
      intents: ['CHECK_FEASIBILITY', 'REBALANCE_DAYS'] as TripPlannerIntent[],
    },
  };

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly stateStore?: StateStoreService,
    @Optional() private readonly orchestrator?: ClaudeOrchestratorService,
    @Optional() private readonly gatekeeperAgent?: ClaudeGatekeeperAgentService,
    @Optional() private readonly narratorAgent?: ClaudeNarratorAgentService,
    @Optional() private readonly contextAnalyzer?: ContextAnalyzerService,
    @Optional() private readonly intentDisambiguator?: IntentDisambiguatorService,
    @Optional() private readonly routeOptimization?: RouteOptimizationService,
  ) {
    this.logger.log('🚀 行程规划智能助手已初始化 (V2 增强版 + 路线优化)');
    this.logger.debug(`服务注入状态: StateStore=${!!stateStore}, Orchestrator=${!!orchestrator}, ContextAnalyzer=${!!contextAnalyzer}, RouteOptimization=${!!routeOptimization}`);
  }

  /**
   * 处理用户消息 - 主入口
   */
  async chat(request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const startTime = Date.now();
    this.logger.debug(`[规划助手] 收到消息: tripId=${request.tripId}, message=${request.message.substring(0, 50)}...`);

    try {
      // 1. 加载或创建会话
      const state = await this.loadOrCreateSession(request);
      
      // 🆕 1.5 处理澄清选择（用户点击了澄清按钮后）
      if (request.clarificationData?.selectedAction) {
        this.logger.debug(`[规划助手] 处理澄清选择: ${request.clarificationData.selectedAction}`);
        return await this.handleClarificationSelection(state, request);
      }
      
      // 2. 记录用户消息
      this.addMessage(state, {
        id: randomUUID(),
        role: 'user',
        content: request.message,
        timestamp: new Date().toISOString(),
      });

      // 3. 分析用户意图
      const intent = await this.analyzeIntent(request.message, state);
      this.logger.debug(`[规划助手] 意图分析: ${intent}`);

      // 4. 🆕 意图不确定性处理（先诊断，再行动）
      if (this.intentDisambiguator && request.message !== '__START_SESSION__') {
        const disambiguation = await this.intentDisambiguator.disambiguate(
          request.message,
          intent,
          state,
        );

        // 如果意图不明确，需要澄清
        if (disambiguation.uncertainty !== IntentUncertainty.CLEAR && disambiguation.clarificationNeeded) {
          this.logger.debug(`[规划助手] 需要澄清: ${disambiguation.uncertainty}`);
          let clarificationResponse = this.createClarificationResponse(state, disambiguation);
          
          // 🎭 即使需要澄清，也运行三人格评估（检查距离等问题）
          const guardianResult = await this.evaluateWithGuardians(state, intent, request.message);
          if (guardianResult.guardiansInvoked.length > 0) {
            this.logger.debug(`[三人格] 澄清阶段触发: ${guardianResult.guardiansInvoked.join(', ')}, 洞察数: ${guardianResult.insights.length}`);
            clarificationResponse = this.enrichResponseWithGuardians(clarificationResponse, guardianResult);
          }
          
          // 记录助手回复
          this.addMessage(state, {
            id: randomUUID(),
            role: 'assistant',
            content: clarificationResponse.message,
            intent,
            quickActions: clarificationResponse.quickActions,
            timestamp: new Date().toISOString(),
          });
          
          state.updatedAt = new Date().toISOString();
          await this.saveSession(state);
          
          return clarificationResponse;
        }

        // 如果发现上下文缺口，附加提示
        if (disambiguation.contextDiscovery?.foundGap && disambiguation.contextDiscovery.shouldPrompt) {
          this.logger.debug(`[规划助手] 发现缺口: ${disambiguation.contextDiscovery.gap?.description}`);
          // 将在响应中附加缺口发现信息
          state.pendingChanges = state.pendingChanges || [];
          // 标记有上下文发现
          (state as any)._contextDiscovery = disambiguation.contextDiscovery;
        }
      }

      // 5. 根据意图处理
      let response: TripPlannerResponse;
      
      switch (intent) {
        // 优化类
        case 'OPTIMIZE_ROUTE':
          response = await this.handleOptimizeRoute(state, request);
          break;
        case 'REPLACE_POI':
          response = await this.handleReplacePoi(state, request);
          break;
        case 'ADJUST_PACE':
          response = await this.handleAdjustPace(state, request);
          break;
        case 'REBALANCE_DAYS':
          response = await this.handleRebalanceDays(state, request);
          break;
          
        // 细化类
        case 'ADD_ACTIVITY':
          response = await this.handleAddActivity(state, request);
          break;
        case 'ARRANGE_MEALS':
          response = await this.handleArrangeMeals(state, request);
          break;
        case 'PLAN_TRANSPORT':
          response = await this.handlePlanTransport(state, request);
          break;
        case 'FILL_FREE_TIME':
          response = await this.handleFillFreeTime(state, request);
          break;
          
        // 咨询类
        case 'ASK_QUESTION':
          response = await this.handleAskQuestion(state, request);
          break;
        case 'GET_SUGGESTION':
          response = await this.handleGetSuggestion(state, request);
          break;
        case 'CHECK_FEASIBILITY':
          response = await this.handleCheckFeasibility(state, request);
          break;
        case 'COMPARE_OPTIONS':
          response = await this.handleCompareOptions(state, request);
          break;
          
        // 执行类
        case 'CREATE_CHECKLIST':
          response = await this.handleCreateChecklist(state, request);
          break;
        case 'EXPORT_ITINERARY':
          response = await this.handleExportItinerary(state, request);
          break;
          
        // 通用
        case 'SHOW_OVERVIEW':
          response = await this.handleShowOverview(state, request);
          break;
        case 'UNDO_CHANGE':
          response = await this.handleUndoChange(state, request);
          break;
        default:
          response = await this.handleGeneralChat(state, request);
      }

      // 5. 🎭 三人格评估（根据需要触发）
      if (request.message !== '__START_SESSION__') {
        const guardianResult = await this.evaluateWithGuardians(state, intent, request.message);
        if (guardianResult.guardiansInvoked.length > 0) {
          this.logger.debug(`[三人格] 触发: ${guardianResult.guardiansInvoked.join(', ')}, 洞察数: ${guardianResult.insights.length}`);
          
          // 📊 埋点：追踪人格触发
          this.trackGuardianInvoked(
            state.sessionId,
            state.tripId,
            request.userId,
            guardianResult.guardiansInvoked,
            this.determineTriggerReason(intent, request.message),
            intent,
            request.message,
          );
          
          // 整合到响应
          response = this.enrichResponseWithGuardians(response, guardianResult);
          
          // 📊 埋点：追踪每个洞察的展示
          for (const insight of guardianResult.insights) {
            this.trackInsightShown(state.sessionId, state.tripId, request.userId, insight);
          }
        }
      }

      // 6. 记录助手回复
      this.addMessage(state, {
        id: randomUUID(),
        role: 'assistant',
        content: response.message,
        intent,
        quickActions: response.quickActions,
        timestamp: new Date().toISOString(),
      });

      // 7. 更新会话状态
      state.phase = response.phase;
      state.updatedAt = new Date().toISOString();
      await this.saveSession(state);

      this.logger.debug(`[规划助手] 处理完成: 耗时=${Date.now() - startTime}ms, phase=${response.phase}`);
      
      return response;
    } catch (error: any) {
      this.logger.error(`[规划助手] 处理失败: ${error.message}`, error.stack);
      return this.createErrorResponse(error.message);
    }
  }

  /**
   * 开始新会话 - 显示欢迎信息和行程概览
   */
  async startSession(tripId: string, userId: string): Promise<TripPlannerResponse> {
    return this.chat({
      tripId,
      userId,
      message: '__START_SESSION__',
    });
  }

  // ==================== 流式响应 ====================

  /**
   * 流式对话接口
   */
  chatStream(request: TripPlannerRequest): Observable<StreamEvent> {
    const subject = new Subject<StreamEvent>();
    
    // 异步处理
    this.processChatStream(request, subject).catch(error => {
      subject.next({
        type: 'error',
        data: { error: error.message },
      });
      subject.complete();
    });
    
    return subject.asObservable();
  }

  private async processChatStream(request: TripPlannerRequest, subject: Subject<StreamEvent>): Promise<void> {
    // 发送思考状态
    subject.next({
      type: 'thinking',
      data: { content: '正在分析您的需求...', progress: 10 },
    });

    const state = await this.loadOrCreateSession(request);
    
    // 发送意图分析状态
    subject.next({
      type: 'thinking',
      data: { content: '理解您的意图...', progress: 30 },
    });

    const intentResult = await this.analyzeIntentMultiple(request.message, state);
    
    // 发送处理状态
    subject.next({
      type: 'thinking',
      data: { content: '正在为您处理...', progress: 50 },
    });

    // 处理主意图
    const response = await this.processIntent(intentResult.primary, state, request);
    
    // 发送内容
    subject.next({
      type: 'content',
      data: {
        content: response.message,
        phase: response.phase,
        progress: 90,
      },
    });

    // 发送完成
    subject.next({
      type: 'done',
      data: {
        quickActions: response.quickActions,
        progress: 100,
      },
    });

    subject.complete();
  }

  // ==================== 多意图识别 ====================

  /**
   * 使用 LLM 分析用户意图（支持多意图）
   */
  private async analyzeIntent(message: string, state: TripPlannerState): Promise<TripPlannerIntent> {
    const result = await this.analyzeIntentMultiple(message, state);
    return result.primary;
  }

  /**
   * 多意图分析
   */
  private async analyzeIntentMultiple(message: string, state: TripPlannerState): Promise<IntentAnalysisResult> {
    // 特殊命令处理
    if (message === '__START_SESSION__') {
      return { primary: 'SHOW_OVERVIEW', secondary: [], confidence: 1.0, entities: {} };
    }

    // 关键词匹配（快速路径）
    const keywordIntents = this.matchKeywordIntents(message);
    
    // 如果只有一个明确意图，直接返回
    if (keywordIntents.length === 1) {
      return {
        primary: keywordIntents[0],
        secondary: [],
        confidence: 0.9,
        entities: this.extractEntities(message),
      };
    }

    // 使用 LLM 进行更精确的多意图分析
    if (this.llmService) {
      try {
        return await this.analyzeIntentWithLLM(message, state);
      } catch (error) {
        this.logger.warn(`LLM 意图分析失败，使用关键词匹配结果: ${error}`);
      }
    }

    // 降级：使用关键词匹配结果
    return {
      primary: keywordIntents[0] || 'GENERAL_CHAT',
      secondary: keywordIntents.slice(1),
      confidence: 0.6,
      entities: this.extractEntities(message),
    };
  }

  /**
   * 关键词意图匹配
   */
  private matchKeywordIntents(message: string): TripPlannerIntent[] {
    const intents: TripPlannerIntent[] = [];
    
    // 优化类
    if (/优化|调整顺序|重新排|路线/.test(message)) intents.push('OPTIMIZE_ROUTE');
    if (/换|替换|不想去|改成/.test(message)) intents.push('REPLACE_POI');
    if (/太赶|太紧|太松|节奏|放慢|加快/.test(message)) intents.push('ADJUST_PACE');
    if (/重新分配|平衡|均衡/.test(message)) intents.push('REBALANCE_DAYS');
    
    // 细化类
    if (/添加|加上|增加|想去/.test(message)) intents.push('ADD_ACTIVITY');
    if (/吃|餐厅|美食|饭/.test(message)) intents.push('ARRANGE_MEALS');
    if (/交通|怎么去|地铁|打车|公交/.test(message)) intents.push('PLAN_TRANSPORT');
    if (/空闲|没安排|还能|还有时间/.test(message)) intents.push('FILL_FREE_TIME');
    
    // 咨询类
    if (/可行|来得及|够不够|会不会/.test(message)) intents.push('CHECK_FEASIBILITY');
    if (/对比|比较|哪个好/.test(message)) intents.push('COMPARE_OPTIONS');
    if (/建议|推荐|应该/.test(message)) intents.push('GET_SUGGESTION');
    if (/\?|？/.test(message) && intents.length === 0) intents.push('ASK_QUESTION');
    
    // 执行类
    if (/清单|准备|要带/.test(message)) intents.push('CREATE_CHECKLIST');
    if (/导出|下载|分享/.test(message)) intents.push('EXPORT_ITINERARY');
    
    // 通用
    if (/概览|整体|看看行程/.test(message)) intents.push('SHOW_OVERVIEW');
    if (/撤销|取消|恢复/.test(message)) intents.push('UNDO_CHANGE');
    
    return intents;
  }

  /**
   * 提取实体
   */
  private extractEntities(message: string): IntentAnalysisResult['entities'] {
    const entities: IntentAnalysisResult['entities'] = {};
    
    // 提取天数
    const dayMatch = message.match(/第(\d+)天/);
    if (dayMatch) {
      entities.dayNumber = parseInt(dayMatch[1], 10);
    }
    
    // 提取餐点类型
    if (/早餐|早饭/.test(message)) entities.mealType = 'breakfast';
    if (/午餐|午饭|中饭/.test(message)) entities.mealType = 'lunch';
    if (/晚餐|晚饭/.test(message)) entities.mealType = 'dinner';
    
    return entities;
  }

  /**
   * LLM 多意图分析
   */
  private async analyzeIntentWithLLM(message: string, state: TripPlannerState): Promise<IntentAnalysisResult> {
    const prompt = `你是一个行程规划助手。分析用户的消息，识别所有意图。

用户消息: "${message}"

当前行程上下文:
- 目的地: ${state.tripContext.destinationName || state.tripContext.destination}
- 天数: ${state.tripContext.durationDays}天
- 当前阶段: ${state.phase}

可能的意图类型:
- OPTIMIZE_ROUTE: 优化路线顺序
- REPLACE_POI: 替换某个景点
- ADJUST_PACE: 调整节奏（太紧/太松）
- REBALANCE_DAYS: 重新平衡各天安排
- ADD_ACTIVITY: 添加活动
- ARRANGE_MEALS: 安排餐厅
- PLAN_TRANSPORT: 规划交通
- FILL_FREE_TIME: 填充空闲时间
- ASK_QUESTION: 问问题
- GET_SUGGESTION: 获取建议
- CHECK_FEASIBILITY: 检查可行性
- COMPARE_OPTIONS: 对比选项
- CREATE_CHECKLIST: 创建行前清单
- EXPORT_ITINERARY: 导出行程
- SHOW_OVERVIEW: 显示行程概览
- UNDO_CHANGE: 撤销修改
- GENERAL_CHAT: 通用对话

返回 JSON 格式:
{
  "primary": "主要意图",
  "secondary": ["次要意图1", "次要意图2"],
  "confidence": 0.9,
  "entities": {
    "dayNumber": 2,
    "poiName": "景点名",
    "mealType": "lunch"
  }
}`;

    const response = await this.llmService!.humanizeResult({
      dataType: 'multi_intent_analysis',
      data: { prompt },
    });

    try {
      // 尝试解析 JSON
      const cleaned = response.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleaned);
      
      // 验证意图有效性
      const validIntents: TripPlannerIntent[] = [
        'OPTIMIZE_ROUTE', 'REPLACE_POI', 'ADJUST_PACE', 'REBALANCE_DAYS',
        'ADD_ACTIVITY', 'ARRANGE_MEALS', 'PLAN_TRANSPORT', 'FILL_FREE_TIME',
        'ASK_QUESTION', 'GET_SUGGESTION', 'CHECK_FEASIBILITY', 'COMPARE_OPTIONS',
        'CREATE_CHECKLIST', 'EXPORT_ITINERARY', 'SHOW_OVERVIEW', 'UNDO_CHANGE',
        'GENERAL_CHAT',
      ];
      
      const primary = validIntents.includes(result.primary) ? result.primary : 'GENERAL_CHAT';
      const secondary = (result.secondary || []).filter((i: string) => validIntents.includes(i as TripPlannerIntent));
      
      return {
        primary,
        secondary,
        confidence: result.confidence || 0.8,
        entities: result.entities || {},
      };
    } catch (e) {
      // JSON 解析失败，尝试提取单一意图
      const intentMatch = response.match(/primary["\s:]+([A-Z_]+)/i);
      const intent = intentMatch ? intentMatch[1].toUpperCase() : 'GENERAL_CHAT';
      
      return {
        primary: intent as TripPlannerIntent,
        secondary: [],
        confidence: 0.5,
        entities: {},
      };
    }
  }

  // ==================== 复杂度评估 ====================

  /**
   * 评估任务复杂度
   * 
   * @returns 复杂度评分和详情
   */
  private evaluateTaskComplexity(
    intent: TripPlannerIntent,
    state: TripPlannerState,
    request: TripPlannerRequest,
    intentResult?: IntentAnalysisResult,
  ): {
    score: number;
    isComplex: boolean;
    breakdown: Record<string, number>;
    reasons: string[];
  } {
    const ctx = state.tripContext;
    const config = this.COMPLEXITY_CONFIG;
    const breakdown: Record<string, number> = {};
    const reasons: string[] = [];

    // 1. 行程规模评分
    const daysScore = ctx.durationDays * config.weights.tripScale.daysCount;
    breakdown['daysCount'] = daysScore;
    if (ctx.durationDays > 5) {
      reasons.push(`行程较长 (${ctx.durationDays}天)`);
    }

    const totalItems = ctx.days.reduce((sum, d) => sum + d.stats.itemCount, 0);
    const itemsScore = totalItems * config.weights.tripScale.itemsCount;
    breakdown['itemsCount'] = itemsScore;
    if (totalItems > 15) {
      reasons.push(`活动较多 (${totalItems}个)`);
    }

    // 统计城市数量
    const cities = new Set(ctx.days.map(d => d.city).filter(Boolean));
    const citiesScore = cities.size * config.weights.tripScale.citiesCount;
    breakdown['citiesCount'] = citiesScore;
    if (cities.size > 2) {
      reasons.push(`多城市 (${cities.size}个)`);
    }

    // 2. 任务类型评分
    const taskScore = config.weights.taskType[intent] || 0;
    breakdown['taskType'] = taskScore;
    if (taskScore >= 3) {
      reasons.push(`任务类型复杂 (${intent})`);
    }

    // 3. 特殊因素评分
    let specialScore = 0;
    
    if (ctx.travelers.children > 0) {
      specialScore += config.weights.specialFactors.hasChildren;
      reasons.push('有儿童同行');
    }
    
    if (ctx.travelers.elderly > 0) {
      specialScore += config.weights.specialFactors.hasElderly;
      reasons.push('有老人同行');
    }
    
    if (intentResult && intentResult.secondary.length > 0) {
      specialScore += config.weights.specialFactors.multipleIntents;
      reasons.push(`多意图 (${intentResult.secondary.length + 1}个)`);
    }
    
    // 检查是否跨天修改
    const targetDay = intentResult?.entities?.dayNumber;
    if (targetDay && ['REBALANCE_DAYS', 'OPTIMIZE_ROUTE'].includes(intent)) {
      specialScore += config.weights.specialFactors.crossDayChange;
      reasons.push('涉及跨天调整');
    }
    
    // 检查是否预算敏感
    if (request.message.includes('预算') || request.message.includes('省钱') || request.message.includes('便宜')) {
      specialScore += config.weights.specialFactors.budgetSensitive;
      reasons.push('预算敏感');
    }
    
    breakdown['specialFactors'] = specialScore;

    // 4. 计算总分
    const totalScore = daysScore + itemsScore + citiesScore + taskScore + specialScore;
    const isComplex = totalScore >= config.threshold;

    this.logger.debug(`[复杂度评估] intent=${intent}, score=${totalScore.toFixed(1)}, isComplex=${isComplex}, breakdown=${JSON.stringify(breakdown)}`);

    return {
      score: totalScore,
      isComplex,
      breakdown,
      reasons,
    };
  }

  /**
   * 判断是否为复杂任务（简化版，用于快速判断）
   */
  private isComplexTask(intent: TripPlannerIntent, state: TripPlannerState): boolean {
    return this.evaluateTaskComplexity(intent, state, { tripId: state.tripId, userId: state.userId, message: '' }).isComplex;
  }

  /**
   * 处理意图（供流式响应使用）
   */
  private async processIntent(intent: TripPlannerIntent, state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    switch (intent) {
      case 'OPTIMIZE_ROUTE': return this.handleOptimizeRoute(state, request);
      case 'REPLACE_POI': return this.handleReplacePoi(state, request);
      case 'ADJUST_PACE': return this.handleAdjustPace(state, request);
      case 'REBALANCE_DAYS': return this.handleRebalanceDays(state, request);
      case 'ADD_ACTIVITY': return this.handleAddActivity(state, request);
      case 'ARRANGE_MEALS': return this.handleArrangeMeals(state, request);
      case 'PLAN_TRANSPORT': return this.handlePlanTransport(state, request);
      case 'FILL_FREE_TIME': return this.handleFillFreeTime(state, request);
      case 'ASK_QUESTION': return this.handleAskQuestion(state, request);
      case 'GET_SUGGESTION': return this.handleGetSuggestion(state, request);
      case 'CHECK_FEASIBILITY': return this.handleCheckFeasibility(state, request);
      case 'COMPARE_OPTIONS': return this.handleCompareOptions(state, request);
      case 'CREATE_CHECKLIST': return this.handleCreateChecklist(state, request);
      case 'EXPORT_ITINERARY': return this.handleExportItinerary(state, request);
      case 'SHOW_OVERVIEW': return this.handleShowOverview(state, request);
      case 'UNDO_CHANGE': return this.handleUndoChange(state, request);
      default: return this.handleGeneralChat(state, request);
    }
  }

  // ==================== 意图处理器 ====================

  /**
   * 显示行程概览
   */
  private async handleShowOverview(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    const isNewSession = request.message === '__START_SESSION__';
    
    // 生成欢迎/概览消息
    let message: string;
    
    if (isNewSession) {
      // 新会话：使用人格化欢迎语
      message = DEFAULT_PLANNER_PERSONA.greetingTemplate
        .replace('{{name}}', DEFAULT_PLANNER_PERSONA.name)
        .replace('{{role}}', DEFAULT_PLANNER_PERSONA.role)
        .replace('{{destination}}', ctx.destinationName || ctx.destination)
        .replace('{{days}}', String(ctx.durationDays));
    } else {
      // 用户主动查看概览
      message = await this.generateOverviewMessage(ctx);
    }

    // 生成快捷操作
    const quickActions: QuickAction[] = [
      { id: '1', label: '📍 优化行程路线', action: 'OPTIMIZE_ROUTE', style: 'primary' },
      { id: '2', label: '🍜 推荐餐厅', action: 'ARRANGE_MEALS', style: 'secondary' },
      { id: '3', label: '❓ 问问题', action: 'ASK_QUESTION', style: 'secondary' },
      { id: '4', label: '✅ 行前清单', action: 'CREATE_CHECKLIST', style: 'secondary' },
    ];

    // 检查行程问题并添加提示
    const issues = this.detectTripIssues(ctx);
    if (issues.length > 0) {
      message += `\n\n⚠️ **发现 ${issues.length} 个潜在问题**：\n${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`;
      quickActions.unshift({
        id: '0',
        label: '🔧 修复问题',
        action: 'FIX_ISSUES',
        style: 'danger',
      });
    }

    return {
      sessionId: state.sessionId,
      message,
      phase: 'OVERVIEW',
      intent: 'SHOW_OVERVIEW',
      richContent: {
        type: 'timeline',
        data: this.generateTimelineData(ctx),
      },
      quickActions,
    };
  }

  /**
   * 优化路线
   */
  private async handleOptimizeRoute(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 创建检查点（用于撤销）
    await this.createCheckpoint(state.sessionId, '优化路线前的检查点');
    
    // 评估任务复杂度
    const complexity = this.evaluateTaskComplexity('OPTIMIZE_ROUTE', state, request);
    this.logger.debug(`[路线优化] 复杂度评估: score=${complexity.score.toFixed(1)}, isComplex=${complexity.isComplex}, reasons=${complexity.reasons.join(', ')}`);
    
    const isComplexTask = complexity.isComplex;
    
    let suggestion: string;
    let optimizationResult: any = null;
    
    if (isComplexTask && this.orchestrator) {
      // 复杂任务：委托给 Claude Orchestrator
      this.logger.debug(`[规划助手] 复杂优化任务，委托给 Orchestrator`);
      try {
        const requestId = randomUUID();
        const result = await this.orchestrator.orchestrate(
          {
            request_id: requestId,
            user_id: request.userId,
            message: `优化行程路线: ${request.message}`,
            trip_id: state.tripId,
          },
          {
            requestId,
            userId: request.userId,
            tripId: state.tripId,
          },
        );
        // 从 OrchestrationResult 中提取结果
        suggestion = result.answerText || await this.generateRouteSuggestion(ctx, request.message);
        optimizationResult = result.result;
      } catch (error: any) {
        this.logger.warn(`Orchestrator 调用失败，降级使用 LLM: ${error.message}`);
        suggestion = await this.generateRouteSuggestion(ctx, request.message);
      }
    } else {
      // 简单任务：使用 LLM 生成优化建议
      suggestion = await this.generateRouteSuggestion(ctx, request.message);
    }
    
    // 记录待确认的修改
    const changeId = randomUUID();
    this.addPendingChange(state, {
      id: changeId,
      type: 'UPDATE',
      target: 'TRIP',
      targetId: state.tripId,
      description: '优化行程路线顺序',
      before: ctx.days,
      after: optimizationResult?.optimizedDays || null,
      impact: {
        timeDelta: -30, // 预计节省30分钟
        riskLevel: 'low',
      },
    });
    
    const message = `好的，我来帮您优化行程路线。

${suggestion}

您觉得这个优化方案怎么样？`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'OPTIMIZING',
      intent: 'OPTIMIZE_ROUTE',
      pendingChanges: [state.pendingChanges![state.pendingChanges!.length - 1]],
      quickActions: [
        { id: '1', label: '✅ 应用优化', action: 'APPLY_OPTIMIZATION', params: { changeId }, style: 'primary' },
        { id: '2', label: '🔄 换个方案', action: 'OPTIMIZE_ROUTE', style: 'secondary' },
        { id: '3', label: '❌ 不需要', action: 'CANCEL', style: 'secondary' },
      ],
      followUp: {
        question: '需要我进一步解释优化的原因吗？',
        options: ['好的，解释一下', '直接应用吧', '我再想想'],
        type: 'single',
      },
    };
  }

  /**
   * 替换景点
   */
  private async handleReplacePoi(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    // 解析要替换的景点
    const alternatives = await this.findAlternativePois(state.tripContext, request.message);
    
    const message = `我理解您想替换景点。以下是一些替代选项：

${alternatives.map((alt, i) => `${i + 1}. **${alt.name}** - ${alt.reason}\n   ⏱️ ${alt.duration}分钟 | 💰 ¥${alt.cost}`).join('\n\n')}

您想选择哪个？`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'OPTIMIZING',
      intent: 'REPLACE_POI',
      richContent: {
        type: 'poi_list',
        data: alternatives,
      },
      quickActions: alternatives.map((alt, i) => ({
        id: String(i + 1),
        label: alt.name,
        action: 'SELECT_POI',
        params: { poiId: alt.id },
        style: i === 0 ? 'primary' : 'secondary',
      })),
    };
  }

  /**
   * 调整节奏
   */
  private async handleAdjustPace(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 分析当前节奏
    const paceAnalysis = this.analyzePace(ctx);
    
    let message: string;
    if (/太赶|太紧/.test(request.message)) {
      message = `我理解您觉得行程太紧凑了。当前分析：

${paceAnalysis.summary}

建议调整方案：
${paceAnalysis.relaxSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

需要我帮您自动调整吗？`;
    } else {
      message = `我理解您觉得行程太松了。当前分析：

${paceAnalysis.summary}

建议增加内容：
${paceAnalysis.intensifySuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

需要我帮您自动调整吗？`;
    }

    return {
      sessionId: state.sessionId,
      message,
      phase: 'OPTIMIZING',
      intent: 'ADJUST_PACE',
      quickActions: [
        { id: '1', label: '✅ 自动调整', action: 'APPLY_PACE_ADJUSTMENT', style: 'primary' },
        { id: '2', label: '🎯 我来选择', action: 'MANUAL_ADJUST', style: 'secondary' },
      ],
    };
  }

  /**
   * 重新平衡各天
   */
  private async handleRebalanceDays(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 分析各天负载
    const dayLoads = ctx.days.map((day, i) => ({
      day: i + 1,
      items: day.stats.itemCount,
      duration: day.stats.totalDuration,
      level: day.stats.itemCount > 5 ? '过多' : day.stats.itemCount < 2 ? '过少' : '适中',
    }));

    const message = `我来帮您重新平衡各天的安排。当前各天负载：

${dayLoads.map(d => `第${d.day}天：${d.items}个活动，约${Math.round(d.duration / 60)}小时 (${d.level})`).join('\n')}

我可以将活动重新分配，让每天的安排更均衡。要我自动平衡吗？`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'OPTIMIZING',
      intent: 'REBALANCE_DAYS',
      quickActions: [
        { id: '1', label: '✅ 自动平衡', action: 'APPLY_REBALANCE', style: 'primary' },
        { id: '2', label: '📊 查看详情', action: 'SHOW_DAY_DETAILS', style: 'secondary' },
      ],
    };
  }

  /**
   * 添加活动
   */
  private async handleAddActivity(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 解析用户想要的活动类型和目标日期
    const targetDay = request.targetDay || this.findBestDayForActivity(ctx);
    
    const message = `好的，您想添加什么活动？

📅 **建议添加到第${targetDay}天**（当天还有约${this.getFreetimeForDay(ctx, targetDay)}分钟空闲时间）

您可以：
1. 直接告诉我想去的地方，如"想去浅草寺"
2. 让我推荐，如"推荐一个适合拍照的地方"
3. 按类型选择，如"想逛一个商场"`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'DETAILING',
      intent: 'ADD_ACTIVITY',
      quickActions: [
        { id: '1', label: '🏯 景点', action: 'ADD_POI', style: 'secondary' },
        { id: '2', label: '🛍️ 购物', action: 'ADD_SHOPPING', style: 'secondary' },
        { id: '3', label: '🎭 体验', action: 'ADD_EXPERIENCE', style: 'secondary' },
        { id: '4', label: '✨ 推荐', action: 'GET_RECOMMENDATION', style: 'primary' },
      ],
      followUp: {
        question: '想添加什么类型的活动？',
        type: 'text',
      },
    };
  }

  /**
   * 安排餐厅
   */
  private async handleArrangeMeals(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 找出还没安排餐厅的餐点
    const missingMeals = this.findMissingMeals(ctx);
    
    let message: string;
    if (missingMeals.length > 0) {
      message = `我来帮您安排餐厅。您还有以下餐点没有安排：

${missingMeals.map(m => `• 第${m.day}天 ${m.meal}`).join('\n')}

我可以根据您当天的行程位置，推荐附近的餐厅。您想从哪一餐开始？`;
    } else {
      message = `您的餐厅都已经安排好了！如果想更换某一餐，可以告诉我"换掉第X天的午餐"。

或者您想看看我的特别推荐？我可以根据当地特色给您一些美食建议。`;
    }

    return {
      sessionId: state.sessionId,
      message,
      phase: 'DETAILING',
      intent: 'ARRANGE_MEALS',
      quickActions: missingMeals.length > 0 ? [
        { id: '1', label: '🍜 全部安排', action: 'ARRANGE_ALL_MEALS', style: 'primary' },
        { id: '2', label: '🎯 我来选', action: 'SELECT_MEALS', style: 'secondary' },
        { id: '3', label: '💡 美食推荐', action: 'FOOD_RECOMMENDATION', style: 'secondary' },
      ] : [
        { id: '1', label: '💡 美食推荐', action: 'FOOD_RECOMMENDATION', style: 'primary' },
        { id: '2', label: '🔄 更换餐厅', action: 'REPLACE_RESTAURANT', style: 'secondary' },
      ],
    };
  }

  /**
   * 规划交通
   */
  private async handlePlanTransport(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 分析交通需求
    const transportNeeds = this.analyzeTransportNeeds(ctx);
    
    const message = `我来帮您规划交通。根据您的行程：

🚃 **交通建议**：
${transportNeeds.suggestions.map(s => `• ${s}`).join('\n')}

💰 **预估交通费用**：约 ¥${transportNeeds.estimatedCost}

🎫 **推荐购买**：
${transportNeeds.passes.map(p => `• ${p.name}：¥${p.price}（${p.reason}）`).join('\n')}

需要我为每段行程规划详细的交通方式吗？`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'DETAILING',
      intent: 'PLAN_TRANSPORT',
      quickActions: [
        { id: '1', label: '📍 详细规划', action: 'DETAIL_TRANSPORT', style: 'primary' },
        { id: '2', label: '🎫 购票建议', action: 'TICKET_ADVICE', style: 'secondary' },
      ],
    };
  }

  /**
   * 填充空闲时间
   */
  private async handleFillFreeTime(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 找出空闲时间段
    const freeSlots = this.findFreeTimeSlots(ctx);
    
    if (freeSlots.length === 0) {
      return {
        sessionId: state.sessionId,
        message: '您的行程安排得很满了！如果想增加活动，可能需要先移除或缩短某些安排。需要我帮您分析一下吗？',
        phase: 'OVERVIEW',
        intent: 'FILL_FREE_TIME',
        quickActions: [
          { id: '1', label: '📊 分析行程', action: 'ANALYZE_SCHEDULE', style: 'primary' },
        ],
      };
    }

    const message = `我找到了以下空闲时间段：

${freeSlots.map(s => `📅 第${s.day}天 ${s.start}-${s.end}（${s.duration}分钟）\n   📍 附近可以去：${s.nearbyOptions.join('、')}`).join('\n\n')}

需要我为您推荐活动来填充吗？`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'DETAILING',
      intent: 'FILL_FREE_TIME',
      quickActions: [
        { id: '1', label: '✨ 自动填充', action: 'AUTO_FILL', style: 'primary' },
        { id: '2', label: '🎯 我来选择', action: 'MANUAL_SELECT', style: 'secondary' },
        { id: '3', label: '😌 保持空闲', action: 'KEEP_FREE', style: 'secondary' },
      ],
    };
  }

  /**
   * 回答问题
   */
  private async handleAskQuestion(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 使用 LLM 回答问题
    const answer = await this.answerQuestionWithLLM(request.message, ctx);
    
    return {
      sessionId: state.sessionId,
      message: answer,
      phase: 'CONSULTING',
      intent: 'ASK_QUESTION',
      quickActions: [
        { id: '1', label: '❓ 继续问', action: 'ASK_MORE', style: 'secondary' },
        { id: '2', label: '🔙 返回行程', action: 'SHOW_OVERVIEW', style: 'secondary' },
      ],
    };
  }

  /**
   * 获取建议
   */
  private async handleGetSuggestion(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 生成个性化建议
    const suggestions = await this.generateSuggestions(ctx, request.message);
    
    const message = `根据您的行程，我有以下建议：

${suggestions.map((s, i) => `${i + 1}. **${s.title}**\n   ${s.description}`).join('\n\n')}

有需要我详细解释或者帮您应用的吗？`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'CONSULTING',
      intent: 'GET_SUGGESTION',
      quickActions: suggestions.map((s, i) => ({
        id: String(i + 1),
        label: s.title,
        action: 'APPLY_SUGGESTION',
        params: { suggestionId: s.id },
        style: i === 0 ? 'primary' : 'secondary',
      })),
    };
  }

  /**
   * 检查可行性
   */
  private async handleCheckFeasibility(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    let analysis: any;
    
    // 使用简单分析（GatekeeperAgent 接口待扩展）
    // TODO: 集成 GatekeeperAgent.checkFeasibility 方法
    analysis = await this.analyzeFeasibility(ctx, request.message);
    
    // 格式化消息
    const message = this.formatFeasibilityMessage(analysis);

    return {
      sessionId: state.sessionId,
      message,
      phase: 'CONSULTING',
      intent: 'CHECK_FEASIBILITY',
      richContent: analysis.risks?.length > 0 ? {
        type: 'comparison',
        data: {
          title: '风险分析',
          items: analysis.risks,
        },
      } : undefined,
      quickActions: analysis.feasible ? [
        { id: '1', label: '👍 好的', action: 'CONFIRM', style: 'primary' },
      ] : [
        { id: '1', label: '🔧 帮我调整', action: 'AUTO_FIX', style: 'primary' },
        { id: '2', label: '📊 详细分析', action: 'DETAIL_ANALYSIS', style: 'secondary' },
      ],
    };
  }

  /**
   * 格式化可行性分析消息
   */
  private formatFeasibilityMessage(analysis: any): string {
    const emoji = analysis.feasible ? '✅' : '⚠️';
    let message = `${emoji} **可行性分析结果**\n\n${analysis.summary}`;
    
    if (analysis.details?.length > 0) {
      message += `\n\n${analysis.details.map((d: string) => `• ${d}`).join('\n')}`;
    }
    
    if (analysis.suggestions?.length > 0) {
      message += `\n\n💡 **建议**：\n${analysis.suggestions.map((s: string) => `• ${s}`).join('\n')}`;
    }
    
    message += `\n\n${analysis.feasible ? '总体来说这个安排是可行的。' : '建议您进行一些调整。'}`;
    
    return message;
  }

  /**
   * 对比选项
   */
  private async handleCompareOptions(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    // 解析要对比的选项
    const comparison = await this.generateComparison(state.tripContext, request.message);
    
    const message = `好的，我来帮您对比一下：

${comparison.table}

**我的建议**：${comparison.recommendation}`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'CONSULTING',
      intent: 'COMPARE_OPTIONS',
      richContent: {
        type: 'comparison',
        data: comparison,
      },
      quickActions: comparison.options.map((opt, i) => ({
        id: String(i + 1),
        label: `选择 ${opt.name}`,
        action: 'SELECT_OPTION',
        params: { optionId: opt.id },
        style: opt.recommended ? 'primary' : 'secondary',
      })),
    };
  }

  /**
   * 创建行前清单
   */
  private async handleCreateChecklist(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 生成个性化清单
    const checklist = this.generateChecklist(ctx);
    
    const message = `我为您生成了行前准备清单：

📋 **${ctx.destinationName || ctx.destination} ${ctx.durationDays}天旅行清单**

**📄 证件类**
${checklist.documents.map(d => `☐ ${d}`).join('\n')}

**👕 衣物类**
${checklist.clothing.map(c => `☐ ${c}`).join('\n')}

**💊 健康类**
${checklist.health.map(h => `☐ ${h}`).join('\n')}

**📱 电子设备**
${checklist.electronics.map(e => `☐ ${e}`).join('\n')}

**💰 财务类**
${checklist.finance.map(f => `☐ ${f}`).join('\n')}

需要我帮您导出这个清单吗？`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'EXECUTING',
      intent: 'CREATE_CHECKLIST',
      richContent: {
        type: 'checklist',
        data: checklist,
      },
      quickActions: [
        { id: '1', label: '📤 导出清单', action: 'EXPORT_CHECKLIST', style: 'primary' },
        { id: '2', label: '➕ 添加项目', action: 'ADD_CHECKLIST_ITEM', style: 'secondary' },
      ],
    };
  }

  /**
   * 导出行程
   */
  private async handleExportItinerary(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const message = `您想以什么格式导出行程？

📄 **PDF** - 适合打印或离线查看
📱 **分享链接** - 发给同行的朋友
📅 **日历** - 导入到手机日历
📋 **文本** - 简洁的文字版本`;

    return {
      sessionId: state.sessionId,
      message,
      phase: 'EXECUTING',
      intent: 'EXPORT_ITINERARY',
      quickActions: [
        { id: '1', label: '📄 PDF', action: 'EXPORT_PDF', style: 'primary' },
        { id: '2', label: '📱 分享链接', action: 'SHARE_LINK', style: 'secondary' },
        { id: '3', label: '📅 日历', action: 'EXPORT_CALENDAR', style: 'secondary' },
        { id: '4', label: '📋 文本', action: 'EXPORT_TEXT', style: 'secondary' },
      ],
    };
  }

  /**
   * 撤销修改
   */
  private async handleUndoChange(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    // 检查是否有可撤销的修改
    if (!state.pendingChanges || state.pendingChanges.length === 0) {
      return {
        sessionId: state.sessionId,
        message: '没有可撤销的修改。您的行程保持原样。',
        phase: state.phase,
        intent: 'UNDO_CHANGE',
      };
    }

    const lastChange = state.pendingChanges[state.pendingChanges.length - 1];
    
    return {
      sessionId: state.sessionId,
      message: `您确定要撤销这个修改吗？\n\n**${lastChange.description}**`,
      phase: 'CONFIRMING',
      intent: 'UNDO_CHANGE',
      quickActions: [
        { id: '1', label: '✅ 确认撤销', action: 'CONFIRM_UNDO', style: 'danger' },
        { id: '2', label: '❌ 取消', action: 'CANCEL', style: 'secondary' },
      ],
    };
  }

  /**
   * 通用对话
   */
  private async handleGeneralChat(state: TripPlannerState, request: TripPlannerRequest): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 使用 LLM 生成回复
    const response = await this.generateGeneralResponse(ctx, request.message, state.messages);
    
    return {
      sessionId: state.sessionId,
      message: response,
      phase: state.phase,
      intent: 'GENERAL_CHAT',
      quickActions: [
        { id: '1', label: '📋 查看行程', action: 'SHOW_OVERVIEW', style: 'secondary' },
        { id: '2', label: '✨ 优化建议', action: 'GET_SUGGESTION', style: 'secondary' },
      ],
    };
  }

  // ==================== 澄清选择处理 ====================

  /**
   * 处理用户的澄清选择（用户点击澄清按钮后的动作）
   */
  private async handleClarificationSelection(
    state: TripPlannerState,
    request: TripPlannerRequest,
  ): Promise<TripPlannerResponse> {
    const { clarificationData } = request;
    if (!clarificationData) {
      throw new Error('缺少澄清数据');
    }

    const { selectedAction, params } = clarificationData;
    this.logger.debug(`[澄清处理] 动作=${selectedAction}, 参数=${JSON.stringify(params)}`);

    // 记录用户选择
    this.addMessage(state, {
      id: randomUUID(),
      role: 'user',
      content: `[选择] ${request.message}`,
      timestamp: new Date().toISOString(),
    });

    switch (selectedAction) {
      case 'QUERY':
        // 用户只是想了解信息，不添加到行程
        return this.handlePureQueryAction(state, request);

      case 'ADD_TO_ITINERARY':
        // 用户想把内容添加到行程
        return this.handleAddToItineraryAction(state, request, params);

      case 'REPLACE':
        // 用户想替换现有项目
        return this.handleReplaceAction(state, request, params);

      case 'REMOVE':
        // 用户想移除项目
        return this.handleRemoveAction(state, request, params);

      case 'MODIFY':
        // 用户想修改项目
        return this.handleModifyAction(state, request, params);

      default:
        this.logger.warn(`[澄清处理] 未知动作: ${selectedAction}`);
        return this.handleGeneralChat(state, request);
    }
  }

  /**
   * 处理纯查询动作（用户只想了解信息）
   */
  private async handlePureQueryAction(
    state: TripPlannerState,
    request: TripPlannerRequest,
  ): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 提取上一条消息中的关键词（用户原始问题）
    const lastUserMessage = state.messages
      .filter(m => m.role === 'user' && !m.content.startsWith('[选择]'))
      .pop();
    const originalQuery = lastUserMessage?.content || request.message;

    // 生成纯信息回复（不涉及行程修改）
    const infoResponse = await this.generateInfoResponse(ctx, originalQuery);

    const message = `${infoResponse}

---
💡 如果您想把相关内容加到行程里，随时告诉我！`;

    this.addMessage(state, {
      id: randomUUID(),
      role: 'assistant',
      content: message,
      timestamp: new Date().toISOString(),
    });

    await this.saveSession(state);

    return {
      sessionId: state.sessionId,
      message,
      phase: 'CONSULTING',
      intent: 'ASK_QUESTION',
      quickActions: [
        { id: '1', label: '➕ 加到行程', action: 'ADD_TO_ITINERARY', style: 'primary' },
        { id: '2', label: '🔍 了解更多', action: 'ASK_MORE', style: 'secondary' },
        { id: '3', label: '🔙 返回', action: 'SHOW_OVERVIEW', style: 'secondary' },
      ],
    };
  }

  /**
   * 处理添加到行程动作
   */
  private async handleAddToItineraryAction(
    state: TripPlannerState,
    request: TripPlannerRequest,
    params?: {
      dayNumber?: number;
      timeSlot?: { start: string; end: string };
      targetItemId?: string;
      gapId?: string;
    },
  ): Promise<TripPlannerResponse> {
    const ctx = state.tripContext;
    
    // 确定目标天数
    const targetDay = params?.dayNumber || request.targetDay || 1;
    const dayContext = ctx.days[targetDay - 1];

    if (!dayContext) {
      return {
        sessionId: state.sessionId,
        message: `❌ 第${targetDay}天不存在，请指定有效的天数（1-${ctx.days.length}）`,
        phase: 'DETAILING',
        intent: 'ADD_ACTIVITY',
      };
    }

    // 如果有时间段，使用指定时间；否则自动找空闲时段
    let timeSlot = params?.timeSlot;
    if (!timeSlot) {
      const freeSlot = this.findFreeSlot(dayContext, 60);
      if (freeSlot) {
        timeSlot = freeSlot;
      }
    }

    // 提取上一条消息中的关键词来推断要添加什么
    const lastUserMessage = state.messages
      .filter(m => m.role === 'user' && !m.content.startsWith('[选择]'))
      .pop();
    const originalQuery = lastUserMessage?.content || request.message;

    // 根据查询内容推断类型
    const isMealQuery = /吃|餐|饭|美食|午餐|晚餐|早餐|拉面|寿司|烤肉/.test(originalQuery);
    const suggestionType = isMealQuery ? 'ARRANGE_MEALS' : 'ADD_ACTIVITY';

    // 生成推荐
    const recommendations = await this.generateRecommendations(ctx, originalQuery, targetDay);

    const message = `好的！我来帮您安排到第${targetDay}天${timeSlot ? ` ${timeSlot.start}-${timeSlot.end}` : ''}。

${recommendations.map((r, i) => `${i + 1}. **${r.name}** ${r.rating ? `⭐${r.rating}` : ''}
   📍 ${r.address || '位置待确认'}
   ⏱️ 建议游玩 ${r.duration || 60} 分钟`).join('\n\n')}

请选择一个，或告诉我您想要的具体地点：`;

    // 生成快捷选择按钮
    const quickActions: QuickAction[] = recommendations.slice(0, 3).map((r, i) => ({
      id: `rec_${i}`,
      label: `${r.name}`,
      action: 'APPLY_RECOMMENDATION',
      params: {
        recommendation: r,
        dayNumber: targetDay,
        timeSlot,
      },
      style: i === 0 ? 'primary' : 'secondary',
    }));

    quickActions.push({
      id: 'custom',
      label: '🔍 搜索其他',
      action: 'SEARCH_MORE',
      style: 'outline',
    });

    this.addMessage(state, {
      id: randomUUID(),
      role: 'assistant',
      content: message,
      intent: suggestionType as TripPlannerIntent,
      quickActions,
      timestamp: new Date().toISOString(),
    });

    await this.saveSession(state);

    return {
      sessionId: state.sessionId,
      message,
      phase: 'DETAILING',
      intent: suggestionType as TripPlannerIntent,
      quickActions,
      followUp: {
        question: '请选择一个推荐，或输入您想去的地方',
        options: recommendations.map(r => r.name),
        type: 'single',
      },
    };
  }

  /**
   * 处理替换动作
   */
  private async handleReplaceAction(
    state: TripPlannerState,
    request: TripPlannerRequest,
    params?: { targetItemId?: string },
  ): Promise<TripPlannerResponse> {
    // 委托给 REPLACE_POI 处理
    return this.handleReplacePoi(state, {
      ...request,
      targetItemId: params?.targetItemId || request.targetItemId,
    });
  }

  /**
   * 处理移除动作
   */
  private async handleRemoveAction(
    state: TripPlannerState,
    request: TripPlannerRequest,
    params?: { targetItemId?: string },
  ): Promise<TripPlannerResponse> {
    const targetItemId = params?.targetItemId || request.targetItemId;
    
    if (!targetItemId) {
      return {
        sessionId: state.sessionId,
        message: '请指定要移除的项目',
        phase: state.phase,
        intent: 'GENERAL_CHAT',
      };
    }

    // 查找并标记为移除
    for (const day of state.tripContext.days) {
      const itemIndex = day.items.findIndex(i => i.itemId === targetItemId);
      if (itemIndex >= 0) {
        const item = day.items[itemIndex];
        
        // 创建待确认修改
        const changeId = `remove_${randomUUID().substring(0, 8)}`;
        state.pendingChanges = state.pendingChanges || [];
        const itemName = this.getItemName(item);
        
        state.pendingChanges.push({
          id: changeId,
          type: 'DELETE',
          target: 'ITEM',
          targetId: targetItemId,
          dayNumber: day.dayNumber,
          description: `移除第${day.dayNumber}天的「${itemName}」`,
          status: 'pending',
        });

        await this.saveSession(state);

        return {
          sessionId: state.sessionId,
          message: `确定要移除第${day.dayNumber}天的「${itemName}」吗？`,
          phase: 'CONFIRMING',
          intent: 'GENERAL_CHAT',
          pendingChanges: state.pendingChanges,
          quickActions: [
            { id: '1', label: '✅ 确认移除', action: 'CONFIRM_REMOVE', params: { changeId }, style: 'danger' },
            { id: '2', label: '❌ 取消', action: 'CANCEL', style: 'secondary' },
          ],
        };
      }
    }

    return {
      sessionId: state.sessionId,
      message: `未找到 ID 为 ${targetItemId} 的项目`,
      phase: state.phase,
      intent: 'GENERAL_CHAT',
    };
  }

  /**
   * 处理修改动作
   */
  private async handleModifyAction(
    state: TripPlannerState,
    request: TripPlannerRequest,
    params?: { targetItemId?: string },
  ): Promise<TripPlannerResponse> {
    const targetItemId = params?.targetItemId || request.targetItemId;
    
    if (!targetItemId) {
      return {
        sessionId: state.sessionId,
        message: '请指定要修改的项目，或告诉我您想修改什么',
        phase: state.phase,
        intent: 'GENERAL_CHAT',
        quickActions: [
          { id: '1', label: '⏰ 修改时间', action: 'MODIFY_TIME', style: 'secondary' },
          { id: '2', label: '⏱️ 修改时长', action: 'MODIFY_DURATION', style: 'secondary' },
          { id: '3', label: '📝 添加备注', action: 'ADD_NOTE', style: 'secondary' },
        ],
      };
    }

    // 查找项目
    for (const day of state.tripContext.days) {
      const item = day.items.find(i => i.itemId === targetItemId);
      if (item) {
        const itemName = this.getItemName(item);
        return {
          sessionId: state.sessionId,
          message: `您想修改「${itemName}」的什么内容？
          
当前信息：
- 时间：${item.startTime || '未设置'} - ${item.endTime || '未设置'}
- 时长：${item.duration || 60} 分钟
- 备注：${item.notes || '无'}`,
          phase: 'DETAILING',
          intent: 'GENERAL_CHAT',
          quickActions: [
            { id: '1', label: '⏰ 修改时间', action: 'MODIFY_TIME', params: { targetItemId }, style: 'secondary' },
            { id: '2', label: '⏱️ 修改时长', action: 'MODIFY_DURATION', params: { targetItemId }, style: 'secondary' },
            { id: '3', label: '📝 添加备注', action: 'ADD_NOTE', params: { targetItemId }, style: 'secondary' },
            { id: '4', label: '🔄 替换', action: 'REPLACE_POI', params: { targetItemId }, style: 'secondary' },
          ],
        };
      }
    }

    return {
      sessionId: state.sessionId,
      message: `未找到 ID 为 ${targetItemId} 的项目`,
      phase: state.phase,
      intent: 'GENERAL_CHAT',
    };
  }

  /**
   * 生成纯信息回复（不涉及行程修改）
   */
  private async generateInfoResponse(ctx: TripContext, query: string): Promise<string> {
    // 识别查询类型
    const isMealQuery = /吃|餐|饭|美食|午餐|晚餐|早餐|拉面|寿司|烤肉|好吃/.test(query);
    const isAttractionQuery = /景点|玩|去|看|逛/.test(query);
    const isTransportQuery = /怎么去|交通|地铁|公交|打车/.test(query);

    if (isMealQuery) {
      return `**${ctx.destinationName || ctx.destination}美食推荐** 🍜

根据当地特色，为您推荐：

1. **一兰拉面** - 经典博多豚骨拉面，24小时营业
   💰 约 ¥80/人 | ⭐ 4.5

2. **筑地寿司清** - 新鲜海鲜寿司，需要排队
   💰 约 ¥200/人 | ⭐ 4.8

3. **矶丸水产** - 海鲜烧烤，自己动手
   💰 约 ¥150/人 | ⭐ 4.3

> 💡 建议：热门餐厅建议提前到或错峰就餐`;
    }

    if (isTransportQuery) {
      return `**${ctx.destinationName || ctx.destination}交通指南** 🚃

**推荐交通方式：**
1. **地铁/JR** - 最便捷，覆盖主要景点
2. **公交** - 适合短途，可欣赏街景
3. **出租车** - 起步价约 ¥40，适合多人或赶时间

**交通卡推荐：**
- Suica/Pasmo：便利店、自动售票机均可购买充值

> 💡 建议：下载「Google Maps」或「换乘案内」APP`;
    }

    // 默认回复
    return `关于「${query}」的信息：

${ctx.destinationName || ctx.destination}是一个很棒的目的地！

如果您想了解更具体的内容，可以告诉我：
- 🍜 美食推荐
- 🏯 景点介绍
- 🚃 交通指南
- 💰 预算建议`;
  }

  /**
   * 生成推荐列表
   */
  private async generateRecommendations(
    ctx: TripContext,
    query: string,
    targetDay: number,
  ): Promise<Array<{ name: string; address?: string; rating?: number; duration?: number }>> {
    // TODO: 接入真实的 POI 搜索服务
    const isMealQuery = /吃|餐|饭|美食|午餐|晚餐|早餐|拉面|寿司|烤肉|好吃/.test(query);
    
    if (isMealQuery) {
      return [
        { name: '一兰拉面', address: '新宿区歌舞伎町', rating: 4.5, duration: 45 },
        { name: '筑地寿司清', address: '中央区筑地', rating: 4.8, duration: 60 },
        { name: '矶丸水产', address: '�的谷区道玄坂', rating: 4.3, duration: 90 },
      ];
    }

    return [
      { name: '浅草寺', address: '台东区浅草', rating: 4.7, duration: 120 },
      { name: '东京塔', address: '港区芝公园', rating: 4.5, duration: 90 },
      { name: '明治神宫', address: '涩谷区代代木', rating: 4.6, duration: 90 },
    ];
  }

  // ==================== 辅助方法 ====================

  /**
   * 加载或创建会话（V2: 支持 StateStore 持久化）
   */
  private async loadOrCreateSession(request: TripPlannerRequest): Promise<TripPlannerState> {
    const sessionId = request.sessionId || `planner_${request.tripId}_${randomUUID().substring(0, 8)}`;
    
    // 1. 先检查内存缓存
    let state = this.sessionCache.get(sessionId);
    if (state) {
      return state;
    }
    
    // 2. 尝试从 StateStore 加载
    if (this.stateStore) {
      const stored = await this.stateStore.get<TripPlannerState>(sessionId, 'TripPlannerSession');
      if (stored) {
        state = stored.data;
        this.sessionCache.set(sessionId, state);
        this.logger.debug(`[规划助手] 从 StateStore 恢复会话: ${sessionId}`);
        return state;
      }
    }
    
    // 3. 创建新会话
    const tripContext = await this.loadTripContext(request.tripId);
    
    state = {
      sessionId,
      tripId: request.tripId,
      userId: request.userId,
      phase: 'OVERVIEW',
      tripContext,
      messages: [],
      pendingChanges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // 4. 持久化到 StateStore
    if (this.stateStore) {
      await this.stateStore.create(
        sessionId,
        'TripPlannerSession',
        state,
        'TripPlannerService',
        `session_${sessionId}`,
      );
      this.logger.debug(`[规划助手] 新会话已持久化: ${sessionId}`);
    }
    
    this.sessionCache.set(sessionId, state);
    return state;
  }

  /**
   * 保存会话（V2: 支持 StateStore 持久化和变更追踪）
   */
  private async saveSession(state: TripPlannerState): Promise<void> {
    // 更新内存缓存
    this.sessionCache.set(state.sessionId, state);
    
    // 持久化到 StateStore（带变更追踪）
    if (this.stateStore) {
      const currentVersion = await this.stateStore.getVersion(state.sessionId, 'TripPlannerSession');
      
      if (currentVersion !== null) {
        // 更新现有会话
        await this.stateStore.update(
          state.sessionId,
          'TripPlannerSession',
          [{ op: 'replace', path: '/', value: state }],
          currentVersion,
          'TripPlannerService',
          `session_${state.sessionId}`,
          { action: 'update', reason: 'Session updated' },
        );
      } else {
        // 创建新会话
        await this.stateStore.create(
          state.sessionId,
          'TripPlannerSession',
          state,
          'TripPlannerService',
          `session_${state.sessionId}`,
        );
      }
    }
  }

  /**
   * 添加待确认的修改
   */
  private addPendingChange(state: TripPlannerState, change: PendingChange): void {
    if (!state.pendingChanges) {
      state.pendingChanges = [];
    }
    state.pendingChanges.push(change);
  }

  /**
   * 回滚到上一个检查点
   */
  async rollbackToCheckpoint(sessionId: string, checkpointId?: string): Promise<{ success: boolean; message: string }> {
    if (!this.stateStore) {
      return { success: false, message: 'StateStore 未配置，无法回滚' };
    }

    const checkpoints = await this.stateStore.getCheckpoints(sessionId, 'TripPlannerSession');
    
    if (checkpoints.length === 0) {
      return { success: false, message: '没有可用的检查点' };
    }

    const targetCheckpoint = checkpointId 
      ? checkpoints.find(cp => cp.checkpointId === checkpointId)
      : checkpoints[checkpoints.length - 1];

    if (!targetCheckpoint) {
      return { success: false, message: '指定的检查点不存在' };
    }

    const result = await this.stateStore.rollbackToCheckpoint(
      sessionId,
      'TripPlannerSession',
      targetCheckpoint.checkpointId,
      'TripPlannerService',
      `rollback_${sessionId}`,
    );

    if (result.success) {
      // 更新内存缓存
      const stored = await this.stateStore.get<TripPlannerState>(sessionId, 'TripPlannerSession');
      if (stored) {
        this.sessionCache.set(sessionId, stored.data);
      }
      return { success: true, message: `已回滚到版本 ${result.rolledBackTo}` };
    }

    return { success: false, message: result.error || '回滚失败' };
  }

  /**
   * 创建检查点
   */
  async createCheckpoint(sessionId: string, reason: string): Promise<string | null> {
    if (!this.stateStore) {
      return null;
    }

    const checkpoint = await this.stateStore.createCheckpoint(
      sessionId,
      'TripPlannerSession',
      'TripPlannerService',
      reason,
    );
    
    return checkpoint?.checkpointId || null;
  }

  // ==================== 应用建议 ====================

  /**
   * 应用 AI 建议到行程
   */
  async applySuggestion(
    dto: {
      tripId: string;
      sessionId: string;
      suggestionId: string;
      targetDay: number;
      timeSlot?: { start: string; end: string };
      suggestionType: 'add_place' | 'modify_time' | 'add_meal' | 'optimize_route';
      place?: {
        name: string;
        nameCN?: string;
        placeId?: number;
        category?: string;
        address?: string;
      };
    },
    userId: string,
  ): Promise<{
    message: string;
    item?: {
      id: string;
      tripDayId: string;
      startTime: string;
      endTime: string;
      type: string;
      placeId?: number;
    };
    tripUpdate?: {
      totalChanges: number;
      addedItems: number;
      removedItems: number;
      modifiedItems: number;
      affectedDays: number[];
    };
    followUpSuggestions?: string[];
  }> {
    this.logger.debug(`[应用建议] tripId=${dto.tripId}, type=${dto.suggestionType}, day=${dto.targetDay}`);

    // 1. 验证会话存在
    const state = this.sessionCache.get(dto.sessionId);
    if (!state) {
      throw new Error('会话不存在或已过期');
    }

    // 2. 验证目标天数
    const tripContext = state.tripContext;
    if (dto.targetDay < 1 || dto.targetDay > tripContext.days.length) {
      throw new Error(`目标天数无效: ${dto.targetDay}，行程共 ${tripContext.days.length} 天`);
    }

    const targetDayContext = tripContext.days[dto.targetDay - 1];

    // 3. 处理不同类型的建议
    switch (dto.suggestionType) {
      case 'add_place':
      case 'add_meal':
        return this.applyAddPlaceSuggestion(dto, targetDayContext, tripContext, state);

      case 'modify_time':
        return this.applyModifyTimeSuggestion(dto, targetDayContext, tripContext, state);

      case 'optimize_route':
        return this.applyOptimizeRouteSuggestion(dto, tripContext, state);

      default:
        throw new Error(`不支持的建议类型: ${dto.suggestionType}`);
    }
  }

  /**
   * 应用添加地点建议
   */
  private async applyAddPlaceSuggestion(
    dto: any,
    targetDay: TripDayContext,
    tripContext: TripContext,
    state: TripPlannerState,
  ): Promise<any> {
    if (!dto.place) {
      throw new Error('add_place/add_meal 类型需要提供 place 信息');
    }

    // 计算时间段
    let startTime: string;
    let endTime: string;

    if (dto.timeSlot) {
      startTime = dto.timeSlot.start;
      endTime = dto.timeSlot.end;
    } else {
      // 自动找空闲时段
      const freeSlot = this.findFreeSlot(targetDay, 60); // 默认1小时
      if (!freeSlot) {
        throw new Error(`第${dto.targetDay}天没有空闲时段`);
      }
      startTime = freeSlot.start;
      endTime = freeSlot.end;
    }

    // 检查时间冲突
    const hasConflict = targetDay.items.some(item => {
      if (!item.startTime) return false;
      const itemStart = this.parseTimeToMinutes(item.startTime);
      const itemEnd = item.endTime 
        ? this.parseTimeToMinutes(item.endTime)
        : itemStart + (item.duration || 60);
      const newStart = this.parseTimeToMinutes(startTime);
      const newEnd = this.parseTimeToMinutes(endTime);
      return !(newEnd <= itemStart || newStart >= itemEnd);
    });

    if (hasConflict) {
      throw new Error(`时间段 ${startTime}-${endTime} 与现有行程冲突`);
    }

    // 创建新行程项
    const newItemId = `item_${randomUUID().substring(0, 8)}`;
    // 内部类型映射
    const itemType = dto.suggestionType === 'add_meal' ? 'RESTAURANT' : 'POI';
    // Prisma 数据库类型映射
    const dbItemType = dto.suggestionType === 'add_meal' ? 'MEAL_ANCHOR' : 'ACTIVITY';

    // 如果有数据库连接，持久化
    if (this.prisma && targetDay.dayId) {
      try {
        const dayDate = new Date(targetDay.date);
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        
        const startDateTime = new Date(dayDate);
        startDateTime.setHours(startHour, startMin, 0, 0);
        
        const endDateTime = new Date(dayDate);
        endDateTime.setHours(endHour, endMin, 0, 0);

        await this.prisma.itineraryItem.create({
          data: {
            id: newItemId,
            tripDayId: targetDay.dayId,
            type: dbItemType as any, // Prisma ItemType
            startTime: startDateTime,
            endTime: endDateTime,
            placeId: dto.place.placeId || null,
            note: dto.place.address || null,
          },
        });
      } catch (error: any) {
        this.logger.error(`[应用建议] 数据库保存失败: ${error.message}`);
        // 继续执行，至少更新内存状态
      }
    }

    // 更新内存状态
    targetDay.items.push({
      itemId: newItemId,
      type: itemType as TripItemContext['type'],
      name: dto.place.nameCN || dto.place.name,
      startTime,
      endTime,
      duration: this.parseTimeToMinutes(endTime) - this.parseTimeToMinutes(startTime),
      poiId: dto.place.placeId?.toString(),
      address: dto.place.address,
    });

    // 记录消息
    this.addMessage(state, {
      id: randomUUID(),
      role: 'system',
      content: `用户应用了建议：添加「${dto.place.name}」到第${dto.targetDay}天 ${startTime}-${endTime}`,
      timestamp: new Date().toISOString(),
    });

    await this.saveSession(state);

    // 生成后续建议
    const followUpSuggestions: string[] = [];
    
    // 检查是否需要交通规划
    const prevItem = targetDay.items
      .filter(i => i.startTime && this.parseTimeToMinutes(i.startTime) < this.parseTimeToMinutes(startTime))
      .sort((a, b) => this.parseTimeToMinutes(b.startTime!) - this.parseTimeToMinutes(a.startTime!))[0];
    
    if (prevItem) {
      const prevItemName = this.getItemName(prevItem);
      const placeName = dto.place.name || dto.place.nameCN || '目的地';
      followUpSuggestions.push(`需要我帮您规划从${prevItemName}到${placeName}的交通吗？`);
    }

    // 检查后续空闲
    const nextItem = targetDay.items
      .filter(i => i.startTime && this.parseTimeToMinutes(i.startTime) > this.parseTimeToMinutes(endTime))
      .sort((a, b) => this.parseTimeToMinutes(a.startTime!) - this.parseTimeToMinutes(b.startTime!))[0];
    
    if (nextItem) {
      const nextItemName = this.getItemName(nextItem);
      followUpSuggestions.push(`${endTime}之后要去${nextItemName}，需要我检查时间安排吗？`);
    }

    return {
      message: `已将「${dto.place.name}」添加到第${dto.targetDay}天 ${startTime}-${endTime}`,
      item: {
        id: newItemId,
        tripDayId: targetDay.dayId || `day_${dto.targetDay}`,
        startTime: `${targetDay.date}T${startTime}:00.000Z`,
        endTime: `${targetDay.date}T${endTime}:00.000Z`,
        type: itemType === 'RESTAURANT' ? 'MEAL_ANCHOR' : 'ACTIVITY',
        placeId: dto.place.placeId,
      },
      tripUpdate: {
        totalChanges: 1,
        addedItems: 1,
        removedItems: 0,
        modifiedItems: 0,
        affectedDays: [dto.targetDay],
      },
      followUpSuggestions,
    };
  }

  /**
   * 应用修改时间建议
   */
  private async applyModifyTimeSuggestion(
    dto: any,
    targetDay: TripDayContext,
    tripContext: TripContext,
    state: TripPlannerState,
  ): Promise<any> {
    // TODO: 实现修改时间逻辑
    return {
      message: '时间修改功能即将推出',
      tripUpdate: {
        totalChanges: 0,
        addedItems: 0,
        removedItems: 0,
        modifiedItems: 0,
        affectedDays: [],
      },
    };
  }

  /**
   * 应用优化路线建议
   */
  private async applyOptimizeRouteSuggestion(
    dto: any,
    tripContext: TripContext,
    state: TripPlannerState,
  ): Promise<any> {
    // TODO: 实现优化路线逻辑
    return {
      message: '路线优化功能即将推出',
      tripUpdate: {
        totalChanges: 0,
        addedItems: 0,
        removedItems: 0,
        modifiedItems: 0,
        affectedDays: [],
      },
    };
  }

  /**
   * 查找空闲时段
   */
  private findFreeSlot(day: TripDayContext, durationMinutes: number): { start: string; end: string } | null {
    // 按时间排序现有项目
    const sortedItems = day.items
      .filter(item => item.startTime)
      .sort((a, b) => this.parseTimeToMinutes(a.startTime!) - this.parseTimeToMinutes(b.startTime!));

    // 从早上9点开始找
    let currentTime = 9 * 60; // 9:00
    const endOfDay = 21 * 60; // 21:00

    for (const item of sortedItems) {
      const itemStart = this.parseTimeToMinutes(item.startTime!);
      const itemEnd = item.endTime 
        ? this.parseTimeToMinutes(item.endTime)
        : itemStart + (item.duration || 60);

      // 检查当前时间到下一个项目之间是否有足够空闲
      if (itemStart - currentTime >= durationMinutes) {
        return {
          start: this.formatMinutesToTime(currentTime),
          end: this.formatMinutesToTime(currentTime + durationMinutes),
        };
      }

      currentTime = Math.max(currentTime, itemEnd);
    }

    // 检查最后一个项目之后到晚上
    if (endOfDay - currentTime >= durationMinutes) {
      return {
        start: this.formatMinutesToTime(currentTime),
        end: this.formatMinutesToTime(currentTime + durationMinutes),
      };
    }

    return null;
  }

  /**
   * 标准化时间字段（将各种格式转为 HH:mm 字符串）
   */
  private normalizeTimeField(time: any): string | undefined {
    if (!time) return undefined;
    
    if (typeof time === 'string') {
      // 已经是字符串格式
      if (time.includes('T')) {
        // ISO 格式：2026-01-10T09:00:00.000Z
        const d = new Date(time);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
      return time; // 假设已经是 HH:mm 格式
    }
    
    if (time instanceof Date) {
      return `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    }
    
    if (typeof time === 'number') {
      // 可能是分钟数
      const h = Math.floor(time / 60);
      const m = time % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    
    return undefined;
  }

  /**
   * 解析时间字符串为分钟数
   */
  private parseTimeToMinutes(time: string | Date | number): number {
    if (typeof time === 'number') return time;
    if (time instanceof Date) return time.getHours() * 60 + time.getMinutes();
    if (typeof time === 'string') {
      if (time.includes('T')) {
        const d = new Date(time);
        return d.getHours() * 60 + d.getMinutes();
      }
      const [h, m] = time.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    }
    return 0;
  }

  /**
   * 格式化分钟数为时间字符串
   */
  private formatMinutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /**
   * 计算两点之间的距离（Haversine 公式）
   * @returns 距离，单位：公里
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // 地球半径，单位：公里
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 角度转弧度
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 添加消息
   */
  private addMessage(state: TripPlannerState, message: TripPlannerMessage): void {
    state.messages.push(message);
    
    // 限制消息历史长度
    if (state.messages.length > 50) {
      state.messages = state.messages.slice(-50);
    }
  }

  /**
   * 加载行程上下文
   */
  private async loadTripContext(tripId: string): Promise<TripContext> {
    if (!this.prisma) {
      // 返回模拟数据
      return this.getMockTripContext(tripId);
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      // 测试模式：使用 mock 数据
      this.logger.warn(`[规划助手] 行程不存在: ${tripId}，使用模拟数据`);
      return this.getMockTripContext(tripId);
    }

    // 转换为 TripContext 格式
    const budgetConfig = trip.budgetConfig as any || {};
    const pacingConfig = trip.pacingConfig as any || {};
    const metadata = trip.metadata as any || {};

    const days: TripDayContext[] = (trip.TripDay || []).map((day: any, index: number) => {
      const items = day.ItineraryItem || [];
      return {
        dayId: day.id,
        dayNumber: index + 1,
        date: day.date.toISOString().split('T')[0],
        theme: day.theme,
        city: day.city,
        items: items.map((item: any) => {
          // 兼容多种字段名，确保名称不为空
          const name = item.title || item.name || item.placeName || item.place?.name || item.activity?.name || '';
          const itemId = item.id || '';
          
          // 如果名称仍然为空，使用 itemId 作为后备
          const finalName = name && name.trim() !== '' 
            ? name 
            : (itemId ? `活动 ${itemId.slice(-6)}` : '活动（名称缺失）');
          
          return {
            itemId,
            type: item.type || 'ACTIVITY',
            name: finalName,
            nameCN: item.nameCN || item.title_cn || item.placeName_cn,
          startTime: this.normalizeTimeField(item.startTime),
          endTime: this.normalizeTimeField(item.endTime),
          duration: item.duration,
          cost: item.cost,
          address: item.address || item.location?.address || item.place?.address,
          notes: item.notes,
            poiId: item.poiId || item.placeId,
            cityName: item.cityName || item.city || item.place?.city,
            location: item.location || item.place?.location,
          };
        }),
        stats: {
          itemCount: items.length,
          totalDuration: items.reduce((sum: number, item: any) => sum + (item.duration || 0), 0),
          totalCost: items.reduce((sum: number, item: any) => sum + (item.cost || 0), 0),
          freeTime: 0, // 需要计算
          travelTime: 0, // 需要计算
        },
      };
    });

    // 计算完成度
    const totalItems = days.reduce((sum, d) => sum + d.stats.itemCount, 0);
    const expectedItems = days.length * 4; // 假设每天 4 个活动为完整
    const completeness = Math.min(100, Math.round((totalItems / expectedItems) * 100));

    return {
      tripId,
      destination: trip.destination,
      destinationName: this.getDestinationName(trip.destination),
      startDate: trip.startDate.toISOString().split('T')[0],
      endDate: trip.endDate.toISOString().split('T')[0],
      durationDays: days.length,
      totalBudget: budgetConfig.totalBudget || 0,
      remainingBudget: budgetConfig.remaining_for_ground,
      travelers: {
        adults: budgetConfig.travelers?.filter((t: any) => t.type === 'ADULT').length || 1,
        children: budgetConfig.travelers?.filter((t: any) => t.type === 'CHILD').length || 0,
        elderly: budgetConfig.travelers?.filter((t: any) => t.type === 'ELDERLY').length || 0,
      },
      pacingConfig: {
        level: pacingConfig.level || 'STANDARD',
        maxDailyActivities: pacingConfig.maxDailyActivities || 5,
      },
      days,
      preferences: metadata.preferences,
      status: trip.status,
      completeness,
    };
  }

  /**
   * 获取目的地名称
   */
  private getDestinationName(code: string): string {
    const names: Record<string, string> = {
      JP: '日本',
      TH: '泰国',
      IS: '冰岛',
      SG: '新加坡',
      KR: '韩国',
      MY: '马来西亚',
      VN: '越南',
      FR: '法国',
      IT: '意大利',
      ES: '西班牙',
      DE: '德国',
      GB: '英国',
      CH: '瑞士',
      US: '美国',
      AU: '澳大利亚',
    };
    return names[code] || code;
  }

  /**
   * 生成概览消息
   */
  private async generateOverviewMessage(ctx: TripContext): Promise<string> {
    return `📍 **${ctx.destinationName || ctx.destination} ${ctx.durationDays}天行程概览**

📅 日期：${ctx.startDate} ~ ${ctx.endDate}
👥 旅行者：${ctx.travelers.adults}大${ctx.travelers.children > 0 ? ctx.travelers.children + '小' : ''}${ctx.travelers.elderly > 0 ? ctx.travelers.elderly + '老' : ''}
💰 预算：¥${ctx.totalBudget.toLocaleString()}
📊 完成度：${ctx.completeness}%

${ctx.days.map(d => `**第${d.dayNumber}天** (${d.date})${d.theme ? ` - ${d.theme}` : ''}\n  ${d.items.length > 0 ? d.items.map(i => `• ${i.name}`).join('\n  ') : '暂无安排'}`).join('\n\n')}`;
  }

  /**
   * 检测行程问题
   */
  private detectTripIssues(ctx: TripContext): string[] {
    const issues: string[] = [];
    
    ctx.days.forEach(day => {
      if (day.stats.itemCount === 0) {
        issues.push(`第${day.dayNumber}天没有任何安排`);
      }
      if (day.stats.totalDuration > 12 * 60) {
        issues.push(`第${day.dayNumber}天安排超过12小时，可能太紧凑`);
      }
    });

    if (ctx.completeness < 50) {
      issues.push('行程整体完成度较低，建议添加更多活动');
    }

    return issues;
  }

  /**
   * 生成时间线数据
   */
  private generateTimelineData(ctx: TripContext): any {
    return ctx.days.map(day => ({
      day: day.dayNumber,
      date: day.date,
      theme: day.theme,
      items: day.items.map(item => ({
        time: item.startTime,
        name: this.getItemName(item), // 确保使用 getItemName
        type: item.type,
        duration: item.duration,
      })),
    }));
  }

  /**
   * 生成路线优化建议（集成 RouteOptimizationService）
   */
  private async generateRouteSuggestion(ctx: TripContext, message: string): Promise<string> {
    // 🆕 使用 RouteOptimizationService 进行专业优化
    if (this.routeOptimization) {
      try {
        const evidence = await this.routeOptimization.optimizeRoute(ctx, {
          trip_id: ctx.tripId,
          generate_alternatives: true,
          max_alternatives: 5,
        });
        return this.formatRouteOptimizationResult(evidence, ctx);
      } catch (error) {
        this.logger.warn(`[路线优化] RouteOptimizationService 调用失败，回退到简化版: ${error}`);
      }
    }

    // 回退到简化版逻辑
    return this.generateRouteSuggestionSimple(ctx, message);
  }

  /**
   * 格式化路线优化结果（结构化证据）
   */
  private formatRouteOptimizationResult(evidence: RouteOptimizationEvidence, ctx: TripContext): string {
    let result = `📍 **路线优化分析报告**\n\n`;

    // 1. 结论
    if (evidence.conclusion.route_approved) {
      result += `✅ **可执行性评分: ${evidence.conclusion.executability_score}/100**\n\n`;
      result += `您的行程安排整体可执行！\n\n`;
    } else {
      result += `⚠️ **可执行性评分: ${evidence.conclusion.executability_score}/100**\n\n`;
      result += `行程存在以下问题需要解决：\n\n`;
    }

    // 2. 硬门控问题（严重）
    const failedGates = evidence.hard_gates.filter(g => g.result === 'FAIL');
    const warningGates = evidence.hard_gates.filter(g => g.result === 'PASS' && g.severity === 'WARNING');

    if (failedGates.length > 0) {
      result += `**🚨 必须解决的问题**：\n`;
      failedGates.forEach((gate, i) => {
        result += `${i + 1}. ${gate.detail}\n`;
        if (gate.suggestion) {
          result += `   → ${gate.suggestion}\n`;
        }
      });
      result += '\n';
    }

    if (warningGates.length > 0) {
      result += `**⚠️ 建议关注的问题**：\n`;
      warningGates.slice(0, 3).forEach((gate, i) => {
        result += `${i + 1}. ${gate.detail}\n`;
      });
      if (warningGates.length > 3) {
        result += `   ...还有 ${warningGates.length - 3} 个警告\n`;
      }
      result += '\n';
    }

    // 3. 软评分
    result += `**📊 综合评分**：\n`;
    result += `• 疲劳度: ${evidence.soft_scores.fatigue.score}/100 ${evidence.soft_scores.fatigue.exceeded ? '❌ 偏高' : '✅'}\n`;
    result += `• 节奏: ${evidence.soft_scores.pace.score}/100 ${evidence.soft_scores.pace.exceeded ? '❌ 需调整' : '✅'}\n`;
    result += `• 体验: ${evidence.soft_scores.experience.score}/100\n`;
    result += `• 综合: **${evidence.soft_scores.overall}/100**\n\n`;

    // 4. 关键特征
    if (evidence.key_features.cross_city_segments && evidence.key_features.cross_city_segments.length > 0) {
      result += `**🌍 跨城市行程**：\n`;
      evidence.key_features.cross_city_segments.forEach(seg => {
        result += `• 第${seg.day}天: ${seg.from_city} → ${seg.to_city} (${seg.distance_km}km, 约${Math.round(seg.estimated_travel_minutes / 60)}小时)\n`;
      });
      result += '\n';
    }

    // 🆕 4.1 夜间段检测
    if (evidence.key_features.night_segments && evidence.key_features.night_segments.length > 0) {
      result += `**🌙 夜间活动提醒**：\n`;
      evidence.key_features.night_segments.forEach(seg => {
        const riskIcon = seg.risk_level === 'HIGH' ? '🔴' : seg.risk_level === 'MEDIUM' ? '🟡' : '🟢';
        result += `• ${riskIcon} 第${seg.day}天: ${seg.description || '夜间活动'}\n`;
      });
      result += '\n';
    }

    // 🆕 4.2 无救援段检测
    if (evidence.key_features.no_rescue_segments && evidence.key_features.no_rescue_segments.length > 0) {
      result += `**⚠️ 偏远区域提醒**：\n`;
      evidence.key_features.no_rescue_segments.forEach(seg => {
        const riskIcon = seg.risk_level === 'HIGH' ? '🔴' : seg.risk_level === 'MEDIUM' ? '🟡' : '🟢';
        result += `• ${riskIcon} 第${seg.day}天: ${seg.description || `距离城市中心 ${seg.distance_km}km`}\n`;
      });
      result += '\n';
    }

    // 🆕 4.3 候选路线（如果生成）
    if (evidence.candidate_routes && evidence.candidate_routes.routes.length > 0) {
      result += `**🔄 候选路线方案**：\n`;
      evidence.candidate_routes.routes.slice(0, 3).forEach((route, i) => {
        const strategyNames: Record<string, string> = {
          'COMPACT': '紧凑型',
          'BALANCED': '均衡型',
          'RELAXED': '松弛型',
        };
        const strategyName = strategyNames[route.strategy] || route.strategy;
        const isBest = route.id === evidence.candidate_routes?.best_route_id;
        result += `${i + 1}. ${isBest ? '⭐ ' : ''}${strategyName}: ${route.description} (评分: ${route.score}/100)\n`;
      });
      result += '\n';
    }

    // 5. 替代方案
    if (evidence.alternatives.length > 0) {
      result += `**💡 建议操作**：\n`;
      evidence.alternatives.slice(0, 3).forEach((alt, i) => {
        const icon = alt.strategy === 'REMOVE_POI' ? '🗑️' : 
                     alt.strategy === 'ADJUST_TIME' ? '⏰' :
                     alt.strategy === 'CHANGE_DAY' ? '📅' : '🔧';
        result += `${i + 1}. ${icon} ${alt.description}\n`;
      });
      result += '\n';
    }

    // 6. 下一步
    if (evidence.next_steps.length > 0) {
      const mainStep = evidence.next_steps[0];
      if (mainStep.action === 'AUTO_FIX') {
        result += `需要我帮您**自动修复**这些问题吗？`;
      } else if (mainStep.action === 'APPLY') {
        result += `您的行程已经很完善，可以放心出发！`;
      } else {
        result += mainStep.message;
      }
    }

    return result;
  }

  /**
   * 简化版路线优化（回退方案）
   */
  private async generateRouteSuggestionSimple(ctx: TripContext, message: string): Promise<string> {
    const allSolutions: string[] = [];
    const allIssues: string[] = [];
    let totalTimeSaved = 0;

    // 分析每一天的行程
    for (const day of ctx.days) {
      const dayAnalysis = this.analyzeDayRoute(day, ctx);
      
      // 为每天的问题加上天数前缀（如果还没有）
      for (const issue of dayAnalysis.issues) {
        if (!issue.includes(`第${day.dayNumber}天`)) {
          allIssues.push(`第${day.dayNumber}天: ${issue}`);
        } else {
          allIssues.push(issue);
        }
      }
      
      allSolutions.push(...dayAnalysis.suggestions);
      totalTimeSaved += dayAnalysis.potentialTimeSaved;
    }

    // 如果没有发现问题，给出正面反馈
    if (allIssues.length === 0) {
      return `📍 **路线分析结果**

✅ 您的行程安排看起来已经很合理了！

**当前行程概览**：
${ctx.days.map(d => `- 第${d.dayNumber}天（${d.theme || d.city || d.date}）：${d.items.length} 个活动`).join('\n')}

如果您想进一步优化，可以告诉我具体想调整哪一天。`;
    }

    // 生成优化建议（问题 + 解决方案一起展示）
    let result = `📍 **路线优化建议**\n\n`;

    // 按天分组展示问题和解决方案
    result += `**🔍 发现以下问题**：\n`;
    allIssues.slice(0, 6).forEach((issue, i) => {
      result += `${i + 1}. ${issue}\n`;
    });
    
    if (allIssues.length > 6) {
      result += `   ...还有 ${allIssues.length - 6} 个问题\n`;
    }

    if (allSolutions.length > 0) {
      result += `\n**✅ 解决方案**：\n`;
      // 去重解决方案
      const uniqueSolutions = [...new Set(allSolutions)];
      uniqueSolutions.slice(0, 5).forEach((solution) => {
        result += `${solution}\n`;
      });
    }

    if (totalTimeSaved > 0) {
      result += `\n预计优化后可节省约 **${totalTimeSaved} 分钟** 交通时间。`;
    }

    result += `\n\n需要我帮您**自动修复**这些问题吗？`;

    return result;
  }

  /**
   * 分析单日路线
   */
  private analyzeDayRoute(day: TripDayContext, ctx: TripContext): {
    issues: string[];
    suggestions: string[];
    potentialTimeSaved: number;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let potentialTimeSaved = 0;

    // 获取有时间的行程项（不要求必须有位置）
    const itemsWithTime = day.items.filter(item => item.startTime).sort((a, b) => {
      const timeA = this.parseTimeToMinutes(a.startTime!);
      const timeB = this.parseTimeToMinutes(b.startTime!);
      return timeA - timeB;
    });

    // 1. 🆕 检测时间冲突（最重要！）
    const timeConflictResult = this.detectTimeConflicts(itemsWithTime, day.dayNumber);
    issues.push(...timeConflictResult.issues);
    suggestions.push(...timeConflictResult.solutions);

    // 2. 🆕 检测地理位置不合理（同一天跨城市）
    const geoResult = this.detectGeographicIssues(day, ctx);
    issues.push(...geoResult.issues);
    suggestions.push(...geoResult.solutions);

    // 获取有位置数据的项目（用于距离分析）
    const itemsWithLocation = itemsWithTime.filter(item => item.location);

    if (itemsWithLocation.length < 2) {
      // 即使没有位置数据，也返回已检测到的问题
      return { issues, suggestions, potentialTimeSaved };
    }

    // 1. 检查相邻地点之间的距离
    for (let i = 0; i < itemsWithLocation.length - 1; i++) {
      const current = itemsWithLocation[i];
      const next = itemsWithLocation[i + 1];

      if (current.location && next.location) {
        const distance = this.calculateDistance(
          current.location.lat, current.location.lng,
          next.location.lat, next.location.lng
        );

        // 检查是否有更优的顺序
        if (i < itemsWithLocation.length - 2) {
          const nextNext = itemsWithLocation[i + 2];
          if (nextNext.location) {
            const altDistance1 = this.calculateDistance(
              current.location.lat, current.location.lng,
              nextNext.location.lat, nextNext.location.lng
            );
            const altDistance2 = this.calculateDistance(
              next.location.lat, next.location.lng,
              nextNext.location.lat, nextNext.location.lng
            );

            // 如果交换顺序能减少总距离
            if (altDistance1 + altDistance2 < distance * 1.5) {
              // 可能有优化空间
            }
          }
        }

        // 距离过远的警告
        if (distance > 50) {
          issues.push(`第${day.dayNumber}天「${current.name}」→「${next.name}」距离约 ${Math.round(distance)}km，需要较长交通时间`);
        }

        // 检查时间间隔是否足够
        const currentEndTime = current.endTime 
          ? this.parseTimeToMinutes(current.endTime)
          : this.parseTimeToMinutes(current.startTime!) + (current.duration || 60);
        const nextStartTime = this.parseTimeToMinutes(next.startTime!);
        const gap = nextStartTime - currentEndTime;
        
        // 估算需要的交通时间（简化：每10km约需15分钟）
        const estimatedTravelTime = Math.max(15, distance * 1.5);
        
        if (gap < estimatedTravelTime && distance > 5) {
          issues.push(`第${day.dayNumber}天「${current.name}」到「${next.name}」时间间隔（${gap}分钟）可能不足以完成 ${Math.round(distance)}km 的交通`);
          suggestions.push(`建议将「${next.name}」开始时间推迟 ${Math.round(estimatedTravelTime - gap)} 分钟`);
        }
      }
    }

    // 2. 检查活动密度
    const totalDuration = day.items.reduce((sum, item) => sum + (item.duration || 60), 0);
    if (totalDuration > 600) { // 超过10小时
      issues.push(`第${day.dayNumber}天活动总时长约 ${Math.round(totalDuration / 60)} 小时，可能过于紧凑`);
      suggestions.push(`建议移除或缩短部分活动，预留足够的休息和用餐时间`);
    }

    // 3. 检查是否有回头路
    if (itemsWithLocation.length >= 3) {
      for (let i = 0; i < itemsWithLocation.length - 2; i++) {
        const a = itemsWithLocation[i];
        const b = itemsWithLocation[i + 1];
        const c = itemsWithLocation[i + 2];

        if (a.location && b.location && c.location) {
          const ab = this.calculateDistance(a.location.lat, a.location.lng, b.location.lat, b.location.lng);
          const bc = this.calculateDistance(b.location.lat, b.location.lng, c.location.lat, c.location.lng);
          const ac = this.calculateDistance(a.location.lat, a.location.lng, c.location.lat, c.location.lng);

          // 如果 A→C 比 A→B→C 短很多，可能存在绕路
          if (ac < (ab + bc) * 0.6 && ab > 5 && bc > 5) {
            suggestions.push(`第${day.dayNumber}天：建议调整「${a.name}」→「${b.name}」→「${c.name}」的顺序，可能存在绕路`);
            potentialTimeSaved += Math.round((ab + bc - ac) * 1.5); // 估算节省时间
          }
        }
      }
    }

    // 4. 生成具体的行程概览
    if (issues.length === 0 && day.items.length > 0) {
      const itemNames = day.items.slice(0, 5).map(i => i.name).join(' → ');
      suggestions.push(`第${day.dayNumber}天路线：${itemNames}${day.items.length > 5 ? ' ...' : ''}`);
    }

    return { issues, suggestions, potentialTimeSaved };
  }

  /**
   * 检测时间冲突
   */
  /**
   * 获取行程项名称（兼容多种字段名，确保不为空）
   */
  private getItemName(item: any): string {
    // 尝试多个字段
    const name = item.name || item.placeName || item.title || item.nameCN || item.place?.name || '';
    
    // 如果名称仍然为空，使用 itemId 作为后备
    if (!name || name.trim() === '') {
      const itemId = item.itemId || item.id || '';
      if (itemId) {
        return `活动 ${itemId.slice(-6)}`; // 使用 itemId 后6位
      }
      return '活动（名称缺失）'; // 与前端容错处理保持一致
    }
    
    return name;
  }

  private detectTimeConflicts(items: TripItemContext[], dayNumber: number): {
    issues: string[];
    solutions: string[];
  } {
    const issues: string[] = [];
    const solutions: string[] = [];
    const conflictPairs: Array<{ itemA: any; itemB: any; overlapMinutes: number; startA: number; endA: number; startB: number; endB: number }> = [];

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const itemA = items[i];
        const itemB = items[j];

        const startA = this.parseTimeToMinutes(itemA.startTime!);
        const endA = itemA.endTime 
          ? this.parseTimeToMinutes(itemA.endTime)
          : startA + (itemA.duration || 60);
        
        const startB = this.parseTimeToMinutes(itemB.startTime!);
        const endB = itemB.endTime 
          ? this.parseTimeToMinutes(itemB.endTime)
          : startB + (itemB.duration || 60);

        // 检查是否有重叠
        if (!(endA <= startB || endB <= startA)) {
          const overlapStart = Math.max(startA, startB);
          const overlapEnd = Math.min(endA, endB);
          const overlapMinutes = overlapEnd - overlapStart;

          if (overlapMinutes > 0) {
            const nameA = this.getItemName(itemA);
            const nameB = this.getItemName(itemB);
            
            issues.push(
              `⚠️ 「${nameA}」(${this.formatMinutesToTime(startA)}-${this.formatMinutesToTime(endA)}) 与「${nameB}」(${this.formatMinutesToTime(startB)}-${this.formatMinutesToTime(endB)}) 重叠 ${overlapMinutes} 分钟`
            );
            
            conflictPairs.push({ itemA, itemB, overlapMinutes, startA, endA, startB, endB });
          }
        }
      }
    }

    // 生成解决方案
    if (conflictPairs.length > 0) {
      // 按时间排序所有冲突项
      const allConflictItems = new Set<any>();
      conflictPairs.forEach(({ itemA, itemB }) => {
        allConflictItems.add(itemA);
        allConflictItems.add(itemB);
      });

      const sortedItems = Array.from(allConflictItems).sort((a, b) => {
        const startA = this.parseTimeToMinutes(a.startTime!);
        const startB = this.parseTimeToMinutes(b.startTime!);
        return startA - startB;
      });

      // 生成重新排列建议
      let currentTime = this.parseTimeToMinutes(sortedItems[0].startTime!);
      const suggestedSchedule: string[] = [];
      
      for (const item of sortedItems) {
        const duration = item.duration || 60;
        const name = this.getItemName(item);
        const newStart = this.formatMinutesToTime(currentTime);
        const newEnd = this.formatMinutesToTime(currentTime + duration);
        suggestedSchedule.push(`  • ${name}: ${newStart}-${newEnd}`);
        currentTime += duration + 30; // 30分钟缓冲时间
      }

      solutions.push(`💡 **建议重新安排时间**：\n${suggestedSchedule.join('\n')}`);
      
      // 如果冲突项太多，建议移除或分天
      if (conflictPairs.length >= 3) {
        solutions.push(`💡 **或者**：将部分活动移到其他天，当天活动安排过密`);
      }
    }

    return { issues, solutions };
  }

  /**
   * 检测地理位置问题
   */
  /**
   * 主要城市坐标（用于计算城市间距离）
   */
  private readonly CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
    '北京': { lat: 39.9042, lng: 116.4074 },
    '上海': { lat: 31.2304, lng: 121.4737 },
    '广州': { lat: 23.1291, lng: 113.2644 },
    '深圳': { lat: 22.5431, lng: 114.0579 },
    '杭州': { lat: 30.2741, lng: 120.1551 },
    '南京': { lat: 32.0603, lng: 118.7969 },
    '苏州': { lat: 31.2989, lng: 120.5853 },
    '成都': { lat: 30.5728, lng: 104.0668 },
    '重庆': { lat: 29.4316, lng: 106.9123 },
    '武汉': { lat: 30.5928, lng: 114.3055 },
    '西安': { lat: 34.3416, lng: 108.9398 },
    '天津': { lat: 39.3434, lng: 117.3616 },
    '厦门': { lat: 24.4798, lng: 118.0894 },
    '青岛': { lat: 36.0671, lng: 120.3826 },
    '大连': { lat: 38.9140, lng: 121.6147 },
    '宁波': { lat: 29.8683, lng: 121.5440 },
    '无锡': { lat: 31.4912, lng: 120.3119 },
    '东京': { lat: 35.6762, lng: 139.6503 },
    '大阪': { lat: 34.6937, lng: 135.5023 },
    '京都': { lat: 35.0116, lng: 135.7681 },
    '巴黎': { lat: 48.8566, lng: 2.3522 },
    '伦敦': { lat: 51.5074, lng: -0.1278 },
    '纽约': { lat: 40.7128, lng: -74.0060 },
  };

  private detectGeographicIssues(day: TripDayContext, ctx: TripContext): {
    issues: string[];
    solutions: string[];
    wrongCityItems: Array<{ item: any; detectedCity: string }>;
  } {
    const issues: string[] = [];
    const solutions: string[] = [];
    const wrongCityItems: Array<{ item: any; detectedCity: string }> = [];

    // 收集当天所有涉及的城市
    const cities = new Set<string>();
    const cityItems: Map<string, Array<{ name: string; item: any }>> = new Map();

    // 地标 → 城市映射
    const landmarks: Record<string, string> = {
      '故宫': '北京',
      '天安门': '北京',
      '长城': '北京',
      '颐和园': '北京',
      '圆明园': '北京',
      '天坛': '北京',
      '鸟巢': '北京',
      '外滩': '上海',
      '东方明珠': '上海',
      '豫园': '上海',
      '西湖': '杭州',
      '灵隐寺': '杭州',
      '雷峰塔': '杭州',
      '千岛湖': '杭州',
      '梦想小镇': '杭州',
      '夫子庙': '南京',
      '中山陵': '南京',
      '玄武湖': '南京',
      '东京塔': '东京',
      '浅草寺': '东京',
      '秋叶原': '东京',
      '涩谷': '东京',
      '大阪城': '大阪',
      '道顿堀': '大阪',
      '清水寺': '京都',
      '伏见稻荷': '京都',
      '金阁寺': '京都',
      '埃菲尔': '巴黎',
      '卢浮宫': '巴黎',
      '凯旋门': '巴黎',
    };

    for (const item of day.items) {
      // 从多个来源提取城市信息
      let city = item.cityName;
      const itemName = this.getItemName(item);
      
      if (!city && item.address) {
        // 尝试从地址中提取城市
        const cityMatch = item.address.match(/(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|厦门|青岛|大连|宁波|无锡|东京|大阪|京都|巴黎|伦敦|纽约)/);
        if (cityMatch) {
          city = cityMatch[1];
        }
      }
      
      if (!city && itemName) {
        // 从名称中检测特定地标
        for (const [landmark, landmarkCity] of Object.entries(landmarks)) {
          if (itemName.includes(landmark)) {
            city = landmarkCity;
            break;
          }
        }
      }

      if (city) {
        cities.add(city);
        if (!cityItems.has(city)) {
          cityItems.set(city, []);
        }
        cityItems.get(city)!.push({ name: itemName, item });
      }
    }

    // 如果同一天涉及多个相隔很远的城市
    const mainDestination = ctx.destinationName || ctx.destination || '';
    
    if (cities.size > 1) {
      const cityList = Array.from(cities);
      
      // 计算城市之间的实际距离
      const cityDistances: Array<{ city1: string; city2: string; distance: number }> = [];
      for (let i = 0; i < cityList.length; i++) {
        for (let j = i + 1; j < cityList.length; j++) {
          const city1 = cityList[i];
          const city2 = cityList[j];
          const coord1 = this.CITY_COORDINATES[city1];
          const coord2 = this.CITY_COORDINATES[city2];
          
          if (coord1 && coord2) {
            const distance = this.calculateDistance(coord1.lat, coord1.lng, coord2.lat, coord2.lng);
            cityDistances.push({ city1, city2, distance: Math.round(distance) });
          }
        }
      }

      // 检查是否是相邻城市（可以一天游玩的，距离 < 100km）
      const adjacentCityGroups = [
        ['杭州', '苏州', '无锡', '上海', '嘉兴', '绍兴'],
        ['南京', '镇江', '扬州'],
        ['北京', '天津'],
        ['广州', '深圳', '东莞', '佛山'],
        ['东京', '横滨'],
        ['大阪', '京都', '奈良', '神户'],
      ];

      let isAdjacent = false;
      for (const group of adjacentCityGroups) {
        if (cityList.every(c => group.includes(c))) {
          isAdjacent = true;
          break;
        }
      }

      // 找出距离超远的城市对
      const farCities = cityDistances.filter(d => d.distance > 200); // 超过200km
      const veryFarCities = cityDistances.filter(d => d.distance > 500); // 超过500km

      if (!isAdjacent || farCities.length > 0) {
        // 生成城市详情（带距离）
        const cityDetails = cityList.map(c => {
          const itemsInCity = cityItems.get(c) || [];
          const names = itemsInCity.slice(0, 2).map(i => i.name);
          return `${c}（${names.join('、')}${itemsInCity.length > 2 ? '等' : ''}）`;
        }).join('、');
        
        // 找出最远的城市对
        if (farCities.length > 0) {
          const farthest = farCities.sort((a, b) => b.distance - a.distance)[0];
          
          if (farthest.distance > 1000) {
            // 🚨 严重问题：超过1000km
            issues.push(`🚨 **严重问题**：${farthest.city1} 和 ${farthest.city2} 相距约 **${farthest.distance}公里**，同一天无法完成`);
            
            // 估算交通时间
            const flightTime = Math.round(farthest.distance / 800); // 飞机约800km/h
            const trainTime = Math.round(farthest.distance / 300); // 高铁约300km/h
            
            solutions.push(`🚫 **这是不可能完成的行程**：
  • ${farthest.city1} → ${farthest.city2} 需要 ${flightTime}-${flightTime + 1} 小时飞行 或 ${trainTime}-${trainTime + 2} 小时高铁
  • 建议：**立即删除** 不属于本次行程的景点`);
            
            // 找出哪个城市的景点应该删除
            const mainCity = mainDestination.match(/(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|厦门|青岛|大连|宁波|无锡|东京|大阪|京都|巴黎|伦敦|纽约)/)?.[1];
            
            if (mainCity) {
              const wrongCity = farthest.city1 === mainCity ? farthest.city2 : farthest.city1;
              const wrongItems = cityItems.get(wrongCity) || [];
              
              if (wrongItems.length > 0) {
                const wrongNames = wrongItems.map(i => `「${i.name}」`).join('、');
                solutions.push(`💡 **建议删除** ${wrongNames}（${wrongCity}的景点，不在${mainDestination}）`);
                
                for (const { item } of wrongItems) {
                  wrongCityItems.push({ item, detectedCity: wrongCity });
                }
              }
            }
          } else if (farthest.distance > 500) {
            // ⚠️ 问题：超过500km
            issues.push(`⚠️ ${farthest.city1} 和 ${farthest.city2} 相距约 **${farthest.distance}公里**，同一天很难完成`);
            
            const trainTime = Math.round(farthest.distance / 300);
            solutions.push(`💡 **建议分开安排**：两城市间需要 ${trainTime}-${trainTime + 1} 小时高铁，建议分到不同天`);
          } else {
            // 200-500km 的提示
            issues.push(`⚠️ ${farthest.city1} 和 ${farthest.city2} 相距约 **${farthest.distance}公里**，同一天游玩会比较赶`);
            solutions.push(`💡 **建议**：预留足够的交通时间，或考虑分到不同天`);
          }
        } else {
          issues.push(`🚨 同一天安排了 ${cityDetails}，这些城市相距较远`);
          solutions.push(`💡 **建议**：将不同城市的景点分开到不同的天`);
        }
      }
    }

    // 检查当天城市是否与行程整体目的地匹配
    if (mainDestination && cities.size > 0) {
      const mainCity = mainDestination.match(/(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|厦门|青岛|大连|宁波|无锡|东京|大阪|京都|巴黎|伦敦|纽约)/)?.[1];
      
      if (mainCity) {
        const mainCoord = this.CITY_COORDINATES[mainCity];
        
        for (const city of Array.from(cities)) {
          if (city === mainCity) continue;
          
          const cityCoord = this.CITY_COORDINATES[city];
          if (mainCoord && cityCoord) {
            const distance = this.calculateDistance(mainCoord.lat, mainCoord.lng, cityCoord.lat, cityCoord.lng);
            
            if (distance > 500) {
              const itemsInWrongCity = cityItems.get(city) || [];
              const wrongNames = itemsInWrongCity.map(i => `「${i.name}」`).join('、');
              
              issues.push(`⚠️ ${wrongNames} 是${city}的景点（距离${mainCity}约${Math.round(distance)}公里），但行程目的地是${mainDestination}`);
              
              for (const { item } of itemsInWrongCity) {
                wrongCityItems.push({ item, detectedCity: city });
              }
              
              solutions.push(`💡 **建议删除** ${wrongNames}，这些景点不在您的行程目的地（${mainDestination}）`);
            }
          }
        }
      }
    }

    return { issues, solutions, wrongCityItems };
  }

  /**
   * 查找替代景点（简化版）
   */
  private async findAlternativePois(ctx: TripContext, message: string): Promise<any[]> {
    // 简化实现
    return [
      { id: '1', name: '替代景点A', reason: '同类型，评分更高', duration: 120, cost: 100 },
      { id: '2', name: '替代景点B', reason: '距离更近，省时间', duration: 90, cost: 80 },
      { id: '3', name: '替代景点C', reason: '更适合带小孩', duration: 150, cost: 120 },
    ];
  }

  /**
   * 分析节奏
   */
  private analyzePace(ctx: TripContext): any {
    const avgItems = ctx.days.reduce((sum, d) => sum + d.stats.itemCount, 0) / ctx.days.length;
    
    return {
      summary: `当前平均每天 ${avgItems.toFixed(1)} 个活动，总体节奏${avgItems > 5 ? '偏紧' : avgItems < 3 ? '偏松' : '适中'}。`,
      relaxSuggestions: [
        '移除评分较低的景点',
        '延长午餐时间',
        '增加休息时间',
      ],
      intensifySuggestions: [
        '添加附近的景点',
        '增加体验活动',
        '利用早晚时间',
      ],
    };
  }

  /**
   * 找出最适合添加活动的日期
   */
  private findBestDayForActivity(ctx: TripContext): number {
    let bestDay = 1;
    let maxFreeTime = 0;
    
    ctx.days.forEach(day => {
      if (day.stats.freeTime > maxFreeTime) {
        maxFreeTime = day.stats.freeTime;
        bestDay = day.dayNumber;
      }
    });
    
    return bestDay;
  }

  /**
   * 获取某天的空闲时间
   */
  private getFreetimeForDay(ctx: TripContext, dayNumber: number): number {
    const day = ctx.days.find(d => d.dayNumber === dayNumber);
    return day ? (12 * 60 - day.stats.totalDuration) : 0;
  }

  /**
   * 找出缺少餐厅安排的餐点
   */
  private findMissingMeals(ctx: TripContext): any[] {
    const missingMeals: any[] = [];
    
    ctx.days.forEach(day => {
      const meals = day.items.filter(i => i.type === 'RESTAURANT');
      if (!meals.some(m => m.name?.includes('早'))) {
        // 通常不强制安排早餐
      }
      if (!meals.some(m => m.name?.includes('午') || (m.startTime && m.startTime >= '11:00' && m.startTime <= '14:00'))) {
        missingMeals.push({ day: day.dayNumber, meal: '午餐' });
      }
      if (!meals.some(m => m.name?.includes('晚') || (m.startTime && m.startTime >= '17:00'))) {
        missingMeals.push({ day: day.dayNumber, meal: '晚餐' });
      }
    });
    
    return missingMeals;
  }

  /**
   * 分析交通需求
   */
  private analyzeTransportNeeds(ctx: TripContext): any {
    return {
      suggestions: [
        '市内以地铁为主，购买交通卡更划算',
        '机场往返建议提前预约接送',
        '景点间打车约30-50元/次',
      ],
      estimatedCost: ctx.durationDays * 100,
      passes: [
        { name: '地铁一日券', price: 50, reason: '每天乘坐3次以上即回本' },
        { name: '交通IC卡', price: 100, reason: '可充值，方便快捷' },
      ],
    };
  }

  /**
   * 找出空闲时间段
   */
  private findFreeTimeSlots(ctx: TripContext): any[] {
    const slots: any[] = [];
    
    ctx.days.forEach(day => {
      if (day.stats.freeTime > 60) {
        slots.push({
          day: day.dayNumber,
          start: '14:00',
          end: '16:00',
          duration: day.stats.freeTime,
          nearbyOptions: ['咖啡厅', '商场', '公园'],
        });
      }
    });
    
    return slots;
  }

  /**
   * 使用 LLM 回答问题
   */
  private async answerQuestionWithLLM(question: string, ctx: TripContext): Promise<string> {
    if (!this.llmService) {
      return `关于"${question}"的问题，建议您查阅最新的旅游攻略或咨询当地旅行社。`;
    }

    const prompt = `你是一位专业的旅行顾问。用户正在规划去${ctx.destinationName || ctx.destination}的${ctx.durationDays}天旅行。

用户问：${question}

请用专业、友好的语气回答这个问题。如果问题涉及具体价格或时效性信息，请提醒用户以实际情况为准。`;

    try {
      const response = await this.llmService.humanizeResult({
        dataType: 'travel_qa',
        data: { prompt },
      });
      return response;
    } catch (error) {
      return `关于"${question}"，我建议您查阅最新的官方信息或咨询专业旅行社。`;
    }
  }

  /**
   * 生成建议
   */
  private async generateSuggestions(ctx: TripContext, message: string): Promise<any[]> {
    return [
      { id: '1', title: '提前预约热门餐厅', description: '建议提前1-2周预约，特别是米其林餐厅' },
      { id: '2', title: '购买景点联票', description: '购买套票可节省约20%费用' },
      { id: '3', title: '下载离线地图', description: '部分地区网络信号较差，建议提前下载' },
    ];
  }

  /**
   * 分析可行性
   */
  private async analyzeFeasibility(ctx: TripContext, message: string): Promise<any> {
    return {
      feasible: true,
      summary: '整体安排可行，但有几点需要注意。',
      details: [
        '交通时间预留充足',
        '景点开放时间已核实',
        '建议第3天早起，避开人流高峰',
      ],
    };
  }

  /**
   * 生成对比
   */
  private async generateComparison(ctx: TripContext, message: string): Promise<any> {
    return {
      table: '| 项目 | 选项A | 选项B |\n|------|------|------|\n| 价格 | ¥100 | ¥150 |\n| 时间 | 2小时 | 3小时 |\n| 评分 | 4.5 | 4.8 |',
      recommendation: '选项A性价比更高，适合时间有限的情况；选项B体验更完整。',
      options: [
        { id: 'A', name: '选项A', recommended: false },
        { id: 'B', name: '选项B', recommended: true },
      ],
    };
  }

  /**
   * 生成行前清单
   */
  private generateChecklist(ctx: TripContext): any {
    const destination = ctx.destination;
    
    return {
      documents: [
        '护照（有效期6个月以上）',
        '签证（如需要）',
        '机票行程单',
        '酒店预订确认',
        '旅行保险单',
      ],
      clothing: [
        '换洗衣物（按天数准备）',
        '舒适的步行鞋',
        '外套（根据天气）',
        '泳衣（如有水上活动）',
      ],
      health: [
        '常用药品',
        '防晒霜',
        '个人卫生用品',
        '口罩',
      ],
      electronics: [
        '手机和充电器',
        '充电宝',
        '转换插头',
        '相机（可选）',
      ],
      finance: [
        '信用卡',
        '当地货币（少量）',
        '支付APP（如支持）',
      ],
    };
  }

  /**
   * 生成通用回复
   */
  private async generateGeneralResponse(ctx: TripContext, message: string, history: TripPlannerMessage[]): Promise<string> {
    if (!this.llmService) {
      return `好的，我理解了。关于您的${ctx.destinationName || ctx.destination}行程，还有什么我可以帮您的吗？`;
    }

    const prompt = `你是 NARA，一位专业、热情的旅行规划师。用户正在规划去${ctx.destinationName || ctx.destination}的${ctx.durationDays}天旅行。

对话历史：
${history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}

用户说：${message}

请用专业、友好的语气回复，并在适当时候引导用户完善行程。`;

    try {
      return await this.llmService.humanizeResult({
        dataType: 'travel_chat',
        data: { prompt },
      });
    } catch (error) {
      return `好的，我理解了。关于您的${ctx.destinationName || ctx.destination}行程，还有什么我可以帮您的吗？`;
    }
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse(errorMessage: string): TripPlannerResponse {
    return {
      sessionId: '',
      message: `抱歉，处理您的请求时遇到了问题：${errorMessage}\n\n请稍后重试，或者换一种方式描述您的需求。`,
      phase: 'OVERVIEW',
      intent: 'GENERAL_CHAT',
      quickActions: [
        { id: '1', label: '🔄 重试', action: 'RETRY', style: 'primary' },
        { id: '2', label: '📋 查看行程', action: 'SHOW_OVERVIEW', style: 'secondary' },
      ],
    };
  }

  /**
   * 创建澄清响应（用户意图不明确时）
   */
  private createClarificationResponse(
    state: TripPlannerState,
    disambiguation: DisambiguationResult,
  ): TripPlannerResponse {
    const clarification = disambiguation.clarificationNeeded!;
    
    // 构建澄清消息
    let message = clarification.question;
    if (clarification.context) {
      message = `${clarification.context}\n\n${message}`;
    }
    
    // 将选项转换为 quickActions
    const quickActions: QuickAction[] = clarification.options.map((option, idx) => ({
      id: option.id || `clarify_${idx}`,
      label: option.label,
      description: option.description,
      action: 'CLARIFY_INTENT',
      data: {
        selectedAction: option.action,
        params: option.params,
      },
      style: option.style || 'secondary',
    }));
    
    // 如果有上下文发现，添加缺口信息到 richContent
    let richContent: TripPlannerResponse['richContent'];
    if (disambiguation.contextDiscovery?.foundGap && disambiguation.contextDiscovery.gap) {
      const gap = disambiguation.contextDiscovery.gap;
      richContent = {
        type: 'gap_highlight',  // 使用新的类型
        data: {
          highlight: {
            type: 'gap',
            dayNumber: gap.dayNumber,
            timeSlot: gap.timeSlot,
            gapType: gap.type,
            description: gap.description,
            severity: gap.severity,
          },
        },
      };
    }
    
    // 收集所有相关缺口
    const detectedGaps = disambiguation.diagnostics?.relatedGaps?.map(gap => ({
      id: gap.id,
      type: gap.type,
      dayNumber: gap.dayNumber,
      timeSlot: gap.timeSlot,
      description: gap.description,
      severity: gap.severity,
      context: gap.context ? {
        beforeItem: gap.context.beforeActivity?.name,
        afterItem: gap.context.afterActivity?.name,
        nearbyLocation: gap.context.dayCity,
      } : undefined,
    })) || [];
    
    return {
      sessionId: state.sessionId,
      message,
      phase: state.phase,
      intent: disambiguation.originalIntent,
      quickActions,
      richContent,
      followUp: clarification.allowFreeText ? {
        question: clarification.question,
        options: clarification.options.map(o => o.label),
        type: 'single',
      } : undefined,
      meta: {
        processingTime: 0,
        uncertainty: disambiguation.uncertainty,
        detectedGaps: detectedGaps.length > 0 ? detectedGaps : undefined,
      },
    } as TripPlannerResponse;
  }

  /**
   * 获取模拟行程上下文（开发测试用）
   */
  private getMockTripContext(tripId: string): TripContext {
    // 特殊测试 tripId 用于测试距离警告
    if (tripId.includes('distance_test')) {
      return this.getMockDistanceTestContext(tripId);
    }
    
    // 🆕 测试时间冲突 + 地理问题
    if (tripId.includes('conflict_test') || tripId.includes('hangzhou')) {
      return this.getMockConflictTestContext(tripId);
    }
    
    return {
      tripId,
      destination: 'JP',
      destinationName: '日本',
      startDate: '2026-04-01',
      endDate: '2026-04-07',
      durationDays: 7,
      totalBudget: 20000,
      remainingBudget: 15000,
      travelers: {
        adults: 2,
        children: 1,
        elderly: 0,
        childrenAges: [8],
      },
      pacingConfig: {
        level: 'STANDARD',
        maxDailyActivities: 5,
      },
      days: [
        {
          dayId: 'd1',
          dayNumber: 1,
          date: '2026-04-01',
          theme: '东京到达日',
          city: '东京',
          items: [
            { itemId: 'i1', type: 'ACTIVITY', name: '抵达成田机场', startTime: '14:00', duration: 60, location: { lat: 35.7720, lng: 140.3929 } },
            { itemId: 'i2', type: 'TRANSPORT', name: '机场到酒店', startTime: '15:00', duration: 90 },
            { itemId: 'i3', type: 'RESTAURANT', name: '新宿拉面', startTime: '18:00', duration: 60, location: { lat: 35.6938, lng: 139.7034 } },
          ],
          stats: { itemCount: 3, totalDuration: 210, totalCost: 500, freeTime: 180, travelTime: 90 },
        },
        {
          dayId: 'd2',
          dayNumber: 2,
          date: '2026-04-02',
          theme: '东京迪士尼',
          city: '东京',
          items: [
            { itemId: 'i4', type: 'POI', name: '东京迪士尼乐园', startTime: '09:00', duration: 600, cost: 1500, location: { lat: 35.6329, lng: 139.8804 } },
          ],
          stats: { itemCount: 1, totalDuration: 600, totalCost: 1500, freeTime: 0, travelTime: 60 },
        },
      ],
      preferences: {
        style: 'family',
        interests: ['亲子', '美食', '购物'],
        pace: 'relaxed',
      },
      status: 'PLANNING',
      completeness: 35,
    };
  }

  /**
   * 时间冲突 + 地理问题测试专用模拟数据（模拟用户的杭州行程）
   */
  private getMockConflictTestContext(tripId: string): TripContext {
    return {
      tripId,
      destination: 'CN',
      destinationName: '杭州',
      startDate: '2026-01-10',
      endDate: '2026-01-20',
      durationDays: 11,
      totalBudget: 10000,
      remainingBudget: 8000,
      status: 'PLANNING',
      completeness: 0.3,
      travelers: {
        adults: 2,
        children: 0,
        elderly: 0,
      },
      pacingConfig: {
        level: 'STANDARD',
        maxDailyActivities: 5,
      },
      days: [
        {
          dayId: 'd1',
          dayNumber: 1,
          date: '2026-01-10',
          theme: '杭州游玩',
          city: '杭州',
          items: [
            {
              itemId: 'item_hotel',
              name: '杭州余杭万豪万枫酒店',
              type: 'HOTEL',
              startTime: '09:30',
              endTime: '10:00',
              duration: 30,
              address: '余杭街道凤新路365号',
              cityName: '杭州',
            },
            {
              itemId: 'item_dream',
              name: '杭州梦想小镇景区',
              type: 'ACTIVITY',
              startTime: '09:00', // ⚠️ 时间冲突！
              endTime: '10:00',
              duration: 60,
              address: '浙江省杭州市余杭区',
              cityName: '杭州',
            },
            {
              itemId: 'item_forbidden',
              name: '故宫博物院', // ⚠️ 这是北京的景点！
              type: 'ACTIVITY',
              startTime: '09:00', // ⚠️ 又是时间冲突！
              endTime: '10:00',
              duration: 120,
              address: '东城区',
              cityName: '北京',
            },
            {
              itemId: 'item_afternoon',
              name: '浙江省杭州市余杭区中国',
              type: 'ACTIVITY',
              startTime: '14:49',
              endTime: '15:49',
              duration: 60,
              address: '杭州市余杭区',
              cityName: '杭州',
            },
          ],
          stats: {
            itemCount: 4,
            totalDuration: 270,
            totalCost: 0,
            freeTime: 300,
            travelTime: 60,
          },
        },
        {
          dayId: 'd2',
          dayNumber: 2,
          date: '2026-01-11',
          theme: '自由活动',
          city: '杭州',
          items: [
            {
              itemId: 'item_west_lake',
              name: '西湖',
              type: 'ACTIVITY',
              startTime: '10:00',
              endTime: '12:00',
              duration: 120,
              address: '杭州市西湖区',
              cityName: '杭州',
            },
          ],
          stats: {
            itemCount: 1,
            totalDuration: 120,
            totalCost: 0,
            freeTime: 480,
            travelTime: 30,
          },
        },
      ],
    };
  }

  /**
   * 距离测试专用模拟数据（同一天内有超远距离的地点）
   */
  private getMockDistanceTestContext(tripId: string): TripContext {
    return {
      tripId,
      destination: 'JP',
      destinationName: '日本',
      startDate: '2026-04-01',
      endDate: '2026-04-03',
      durationDays: 3,
      totalBudget: 30000,
      remainingBudget: 25000,
      travelers: {
        adults: 2,
        children: 0,
        elderly: 0,
      },
      pacingConfig: {
        level: 'STANDARD',
        maxDailyActivities: 5,
      },
      days: [
        {
          dayId: 'd1',
          dayNumber: 1,
          date: '2026-04-01',
          theme: '东京-大阪（问题日）',
          city: '东京',
          items: [
            // 东京塔 -> 大阪城，距离约 400km，同一天不合理！
            { 
              itemId: 'i1', 
              type: 'POI', 
              name: '东京塔', 
              startTime: '09:00', 
              endTime: '11:00',
              duration: 120, 
              location: { lat: 35.6586, lng: 139.7454 },
              cityName: '东京',
            },
            { 
              itemId: 'i2', 
              type: 'POI', 
              name: '大阪城', 
              startTime: '14:00', 
              endTime: '17:00',
              duration: 180, 
              location: { lat: 34.6873, lng: 135.5262 },
              cityName: '大阪',
            },
            { 
              itemId: 'i3', 
              type: 'RESTAURANT', 
              name: '道顿堀美食街', 
              startTime: '18:00', 
              endTime: '20:00',
              duration: 120, 
              location: { lat: 34.6687, lng: 135.5011 },
              cityName: '大阪',
            },
          ],
          stats: { itemCount: 3, totalDuration: 420, totalCost: 2000, freeTime: 0, travelTime: 180 },
          issues: ['⚠️ 同一天包含东京和大阪的景点，距离超过400公里'],
        },
        {
          dayId: 'd2',
          dayNumber: 2,
          date: '2026-04-02',
          theme: '大阪-京都（合理日）',
          city: '大阪',
          items: [
            { 
              itemId: 'i4', 
              type: 'POI', 
              name: '清水寺', 
              startTime: '09:00', 
              endTime: '12:00',
              duration: 180, 
              location: { lat: 34.9949, lng: 135.7850 },
              cityName: '京都',
            },
            { 
              itemId: 'i5', 
              type: 'POI', 
              name: '伏见稻荷大社', 
              startTime: '14:00', 
              endTime: '17:00',
              duration: 180, 
              location: { lat: 34.9671, lng: 135.7727 },
              cityName: '京都',
            },
          ],
          stats: { itemCount: 2, totalDuration: 360, totalCost: 1000, freeTime: 120, travelTime: 60 },
        },
      ],
      preferences: {
        style: 'culture',
        interests: ['历史', '美食'],
        pace: 'standard',
      },
      status: 'PLANNING',
      completeness: 60,
    };
  }

  // ==================== 🎭 三人格守护者系统 ====================

  /**
   * 判断是否需要触发三人格显现
   * 
   * @param intent 用户意图
   * @param message 用户消息
   * @param state 会话状态
   * @returns 需要显现的人格列表
   */
  private shouldInvokeGuardians(
    intent: TripPlannerIntent,
    message: string,
    state: TripPlannerState,
  ): GuardianPersona[] {
    if (!this.GUARDIAN_CONFIG.enabled) return [];

    const guardians: GuardianPersona[] = [];
    const ctx = state.tripContext;
    const lowerMessage = message.toLowerCase();

    // 检查是否触发全员显现
    const { allGuardians } = this.GUARDIAN_CONFIG;
    const triggerAll = 
      allGuardians.intents.includes(intent) ||
      allGuardians.keywords.some(kw => message.includes(kw));

    if (triggerAll) {
      return ['Abu', 'DrDre', 'Neptune'];
    }

    // Abu: 安全/时间/可达性问题
    if (this.shouldInvokeAbu(intent, message, ctx)) {
      guardians.push('Abu');
    }

    // Dr.Dre: 节奏/疲劳度问题
    if (this.shouldInvokeDrDre(intent, message, ctx)) {
      guardians.push('DrDre');
    }

    // Neptune: 替代方案
    if (this.shouldInvokeNeptune(intent, message, ctx)) {
      guardians.push('Neptune');
    }

    return guardians;
  }

  /**
   * 确定触发原因（用于埋点）
   */
  private determineTriggerReason(
    intent: TripPlannerIntent,
    message: string,
  ): 'keyword' | 'threshold' | 'intent' | 'all_guardians' {
    const { allGuardians, abu, drDre, neptune } = this.GUARDIAN_CONFIG;
    
    // 全员触发
    if (allGuardians.intents.includes(intent) || allGuardians.keywords.some(kw => message.includes(kw))) {
      return 'all_guardians';
    }
    
    // 关键词触发检测
    const allKeywords = [
      ...['安全', '危险', '能去吗', '开门吗', '营业时间', '关门', '休息日', '交通管制'], // Abu
      ...['太累', '太赶', '走不动', '休息', '轻松一点', '紧凑', '慢一点'], // Dr.Dre
      ...neptune.replacementKeywords, // Neptune
    ];
    if (allKeywords.some(kw => message.includes(kw))) {
      return 'keyword';
    }
    
    // 特定意图触发
    const intentTriggers: TripPlannerIntent[] = [
      'CHECK_FEASIBILITY', 'ADJUST_PACE', 'REBALANCE_DAYS', 'REPLACE_POI'
    ];
    if (intentTriggers.includes(intent)) {
      return 'intent';
    }
    
    // 默认为阈值触发（疲劳度等）
    return 'threshold';
  }

  /**
   * 判断是否触发 Abu (安全守护者)
   */
  private shouldInvokeAbu(intent: TripPlannerIntent, message: string, ctx: TripContext): boolean {
    const { abu } = this.GUARDIAN_CONFIG;
    
    // 关键词检测（增加距离相关）
    const abuKeywords = ['安全', '危险', '能去吗', '开门吗', '营业时间', '关门', '休息日', '交通管制', '距离', '远', '公里', 'km', '太远', '跨城'];
    if (abuKeywords.some(kw => message.includes(kw))) {
      return true;
    }

    // 检查可行性意图
    if (intent === 'CHECK_FEASIBILITY') {
      return true;
    }

    // 添加/修改行程时自动检查距离
    if (['ADD_ACTIVITY', 'ARRANGE_MEALS', 'ADD_HOTEL'].includes(intent)) {
      return true;
    }

    // 检查行程中是否有远距离项目（超过 200km）
    for (const day of ctx.days) {
      const itemsWithLocation = day.items.filter(item => item.location);
      for (let i = 0; i < itemsWithLocation.length - 1; i++) {
        const current = itemsWithLocation[i];
        const next = itemsWithLocation[i + 1];
        if (current.location && next.location) {
          const distance = this.calculateDistance(
            current.location.lat, current.location.lng,
            next.location.lat, next.location.lng
          );
          if (distance > 200) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 判断是否触发 Dr.Dre (节奏设计师)
   */
  private shouldInvokeDrDre(intent: TripPlannerIntent, message: string, ctx: TripContext): boolean {
    const { drDre } = this.GUARDIAN_CONFIG;
    
    // 关键词检测
    const drDreKeywords = ['太累', '太赶', '走不动', '休息', '轻松一点', '紧凑', '慢一点'];
    if (drDreKeywords.some(kw => message.includes(kw))) {
      return true;
    }

    // 调整节奏意图
    if (intent === 'ADJUST_PACE' || intent === 'REBALANCE_DAYS') {
      return true;
    }

    // 检查疲劳度
    const fatigueLevel = this.calculateFatigueLevel(ctx);
    if (fatigueLevel > drDre.fatigueThreshold) {
      return true;
    }

    // 检查单日活动数是否超标
    const maxActivitiesInOneDay = Math.max(...ctx.days.map(d => d.items.length));
    if (maxActivitiesInOneDay > drDre.maxDailyActivities) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否触发 Neptune (空间魔法师)
   */
  private shouldInvokeNeptune(intent: TripPlannerIntent, message: string, ctx: TripContext): boolean {
    const { neptune } = this.GUARDIAN_CONFIG;
    
    // 关键词检测：替换相关
    if (neptune.replacementKeywords.some(kw => message.includes(kw))) {
      return true;
    }

    // 替换意图
    if (intent === 'REPLACE_POI') {
      return true;
    }

    return false;
  }

  /**
   * 计算行程整体疲劳度 (0-100)
   */
  private calculateFatigueLevel(ctx: TripContext): number {
    const { drDre } = this.GUARDIAN_CONFIG;
    let totalFatigue = 0;

    for (const day of ctx.days) {
      const itemCount = day.items.length;
      const travelTime = day.stats.travelTime || 0;
      const totalDuration = day.stats.totalDuration || 0;
      
      // 活动数因素
      const activityFatigue = Math.min((itemCount / drDre.maxDailyActivities) * 40, 40);
      
      // 交通时间因素
      const travelFatigue = Math.min((travelTime / 120) * 30, 30); // 120分钟交通对应30分疲劳
      
      // 总时长因素
      const durationFatigue = Math.min((totalDuration / 600) * 30, 30); // 10小时对应30分疲劳
      
      totalFatigue += activityFatigue + travelFatigue + durationFatigue;
    }

    // 平均到每天
    const avgFatigue = totalFatigue / Math.max(ctx.days.length, 1);
    
    // 带老人/小孩加权
    const elderlyFactor = ctx.travelers.elderly > 0 ? 1.3 : 1;
    const childrenFactor = ctx.travelers.children > 0 ? 1.2 : 1;
    
    return Math.min(avgFatigue * elderlyFactor * childrenFactor, 100);
  }

  /**
   * 执行三人格评估
   */
  async evaluateWithGuardians(
    state: TripPlannerState,
    intent: TripPlannerIntent,
    message: string,
  ): Promise<{
    insights: PersonaInsight[];
    evaluation: GuardianEvaluation;
    guardiansInvoked: GuardianPersona[];
  }> {
    const ctx = state.tripContext;
    const guardiansToInvoke = this.shouldInvokeGuardians(intent, message, state);
    
    if (guardiansToInvoke.length === 0) {
      return { insights: [], evaluation: {}, guardiansInvoked: [] };
    }

    this.logger.debug(`[三人格] 触发评估: ${guardiansToInvoke.join(', ')}`);

    const insights: PersonaInsight[] = [];
    const evaluation: GuardianEvaluation = {};

    // Abu 评估
    if (guardiansToInvoke.includes('Abu')) {
      const abuResult = await this.evaluateWithAbu(ctx, message);
      evaluation.abu = abuResult.evaluation;
      if (abuResult.insights.length > 0) {
        insights.push(...abuResult.insights);
      }
    }

    // Dr.Dre 评估
    if (guardiansToInvoke.includes('DrDre')) {
      const drDreResult = await this.evaluateWithDrDre(ctx, message);
      evaluation.drDre = drDreResult.evaluation;
      if (drDreResult.insights.length > 0) {
        insights.push(...drDreResult.insights);
      }
    }

    // Neptune 评估
    if (guardiansToInvoke.includes('Neptune')) {
      const neptuneResult = await this.evaluateWithNeptune(ctx, message);
      evaluation.neptune = neptuneResult.evaluation;
      if (neptuneResult.insights.length > 0) {
        insights.push(...neptuneResult.insights);
      }
    }

    return { insights, evaluation, guardiansInvoked: guardiansToInvoke };
  }

  /**
   * Abu 评估：安全与可行性
   */
  private async evaluateWithAbu(ctx: TripContext, message: string): Promise<{
    insights: PersonaInsight[];
    evaluation: GuardianEvaluation['abu'];
  }> {
    const persona = GUARDIAN_PERSONAS.Abu;
    const insights: PersonaInsight[] = [];
    const issues: string[] = [];
    const risks: Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string }> = [];

    // 检查每天的安排
    for (const day of ctx.days) {
      // 🆕 检查同一天行程项之间的距离
      const itemsWithLocation = day.items.filter(item => 
        item.location && item.startTime && 
        ['POI', 'RESTAURANT', 'ACTIVITY', 'HOTEL'].includes(item.type)
      ).sort((a, b) => {
        const timeA = this.parseTimeToMinutes(a.startTime!);
        const timeB = this.parseTimeToMinutes(b.startTime!);
        return timeA - timeB;
      });

      for (let i = 0; i < itemsWithLocation.length - 1; i++) {
        const current = itemsWithLocation[i];
        const next = itemsWithLocation[i + 1];
        
        if (current.location && next.location) {
          const distance = this.calculateDistance(
            current.location.lat, current.location.lng,
            next.location.lat, next.location.lng
          );
          
          // 距离超过 200km 警告，超过 500km 为严重警告，超过 1000km 为错误
          if (distance > 1000) {
            issues.push(`⚠️ 第${day.dayNumber}天「${current.name}」到「${next.name}」距离约 ${Math.round(distance)} 公里，同一天内几乎无法完成！`);
            risks.push({
              type: 'distance',
              severity: 'high',
              description: `${current.name} → ${next.name} 距离 ${Math.round(distance)}km，需要跨城交通`,
            });
          } else if (distance > 500) {
            issues.push(`⚠️ 第${day.dayNumber}天「${current.name}」到「${next.name}」距离约 ${Math.round(distance)} 公里，建议分开安排`);
            risks.push({
              type: 'distance',
              severity: 'high',
              description: `${current.name} → ${next.name} 距离 ${Math.round(distance)}km，可能需要高铁/飞机`,
            });
          } else if (distance > 200) {
            issues.push(`第${day.dayNumber}天「${current.name}」到「${next.name}」距离约 ${Math.round(distance)} 公里，请确认交通安排`);
            risks.push({
              type: 'distance',
              severity: 'medium',
              description: `${current.name} → ${next.name} 距离 ${Math.round(distance)}km，需要较长交通时间`,
            });
          } else if (distance > 50) {
            // 50-200km: 提醒
            risks.push({
              type: 'distance',
              severity: 'low',
              description: `${current.name} → ${next.name} 距离 ${Math.round(distance)}km`,
            });
          }
        }
      }

      // 🆕 检查是否在不同城市之间安排了活动但没有交通
      const uniqueCities = [...new Set(day.items.filter(i => i.cityName).map(i => i.cityName))];
      if (uniqueCities.length > 1) {
        const hasInterCityTransport = day.items.some(item => 
          item.type === 'TRANSPORT' && 
          (item.transportType === '高铁' || item.transportType === '飞机' || item.transportType === '长途汽车')
        );
        if (!hasInterCityTransport) {
          issues.push(`第${day.dayNumber}天涉及多个城市（${uniqueCities.join('、')}），但未安排城际交通`);
          risks.push({
            type: 'cross_city',
            severity: 'medium',
            description: `涉及 ${uniqueCities.length} 个城市，请确认交通方式`,
          });
        }
      }

      // 检查是否有夜间活动但没有安排交通
      const hasLateActivity = day.items.some(item => {
        const endTime = item.endTime;
        if (endTime) {
          const hour = parseInt(String(endTime).split(':')[0], 10);
          return hour >= 21;
        }
        return false;
      });

      if (hasLateActivity) {
        const hasTransportBack = day.items.some(item => 
          item.type === 'TRANSPORT' && item.endTime && parseInt(String(item.endTime).split(':')[0], 10) >= 21
        );
        if (!hasTransportBack) {
          issues.push(`第${day.dayNumber}天有夜间活动，但未安排返程交通`);
          risks.push({
            type: 'transport',
            severity: 'medium',
            description: `第${day.dayNumber}天晚间可能面临交通不便`,
          });
        }
      }

      // 检查活动时间是否合理
      const firstActivity = day.items.find(item => item.startTime);
      if (firstActivity && firstActivity.startTime) {
        const startHour = parseInt(String(firstActivity.startTime).split(':')[0], 10);
        if (startHour < 6) {
          issues.push(`第${day.dayNumber}天${firstActivity.startTime}开始可能太早`);
          risks.push({
            type: 'timing',
            severity: 'low',
            description: `早起可能影响体力`,
          });
        }
      }
    }

    // 检查带老人/小孩的特殊关注
    if (ctx.travelers.elderly > 0) {
      const hasAccessibilityIssue = ctx.days.some(day =>
        day.items.some(item => {
          const itemName = this.getItemName(item);
          return itemName.includes('登山') || itemName.includes('徒步') || itemName.includes('爬');
        })
      );
      if (hasAccessibilityIssue) {
        issues.push('行程包含登山/徒步活动，请确认老人是否适合参与');
        risks.push({
          type: 'accessibility',
          severity: 'medium',
          description: '部分活动可能不适合老年人',
        });
      }
    }

    // 生成洞察
    if (issues.length > 0 || risks.length > 0) {
      const severity = risks.some(r => r.severity === 'high') ? 'error' 
        : risks.some(r => r.severity === 'medium') ? 'warning' 
        : 'info';

      insights.push({
        persona: 'Abu',
        emoji: persona.emoji,
        name: persona.nameCN,
        role: persona.roleCN,
        severity,
        message: issues.length > 0 ? issues[0] : `发现 ${risks.length} 个潜在风险点`,
        suggestion: risks.length > 0 ? `建议关注: ${risks.map(r => r.description).join('; ')}` : undefined,
        details: issues,
      });
    } else {
      // Abu 检查通过，给出正向反馈
      insights.push({
        persona: 'Abu',
        emoji: persona.emoji,
        name: persona.nameCN,
        role: persona.roleCN,
        severity: 'success',
        message: '✓ 行程安全检查通过，没有发现明显问题',
      });
    }

    return {
      insights,
      evaluation: {
        passed: issues.length === 0 && risks.filter(r => r.severity !== 'low').length === 0,
        issues,
        risks,
      },
    };
  }

  /**
   * Dr.Dre 评估：节奏与体力
   */
  private async evaluateWithDrDre(ctx: TripContext, message: string): Promise<{
    insights: PersonaInsight[];
    evaluation: GuardianEvaluation['drDre'];
  }> {
    const persona = GUARDIAN_PERSONAS.DrDre;
    const insights: PersonaInsight[] = [];
    const issues: string[] = [];
    const { drDre } = this.GUARDIAN_CONFIG;

    // 计算总体疲劳度
    const fatigueLevel = this.calculateFatigueLevel(ctx);
    
    // 判断节奏建议
    let paceRecommendation: 'slow_down' | 'ok' | 'can_add_more' = 'ok';
    
    if (fatigueLevel > 80) {
      paceRecommendation = 'slow_down';
      issues.push('整体行程强度过高，建议减少活动或增加休息时间');
    } else if (fatigueLevel > 60) {
      paceRecommendation = 'slow_down';
      issues.push('行程略显紧凑，部分天可以考虑放慢节奏');
    } else if (fatigueLevel < 30) {
      paceRecommendation = 'can_add_more';
    }

    // 检查具体问题
    for (const day of ctx.days) {
      if (day.items.length > drDre.maxDailyActivities) {
        issues.push(`第${day.dayNumber}天安排了${day.items.length}个活动，可能比较紧张`);
      }
      
      if ((day.stats.totalDuration || 0) > 10 * 60) { // 超过10小时
        issues.push(`第${day.dayNumber}天活动时间超过10小时，建议适当调整`);
      }
    }

    // 检查连续高强度
    let consecutiveIntenseDays = 0;
    for (const day of ctx.days) {
      const dayFatigue = (day.items.length / drDre.maxDailyActivities) * 100;
      if (dayFatigue > 70) {
        consecutiveIntenseDays++;
      } else {
        consecutiveIntenseDays = 0;
      }
      if (consecutiveIntenseDays >= drDre.maxConsecutiveIntenseDays) {
        issues.push(`连续${consecutiveIntenseDays}天高强度活动，建议插入休息日`);
        break;
      }
    }

    // 生成洞察
    const severity = fatigueLevel > 80 ? 'warning' 
      : fatigueLevel > 60 ? 'info' 
      : 'success';

    const fatigueEmoji = fatigueLevel > 80 ? '🔴' : fatigueLevel > 60 ? '🟡' : '🟢';
    
    insights.push({
      persona: 'DrDre',
      emoji: persona.emoji,
      name: persona.nameCN,
      role: persona.roleCN,
      severity,
      message: `${fatigueEmoji} 体力消耗评估: ${Math.round(fatigueLevel)}/100`,
      suggestion: paceRecommendation === 'slow_down' 
        ? '建议放慢节奏，您可以说"帮我调整得轻松一点"'
        : paceRecommendation === 'can_add_more'
        ? '行程还有余量，可以考虑添加更多活动'
        : '节奏合理，每天都有适当的休息时间',
      details: issues.length > 0 ? issues : undefined,
    });

    return {
      insights,
      evaluation: {
        sustainable: fatigueLevel <= 70,
        fatigueLevel: Math.round(fatigueLevel),
        issues,
        paceRecommendation,
      },
    };
  }

  /**
   * Neptune 评估：替代方案
   */
  private async evaluateWithNeptune(ctx: TripContext, message: string): Promise<{
    insights: PersonaInsight[];
    evaluation: GuardianEvaluation['neptune'];
  }> {
    const persona = GUARDIAN_PERSONAS.Neptune;
    const insights: PersonaInsight[] = [];
    const alternatives: Array<{ original: string; replacement: string; reason: string; impact: string }> = [];

    // 检测用户是否在询问替代方案
    const { neptune } = this.GUARDIAN_CONFIG;
    const wantsAlternative = neptune.replacementKeywords.some(kw => message.includes(kw));

    // 如果有可替代的项目，生成建议
    // 这里可以基于 LLM 生成更智能的替代方案
    if (wantsAlternative || neptune.proactiveAlternatives) {
      // 找到潜在可替换的高分险/高疲劳项目
      for (const day of ctx.days) {
        for (const item of day.items) {
          const itemName = this.getItemName(item);
          // 示例：如果有太热门的景点，提供备选
          if (itemName.includes('迪士尼') && ctx.travelers.elderly > 0) {
            alternatives.push({
              original: itemName,
              replacement: '上野公园 + 浅草寺',
              reason: '迪士尼可能对老人来说太累',
              impact: '节省体力，文化体验更深',
            });
          }
        }
      }
    }

    // 生成洞察
    if (alternatives.length > 0 || wantsAlternative) {
      insights.push({
        persona: 'Neptune',
        emoji: persona.emoji,
        name: persona.nameCN,
        role: persona.roleCN,
        severity: 'info',
        message: alternatives.length > 0 
          ? `我找到了 ${alternatives.length} 个可能的替代方案`
          : '我可以帮您找到合适的替代方案，请告诉我您想替换哪个活动',
        suggestion: alternatives.length > 0 
          ? `推荐: ${alternatives[0].original} → ${alternatives[0].replacement}（${alternatives[0].reason}）`
          : undefined,
        details: alternatives.map(a => `${a.original} → ${a.replacement}: ${a.reason}`),
      });
    }

    return {
      insights,
      evaluation: {
        hasAlternatives: alternatives.length > 0,
        alternatives,
      },
    };
  }

  /**
   * 将三人格洞察整合到响应中
   */
  enrichResponseWithGuardians(
    response: TripPlannerResponse,
    guardianResult: {
      insights: PersonaInsight[];
      evaluation: GuardianEvaluation;
      guardiansInvoked: GuardianPersona[];
    },
  ): TripPlannerResponse {
    if (guardianResult.guardiansInvoked.length === 0) {
      return response;
    }

    // 🔢 按优先级排序洞察（安全 > 体力 > 替代方案）
    const sortedInsights = [...guardianResult.insights].sort(
      (a, b) => GUARDIAN_PRIORITY[a.persona] - GUARDIAN_PRIORITY[b.persona]
    );

    // 添加人格洞察
    response.personaInsights = sortedInsights;
    response.guardianEvaluation = guardianResult.evaluation;
    
    // 更新元数据
    response.meta = {
      ...response.meta,
      guardiansInvoked: guardianResult.guardiansInvoked,
    };

    // 如果有严重问题，更新消息以引起注意
    const hasWarning = sortedInsights.some(i => i.severity === 'warning' || i.severity === 'error');
    if (hasWarning) {
      // 在消息前添加顾问团提示（按优先级排序后的结果）
      const warningInsights = sortedInsights.filter(i => i.severity === 'warning' || i.severity === 'error');
      const advisorSummary = warningInsights.map(i => `${i.emoji} ${i.name}: ${i.message}`).join('\n');
      
      response.message = `💭 **顾问团评估**\n${advisorSummary}\n\n---\n\n${response.message}`;
    }

    return response;
  }

  // ==================== 📊 埋点与追踪 ====================

  /**
   * 发送三人格埋点事件
   */
  private trackGuardianEvent(event: GuardianTrackingEventUnion): void {
    // 基础日志记录
    this.logger.debug(`[Guardian Tracking] ${event.eventType}`, {
      sessionId: event.sessionId,
      tripId: event.tripId,
      data: 'data' in event ? event.data : undefined,
    });

    // TODO: 集成实际的埋点服务（如 Segment、Mixpanel、自建埋点系统）
    // await this.analyticsService.track(event);
  }

  /**
   * 追踪人格触发事件
   */
  trackGuardianInvoked(
    sessionId: string,
    tripId: string,
    userId: string,
    guardiansInvoked: GuardianPersona[],
    triggerReason: 'keyword' | 'threshold' | 'intent' | 'all_guardians',
    intent: TripPlannerIntent,
    message: string,
  ): void {
    const event: GuardianInvokedEvent = {
      eventType: 'guardian.invoked',
      timestamp: new Date().toISOString(),
      sessionId,
      tripId,
      userId,
      data: {
        guardiansInvoked,
        triggerReason,
        intent,
        message: message.substring(0, 100), // 脱敏：只取前100字符
      },
    };
    this.trackGuardianEvent(event);
  }

  /**
   * 追踪洞察展示事件
   */
  trackInsightShown(
    sessionId: string,
    tripId: string,
    userId: string,
    insight: PersonaInsight,
  ): void {
    const event: GuardianInsightShownEvent = {
      eventType: 'guardian.insight_shown',
      timestamp: new Date().toISOString(),
      sessionId,
      tripId,
      userId,
      data: {
        persona: insight.persona,
        severity: insight.severity,
        insightId: randomUUID(),
        messagePreview: insight.message.substring(0, 50),
      },
    };
    this.trackGuardianEvent(event);
  }

  /**
   * 追踪警告被忽略事件
   */
  trackWarningIgnored(
    sessionId: string,
    tripId: string,
    userId: string,
    persona: GuardianPersona,
    severity: 'warning' | 'error',
    warningType: string,
    ignoredMessage: string,
    disclaimerShown: boolean,
  ): void {
    const event: GuardianWarningIgnoredEvent = {
      eventType: 'guardian.warning_ignored',
      timestamp: new Date().toISOString(),
      sessionId,
      tripId,
      userId,
      data: {
        persona,
        severity,
        warningType,
        ignoredMessage: ignoredMessage.substring(0, 100),
        disclaimerShown,
      },
    };
    this.trackGuardianEvent(event);
  }

  // ==================== ⚠️ 责任边界声明 ====================

  /**
   * 处理用户忽略安全警告
   * 当用户选择忽略 Abu 的安全警告时，添加免责声明
   */
  handleUserIgnoredWarning(
    state: TripPlannerState,
    response: TripPlannerResponse,
    ignoredInsight: PersonaInsight,
  ): TripPlannerResponse {
    // 只处理 warning 和 error 级别
    if (ignoredInsight.severity !== 'warning' && ignoredInsight.severity !== 'error') {
      return response;
    }

    // 添加免责声明
    const disclaimer: Disclaimer = {
      type: 'user_override_safety',
      message: `您已选择忽略${GUARDIAN_PERSONAS[ignoredInsight.persona].nameCN}的安全提示，请自行评估相关风险。`,
      timestamp: new Date().toISOString(),
      relatedPersona: ignoredInsight.persona,
      userAction: 'ignored',
    };

    response.disclaimer = disclaimer;

    // 追踪忽略事件
    this.trackWarningIgnored(
      state.sessionId,
      state.tripId,
      state.userId,
      ignoredInsight.persona,
      ignoredInsight.severity as 'warning' | 'error',
      'safety_warning',
      ignoredInsight.message,
      true, // disclaimerShown
    );

    // 在消息中添加温和提示
    response.message += `\n\n⚠️ *${disclaimer.message}*`;

    return response;
  }

  /**
   * 创建数据不完整的免责声明
   */
  createDataIncompleteDisclaimer(missingData: string[]): Disclaimer {
    return {
      type: 'data_incomplete',
      message: `以下信息暂不完整，评估结果仅供参考：${missingData.join('、')}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 创建 LLM 降级的免责声明
   */
  createLlmFallbackDisclaimer(): Disclaimer {
    return {
      type: 'llm_fallback',
      message: '当前使用基础规则评估，完整智能分析暂时不可用',
      timestamp: new Date().toISOString(),
    };
  }
}
