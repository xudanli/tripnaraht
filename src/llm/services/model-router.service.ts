import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../dto/llm-request.dto';

/**
 * 模型路由策略
 */
export enum RoutingStrategy {
  /** 优先使用 vLLM（快速、低成本） */
  VLLM_FIRST = 'vllm_first',
  /** 优先使用外部 API（高质量） */
  API_FIRST = 'api_first',
  /** 根据任务复杂度自动选择 */
  AUTO = 'auto',
  /** 始终使用指定提供商 */
  FIXED = 'fixed',
}

/**
 * 任务复杂度
 */
export enum TaskComplexity {
  /** 简单任务（单轮对话、简单查询） */
  SIMPLE = 'simple',
  /** 中等任务（多步推理、结构化输出） */
  MEDIUM = 'medium',
  /** 复杂任务（长文本、复杂推理、多轮对话） */
  COMPLEX = 'complex',
}

/**
 * 路由决策
 */
export interface RoutingDecision {
  /** 选择的提供商 */
  provider: LlmProvider;
  /** 模型名称 */
  model: string;
  /** LoRA 适配器（如果使用 vLLM） */
  loraAdapter?: string;
  /** 决策理由 */
  reason: string;
  /** 降级提供商（如果主提供商失败） */
  fallbackProvider?: LlmProvider;
}

/**
 * 路由请求
 */
export interface RoutingRequest {
  /** 任务类型 */
  taskType: string;
  /** 任务复杂度（可选，自动推断） */
  complexity?: TaskComplexity;
  /** 输入长度（用于判断复杂度） */
  inputLength?: number;
  /** 是否需要结构化输出 */
  structuredOutput?: boolean;
  /** 是否需要函数调用 */
  functionCalling?: boolean;
  /** 指定提供商（覆盖路由策略） */
  preferredProvider?: LlmProvider;
  /** 最大延迟要求（毫秒） */
  maxLatencyMs?: number;
  /** 最大成本要求（美分/请求） */
  maxCostCents?: number;
}

/**
 * 模型信息
 */
interface ModelInfo {
  provider: LlmProvider;
  model: string;
  /** 每 1000 tokens 成本（美分） */
  costPer1kTokens: number;
  /** 平均延迟（毫秒） */
  avgLatencyMs: number;
  /** 最大上下文长度 */
  maxContextLength: number;
  /** 是否支持函数调用 */
  supportsFunctionCalling: boolean;
  /** 是否支持结构化输出 */
  supportsStructuredOutput: boolean;
  /** 推理能力评分（1-10） */
  reasoningScore: number;
  /** 是否可用 */
  available: boolean;
}

/**
 * TripNARA 模型路由服务
 * 
 * 职责：
 * 1. 在 vLLM 自托管模型和外部 API 之间智能路由
 * 2. 根据任务复杂度、成本、延迟要求选择最优模型
 * 3. 支持降级策略
 * 4. 监控模型可用性和性能
 */
@Injectable()
export class ModelRouterService implements OnModuleInit {
  private readonly logger = new Logger(ModelRouterService.name);
  
  /** 路由策略 */
  private strategy: RoutingStrategy;
  
  /** 固定提供商（当策略为 FIXED 时） */
  private fixedProvider: LlmProvider;
  
  /** vLLM 是否可用 */
  private vllmAvailable: boolean = false;
  
  /** 模型信息表 */
  private readonly modelInfoMap: Map<LlmProvider, ModelInfo> = new Map();
  
  constructor(private readonly configService: ConfigService) {
    // 从配置读取路由策略
    const strategyConfig = this.configService.get<string>('LLM_ROUTING_STRATEGY') || 'auto';
    this.strategy = this.parseStrategy(strategyConfig);
    
    // 固定提供商
    const fixedProviderConfig = this.configService.get<string>('LLM_FIXED_PROVIDER') || 'deepseek';
    this.fixedProvider = this.parseProvider(fixedProviderConfig);
    
    // 初始化模型信息
    this.initModelInfo();
  }
  
  async onModuleInit() {
    this.logger.log(`ModelRouterService initialized, strategy: ${this.strategy}`);
    
    // 检查 vLLM 可用性
    await this.checkVllmAvailability();
  }
  
  /**
   * 初始化模型信息
   */
  private initModelInfo(): void {
    // vLLM (Qwen2.5-7B + LoRA)
    this.modelInfoMap.set(LlmProvider.VLLM, {
      provider: LlmProvider.VLLM,
      model: 'Qwen/Qwen2.5-7B-Instruct',
      costPer1kTokens: 0.1, // 自托管，仅计算成本
      avgLatencyMs: 300,
      maxContextLength: 8192,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      reasoningScore: 7,
      available: false, // 启动时检查
    });
    
    // DeepSeek
    this.modelInfoMap.set(LlmProvider.DEEPSEEK, {
      provider: LlmProvider.DEEPSEEK,
      model: 'deepseek-chat',
      costPer1kTokens: 0.14,
      avgLatencyMs: 800,
      maxContextLength: 32768,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      reasoningScore: 8,
      available: !!this.configService.get<string>('DEEPSEEK_API_KEY'),
    });
    
    // OpenAI (GPT-4o)
    this.modelInfoMap.set(LlmProvider.OPENAI, {
      provider: LlmProvider.OPENAI,
      model: 'gpt-4o',
      costPer1kTokens: 5.0,
      avgLatencyMs: 1500,
      maxContextLength: 128000,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      reasoningScore: 9,
      available: !!this.configService.get<string>('OPENAI_API_KEY'),
    });
    
    // Anthropic (Claude 3.5 Sonnet)
    this.modelInfoMap.set(LlmProvider.ANTHROPIC, {
      provider: LlmProvider.ANTHROPIC,
      model: 'claude-3-5-sonnet-20241022',
      costPer1kTokens: 3.0,
      avgLatencyMs: 2000,
      maxContextLength: 200000,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      reasoningScore: 9,
      available: !!this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
    
    // Gemini
    this.modelInfoMap.set(LlmProvider.GEMINI, {
      provider: LlmProvider.GEMINI,
      model: 'gemini-pro',
      costPer1kTokens: 0.5,
      avgLatencyMs: 1000,
      maxContextLength: 32768,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      reasoningScore: 7,
      available: !!this.configService.get<string>('GEMINI_API_KEY'),
    });
  }
  
  /**
   * 解析路由策略
   */
  private parseStrategy(config: string): RoutingStrategy {
    const map: Record<string, RoutingStrategy> = {
      'vllm_first': RoutingStrategy.VLLM_FIRST,
      'api_first': RoutingStrategy.API_FIRST,
      'auto': RoutingStrategy.AUTO,
      'fixed': RoutingStrategy.FIXED,
    };
    return map[config.toLowerCase()] || RoutingStrategy.AUTO;
  }
  
  /**
   * 解析提供商
   */
  private parseProvider(config: string): LlmProvider {
    const map: Record<string, LlmProvider> = {
      'openai': LlmProvider.OPENAI,
      'gemini': LlmProvider.GEMINI,
      'deepseek': LlmProvider.DEEPSEEK,
      'anthropic': LlmProvider.ANTHROPIC,
      'vllm': LlmProvider.VLLM,
    };
    return map[config.toLowerCase()] || LlmProvider.DEEPSEEK;
  }
  
  /**
   * 检查 vLLM 可用性
   */
  private async checkVllmAvailability(): Promise<void> {
    const vllmUrl = this.configService.get<string>('VLLM_URL') || 'http://localhost:8080';
    
    try {
      const response = await fetch(`${vllmUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      
      this.vllmAvailable = response.ok;
      
      const vllmInfo = this.modelInfoMap.get(LlmProvider.VLLM);
      if (vllmInfo) {
        vllmInfo.available = this.vllmAvailable;
      }
      
      if (this.vllmAvailable) {
        this.logger.log('vLLM service is available');
      } else {
        this.logger.warn('vLLM service is not available');
      }
    } catch (error: any) {
      this.vllmAvailable = false;
      this.logger.warn(`vLLM health check failed: ${error?.message || error}`);
    }
  }
  
  /**
   * 获取路由决策
   */
  async route(request: RoutingRequest): Promise<RoutingDecision> {
    // 如果指定了提供商，直接使用
    if (request.preferredProvider) {
      return this.createDecision(request.preferredProvider, 'User specified provider');
    }
    
    // 根据策略路由
    switch (this.strategy) {
      case RoutingStrategy.VLLM_FIRST:
        return this.routeVllmFirst(request);
      
      case RoutingStrategy.API_FIRST:
        return this.routeApiFirst(request);
      
      case RoutingStrategy.FIXED:
        return this.createDecision(this.fixedProvider, 'Fixed provider strategy');
      
      case RoutingStrategy.AUTO:
      default:
        return this.routeAuto(request);
    }
  }
  
  /**
   * vLLM 优先路由
   */
  private async routeVllmFirst(_request: RoutingRequest): Promise<RoutingDecision> {
    // 检查 vLLM 是否可用
    if (this.vllmAvailable) {
      return this.createDecision(LlmProvider.VLLM, 'vLLM first strategy', LlmProvider.DEEPSEEK);
    }
    
    // 降级到 DeepSeek
    return this.createDecision(LlmProvider.DEEPSEEK, 'vLLM not available, fallback to DeepSeek');
  }
  
  /**
   * API 优先路由
   */
  private async routeApiFirst(_request: RoutingRequest): Promise<RoutingDecision> {
    // 按优先级尝试外部 API
    const providers = [
      LlmProvider.ANTHROPIC,
      LlmProvider.OPENAI,
      LlmProvider.DEEPSEEK,
      LlmProvider.GEMINI,
    ];
    
    for (const provider of providers) {
      const info = this.modelInfoMap.get(provider);
      if (info?.available) {
        return this.createDecision(provider, 'API first strategy', LlmProvider.VLLM);
      }
    }
    
    // 所有外部 API 不可用，降级到 vLLM
    if (this.vllmAvailable) {
      return this.createDecision(LlmProvider.VLLM, 'All APIs unavailable, fallback to vLLM');
    }
    
    // 使用 DeepSeek 作为最后的降级
    return this.createDecision(LlmProvider.DEEPSEEK, 'Fallback to DeepSeek');
  }
  
  /**
   * 自动路由（根据任务特征选择）
   */
  private async routeAuto(request: RoutingRequest): Promise<RoutingDecision> {
    // 推断任务复杂度
    const complexity = request.complexity || this.inferComplexity(request);
    
    // 简单任务 → vLLM（快速、低成本）
    if (complexity === TaskComplexity.SIMPLE && this.vllmAvailable) {
      return this.createDecision(
        LlmProvider.VLLM,
        'Simple task, using vLLM for speed',
        LlmProvider.DEEPSEEK,
      );
    }
    
    // 中等任务 → DeepSeek（性价比）
    if (complexity === TaskComplexity.MEDIUM) {
      const deepseekInfo = this.modelInfoMap.get(LlmProvider.DEEPSEEK);
      if (deepseekInfo?.available) {
        return this.createDecision(
          LlmProvider.DEEPSEEK,
          'Medium task, using DeepSeek for balance',
          LlmProvider.VLLM,
        );
      }
    }
    
    // 复杂任务 → Claude/GPT-4（高质量）
    if (complexity === TaskComplexity.COMPLEX) {
      const anthropicInfo = this.modelInfoMap.get(LlmProvider.ANTHROPIC);
      if (anthropicInfo?.available) {
        return this.createDecision(
          LlmProvider.ANTHROPIC,
          'Complex task, using Claude for quality',
          LlmProvider.OPENAI,
        );
      }
      
      const openaiInfo = this.modelInfoMap.get(LlmProvider.OPENAI);
      if (openaiInfo?.available) {
        return this.createDecision(
          LlmProvider.OPENAI,
          'Complex task, using GPT-4 for quality',
          LlmProvider.DEEPSEEK,
        );
      }
    }
    
    // 考虑延迟要求
    if (request.maxLatencyMs && request.maxLatencyMs < 500 && this.vllmAvailable) {
      return this.createDecision(
        LlmProvider.VLLM,
        'Low latency requirement, using vLLM',
        LlmProvider.DEEPSEEK,
      );
    }
    
    // 考虑成本要求
    if (request.maxCostCents && request.maxCostCents < 1 && this.vllmAvailable) {
      return this.createDecision(
        LlmProvider.VLLM,
        'Low cost requirement, using vLLM',
        LlmProvider.DEEPSEEK,
      );
    }
    
    // 默认使用 vLLM（如果可用）或 DeepSeek
    if (this.vllmAvailable) {
      return this.createDecision(LlmProvider.VLLM, 'Default to vLLM', LlmProvider.DEEPSEEK);
    }
    
    return this.createDecision(LlmProvider.DEEPSEEK, 'Default to DeepSeek');
  }
  
  /**
   * 推断任务复杂度
   */
  private inferComplexity(request: RoutingRequest): TaskComplexity {
    // 根据输入长度
    if (request.inputLength) {
      if (request.inputLength > 4000) return TaskComplexity.COMPLEX;
      if (request.inputLength > 1000) return TaskComplexity.MEDIUM;
    }
    
    // 根据任务类型
    const complexTasks = ['planning', 'decision', 'analysis', 'what-if'];
    const mediumTasks = ['summarize', 'extract', 'translate', 'explain'];
    
    if (complexTasks.some(t => request.taskType.toLowerCase().includes(t))) {
      return TaskComplexity.COMPLEX;
    }
    
    if (mediumTasks.some(t => request.taskType.toLowerCase().includes(t))) {
      return TaskComplexity.MEDIUM;
    }
    
    // 函数调用通常需要更好的模型
    if (request.functionCalling) {
      return TaskComplexity.MEDIUM;
    }
    
    return TaskComplexity.SIMPLE;
  }
  
  /**
   * 创建路由决策
   */
  private createDecision(
    provider: LlmProvider,
    reason: string,
    fallbackProvider?: LlmProvider,
  ): RoutingDecision {
    const modelInfo = this.modelInfoMap.get(provider);
    
    return {
      provider,
      model: modelInfo?.model || 'unknown',
      loraAdapter: provider === LlmProvider.VLLM ? 'tripnara-decision' : undefined,
      reason,
      fallbackProvider,
    };
  }
  
  /**
   * 获取模型信息
   */
  getModelInfo(provider: LlmProvider): ModelInfo | undefined {
    return this.modelInfoMap.get(provider);
  }
  
  /**
   * 获取所有可用模型
   */
  getAvailableModels(): ModelInfo[] {
    return Array.from(this.modelInfoMap.values()).filter(m => m.available);
  }
  
  /**
   * 更新 vLLM 可用性
   */
  setVllmAvailable(available: boolean): void {
    this.vllmAvailable = available;
    const vllmInfo = this.modelInfoMap.get(LlmProvider.VLLM);
    if (vllmInfo) {
      vllmInfo.available = available;
    }
  }
  
  /**
   * 获取当前路由策略
   */
  getStrategy(): RoutingStrategy {
    return this.strategy;
  }
  
  /**
   * 设置路由策略
   */
  setStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy;
    this.logger.log(`Routing strategy changed to: ${strategy}`);
  }
}
