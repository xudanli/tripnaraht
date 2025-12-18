// src/agent/services/router.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RouterOutput, RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';
import { EventTelemetryService } from './event-telemetry.service';

/**
 * Router Service
 * 
 * 语义路由：决定走 System 1 还是 System 2
 * 
 * 策略：规则优先 + 小模型灰区裁决
 */
@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);

  constructor(private eventTelemetry?: EventTelemetryService) {}

  /**
   * 路由决策
   * 
   * @param userInput 用户输入
   * @param context 上下文信息
   * @param requestId 请求 ID（用于事件追踪）
   * @returns RouterOutput
   */
  async route(
    userInput: string,
    context?: {
      tripId?: string | null;
      recentMessages?: string[];
      userId?: string;
    },
    requestId?: string
  ): Promise<RouterOutput> {
    const startTime = Date.now();

    try {
      // 1. 硬规则短路检查
      const hardRuleResult = this.checkHardRules(userInput, context);
      if (hardRuleResult) {
        const output = hardRuleResult;
        output.ui_hint.status = this.getInitialUIStatus(output.route);
        const routerMs = Date.now() - startTime;
        this.logger.debug(`Router decision (hard rule): ${output.route}, confidence: ${output.confidence}, ms: ${routerMs}`);
        
        // 记录事件
        if (this.eventTelemetry && requestId) {
          this.eventTelemetry.recordRouterDecision(
            requestId,
            output.route,
            output.confidence,
            output.reasons.map(r => String(r)),
            routerMs,
            { method: 'hard_rule' }
          );
        }
        
        return output;
      }

      // 2. 特征提取
      const features = this.extractFeatures(userInput, context);

      // 3. 灰区打分
      const score = this.scoreFeatures(features);

      // 4. 路由决策
      const route = this.decideRoute(score, features);

      // 5. 构建输出
      const output: RouterOutput = {
        route,
        confidence: score.confidence,
        reasons: features.reasons,
        required_capabilities: this.getRequiredCapabilities(route, features),
        consent_required: this.requiresConsent(route, features),
        budget: this.getBudget(route),
        ui_hint: {
          mode: route.startsWith('SYSTEM1') ? 'fast' : 'slow',
          status: this.getInitialUIStatus(route),
          message: this.getUIMessage(route, score.confidence),
        },
      };

      const routerMs = Date.now() - startTime;
      this.logger.debug(`Router decision: ${output.route}, confidence: ${output.confidence}, ms: ${routerMs}`);

      // 记录事件
      if (this.eventTelemetry && requestId) {
        this.eventTelemetry.recordRouterDecision(
          requestId,
          output.route,
          output.confidence,
          output.reasons.map(r => String(r)),
          routerMs,
          { method: 'feature_scoring' }
        );
      }

      return output;
    } catch (error: any) {
      this.logger.error(`Router error: ${error?.message || String(error)}`, error?.stack);
      
      // 记录 fallback 事件
      if (this.eventTelemetry && requestId) {
        this.eventTelemetry.recordFallbackTriggered(
          requestId,
          'UNKNOWN',
          RouteType.SYSTEM1_API,
          `Router error: ${error?.message || String(error)}`,
          { error: error?.message || String(error) }
        );
      }
      
      // 降级到 System1_API
      const fallbackOutput = {
        route: RouteType.SYSTEM1_API,
        confidence: 0.3,
        reasons: [RouterReason.MISSING_INFO],
        required_capabilities: [],
        consent_required: false,
        budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
        ui_hint: {
          mode: 'fast' as const,
          status: UIStatus.THINKING,
          message: '正在处理您的请求...',
        },
      };

      // 记录 fallback 路由决策事件
      if (this.eventTelemetry && requestId) {
        const routerMs = Date.now() - startTime;
        this.eventTelemetry.recordRouterDecision(
          requestId,
          fallbackOutput.route,
          fallbackOutput.confidence,
          fallbackOutput.reasons.map(r => String(r)),
          routerMs,
          { method: 'fallback', error: error?.message || String(error) }
        );
      }

      return fallbackOutput;
    }
  }

  /**
   * 硬规则短路检查
   */
  private checkHardRules(
    userInput: string,
    context?: any
  ): RouterOutput | null {
    const input = userInput.toLowerCase();

    // 支付/退款/批量写库 → System2 + consent
    if (
      /支付|付款|下单|预订|退款|取消订单|批量|删除.*个|添加.*个/i.test(input)
    ) {
      return {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 0.9,
        reasons: [RouterReason.HIGH_RISK_ACTION],
        required_capabilities: ['planner'],
        consent_required: true,
        budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.AWAITING_CONSENT,
          message: '此操作需要您的确认',
        },
      };
    }

    // 浏览器/官网查询 → System2_WEBBROWSE + consent
    if (
      /浏览器|官网|网页|爬取|查.*房|查.*有房/i.test(input)
    ) {
      return {
        route: RouteType.SYSTEM2_WEBBROWSE,
        confidence: 0.9,
        reasons: [RouterReason.REALTIME_WEB, RouterReason.HIGH_RISK_ACTION],
        required_capabilities: ['browser'],
        consent_required: true,
        budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 12 },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.AWAITING_CONSENT,
          message: '此操作需要您的确认',
        },
      };
    }

    // 明确 CRUD → System1_API
    if (
      /删除|移除|添加|移动|改.*优先级|设置.*为/i.test(input) &&
      !/规划|如果|要是/i.test(input)
    ) {
      return {
        route: RouteType.SYSTEM1_API,
        confidence: 0.85,
        reasons: [],
        required_capabilities: ['places', 'trips'],
        consent_required: false,
        budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
        ui_hint: {
          mode: 'fast',
          status: UIStatus.THINKING,
          message: '正在处理...',
        },
      };
    }

    // 单纯事实查询 → System1_RAG
    if (
      /是什么|在哪里|营业时间|开放时间|多少钱|价格|推荐.*餐厅|推荐.*景点|推荐.*拉面|推荐.*美食/i.test(input) &&
      !/规划|几天|如果|要是/i.test(input)
    ) {
      return {
        route: RouteType.SYSTEM1_RAG,
        confidence: 0.8,
        reasons: [],
        required_capabilities: ['places'],
        consent_required: false,
        budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
        ui_hint: {
          mode: 'fast',
          status: UIStatus.THINKING,
          message: '正在查询...',
        },
      };
    }

    return null;
  }

  /**
   * 特征提取
   */
  private extractFeatures(
    userInput: string,
    context?: any
  ): {
    constraintCount: number;
    ambiguity: number;
    hasRealtimeWeb: boolean;
    hasPlanning: boolean;
    reasons: RouterReason[];
  } {
    const input = userInput.toLowerCase();
    
    // 约束数量（"既要...又要...但不要..."）
    const constraintCount = (
      (input.match(/既要|又要|还要|但是|不过|然而|可是/g) || []).length +
      (input.match(/不要|不能|避免|避开/g) || []).length
    );

    // 歧义（未解析实体、代词）
    const ambiguity = (
      (input.match(/这个|那个|它|它们|这里|那里/g) || []).length +
      (input.match(/\?|？/g) || []).length
    );

    // 实时/网页信号
    const hasRealtimeWeb = /官网|下.*有房|今天|现在|实时|限量|抢购/i.test(input);

    // 规划信号
    const hasPlanning = /规划|几天|行程|路线|赶得上|如果.*就|要是.*就/i.test(input);

    const reasons: RouterReason[] = [];
    if (constraintCount >= 2) reasons.push(RouterReason.MULTI_CONSTRAINT);
    if (ambiguity > 0) reasons.push(RouterReason.MISSING_INFO);
    if (hasRealtimeWeb) reasons.push(RouterReason.REALTIME_WEB);
    if (hasPlanning) reasons.push(RouterReason.NO_API);

    return {
      constraintCount,
      ambiguity,
      hasRealtimeWeb,
      hasPlanning,
      reasons,
    };
  }

  /**
   * 特征打分
   */
  private scoreFeatures(features: any): {
    confidence: number;
    route: RouteType;
  } {
    let score = 0.5; // 初始中性分数
    let route = RouteType.SYSTEM1_API;

    // 约束多 → System2
    if (features.constraintCount >= 2) {
      score += 0.3;
      route = RouteType.SYSTEM2_REASONING;
    }

    // 有规划信号 → System2
    if (features.hasPlanning) {
      score += 0.25;
      route = RouteType.SYSTEM2_REASONING;
    }

    // 有实时/网页信号 → System2_WEBBROWSE
    if (features.hasRealtimeWeb) {
      score += 0.2;
      route = RouteType.SYSTEM2_WEBBROWSE;
    }

    // 歧义高 → 降低置信度
    if (features.ambiguity > 2) {
      score -= 0.3;
    }

    // 归一化置信度
    const confidence = Math.max(0.1, Math.min(0.95, score));

    return { confidence, route };
  }

  /**
   * 路由决策
   */
  private decideRoute(
    score: { confidence: number; route: RouteType },
    features: any
  ): RouteType {
    // 如果置信度低，降级到 System1
    if (score.confidence < 0.45) {
      return features.hasPlanning ? RouteType.SYSTEM1_RAG : RouteType.SYSTEM1_API;
    }

    return score.route;
  }

  /**
   * 获取所需能力
   */
  private getRequiredCapabilities(route: RouteType, features: any): string[] {
    const capabilities: string[] = [];

    if (route === RouteType.SYSTEM1_RAG || route === RouteType.SYSTEM2_REASONING) {
      capabilities.push('places');
    }

    if (route === RouteType.SYSTEM2_REASONING) {
      capabilities.push('transport', 'planner');
    }

    if (route === RouteType.SYSTEM2_WEBBROWSE) {
      capabilities.push('browser');
    }

    return capabilities;
  }

  /**
   * 是否需要同意
   */
  private requiresConsent(route: RouteType, features: any): boolean {
    return route === RouteType.SYSTEM2_WEBBROWSE || features.hasRealtimeWeb;
  }

  /**
   * 获取预算
   */
  private getBudget(route: RouteType): {
    max_seconds: number;
    max_steps: number;
    max_browser_steps: number;
  } {
    if (route.startsWith('SYSTEM1')) {
      return { max_seconds: 3, max_steps: 1, max_browser_steps: 0 };
    }

    if (route === RouteType.SYSTEM2_WEBBROWSE) {
      return { max_seconds: 60, max_steps: 8, max_browser_steps: 12 };
    }

    return { max_seconds: 60, max_steps: 8, max_browser_steps: 0 };
  }

  /**
   * 获取初始 UI 状态
   */
  private getInitialUIStatus(route: RouteType): UIStatus {
    if (route.startsWith('SYSTEM1')) {
      return UIStatus.THINKING;
    }
    return UIStatus.THINKING;
  }

  /**
   * 获取 UI 消息
   */
  private getUIMessage(route: RouteType, confidence: number): string {
    if (confidence < 0.45) {
      return '需要更多信息才能处理您的请求';
    }

    if (route.startsWith('SYSTEM1')) {
      return '正在快速处理...';
    }

    return '正在深度分析...';
  }
}

