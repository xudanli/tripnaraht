// src/agent/assistants/planning-assistant/services/smart-router.service.ts

/**
 * 智能路由服务
 * 
 * 职责:
 * - 分析用户消息的意图
 * - 路由到合适的业务接口
 * - 提取自然语言中的参数
 * 
 * 参考文档:
 * - API_REDESIGN_CODE_TEMPLATES.md - 代码模板
 * - API_REDESIGN_REVIEW_AI_SCIENTIST.md - AI科学家评审
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../../llm/services/llm.service';
import { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import { McpToolRegistryService, McpToolDefinition } from './mcp-tool-registry.service';
import { LlmToolSelectorService, ToolSelection } from './llm-tool-selector.service';

/**
 * 路由目标
 * 支持所有 MCP 服务的自然语言调用
 */
export type RoutingTarget = 
  // 核心业务接口
  | 'recommendations' 
  | 'generate' 
  | 'compare'
  | 'optimize'      // 优化已有行程（需 tripId） 
  // 住宿相关
  | 'hotel'           // 酒店搜索
  | 'airbnb'          // Airbnb/民宿搜索
  | 'accommodation'   // 住宿搜索（酒店+Airbnb）
  // 餐饮相关
  | 'restaurant'      // 餐厅搜索
  // 交通相关
  | 'flight'          // 航班搜索
  | 'rail'            // 铁路查询
  | 'carRental'       // 租车搜索
  // 信息查询
  | 'weather'         // 天气查询
  | 'search'          // Web搜索（Exa）
  | 'translate'       // 翻译服务
  | 'currency'        // 货币转换
  | 'image'           // 图片搜索
  | 'calendar'        // 日历管理（Google Calendar）
  // 其他
  | 'chat';           // 对话、问答

/**
 * 路由结果
 */
export interface RoutingResult {
  /** 目标接口 */
  target: RoutingTarget;
  
  /** 置信度 (0.0-1.0) */
  confidence: number;
  
  /** 提取的参数 */
  extractedParams?: {
    destination?: string;
    preferences?: Record<string, any>;
    planIds?: string[];
    naturalLanguage?: string;
    [key: string]: any;
  };
  
  /** 路由原因 */
  reason?: string;
  
  /** 路由原因（中文） */
  reasonCN?: string;
}

/**
 * 路由时使用的会话状态
 */
export interface RouterSessionState {
  phase?: string;
  preferences?: Record<string, any>;
  planCandidates?: Array<{ id: string }>;
  selectedDestination?: string;
  tripId?: string;   // 规划工作台：用户已有行程，应禁止推荐目的地
  countryCode?: string;
}

/**
 * 参数提取结果
 */
export interface ExtractedParams {
  destination?: string;
  preferences?: {
    budget?: { total?: number; currency?: string };
    travelers?: { adults?: number; children?: number };
    activities?: string[];
    travelStyle?: string;
    dateRange?: { startDate?: string; endDate?: string };
  };
  filters?: {
    countryCode?: string;
    region?: string;
  };
  constraints?: {
    days?: number;
    startDate?: string;
    endDate?: string;
  };
  planIds?: string[];
  [key: string]: any;
}

@Injectable()
export class SmartRouterService {
  private readonly logger = new Logger(SmartRouterService.name);

  constructor(
    @Optional() private readonly llmService?: LlmService,
    private readonly toolRegistry?: McpToolRegistryService,
    private readonly toolSelector?: LlmToolSelectorService,
  ) {
    this.logger.log('🚀 智能路由服务已初始化');
    this.logger.log(`工具融合能力: Registry=${!!toolRegistry}, Selector=${!!toolSelector}`);
    if (!toolRegistry) {
      this.logger.warn('⚠️ McpToolRegistryService 未注入！');
    }
    if (!toolSelector) {
      this.logger.warn('⚠️ LlmToolSelectorService 未注入！');
    }
  }

  /**
   * 智能路由（带工具选择）：分析用户消息，路由到合适的业务接口和工具
   */
  async routeWithTools(
    message: string,
    sessionState?: RouterSessionState
  ): Promise<RoutingResult & { selectedTool?: McpToolDefinition; toolSelection?: ToolSelection }> {
    // 1. 先进行基础路由
    const routingResult = await this.route(message, sessionState);
    
    // 2. 如果路由到具体服务，且工具融合功能可用，进行工具选择
    // 调试日志：检查工具选择条件（使用 log 级别确保可见）
    this.logger.log(`[工具选择] 检查: target=${routingResult.target}, hasRegistry=${!!this.toolRegistry}, hasSelector=${!!this.toolSelector}`);
    
    if (routingResult.target !== 'chat' && 
        routingResult.target !== 'recommendations' &&
        routingResult.target !== 'generate' &&
        routingResult.target !== 'compare' &&
        routingResult.target !== 'optimize' &&
        this.toolRegistry && 
        this.toolSelector) {
      
      try {
        // 映射路由目标到服务名称
        const serviceName = this.mapTargetToServiceName(routingResult.target);
        this.logger.log(`[工具选择] 路由目标 ${routingResult.target} 映射到服务: ${serviceName}`);
        
        if (serviceName) {
          // 获取该服务的所有工具
          const availableTools = this.toolRegistry.getServiceTools(serviceName);
          this.logger.log(`[工具选择] 服务 ${serviceName} 可用工具数: ${availableTools.length}, 工具列表: ${availableTools.map(t => t.toolName).join(', ')}`);
          
          if (availableTools.length > 0) {
            // 使用 LLM 选择最合适的工具
            this.logger.log(`[工具选择] 开始工具选择，可用工具: ${availableTools.map(t => t.toolName).join(', ')}`);
            const toolSelection = await this.toolSelector.selectTool(
              message,
              {
                phase: sessionState?.phase,
                preferences: sessionState?.preferences,
                selectedDestination: sessionState?.selectedDestination,
              },
              availableTools
            );
            
            this.logger.log(`[工具选择] 结果: ${toolSelection.tool.toolName}, confidence=${toolSelection.confidence}`);
            
            // 如果置信度足够高，使用选中的工具（降低阈值以提高触发率）
            if (toolSelection.confidence >= 0.6) {
              this.logger.log(`[工具选择] ✅ 成功: ${toolSelection.tool.toolName}, confidence=${toolSelection.confidence}`);
              
              // 合并参数（工具选择提取的参数优先级更高）
              const mergedParams = {
                ...routingResult.extractedParams,
                ...toolSelection.extractedParams,
              };
              
              return {
                ...routingResult,
                extractedParams: mergedParams,
                selectedTool: toolSelection.tool,
                toolSelection,
              };
            } else {
              this.logger.log(`[工具选择] ⚠️ 置信度较低(${toolSelection.confidence})，使用默认路由`);
            }
          } else {
            this.logger.warn(`[工具选择] ⚠️ 服务 ${serviceName} 没有可用工具`);
          }
        } else {
          this.logger.log(`[工具选择] ⚠️ 路由目标 ${routingResult.target} 无法映射到服务名称`);
        }
      } catch (error: any) {
        this.logger.error(`[工具选择] ❌ 失败: ${error.message}，使用默认路由`, error.stack);
      }
    } else {
      this.logger.log(`[工具选择] ⏭️ 跳过: target=${routingResult.target}, hasRegistry=${!!this.toolRegistry}, hasSelector=${!!this.toolSelector}`);
    }
    
    // 3. 返回基础路由结果
    return routingResult;
  }

  /**
   * 智能路由：分析用户消息，路由到合适的业务接口
   */
  async route(
    message: string,
    sessionState?: RouterSessionState
  ): Promise<RoutingResult> {
    this.logger.debug(`智能路由分析: message="${message.substring(0, 50)}...", selectedDestination=${sessionState?.selectedDestination || 'none'}, tripId=${sessionState?.tripId || 'none'}`);

    try {
      // 方法0: 先进行快速关键词检查（确保具体服务请求优先匹配）
      // 这样可以避免 LLM 将"推荐冰岛酒店"误判为 recommendations
      const keywordResult = this.routeByKeywords(message, sessionState);
      
      // 如果会话中有已选定的目的地，且路由结果中没有明确的目的地，使用会话中的目的地
      if (sessionState?.selectedDestination && keywordResult.extractedParams && !keywordResult.extractedParams.destination) {
        keywordResult.extractedParams.destination = sessionState.selectedDestination;
        this.logger.debug(`关键词路由：使用会话中的目的地 ${sessionState.selectedDestination}`);
      }
      
      // 如果关键词路由匹配到具体服务（非 recommendations/generate/compare/chat），直接返回
      const specificServiceTargets: RoutingTarget[] = [
        'hotel', 'airbnb', 'accommodation', 'restaurant', 
        'flight', 'rail', 'carRental', 'weather', 'search', 
        'translate', 'currency', 'image', 'optimize'
      ];
      
      // 对于酒店搜索，降低置信度阈值，确保即使置信度稍低也能正确路由
      const confidenceThreshold = keywordResult.target === 'hotel' ? 0.75 : 0.8;
      
      if (keywordResult.confidence >= confidenceThreshold && 
          specificServiceTargets.includes(keywordResult.target)) {
        this.logger.debug(
          `[智能路由] 关键词路由匹配到具体服务: ${keywordResult.target} ` +
          `(confidence=${keywordResult.confidence.toFixed(2)}), ` +
          `destination=${keywordResult.extractedParams?.destination || 'none'}, ` +
          `message="${message.substring(0, 30)}..."`
        );
        return this.maybeOverrideRecommendationsForPlanningWorkbench(keywordResult, sessionState);
      }

      // 方法1: 使用LLM进行智能路由（如果可用）
      if (this.llmService) {
        const llmResult = await this.routeWithLLM(message, sessionState);
        // 降低置信度阈值，让更多请求能够路由到具体服务
        if (llmResult && llmResult.confidence > 0.6) {
          // 优先级规则1: 如果关键词路由匹配到具体服务（如 hotel），且置信度足够高（>= 0.8），优先使用关键词结果
          // 这可以防止 LLM 将"推荐酒店"误判为 recommendations
          if (specificServiceTargets.includes(keywordResult.target) && 
              keywordResult.confidence >= 0.8) {
            // 如果 LLM 也路由到具体服务，且与关键词路由一致，使用关键词结果（更可靠）
            if (specificServiceTargets.includes(llmResult.target) && 
                llmResult.target === keywordResult.target) {
              this.logger.debug(`关键词路由与LLM路由一致，使用关键词结果: ${keywordResult.target}`);
              return this.maybeOverrideRecommendationsForPlanningWorkbench(keywordResult, sessionState);
            }
            // 如果 LLM 路由到 recommendations 或其他非具体服务，但关键词路由匹配到具体服务，优先使用关键词路由
            if (!specificServiceTargets.includes(llmResult.target) || 
                llmResult.target === 'recommendations') {
              this.logger.debug(
                `关键词路由优先级更高（${keywordResult.target}, confidence=${keywordResult.confidence}），` +
                `覆盖LLM路由（${llmResult.target}, confidence=${llmResult.confidence}）`
              );
              return this.maybeOverrideRecommendationsForPlanningWorkbench(keywordResult, sessionState);
            }
          }
          // 优先级规则2: 如果 LLM 路由到具体服务，且关键词也匹配到具体服务，优先使用关键词结果（更可靠）
          if (specificServiceTargets.includes(llmResult.target) && 
              specificServiceTargets.includes(keywordResult.target) &&
              keywordResult.confidence >= 0.8) {
            this.logger.debug(`关键词路由优先级更高，使用关键词结果: ${keywordResult.target}`);
            return this.maybeOverrideRecommendationsForPlanningWorkbench(keywordResult, sessionState);
          }
          return this.maybeOverrideRecommendationsForPlanningWorkbench(llmResult, sessionState);
        }
        this.logger.debug(`LLM路由置信度较低(${llmResult?.confidence})，使用关键词路由`);
      }

      // 方法2: 关键词路由（回退方案）
      return this.maybeOverrideRecommendationsForPlanningWorkbench(keywordResult, sessionState);
    } catch (error: any) {
      this.logger.warn(`智能路由失败: ${error.message}，使用默认路由`);
      return {
        target: 'chat',
        confidence: 0.5,
        reason: 'Routing failed, fallback to chat',
        reasonCN: '路由失败，回退到对话',
      };
    }
  }

  /**
   * 规划工作台场景：用户已有行程（tripId 存在）时，禁止推荐目的地。
   * 用户询问当前目的地的问题（如「人多吗」「天气怎么样」）应走对话回答，而非推荐。
   */
  private maybeOverrideRecommendationsForPlanningWorkbench(
    result: RoutingResult,
    sessionState?: RouterSessionState
  ): RoutingResult {
    if (sessionState?.tripId && result.target === 'recommendations') {
      this.logger.debug(
        `[规划工作台] tripId=${sessionState.tripId} 存在，禁止推荐目的地，改为 chat`
      );
      return {
        ...result,
        target: 'chat',
        reason: 'User has existing trip (planning workbench), answer question instead of recommending destinations',
        reasonCN: '规划工作台场景，用户已有行程，应回答询问而非推荐目的地',
      };
    }
    return result;
  }

  /**
   * 使用LLM进行智能路由
   */
  private async routeWithLLM(
    message: string,
    sessionState?: RouterSessionState
  ): Promise<RoutingResult> {
    const contextInfo = sessionState
      ? `当前阶段: ${sessionState.phase || 'UNKNOWN'}
已有偏好: ${JSON.stringify(sessionState.preferences || {})}
已有方案数: ${sessionState.planCandidates?.length || 0}
已选定的目的地: ${sessionState.selectedDestination || '无'}
规划工作台（用户已有行程）: ${sessionState.tripId ? '是，tripId=' + sessionState.tripId : '否'}`
      : '新会话';

    const prompt = `分析用户消息，判断应该路由到哪个接口。

用户消息: "${message}"

会话上下文:
${contextInfo}

**重要规则**：
1. 如果消息包含"酒店"、"hotel"、"推荐酒店"、"找酒店"等关键词，**必须**路由到 hotel，不要路由到 recommendations
2. 如果会话中已选定目的地（selectedDestination不为空），且用户请求具体服务（如酒店、餐厅），应该路由到具体服务，而不是 recommendations
3. 只有在用户明确要求推荐新目的地（如"推荐一些目的地"、"我想去日本"）时，才路由到 recommendations

可选接口（按优先级排序，具体服务优先于通用推荐）:
- hotel: 用户想要搜索酒店（例如："推荐冰岛的酒店"、"找酒店"、"搜索酒店"、"冰岛酒店"、"推荐酒店"）- **如果消息包含"酒店"或"hotel"，必须路由到这里，不要路由到 recommendations**
- airbnb: 用户想要搜索 Airbnb/民宿（例如："推荐 Airbnb"、"找民宿"、"短租"、"Airbnb 房源"）- 如果消息包含"airbnb"、"民宿"、"bnb"，优先路由到这里
- accommodation: 用户想要搜索住宿（包括酒店和 Airbnb）（例如："推荐住宿"、"找住处"、"住宿推荐"）- 如果消息只包含"住宿"且不包含"酒店"或"airbnb"，路由到这里
- restaurant: 用户想要搜索餐厅（例如："推荐餐厅"、"找餐厅"、"附近有什么好吃的"、"餐厅推荐"）- 如果消息包含"餐厅"、"restaurant"、"美食"，优先路由到这里
- flight: 用户想要搜索航班（例如："搜索从北京到上海的航班"、"查机票"、"航班查询"、"找航班"）- 如果消息包含"航班"、"flight"、"机票"，优先路由到这里
- rail: 用户想要查询铁路（例如："查询从巴黎到伦敦的火车"、"火车票"、"铁路查询"、"查火车"、"高铁"）- 如果消息包含"火车"、"rail"、"高铁"，优先路由到这里
- carRental: 用户想要搜索租车（例如："冰岛租车推荐"、"租车"、"car rental"）- 如果消息包含"租车"、"car rental"、"car hire"，优先路由到这里
- weather: 用户想要查询天气（例如："冰岛天气怎么样"、"查天气"、"天气预报"、"天气查询"）- 如果消息包含"天气"、"weather"，优先路由到这里
- search: 用户想要搜索信息（例如："搜索冰岛旅游攻略"、"查一下"、"网上搜索"、"Web搜索"）- 如果消息包含"搜索"且包含"信息"、"资料"、"攻略"等，优先路由到这里
- translate: 用户想要翻译（例如："翻译一下"、"这是什么意思"、"翻译成中文"）- 如果消息包含"翻译"、"translate"，优先路由到这里
- currency: 用户想要货币转换（例如："汇率"、"货币转换"、"换算"、"美元换人民币"）- 如果消息包含"汇率"、"货币"、"换算"，优先路由到这里
- image: 用户想要搜索图片（例如："找图片"、"图片搜索"、"看看图片"）- 如果消息包含"图片"、"image"，优先路由到这里
- recommendations: 用户想要推荐目的地（例如："推荐一些目的地"、"我想去日本"、"有什么好玩的地方"）- **重要：如果会话中已选定目的地（selectedDestination不为空）或规划工作台（tripId存在，用户已有行程），绝对不应该路由到这里！用户询问当前目的地的问题（如"冰岛春节人多吗"、"天气怎么样"）应路由到 chat 或 search。只有在用户明确说"推荐新目的地"、"换一个地方"、"还有什么其他选择"时才路由到 recommendations。**
- optimize: **仅当 tripId 存在时**，用户想要优化已有行程（例如："帮我优化这个行程"、"优化行程"、"improve this trip"）- 与 generate 不同，optimize 是优化已有行程，不是生成新方案
- generate: 用户想要生成新方案（例如："帮我规划行程"、"生成一个5天的方案"、"做个计划"）- **注意：若用户说"优化行程"且 tripId 存在，应路由到 optimize 而非 generate**
- compare: 用户想要对比方案（例如："对比这两个方案"、"哪个更好"、"比较一下"）
- chat: 其他对话、问答、闲聊（例如："你好"、"这是什么"、"谢谢"）

返回JSON格式:
{
  "target": "recommendations" | "generate" | "compare" | "optimize" | "hotel" | "airbnb" | "accommodation" | "restaurant" | "flight" | "rail" | "carRental" | "weather" | "search" | "translate" | "currency" | "image" | "chat",
  "confidence": 0.0-1.0,
  "reason": "路由原因（英文）",
  "reasonCN": "路由原因（中文）",
  "extractedParams": {
    "destination": "目的地（如果有）",
    "location": { "lat": 纬度, "lng": 经度 },
    "preferences": { "预算、人数等偏好（如果有）" },
    "planIds": ["方案ID列表（如果对比）"],
    "naturalLanguage": "原始消息",
    "excludeAirbnb": true,
    "query": "搜索查询（如果有）",
    "sourceLanguage": "源语言（翻译）",
    "targetLanguage": "目标语言（翻译）",
    "fromCurrency": "源货币（货币转换）",
    "toCurrency": "目标货币（货币转换）",
    "amount": "金额（货币转换）",
    "origin": "出发地（铁路查询）",
    "destination": "目的地（铁路查询）",
    "date": "日期（铁路查询，格式：YYYY-MM-DD）"
  }
}`;

    try {
      const result = await this.llmService!.callLlmWithSchema(
        LlmProvider.DEEPSEEK,
        prompt
      );

      // 解析LLM返回的JSON
      let parsed: any;
      if (typeof result === 'string') {
        // 清理 markdown 代码块标记（```json ... ```）
        const cleaned = this.cleanJsonString(result);
        parsed = JSON.parse(cleaned);
      } else {
        parsed = result;
      }

      // 验证和规范化结果
      const validTargets: RoutingTarget[] = [
        'recommendations', 'generate', 'compare', 'optimize',
        'hotel', 'airbnb', 'accommodation',
        'restaurant', 'flight', 'rail',
        'weather', 'search', 'translate', 'currency', 'image',
        'chat'
      ];
      const target = validTargets.includes(parsed.target) ? parsed.target : 'chat';
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

      this.logger.debug(
        `LLM路由结果: message="${message.substring(0, 30)}..." -> ${target} (confidence=${confidence})`
      );

      // 如果会话中有已选定的目的地，且路由结果中没有明确的目的地，使用会话中的目的地
      const extractedParams = parsed.extractedParams || {};
      if (sessionState?.selectedDestination && !extractedParams.destination) {
        extractedParams.destination = sessionState.selectedDestination;
        this.logger.debug(`LLM路由：使用会话中的目的地 ${sessionState.selectedDestination}`);
      }
      
      return {
        target,
        confidence,
        extractedParams,
        reason: parsed.reason,
        reasonCN: parsed.reasonCN,
      };
    } catch (error: any) {
      this.logger.warn(`LLM路由解析失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 关键词路由（回退方案）
   */
  private routeByKeywords(
    message: string,
    sessionState?: RouterSessionState
  ): RoutingResult {
    const lowerMessage = message.toLowerCase();
    
    // 如果会话中有已选定的目的地，优先使用它
    const contextDestination = sessionState?.selectedDestination;

    // 优化已有行程：tripId 存在且消息包含「优化」关键词 → 路由到 optimize（不走 generate）
    const optimizeKeywords = ['优化', 'optimize', '优化行程', '优化这个行程', 'improve', '改进'];
    if (sessionState?.tripId && optimizeKeywords.some(kw => lowerMessage.includes(kw))) {
      return {
        target: 'optimize',
        confidence: 0.95,
        reason: 'User wants to optimize existing trip',
        reasonCN: '用户想要优化已有行程',
        extractedParams: {
          naturalLanguage: message,
          tripId: sessionState.tripId,
        },
      };
    }
    
    // Airbnb/民宿搜索关键词（优先级高于酒店）
    if (lowerMessage.includes('airbnb') || 
        lowerMessage.includes('民宿') || 
        lowerMessage.includes('短租') ||
        (lowerMessage.includes('bnb') && !lowerMessage.includes('hotel')) ||
        (lowerMessage.includes('推荐') && (lowerMessage.includes('airbnb') || lowerMessage.includes('民宿')))) {
      return {
        target: 'airbnb',
        confidence: 0.95, // 提高置信度
        reason: 'User wants Airbnb listings',
        reasonCN: '用户想要搜索 Airbnb/民宿',
        extractedParams: {
          naturalLanguage: message,
          excludeAirbnb: false,
        },
      };
    }

    // 住宿搜索关键词（包括酒店和 Airbnb）
    if (lowerMessage.includes('住宿') && 
        !lowerMessage.includes('酒店') && 
        !lowerMessage.includes('airbnb') &&
        !lowerMessage.includes('民宿')) {
      return {
        target: 'accommodation',
        confidence: 0.85,
        reason: 'User wants accommodation (hotels + Airbnb)',
        reasonCN: '用户想要搜索住宿（包括酒店和 Airbnb）',
        extractedParams: {
          naturalLanguage: message,
          excludeAirbnb: false,
        },
      };
    }
    
    // 酒店搜索关键词（增强匹配，确保"推荐酒店"按钮正确路由）
    const hotelKeywords = [
      '酒店', 'hotel', '找酒店', '搜索酒店', '推荐酒店',
      '酒店推荐', '酒店搜索', '找住宿', '住宿推荐'
    ];
    const hasHotelKeyword = hotelKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // 特殊处理："推荐酒店"必须路由到 hotel，不能路由到 recommendations
    const isRecommendHotel = lowerMessage.includes('推荐') && lowerMessage.includes('酒店');
    
    if (hasHotelKeyword || isRecommendHotel) {
      this.logger.debug(
        `[关键词路由] 酒店关键词匹配: message="${message}", ` +
        `hasHotelKeyword=${hasHotelKeyword}, isRecommendHotel=${isRecommendHotel}, ` +
        `lowerMessage="${lowerMessage}"`
      );
      // 优先使用会话中的目的地，如果没有则从消息中提取
      let destination = contextDestination;
      
      if (!destination) {
        // 尝试从消息中提取目的地（移除"推荐"、"酒店"等关键词）
        destination = message;
        // 移除常见关键词，保留地点信息
        destination = destination.replace(/推荐|酒店|hotel|找|搜索|住宿|推荐|的/gi, '').trim();
        // 如果移除后还有内容，作为目的地
        if (destination && destination.length > 0) {
          destination = destination.trim();
        } else {
          // 如果移除后为空，且没有上下文目的地，destination 设为 undefined（让服务端处理）
          destination = undefined;
        }
      }
      
      // 记录路由决策日志
      this.logger.debug(
        `[关键词路由] 酒店搜索匹配: message="${message}", ` +
        `contextDestination=${contextDestination || 'none'}, ` +
        `extractedDestination=${destination || 'none'}`
      );
      
      return {
        target: 'hotel',
        confidence: 0.95, // 进一步提高置信度，确保优先匹配
        reason: destination ? `User wants to search for hotels in ${destination}` : 'User wants to search for hotels',
        reasonCN: destination ? `用户想要搜索${destination}的酒店` : '用户想要搜索酒店',
        extractedParams: {
          naturalLanguage: message,
          ...(destination && { destination: destination }),
          excludeAirbnb: false, // 改为 false，因为现在优先使用 Airbnb
        },
      };
    }

    // 餐厅搜索关键词
    if (lowerMessage.includes('餐厅') || lowerMessage.includes('restaurant') ||
        lowerMessage.includes('餐馆') || lowerMessage.includes('饭店') ||
        lowerMessage.includes('美食') || lowerMessage.includes('好吃的') ||
        lowerMessage.includes('吃饭') || lowerMessage.includes('用餐') ||
        (lowerMessage.includes('推荐') && (lowerMessage.includes('餐厅') || lowerMessage.includes('美食')))) {
      return {
        target: 'restaurant',
        confidence: 0.9, // 提高置信度
        reason: 'User wants to search for restaurants',
        reasonCN: '用户想要搜索餐厅',
        extractedParams: {
          naturalLanguage: message,
        },
      };
    }

    // 航班搜索关键词
    if (lowerMessage.includes('航班') || lowerMessage.includes('flight') ||
        lowerMessage.includes('机票') || lowerMessage.includes('飞机') ||
        lowerMessage.includes('查机票') || lowerMessage.includes('找航班') ||
        (lowerMessage.includes('搜索') && (lowerMessage.includes('航班') || lowerMessage.includes('机票')))) {
      // 尝试提取出发地、目的地、日期（与铁路类似）
      let origin = '';
      let destination = '';
      const fromToZh = message.match(/从\s*([^\s到]+)\s*到\s*([^\s的]+)/);
      const toZh = message.match(/([^\s,，]+)\s*到\s*([^\s,，]+)/);
      const fromToEn = message.match(/from\s+([^\s]+)\s+to\s+([^\s]+)/i);
      if (fromToZh) {
        origin = fromToZh[1].trim();
        destination = fromToZh[2].trim();
      } else if (toZh && (lowerMessage.includes('航班') || lowerMessage.includes('机票') || lowerMessage.includes('飞机'))) {
        origin = toZh[1].trim();
        destination = toZh[2].trim();
      } else if (fromToEn) {
        origin = fromToEn[1].trim();
        destination = fromToEn[2].trim();
      }
      let departureDate = '';
      const isoDate = message.match(/(\d{4}-\d{2}-\d{2})/);
      const cnDate = message.match(/(\d{1,2})月(\d{1,2})[日号]?/);
      const slashDate = message.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
      const tomorrowZh = /\b(明天|后天|大后天)\b/.exec(message);
      const tomorrowEn = /\b(tomorrow|day after tomorrow)\b/i.exec(message);
      const monthEn = message.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
      const now = new Date();
      const y = now.getFullYear();
      if (isoDate) departureDate = isoDate[1];
      else if (cnDate) departureDate = `${y}-${cnDate[1].padStart(2, '0')}-${cnDate[2].padStart(2, '0')}`;
      else if (slashDate) departureDate = `${slashDate[3] || y}-${slashDate[1].padStart(2, '0')}-${slashDate[2].padStart(2, '0')}`;
      else if (tomorrowZh) {
        const days: Record<string, number> = { 明天: 1, 后天: 2, 大后天: 3 };
        const d = new Date(now); d.setDate(d.getDate() + (days[tomorrowZh[1]] || 1));
        departureDate = d.toISOString().split('T')[0];
      } else if (tomorrowEn) {
        const days = tomorrowEn[1].toLowerCase() === 'tomorrow' ? 1 : 2;
        const d = new Date(now); d.setDate(d.getDate() + days);
        departureDate = d.toISOString().split('T')[0];
      } else if (monthEn) {
        const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
        const m = months[monthEn[1].toLowerCase()];
        if (m) departureDate = `${y}-${String(m).padStart(2, '0')}-${monthEn[2].padStart(2, '0')}`;
      }
      return {
        target: 'flight',
        confidence: 0.9,
        reason: 'User wants to search for flights',
        reasonCN: '用户想要搜索航班',
        extractedParams: {
          naturalLanguage: message,
          ...(origin && { origin }),
          ...(destination && { destination }),
          ...(departureDate && { departureDate }),
        },
      };
    }

    // 铁路查询关键词
    if (lowerMessage.includes('火车') || lowerMessage.includes('rail') ||
        lowerMessage.includes('高铁') || lowerMessage.includes('动车') ||
        lowerMessage.includes('铁路') || lowerMessage.includes('train') ||
        (lowerMessage.includes('查询') && (lowerMessage.includes('火车') || lowerMessage.includes('铁路')))) {
      // 尝试提取出发地、目的地：从X到Y、X到Y、from X to Y
      let origin = '';
      let destination = '';
      const fromToZh = message.match(/从\s*([^\s到]+)\s*到\s*([^\s的]+)/);
      const toZh = message.match(/([^\s,，]+)\s*到\s*([^\s,，]+)/);
      const fromToEn = message.match(/from\s+([^\s]+)\s+to\s+([^\s]+)/i);
      if (fromToZh) {
        origin = fromToZh[1].trim();
        destination = fromToZh[2].trim();
      } else if (toZh && (lowerMessage.includes('火车') || lowerMessage.includes('铁路') || lowerMessage.includes('高铁'))) {
        origin = toZh[1].trim();
        destination = toZh[2].trim();
      } else if (fromToEn) {
        origin = fromToEn[1].trim();
        destination = fromToEn[2].trim();
      }
      // 尝试提取出行日期/时间：3月15日、3月15号、3/15、明天、后天、明天下午、March 15、tomorrow
      let date = '';
      const isoDate = message.match(/(\d{4}-\d{2}-\d{2})(?:\s*[T\s](\d{1,2}):?(\d{2})?)?/);
      const cnDate = message.match(/(\d{1,2})月(\d{1,2})[日号]?(?:\s*[上下]午|\s*(\d{1,2}):?(\d{2})?)?/);
      const slashDate = message.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
      const tomorrowZh = /\b(明天|后天|大后天)\b/.exec(message);
      const tomorrowEn = /\b(tomorrow|day after tomorrow)\b/i.exec(message);
      const monthEn = message.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
      const now = new Date();
      const y = now.getFullYear();
      if (isoDate) {
        date = isoDate[2] ? `${isoDate[1]}T${isoDate[2].padStart(2, '0')}:${(isoDate[3] || '00').padStart(2, '0')}:00` : isoDate[1];
      } else if (cnDate) {
        const d = `${y}-${cnDate[1].padStart(2, '0')}-${cnDate[2].padStart(2, '0')}`;
        date = cnDate[3] ? `${d}T${cnDate[3].padStart(2, '0')}:${(cnDate[4] || '00').padStart(2, '0')}:00` : d;
      } else if (slashDate) {
        const yr = slashDate[3] || String(y);
        date = `${yr}-${slashDate[1].padStart(2, '0')}-${slashDate[2].padStart(2, '0')}`;
      } else if (tomorrowZh) {
        const days = { 明天: 1, 后天: 2, 大后天: 3 };
        const d = new Date(now); d.setDate(d.getDate() + (days[tomorrowZh[1] as keyof typeof days] || 1));
        date = d.toISOString().split('T')[0];
      } else if (tomorrowEn) {
        const days = tomorrowEn[1].toLowerCase() === 'tomorrow' ? 1 : 2;
        const d = new Date(now); d.setDate(d.getDate() + days);
        date = d.toISOString().split('T')[0];
      } else if (monthEn) {
        const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
        const m = months[monthEn[1].toLowerCase()];
        if (m) date = `${y}-${String(m).padStart(2, '0')}-${monthEn[2].padStart(2, '0')}`;
      }
      return {
        target: 'rail',
        confidence: 0.9, // 提高置信度
        reason: 'User wants to search for rail routes',
        reasonCN: '用户想要查询铁路',
        extractedParams: {
          naturalLanguage: message,
          ...(origin && { origin }),
          ...(destination && { destination }),
          ...(date && { date }),
        },
      };
    }

    // 租车搜索关键词
    if (lowerMessage.includes('租车') || lowerMessage.includes('car rental') ||
        lowerMessage.includes('car hire') || lowerMessage.includes('租车推荐') ||
        lowerMessage.includes('推荐') && (lowerMessage.includes('租车') || lowerMessage.includes('租车公司'))) {
      // 优先使用会话中的目的地，其次使用 context.countryCode（如 IS、JP）
      let destination = contextDestination || (sessionState?.countryCode as string | undefined);
      
      if (!destination) {
        // 尝试从消息中提取目的地（移除"搜索"、"租车"、"的"、"推荐"等关键词）
        destination = message.replace(/搜索|租车|car\s*rental|car\s*hire|推荐|的|找|查/gi, '').trim();
        if (!destination || destination.length === 0) {
          destination = message;
        }
      }
      
      return {
        target: 'carRental',
        confidence: 0.95, // 高置信度
        reason: destination ? `User wants to search for car rentals in ${destination}` : 'User wants to search for car rentals',
        reasonCN: destination ? `用户想要搜索${destination}的租车` : '用户想要搜索租车',
        extractedParams: {
          naturalLanguage: message,
          destination: destination,
          countryCode: sessionState?.countryCode,
        },
      };
    }

    // 天气查询关键词（增强匹配）
    if (lowerMessage.includes('天气') || lowerMessage.includes('weather') ||
        lowerMessage.includes('天气预报') || lowerMessage.includes('查天气') ||
        lowerMessage.includes('天气怎么样') || lowerMessage.includes('天气如何') ||
        lowerMessage.includes('天气情况') || lowerMessage.includes('气温') ||
        lowerMessage.includes('温度') || lowerMessage.includes('下雨') ||
        lowerMessage.includes('晴天') || lowerMessage.includes('多云')) {
      // 提取目的地（如果有）
      let destination = contextDestination;
      if (!destination && lowerMessage.includes('天气')) {
        // 尝试从消息中提取地点（移除天气相关词汇）
        destination = message.replace(/天气|weather|预报|怎么样|如何|情况|查询|查/gi, '').trim();
        if (!destination || destination.length === 0) {
          destination = message;
        }
      }
      
      return {
        target: 'weather',
        confidence: 0.95, // 提高置信度
        reason: destination ? `User wants weather information for ${destination}` : 'User wants weather information',
        reasonCN: destination ? `用户想要查询${destination}的天气` : '用户想要查询天气',
        extractedParams: {
          naturalLanguage: message,
          destination: destination,
          location: destination, // 同时设置 location 字段
        },
      };
    }

    // Web搜索关键词（增强匹配）
    if (lowerMessage.includes('搜索') || lowerMessage.includes('search') ||
        lowerMessage.includes('查一下') || lowerMessage.includes('网上搜索') ||
        lowerMessage.includes('web') || lowerMessage.includes('网上') ||
        lowerMessage.includes('攻略') || lowerMessage.includes('指南') ||
        lowerMessage.includes('信息') || lowerMessage.includes('资料') ||
        lowerMessage.includes('深度搜索') || lowerMessage.includes('深度研究') ||
        lowerMessage.includes('web搜索') || lowerMessage.includes('web search')) {
      // 提取搜索查询
      let query = message;
      // 如果消息包含"搜索"，提取搜索内容
      if (lowerMessage.includes('搜索')) {
        const searchMatch = message.match(/搜索[：:：]?(.+)/i) || message.match(/搜索(.+)/i);
        if (searchMatch && searchMatch[1]) {
          query = searchMatch[1].trim();
        }
      }
      
      return {
        target: 'search',
        confidence: 0.85, // 提高置信度
        reason: 'User wants web search',
        reasonCN: '用户想要搜索信息',
        extractedParams: {
          naturalLanguage: message,
          query: query,
        },
      };
    }

    // 翻译关键词
    if (lowerMessage.includes('翻译') || lowerMessage.includes('translate') ||
        lowerMessage.includes('什么意思') || lowerMessage.includes('是什么意思')) {
      return {
        target: 'translate',
        confidence: 0.85,
        reason: 'User wants translation',
        reasonCN: '用户想要翻译',
        extractedParams: {
          naturalLanguage: message,
        },
      };
    }

    // 货币转换关键词
    if (lowerMessage.includes('汇率') || lowerMessage.includes('exchange rate') ||
        lowerMessage.includes('货币转换') || lowerMessage.includes('换算') ||
        lowerMessage.includes('换') && (lowerMessage.includes('元') || lowerMessage.includes('美元') || lowerMessage.includes('人民币'))) {
      return {
        target: 'currency',
        confidence: 0.85,
        reason: 'User wants currency conversion',
        reasonCN: '用户想要货币转换',
        extractedParams: {
          naturalLanguage: message,
        },
      };
    }

    // 图片搜索关键词
    if (lowerMessage.includes('图片') || lowerMessage.includes('image') ||
        lowerMessage.includes('照片') || lowerMessage.includes('picture') ||
        lowerMessage.includes('找图片') || lowerMessage.includes('图片搜索')) {
      return {
        target: 'image',
        confidence: 0.8,
        reason: 'User wants image search',
        reasonCN: '用户想要搜索图片',
        extractedParams: {
          naturalLanguage: message,
        },
      };
    }

    // 推荐相关关键词（只有在没有匹配到具体服务时才使用）
    // 注意：这个检查应该在所有具体服务关键词之后，确保具体服务优先
    // **重要：如果用户已选定目的地，不应该推荐目的地，应该路由到具体服务或chat**
    const recommendKeywords = [
      '推荐', 'recommend', '推荐一些', '推荐几个', '有什么', '哪里', 'where',
      '目的地', 'destination', '好玩', '值得去', '适合', 'suitable'
    ];
    // 检查是否已经匹配到具体服务关键词
    const hasSpecificServiceKeyword = 
      lowerMessage.includes('酒店') || lowerMessage.includes('hotel') ||
      lowerMessage.includes('airbnb') || lowerMessage.includes('民宿') ||
      lowerMessage.includes('餐厅') || lowerMessage.includes('restaurant') ||
      lowerMessage.includes('航班') || lowerMessage.includes('flight') ||
      lowerMessage.includes('火车') || lowerMessage.includes('rail') ||
      lowerMessage.includes('租车') || lowerMessage.includes('car rental') ||
      lowerMessage.includes('天气') || lowerMessage.includes('weather') ||
      lowerMessage.includes('翻译') || lowerMessage.includes('translate') ||
      lowerMessage.includes('汇率') || lowerMessage.includes('货币') ||
      lowerMessage.includes('图片') || lowerMessage.includes('image');
    
    // 如果用户已选定目的地或规划工作台（tripId存在），且没有匹配到具体服务，路由到chat而不是recommendations
    const hasExistingTrip = !!(contextDestination || sessionState?.tripId);
    if (hasExistingTrip && !hasSpecificServiceKeyword && recommendKeywords.some(keyword => lowerMessage.includes(keyword))) {
      this.logger.debug(`用户已有行程（selectedDestination=${contextDestination || 'none'}, tripId=${sessionState?.tripId || 'none'}），路由到chat而不是recommendations`);
      return {
        target: 'chat',
        confidence: 0.7,
        reason: `User has existing trip, route to chat for context-aware response`,
        reasonCN: `用户已有行程，路由到对话以提供上下文感知的回复`,
        extractedParams: {
          naturalLanguage: message,
          destination: contextDestination,
        },
      };
    }
    
    if (!hasSpecificServiceKeyword && recommendKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return {
        target: 'recommendations',
        confidence: 0.8,
        reason: 'Contains recommendation keywords',
        reasonCN: '包含推荐关键词',
        extractedParams: {
          naturalLanguage: message,
        },
      };
    }

    // 生成方案相关关键词
    const generateKeywords = [
      '规划', 'plan', '生成', 'generate', '安排', 'arrange', '行程', 'itinerary',
      '方案', '计划', '做个', '帮我', '帮我规划', '帮我安排'
    ];
    if (generateKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return {
        target: 'generate',
        confidence: 0.8,
        reason: 'Contains plan generation keywords',
        reasonCN: '包含方案生成关键词',
        extractedParams: {
          naturalLanguage: message,
        },
      };
    }

    // 对比相关关键词
    const compareKeywords = [
      '对比', 'compare', '比较', '哪个', '哪个好', '哪个更好', '区别', 'difference',
      '差异', '对比一下', '比较一下'
    ];
    if (compareKeywords.some(keyword => lowerMessage.includes(keyword))) {
      // 如果有方案候选，提取方案ID
      const planIds = sessionState?.planCandidates?.map(p => p.id) || [];
      return {
        target: 'compare',
        confidence: planIds.length >= 2 ? 0.9 : 0.6,
        reason: 'Contains comparison keywords',
        reasonCN: '包含对比关键词',
        extractedParams: {
          planIds: planIds.length >= 2 ? planIds.slice(0, 2) : [],
          naturalLanguage: message,
        },
      };
    }

    // 默认路由到对话
    return {
      target: 'chat',
      confidence: 0.6,
      reason: 'No specific intent detected, route to chat',
      reasonCN: '未检测到特定意图，路由到对话',
      extractedParams: {
        naturalLanguage: message,
      },
    };
  }

  /**
   * 从自然语言提取参数
   */
  async extractParams(
    naturalLanguage: string,
    targetType: 'recommendations' | 'generate' | 'compare'
  ): Promise<ExtractedParams> {
    this.logger.debug(`提取参数: type=${targetType}, message="${naturalLanguage.substring(0, 50)}..."`);

    if (!this.llmService) {
      this.logger.warn('LLM服务不可用，无法提取参数');
      return {};
    }

    const prompt = this.buildExtractionPrompt(naturalLanguage, targetType);

    try {
      const result = await this.llmService.callLlmWithSchema(
        LlmProvider.DEEPSEEK,
        prompt
      );

      let parsed: any;
      if (typeof result === 'string') {
        // 清理 markdown 代码块标记（```json ... ```）
        const cleaned = this.cleanJsonString(result);
        parsed = JSON.parse(cleaned);
      } else {
        parsed = result;
      }

      this.logger.debug(`参数提取成功: ${JSON.stringify(parsed).substring(0, 100)}...`);

      return parsed as ExtractedParams;
    } catch (error: any) {
      this.logger.warn(`参数提取失败: ${error.message}`);
      return {};
    }
  }

  /**
   * 清理 JSON 字符串，移除 markdown 代码块标记
   */
  private cleanJsonString(jsonString: string): string {
    if (!jsonString || typeof jsonString !== 'string') {
      return jsonString;
    }

    let cleaned = jsonString.trim();

    // 移除开头的 ```json 或 ```
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    
    // 移除结尾的 ```
    cleaned = cleaned.replace(/\s*```$/g, '');

    // 移除前后空白
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * 构建参数提取的Prompt
   */
  private buildExtractionPrompt(
    naturalLanguage: string,
    targetType: 'recommendations' | 'generate' | 'compare'
  ): string {
    const basePrompt = `从用户消息中提取结构化参数。

用户消息: "${naturalLanguage}"`;

    switch (targetType) {
      case 'recommendations':
        return `${basePrompt}

提取以下参数（如果存在）:
- destination: 目的地（国家、城市）
- preferences.budget: 预算信息 { total: 金额, currency: "CNY"|"USD" }
- preferences.travelers: 出行人数 { adults: 人数, children: 可选 }
- preferences.activities: 活动偏好（数组）
- preferences.travelStyle: 旅行风格
- filters.countryCode: 国家代码（ISO 3166-1 alpha-2）
- filters.region: 地区

返回JSON格式:
{
  "destination": "目的地",
  "preferences": { ... },
  "filters": { ... }
}`;

      case 'generate':
        return `${basePrompt}

提取以下参数（如果存在）:
- destination: 目的地（必需）
- preferences.budget: 预算信息
- preferences.travelers: 出行人数
- preferences.activities: 活动偏好
- constraints.days: 天数
- constraints.startDate: 开始日期（ISO格式）
- constraints.endDate: 结束日期（ISO格式）

返回JSON格式:
{
  "destination": "目的地",
  "preferences": { ... },
  "constraints": { ... }
}`;

      case 'compare':
        return `${basePrompt}

提取以下参数（如果存在）:
- planIds: 方案ID列表（如果消息中提到了方案编号或名称）

返回JSON格式:
{
  "planIds": ["plan_id_1", "plan_id_2"]
}`;

      default:
        return basePrompt;
    }
  }

  /**
   * 映射路由目标到服务名称
   */
  private mapTargetToServiceName(target: RoutingTarget): string | null {
    const mapping: Record<string, string> = {
      'airbnb': 'airbnb',
      'weather': 'weather',
      'search': 'exa',
      'hotel': 'hotel', // 酒店搜索（服务层会优先使用 Airbnb）
      'accommodation': 'hotel', // 住宿搜索映射到 hotel 服务（业务层会同时搜索酒店和 Airbnb）
      'restaurant': 'restaurant',
      'flight': 'amadeus',
      'rail': 'rail',
      'carRental': 'booking-com',
      'translate': 'translation',
      'currency': 'currency',
      'image': 'image',
      'calendar': 'google-calendar', // 新增日历服务映射
    };
    
    return mapping[target] || null;
  }
}
