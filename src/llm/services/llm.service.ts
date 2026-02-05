// src/llm/services/llm.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import dns from 'node:dns';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { NaturalLanguageToParamsDto, TripCreationParams, HumanizeResultDto, DecisionSupportDto, LlmProvider } from '../dto/llm-request.dto';
import { createOpenAIHttp } from '../utils/openai-http.factory';
import { retryWithBackoff } from '../utils/retry-with-backoff';
import { CircuitBreaker } from '../utils/circuit-breaker';

/**
 * 通用 LLM 服务
 * 
 * 提供以下功能：
 * 1. 自然语言转接口参数（如创建行程）
 * 2. 复杂决策支持（What-If评估、多方案对比）
 * 3. 结果人性化转化（结构化数据转自然语言）
 * 4. 异常处理与追问
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly defaultProvider: LlmProvider;
  private readonly useMock: boolean;
  
  // OpenAI HTTP 客户端（使用显式代理配置）
  private readonly openaiHttp: AxiosInstance;
  // 共享的 HTTPS Agent（用于其他 LLM 提供商，如 DeepSeek、Anthropic）
  private readonly httpsAgent: https.Agent | HttpsProxyAgent<string>;
  // 熔断器（用于在连续失败后禁用 API 调用）
  private readonly circuitBreaker: CircuitBreaker;

  constructor(@Optional() private configService?: ConfigService) {
    // 强制 IPv4 优先（解决 IPv6 连接失败问题）
    dns.setDefaultResultOrder('ipv4first');
    
    // 检查是否禁用代理（默认启用代理，如果配置了代理环境变量）
    // 只有当 LLM_DISABLE_PROXY 明确设置为 'true' 时才禁用代理
    const disableProxy = this.configService?.get<string>('LLM_DISABLE_PROXY') === 'true' || 
                         process.env.LLM_DISABLE_PROXY === 'true';
    
    // 检查代理环境变量（用于创建共享的 httpsAgent）
    const proxyUrl = disableProxy
      ? undefined
      : (this.configService?.get<string>('HTTPS_PROXY') ||
         this.configService?.get<string>('https_proxy') ||
         this.configService?.get<string>('ALL_PROXY') ||
         process.env.HTTPS_PROXY ||
         process.env.https_proxy ||
         process.env.ALL_PROXY ||
         process.env.all_proxy);
    
    // 记录代理配置状态
    if (proxyUrl) {
      this.logger.log(`[LLM] 使用代理: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`); // 隐藏密码
    } else if (disableProxy) {
      this.logger.debug(`[LLM] 代理已禁用（LLM_DISABLE_PROXY=true）`);
    } else {
      this.logger.debug(`[LLM] 未配置代理环境变量`);
    }

    // 创建共享的 HTTPS Agent（用于其他 LLM 提供商）
    // 注意：如果代理服务器未运行，会导致连接错误，因此默认禁用代理
    this.httpsAgent = proxyUrl
      ? new HttpsProxyAgent<string>(proxyUrl)
      : new https.Agent({
          keepAlive: true,
          family: 4, // 强制 IPv4
        });
    
    // 处理 baseURL - 使用可选链和 process.env 作为保底
    const baseUrl = this.configService?.get<string>('OPENAI_BASE_URL') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
    // 使用统一的工厂函数创建 OpenAI HTTP 客户端（默认禁用代理）
    this.openaiHttp = createOpenAIHttp(baseUrl, this.logger, { disableProxy });
    
    // 创建熔断器（连续 5 次失败后熔断，1 分钟后进入 HALF_OPEN）
    this.circuitBreaker = new CircuitBreaker('LlmService', {
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1分钟
      halfOpenMaxCalls: 2,
    });
    
    // 检查是否启用 Mock 模式（用于测试或网络不可用时）
    this.useMock = (this.configService?.get<string>('LLM_USE_MOCK') || process.env.LLM_USE_MOCK) === 'true';
    
    // 根据环境变量确定默认提供商
    // 优先使用 DeepSeek（如果配置了）
    const deepseekKey = this.configService?.get<string>('DEEPSEEK_API_KEY') || process.env.DEEPSEEK_API_KEY;
    const openaiKey = this.configService?.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
    const geminiKey = this.configService?.get<string>('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    const anthropicKey = this.configService?.get<string>('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;
    
    if (deepseekKey) {
      this.defaultProvider = LlmProvider.DEEPSEEK;
    } else if (openaiKey) {
      this.defaultProvider = LlmProvider.OPENAI;
    } else if (geminiKey) {
      this.defaultProvider = LlmProvider.GEMINI;
    } else if (anthropicKey) {
      this.defaultProvider = LlmProvider.ANTHROPIC;
    } else {
      this.defaultProvider = LlmProvider.DEEPSEEK; // 默认使用 DeepSeek
      // 如果没有配置 API Key 且未启用 Mock，自动启用 Mock
      if (!this.useMock) {
        this.logger.warn('⚠️ LlmService Warning: No LLM API key configured (checked ConfigService and process.env), will use mock mode');
        // 注意：这里不能直接修改 useMock，因为它是 readonly
        // 实际会在 callLlm 中检查网络连接失败时自动回退
      }
    }
  }

  /**
   * 获取系统推荐的默认提供商
   * 
   * @returns 系统推荐的 LLM 提供商
   */
  getDefaultProvider(): LlmProvider {
    return this.defaultProvider;
  }

  /**
   * 自然语言转接口参数
   * 将用户的口语化需求转换为创建行程的接口参数
   */
  /**
   * 从 LLM 响应中提取 JSON
   * 处理可能包含 markdown 代码块标记的情况（如 ```json ... ```）
   */
  private extractJSON(response: string): any {
    let cleaned = response.trim();
    
    // 移除 markdown 代码块标记
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, ''); // 移除开头的 ```json 或 ```
    cleaned = cleaned.replace(/\s*```$/i, ''); // 移除结尾的 ```
    cleaned = cleaned.trim();
    
    // 尝试提取 JSON 对象（如果响应中包含其他文本）
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    return JSON.parse(cleaned);
  }

  async naturalLanguageToTripParams(dto: NaturalLanguageToParamsDto): Promise<{
    params: TripCreationParams;
    needsClarification: boolean;
    clarificationQuestions?: string[];
    // 新增：旅行规划师风格的响应
    plannerReply?: string;
    suggestedQuestions?: string[];
    conversationContext?: Record<string, any>;
    // 🆕 原始LLM输出（用于响应转换）
    llmRawOutput?: any;
  }> {
    const provider = dto.provider || this.defaultProvider;
    // 🆕 如果提供了 destinationConfig，使用特化 Prompt
    const prompt = this.buildTripCreationPrompt(
      dto.text,
      dto.contextBlocks,
      dto.destinationCode,
      dto.destinationConfig
    );

    try {
      // 🆕 根据 destinationConfig 动态构建 schema（包含特化字段）
      const schema = this.getTripCreationSchema(dto.destinationConfig);
      const response = await this.callLlm(provider, prompt, schema);
      const parsed = this.extractJSON(response);

      // 添加调试日志
      this.logger.debug(`LLM parsed result: ${JSON.stringify(parsed, null, 2)}`);
      this.logger.debug(`LLM needsClarification: ${parsed.needsClarification}, inferredFields: ${JSON.stringify(parsed.inferredFields)}`);

      // 验证必需字段
      const hasAllRequiredFields = parsed.destination && parsed.startDate && parsed.endDate && parsed.totalBudget;

      // 判断是否需要澄清：
      // 1. 如果有推断字段，需要澄清确认
      // 2. 如果缺少必需字段，需要澄清
      const hasInferredFields = parsed.inferredFields && parsed.inferredFields.length > 0;
      const shouldClarify = !hasAllRequiredFields || hasInferredFields || parsed.needsClarification;

      if (shouldClarify) {
        // 使用智能旅行规划师风格生成澄清对话
        this.logger.debug('Generating planner-style clarification dialog');
        const clarification = await this.generatePlannerStyleClarification(
          dto.text,
          parsed,
          parsed.inferredFields
        );

      return {
        params: parsed as TripCreationParams,
        needsClarification: true,
          // 保留旧字段以保持向后兼容
          clarificationQuestions: clarification.suggestedQuestions || this.generateFallbackQuestions(parsed, parsed.inferredFields),
          // 新增：旅行规划师风格的响应
          plannerReply: clarification.reply,
          suggestedQuestions: clarification.suggestedQuestions,
          conversationContext: clarification.conversationContext,
          // 🆕 原始LLM输出（用于响应转换）
          llmRawOutput: clarification.llmRawOutput,
        };
      }

      // 信息完整，可以直接创建行程
      this.logger.debug('All required fields present, no clarification needed');
      return {
        params: parsed as TripCreationParams,
        needsClarification: false,
      };
    } catch (error: any) {
      this.logger.error(`Failed to parse natural language: ${error.message}`);
      throw error;
    }
  }

  /**
   * 结果人性化转化
   * 将接口返回的结构化数据转化为自然语言描述
   */
  async humanizeResult(dto: HumanizeResultDto): Promise<string> {
    const provider = dto.provider || this.defaultProvider;
    const prompt = this.buildHumanizePrompt(dto.dataType, dto.data);

    try {
      const response = await this.callLlm(provider, prompt);
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to humanize result: ${error.message}`);
      throw error;
    }
  }

  /**
   * 决策支持
   * 基于接口数据提供智能决策建议
   */
  async provideDecisionSupport(dto: DecisionSupportDto): Promise<{
    recommendations: Array<{
      title: string;
      description: string;
      confidence: number;
      reasoning: string;
    }>;
    summary: string;
  }> {
    const provider = dto.provider || this.defaultProvider;
    const prompt = this.buildDecisionSupportPrompt(dto.scenario, dto.contextData);

    try {
      const response = await this.callLlm(provider, prompt, this.getDecisionSupportSchema());
      const parsed = this.extractJSON(response);
      return parsed;
    } catch (error: any) {
      this.logger.error(`Failed to provide decision support: ${error.message}`);
      throw error;
    }
  }

  /**
   * 异常处理与追问
   * 当接口调用失败或参数不足时，生成追问话术
   */
  async handleErrorAndClarify(error: any, context: string): Promise<{
    message: string;
    clarificationQuestions: string[];
    suggestedActions: string[];
  }> {
    // 如果启用 Mock 模式或网络不可用，直接返回默认错误处理
    if (this.useMock) {
      this.logger.warn('Using mock error handling');
      return {
        message: `抱歉，处理您的请求时遇到了问题：${error.message || '未知错误'}`,
        clarificationQuestions: [
          '请检查输入参数是否正确',
          '请提供更详细的行程信息（目的地、日期、预算等）',
        ],
        suggestedActions: ['重试', '使用标准创建行程接口', '联系客服'],
      };
    }

    const provider = this.defaultProvider;
    const prompt = this.buildErrorHandlingPrompt(error, context);

    try {
      const response = await this.callLlm(provider, prompt, this.getErrorHandlingSchema());
      const parsed = this.extractJSON(response);
      return parsed;
    } catch (err: any) {
      this.logger.error(`Failed to handle error with LLM: ${err.message}`);
      // 回退到默认错误处理
      return {
        message: `抱歉，处理您的请求时遇到了问题：${error.message || '未知错误'}`,
        clarificationQuestions: [
          '请检查输入参数是否正确',
          '请提供更详细的行程信息（目的地、日期、预算等）',
        ],
        suggestedActions: ['重试', '使用标准创建行程接口', '联系客服'],
      };
    }
  }

  /**
   * 通用 LLM 调用（公共方法，供其他模块使用）
   * 
   * @param provider LLM 提供商
   * @param prompt 提示词
   * @param schema JSON Schema（可选，用于结构化输出）
   * @returns LLM 响应文本
   */
  async callLlmWithSchema(
    provider: LlmProvider,
    prompt: string,
    schema?: any
  ): Promise<string> {
    return this.callLlm(provider, prompt, schema);
  }

  /**
   * 调用 LLM API（内部方法）
   */
  private async callLlm(
    provider: LlmProvider,
    prompt: string,
    schema?: any
  ): Promise<string> {
    // 如果启用 Mock 模式，返回模拟响应
    if (this.useMock) {
      this.logger.warn('Using mock LLM response');
      return this.getMockResponse(prompt, schema);
    }

    // 检查熔断器状态
    if (this.circuitBreaker.isOpen()) {
      const state = this.circuitBreaker.getState();
      this.logger.warn(`Circuit breaker is ${state}, falling back to mock mode`);
      return this.getMockResponse(prompt, schema);
    }

    try {
      switch (provider) {
        case LlmProvider.OPENAI:
          return await this.callOpenAI(prompt, schema);
        case LlmProvider.GEMINI:
          return await this.callGemini(prompt, schema);
        case LlmProvider.DEEPSEEK:
          return await this.callDeepSeek(prompt, schema);
        case LlmProvider.ANTHROPIC:
          return await this.callAnthropic(prompt, schema);
        default:
          throw new Error(`Unsupported LLM provider: ${provider}`);
      }
    } catch (error: any) {
      // 如果网络请求失败，自动回退到 Mock 模式
      const isNetworkError = 
        error.message?.includes('no response received') || 
        error.message?.includes('network') || 
        error.message?.includes('aborted') ||
        error.message?.includes('timeout') ||
        error.message?.includes('503') || // 503 错误也应该触发降级
        error.response?.status === 503 || // 检查 HTTP 状态码
        error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNABORTED';
      
      if (isNetworkError) {
        const errorDetails = error.response?.status 
          ? `HTTP ${error.response.status}: ${error.response?.data?.error?.message || error.message}`
          : error.message;
        this.logger.warn(`LLM API call failed (${errorDetails}), falling back to mock mode`);
        return this.getMockResponse(prompt, schema);
      }
      throw error;
    }
  }

  /**
   * Mock 响应（用于测试或网络不可用时）
   * 
   * 关键：根据调用场景返回正确的 mock 数据结构
   * - selectAction: 返回 action 选择结果（action_name, input, reasoning 等）
   * - naturalLanguageToTripParams: 返回 trip 参数（destination, startDate 等）
   * - 其他: 返回符合 schema 的默认结构
   */
  private getMockResponse(prompt: string, schema?: any): string {
    this.logger.debug(`Mock LLM response for prompt: ${prompt.substring(0, 100)}...`);
    
    // 判断调用场景：检查 schema 结构
    const isActionSelection = schema?.properties?.action_name !== undefined;
    const isTripParams = schema?.properties?.destination !== undefined;
    
    if (isActionSelection) {
      // 场景：LLM Plan Service 的 selectAction 调用
      // 返回一个合法的 action 选择，而不是 trip 参数
      // 根据 prompt 内容智能选择 action
      let actionName = 'places.resolve_entities';
      let input: any = {};
      
      // 从 prompt 中提取状态信息
      const nodesMatch = prompt.match(/nodes:\s*(\d+)/);
      const nodesCount = nodesMatch ? parseInt(nodesMatch[1]) : 0;
      const factsMatch = prompt.match(/facts:\s*(\d+)/);
      const factsCount = factsMatch ? parseInt(factsMatch[1]) : 0;
      const hasTimeMatrix = prompt.includes('time_matrix:') && !prompt.includes('time_matrix: null');
      
      // 检查是否有违规信息
      const hasDaysMismatch = prompt.includes('DAYS_COUNT_MISMATCH') || prompt.includes('天数不匹配');
      const hasTimeMissing = prompt.includes('ROBUST_TIME_MISSING') || prompt.includes('缺少时间矩阵');
      const hasLunchMissing = prompt.includes('LUNCH_MISSING') || prompt.includes('缺少午餐');
      
      // 优先级规则：
      // 1. 如果 nodes=0，必须先解析实体（不能获取 facts）
      if (nodesCount === 0) {
        actionName = 'places.resolve_entities';
        input = {};
      }
      // 2. 如果有节点但没有 facts，获取 facts
      else if (nodesCount > 0 && factsCount === 0) {
        actionName = 'places.get_poi_facts';
        // 尝试提取 node IDs（如果有的话）
        const nodeIdsMatch = prompt.match(/node_ids:\s*\[([\d,\s]+)\]/);
        if (nodeIdsMatch) {
          input = { poi_ids: nodeIdsMatch[1].split(',').map((id: string) => parseInt(id.trim())) };
        } else {
          input = {};
        }
      }
      // 3. 如果有节点和 facts 但没有时间矩阵，构建时间矩阵
      else if (nodesCount > 0 && factsCount > 0 && !hasTimeMatrix) {
        actionName = 'transport.build_time_matrix';
        input = {};
      }
      // 4. 如果所有前置条件满足，执行优化
      else if (nodesCount > 0 && factsCount > 0 && hasTimeMatrix) {
        actionName = 'itinerary.optimize_day_vrptw';
        input = {};
      }
      // 5. 根据违规类型选择修复 action
      else if (hasTimeMissing && nodesCount > 0) {
        actionName = 'transport.build_time_matrix';
        input = {};
      }
      // 默认：解析实体
      else {
        actionName = 'places.resolve_entities';
        input = {};
      }
      
      const result = {
        action_name: actionName,
        input,
        reasoning: `Mock mode: 根据当前状态选择 ${actionName} (nodes=${nodesCount}, facts=${factsCount}, hasTimeMatrix=${hasTimeMatrix})`,
        confidence: 0.5, // Mock 模式置信度较低
        should_continue: true,
      };
      
      this.logger.warn(`Mock mode: returning action selection (${actionName}), confidence=0.5`);
      this.logger.debug(`Mock response: ${JSON.stringify(result)}`);
      return JSON.stringify(result);
    }
    
    if (isTripParams) {
      // 场景：naturalLanguageToTripParams 调用
      // 返回 trip 参数（这是唯一应该返回 destination/startDate 的场景）
      const dayMatch = prompt.match(/(\d+)\s*天/);
      const days = dayMatch ? parseInt(dayMatch[1]) : 5;
      
      const budgetMatch = prompt.match(/(\d+)\s*万/);
      const budget = budgetMatch ? parseInt(budgetMatch[1]) * 10000 : 20000;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + days);
      
      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const startDateStr = formatDate(today);
      const endDateStr = formatDate(endDate);
      
      // 检测目的地
      let destination: string | null = null;
      if (prompt.includes('北京') || prompt.includes('中国') || prompt.includes('CN')) {
        destination = 'CN';
      } else if (prompt.includes('东京') || prompt.includes('日本') || prompt.includes('JP')) {
        destination = 'JP';
      }
      
      const result = {
        destination: destination || 'CN', // 默认中国（更符合常见场景）
        startDate: startDateStr,
        endDate: endDateStr,
        totalBudget: budget,
        hasChildren: (prompt.includes('带娃') || prompt.includes('小孩') || prompt.includes('孩子')) && !prompt.includes('去日本玩'),
        hasElderly: prompt.includes('老人') || prompt.includes('父母') || prompt.includes('长辈'),
        preferences: {},
      };
      
      this.logger.warn(`Mock mode: returning trip params (destination=${destination})`);
      this.logger.debug(`Mock response: ${JSON.stringify(result)}`);
      return JSON.stringify(result);
    }
    
    // 其他场景：返回符合 schema 的默认结构
    this.logger.warn(`Mock mode: unknown schema, returning empty object`);
    return JSON.stringify({});
  }

  /**
   * 调用 OpenAI API
   */
  private async callOpenAI(prompt: string, schema?: any): Promise<string> {
    const apiKey = this.configService?.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured (checked ConfigService and process.env)');
    }

    const model = this.configService?.get<string>('OPENAI_MODEL') || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    
    const body: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    };

    // 如果提供了 schema，使用 structured outputs
    if (schema) {
      // 检查是否支持新的 json_schema 格式（gpt-4o-2024-08-06 及以后版本）
      const supportsJsonSchema = model.includes('gpt-4o') && (
        model.includes('2024-08-06') || 
        model.includes('2024-07-18') ||
        model === 'gpt-4o' || 
        model === 'gpt-4o-mini'
      );
      
      if (supportsJsonSchema) {
        // 使用新的 json_schema 格式（更稳定、更严格）
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response_schema',
            strict: true,
            schema: schema,
          },
        };
      } else if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
        // 降级到 json_object 格式（向后兼容）
        body.response_format = { type: 'json_object' };
        body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
      }
    }

    try {
      // 使用显式配置的 openaiHttp 实例，带重试机制
      this.logger.debug(`Calling OpenAI API with URL: ${this.openaiHttp.defaults.baseURL}/chat/completions`);
      
      const response = await retryWithBackoff(
        () => this.openaiHttp.post('/chat/completions', body, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        }),
        {
          maxRetries: 3,
          initialDelayMs: 200,
          maxDelayMs: 2000,
          factor: 2,
          jitter: true,
        }
      );

      const data = response.data as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const result = data.choices?.[0]?.message?.content || '';
      
      // 记录成功
      this.circuitBreaker.recordSuccess();
      
      return result;
    } catch (error: any) {
      // 记录失败
      this.circuitBreaker.recordFailure();
      
      // 记录实际使用的 URL（从错误中提取）
      const actualUrl = error.config?.url || `${this.openaiHttp.defaults.baseURL}/chat/completions`;
      this.logger.debug(`Actual URL used in request: ${actualUrl}`);
      this.logger.debug(`Request config: ${JSON.stringify({ url: error.config?.url, baseURL: error.config?.baseURL, method: error.config?.method })}`);
      
      // 输出底层错误信息（AggregateError 的根因）
      const errorDetails = {
        message: error?.message,
        code: error?.code,
        errno: error?.errno,
        syscall: error?.syscall,
        address: error?.address,
        port: error?.port,
        cause: error?.cause?.message ?? error?.cause,
        errors: error?.errors?.map((e: any) => ({
          message: e?.message,
          code: e?.code,
          errno: e?.errno,
          syscall: e?.syscall,
        })),
      };
      this.logger.error(`OpenAI API error details: ${JSON.stringify(errorDetails, null, 2)}`);
      this.logger.error(`OpenAI API error: ${error.message}`, error.stack);
      
      if (error.response) {
        this.logger.error(`OpenAI API response: ${JSON.stringify(error.response.data)}`);
        throw new Error(`OpenAI API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      if (error.request) {
        this.logger.error(`OpenAI API request failed: no response received`);
        throw new Error(`OpenAI API request failed: no response received. Check network connection.`);
      }
      throw new Error(`OpenAI API request failed: ${error.message}`);
    }
  }

  /**
   * 调用 Gemini API
   */
  private async callGemini(prompt: string, schema?: any): Promise<string> {
    const apiKey = this.configService?.get<string>('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured (checked ConfigService and process.env)');
    }

    const model = this.configService?.get<string>('GEMINI_MODEL') || process.env.GEMINI_MODEL || 'gemini-pro';
    
    const body: any = {
      contents: [{
        parts: [{ text: prompt }],
      }],
    };

    if (schema) {
      body.generationConfig = {
        responseMimeType: 'application/json',
        responseSchema: schema,
      };
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 60000, // 增加超时时间
          proxy: false, // 关键：忽略 HTTP(S)_PROXY 环境变量
          httpsAgent: this.httpsAgent, // 使用共享的 HTTPS Agent
        }
      );

      const data = response.data as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Gemini API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Gemini API request failed: ${error.message}`);
    }
  }

  /**
   * 调用 DeepSeek API
   */
  private async callDeepSeek(prompt: string, schema?: any): Promise<string> {
    const apiKey = this.configService?.get<string>('DEEPSEEK_API_KEY') || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY not configured (checked ConfigService and process.env)');
    }

    const model = this.configService?.get<string>('DEEPSEEK_MODEL') || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    
    const body: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    };

    if (schema) {
      body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
    }

    // 根据请求大小动态调整超时时间
    // 对于大型请求（如行程编排），使用更长的超时时间
    const promptLength = prompt.length;
    const timeout = promptLength > 50000 ? 180000 : promptLength > 20000 ? 120000 : 60000; // 3分钟/2分钟/1分钟

    try {
      this.logger.debug(`调用 DeepSeek API (prompt长度: ${promptLength}, 超时: ${timeout}ms)`);
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout,
        proxy: false, // 关键：忽略 HTTP(S)_PROXY 环境变量
        httpsAgent: this.httpsAgent, // 使用共享的 HTTPS Agent
      });

      const data = response.data as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      // 检查是否是超时或中止错误
      const isTimeoutOrAbort = 
        error.code === 'ECONNABORTED' ||
        error.message?.includes('aborted') ||
        error.message?.includes('timeout') ||
        error.code === 'ETIMEDOUT';
      
      if (isTimeoutOrAbort) {
        this.logger.warn(`DeepSeek API 请求超时或中止 (prompt长度: ${promptLength}, 超时设置: ${timeout}ms): ${error.message}`);
        throw new Error(`DeepSeek API request timeout or aborted: ${error.message}`);
      }
      
      if (error.response) {
        throw new Error(`DeepSeek API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`DeepSeek API request failed: ${error.message}`);
    }
  }

  /**
   * 调用 Anthropic API
   */
  private async callAnthropic(prompt: string, schema?: any): Promise<string> {
    // 优先从 .env 文件直接读取（确保 .env 文件的优先级高于 process.env）
    // 使用 dotenv.parse() 而不是 dotenv.config()，避免修改 process.env
    const envPath = path.resolve(process.cwd(), '.env');
    let envConfig: Record<string, string> = {};
    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envConfig = dotenv.parse(envContent);
    } catch (error: any) {
      this.logger.warn(`[Anthropic] 无法读取 .env 文件: ${envPath}, 错误: ${error?.message || error}`);
    }
    
    // 优先使用 .env 文件的值，如果 .env 文件中没有，再使用 process.env
    const apiKey = envConfig.ANTHROPIC_API_KEY || this.configService?.get<string>('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured (checked .env file, ConfigService and process.env)');
    }

    // 优先使用 .env 文件的值
    const model = envConfig.ANTHROPIC_MODEL || this.configService?.get<string>('ANTHROPIC_MODEL') || process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
    
    // 支持自定义 base URL（用于代理）
    // 优先使用 .env 文件的值
    const baseUrl = envConfig.ANTHROPIC_BASE_URL || this.configService?.get<string>('ANTHROPIC_BASE_URL') || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    
    // 添加调试日志
    this.logger.debug(`[Anthropic] 配置来源: .env=${!!envConfig.ANTHROPIC_MODEL}, ConfigService=${!!this.configService?.get<string>('ANTHROPIC_MODEL')}, process.env=${!!process.env.ANTHROPIC_MODEL}`);
    this.logger.debug(`[Anthropic] 最终配置: model=${model}, baseUrl=${baseUrl}`);
    
    // 确保 base URL 以 /v1/messages 结尾（如果 base URL 已经包含路径，则直接使用）
    const apiUrl = baseUrl.endsWith('/v1/messages') 
      ? baseUrl 
      : `${baseUrl.replace(/\/$/, '')}/v1/messages`;
    
    // 根据 prompt 长度和 schema 复杂度动态调整 max_tokens
    // 对于复杂的骨架方案生成，需要更多的 tokens
    const promptLength = prompt.length;
    const estimatedOutputTokens = schema 
      ? Math.max(4096, Math.ceil(promptLength * 0.5)) // 复杂输出需要更多 tokens
      : 4096;
    const maxTokens = Math.min(8192, estimatedOutputTokens); // 限制最大为 8192
    
    const body: any = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };

    if (schema) {
      // 强化 JSON 格式要求，确保返回纯 JSON（不要包含任何解释性文本）
      body.messages[0].content += `\n\n【重要】你必须只返回 JSON 格式，不要包含任何其他文本、解释或 markdown 代码块标记。

请严格按照以下 JSON Schema 返回结果：

${JSON.stringify(schema, null, 2)}

要求：
1. 只返回 JSON 对象，不要包含 \`\`\`json 或 \`\`\` 标记
2. 不要添加任何解释性文字
3. 确保 JSON 格式完全有效
4. 所有字段必须符合 schema 定义`;
    }

    try {
      this.logger.debug(`[Anthropic] 调用 API: ${apiUrl}, model: ${model}`);
      
      // 使用重试机制调用 API
      const response = await retryWithBackoff(
        () => axios.post(apiUrl, body, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 60000, // 增加超时时间
          proxy: false, // 通过 httpsAgent 使用代理，不在这里设置 proxy
          httpsAgent: this.httpsAgent, // 使用共享的 HTTPS Agent（包含代理配置）
        }),
        {
          maxRetries: 3,
          initialDelayMs: 1000, // 初始延迟 1 秒
          maxDelayMs: 5000, // 最大延迟 5 秒
          retryCondition: (error: any) => {
            // 503 错误应该重试（上游服务暂时不可用）
            if (error.response?.status === 503) {
              this.logger.warn(`[Anthropic] 收到 503 错误，将重试: ${error.response?.data?.error?.message || 'Service unavailable'}`);
              return true;
            }
            // 其他可重试的错误
            const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'];
            if (error.code && retryableCodes.includes(error.code)) {
              return true;
            }
            // 网络超时错误
            if (error.message?.includes('timeout') || error.message?.includes('ECONNRESET')) {
              return true;
            }
            return false;
          },
        }
      );

      const data = response.data as {
        content?: Array<{ text?: string }>;
      };
      return data.content?.[0]?.text || '';
    } catch (error: any) {
      // 记录详细错误信息
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        const errorMsg = `Anthropic API error: ${status} ${JSON.stringify(errorData)}`;
        
        // 503 错误记录警告日志
        if (status === 503) {
          this.logger.warn(`[Anthropic] 上游服务不可用 (503): ${errorData?.error?.message || 'Service temporarily unavailable'}`);
        }
        
        throw new Error(errorMsg);
      }
      throw new Error(`Anthropic API request failed: ${error.message}`);
    }
  }

  // ========== Prompt 构建方法 ==========

  private buildTripCreationPrompt(
    text: string,
    contextBlocks?: any[],
    destinationCode?: string,
    destinationConfig?: any
  ): string {
    // 获取当前日期用于日期推算
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDate = now.toISOString().split('T')[0];

    // 构建 Context Package 信息（如果有）
    let contextSection = '';
    if (contextBlocks && contextBlocks.length > 0) {
      const contextInfo = contextBlocks
        .map((block: any) => {
          const type = block.type || 'UNKNOWN';
          const content = block.content || '';
          // 只提取关键信息，避免 token 过多
          const summary = content.length > 500 ? content.substring(0, 500) + '...' : content;
          return `### ${type}\n${summary}`;
        })
        .join('\n\n');
      
      contextSection = `\n## 目的地上下文信息（用于增强理解）

以下信息来自目的地知识库，可以帮助你更好地理解用户需求：

${contextInfo}

**注意**：这些上下文信息仅供参考，优先使用用户明确提到的信息。`;
    }

    // 🆕 如果目的地有特化配置，添加特化提取规则
    let specializedSection = '';
    if (destinationConfig && destinationConfig.enabled && destinationConfig.fieldExtractionRules) {
      specializedSection = this.buildDestinationSpecificPromptSection(destinationConfig, destinationCode);
    }

    return `你是一位经验丰富的旅行规划师，正在帮助用户规划旅行。用户说："${text}"

当前日期：${currentDate}${contextSection}

## 你的任务
从用户的自然语言中理解他们的旅行需求，并提取关键信息。

## 需要提取的信息
- destination: 目的地国家代码（ISO 3166-1 alpha-2，如 JP、CN、US、TH、IS）
- startDate: 开始日期（ISO 8601 格式）
- endDate: 结束日期（ISO 8601 格式）
- totalBudget: 总预算（人民币，元）
- hasChildren: 是否有小孩同行（布尔值）
- hasElderly: 是否有老人同行（布尔值）
- preferences: 旅行偏好（对象，包含 style、interests、pace 等）
- needsClarification: 是否需要进一步确认信息
- inferredFields: 推断的字段列表

## 旅行规划专业知识

### 目的地识别
- 日本：JP | 东京、大阪、京都、北海道、冲绳
- 泰国：TH | 曼谷、清迈、普吉岛、芭提雅
- 冰岛：IS | 雷克雅未克、黄金圈
- 新加坡：SG | 圣淘沙、滨海湾
- 韩国：KR | 首尔、釜山、济州岛
- 马来西亚：MY | 吉隆坡、槟城、兰卡威
- 越南：VN | 河内、胡志明市、岘港
- 欧洲国家：FR（法国）、IT（意大利）、ES（西班牙）、DE（德国）、GB（英国）、CH（瑞士）

### 日期处理
- "春节"（${currentYear}年或${currentYear + 1}年）：1月底~2月中
- "国庆"：10月1日~7日
- "五一"：5月1日~5日
- "暑假"：7月~8月
- "寒假"：1月中~2月
- "樱花季"（日本）：3月下旬~4月中旬
- "枫叶季"（日本）：11月
- "极光季"（冰岛/北欧）：9月~3月（但注意：如果用户明确提到9月日期，季节应该是过渡季，不是冬季）

### 预算参考（人民币/人）
- 东南亚5天：5000-15000
- 日本7天：10000-25000
- 韩国5天：6000-15000
- 冰岛10天：25000-50000
- 欧洲10天：20000-40000
- 亲子游通常预算+30%
- 老人游建议选择舒适档次

### 旅行风格识别
- "休闲/度假/放松" → style: "relaxed"
- "深度游/文化/历史" → style: "cultural"
- "冒险/户外/运动" → style: "adventure"
- "美食/逛吃/购物" → style: "foodie"
- "网红打卡/拍照" → style: "instagram"
- "亲子游/带娃/带孩子" → hasChildren: true, style: "family"
- "带父母/带老人/孝顺游" → hasElderly: true, style: "comfortable"

## 规则
1. **用户明确提到的信息**：不要标记为推断
   - 用户说"去日本" → destination: "JP", inferredFields 不包含 destination
   - 用户说"春节去" → 转换为具体日期，inferredFields 不包含日期

2. **需要推断的信息**：标记为推断并设置 needsClarification: true
   - 用户没提日期 → 推断合理日期，inferredFields 包含 "startDate", "endDate"
   - 用户没提预算 → 根据目的地推断，inferredFields 包含 "totalBudget"

3. **天数推算**
   - 用户说"5天" → endDate = startDate + 4天（含首尾）
   - 用户没说天数但说了日期范围 → 计算天数

4. **保守原则**
   - 宁可标记需要确认，也不要擅自做重大假设
   - 目的地是必须的，如果不清楚则 destination 留空

5. **日期与季节一致性**（重要）
   - 如果推断出了startDate，季节必须与日期一致：
     - 9月 → 过渡季/初秋，不是冬季（即使用户说"看极光"）
     - 12月-2月 → 冬季
     - 6月-8月 → 夏季
   - 不要因为活动偏好（如"看极光"）而忽略日期推断的季节
   - 如果日期和活动偏好矛盾，优先使用日期推断的季节

## 输出格式
返回纯 JSON，示例：
{
  "destination": "JP",
  "startDate": "2026-04-01T00:00:00.000Z",
  "endDate": "2026-04-07T00:00:00.000Z",
  "totalBudget": 20000,
  "hasChildren": true,
  "hasElderly": false,
  "preferences": {
    "style": "family",
    "interests": ["亲子", "樱花"],
    "pace": "relaxed"
  },
  "needsClarification": false,
  "inferredFields": []
}${specializedSection ? `\n\n## 目的地特化提取规则（${destinationConfig.destinationName}）\n\n${specializedSection}` : ''}`;
  }

  /**
   * 🆕 构建目的地特化 Prompt 片段
   */
  private buildDestinationSpecificPromptSection(
    config: any,
    destinationCode?: string
  ): string {
    let section = '';
    
    // 添加字段提取规则
    if (config.fieldExtractionRules && config.fieldExtractionRules.length > 0) {
      section += '### 特化字段提取\n\n';
      for (const rule of config.fieldExtractionRules) {
        section += `- **${rule.fieldName}** (${rule.fieldType}): ${rule.extractionPrompt}\n`;
        if (rule.validation) {
          section += `  - 验证规则: ${JSON.stringify(rule.validation)}\n`;
        }
      }
      section += '\n';
    }
    
    return section;
  }

  private buildHumanizePrompt(dataType: string, data: any): string {
    const dataStr = JSON.stringify(data, null, 2);
    
    const prompts: Record<string, string> = {
      itinerary_optimization: `请将以下行程优化结果转化为自然语言描述，包括时间安排、路线顺序、快乐值评分等：

${dataStr}

请用流畅的中文描述，让用户容易理解。`,
      
      what_if_evaluation: `请将以下 What-If 评估结果转化为自然语言，包括风险指标、候选方案对比、推荐建议等：

${dataStr}

请用清晰的中文说明每个方案的优劣。`,
      
      trip_schedule: `请将以下行程计划转化为自然语言描述，包括每日安排、活动时间、地点信息等：

${dataStr}

请用友好的语气描述，让用户对行程有清晰的了解。`,
      
      transport_plan: `请将以下交通规划结果转化为自然语言，包括交通方式、时间、痛苦指数、推荐理由等：

${dataStr}

请用简洁明了的中文说明。`,
    };

    return prompts[dataType] || `请将以下数据转化为自然语言描述：\n\n${dataStr}`;
  }

  private buildDecisionSupportPrompt(scenario: string, contextData: any): string {
    return `你是一个智能决策助手。当前场景：${scenario}

相关数据：
${JSON.stringify(contextData, null, 2)}

请分析数据，提供 2-3 个决策建议，每个建议包括：
- title: 建议标题
- description: 详细描述
- confidence: 置信度（0-1）
- reasoning: 推理过程

最后提供一个总结。`;
  }

  private buildErrorHandlingPrompt(error: any, context: string): string {
    return `用户在执行以下操作时遇到错误：
${context}

错误信息：
${JSON.stringify(error, null, 2)}

请生成友好的错误提示、追问问题和建议操作。`;
  }

  // ========== Schema 定义 ==========

  private getTripCreationSchema(destinationConfig?: any): any {
    const schema: any = {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        totalBudget: { type: 'number' },
        hasChildren: { type: 'boolean' },
        hasElderly: { type: 'boolean' },
        preferences: { type: 'object' },
        needsClarification: {
          type: 'boolean',
          description: '如果任何关键信息（日期、预算）是推断的，设置为 true',
        },
        inferredFields: {
          type: 'array',
          items: { type: 'string' },
          description: '推断的字段列表，如 ["startDate", "totalBudget"]',
        },
      },
      required: ['destination', 'startDate', 'endDate', 'totalBudget'],
    };
    
    // 🆕 如果提供了 destinationConfig，添加特化字段到 schema
    if (destinationConfig && destinationConfig.enabled && destinationConfig.fieldExtractionRules) {
      for (const rule of destinationConfig.fieldExtractionRules) {
        let fieldType: any = { type: rule.fieldType };
        
        // 根据字段类型设置 schema
        if (rule.fieldType === 'array') {
          fieldType = {
            type: 'array',
            items: { type: 'string' },
          };
        } else if (rule.fieldType === 'object') {
          fieldType = { type: 'object' };
        } else if (rule.fieldType === 'number') {
          fieldType = { type: 'number' };
        } else if (rule.fieldType === 'boolean') {
          fieldType = { type: 'boolean' };
        }
        
        // 添加描述
        fieldType.description = rule.extractionPrompt;
        
        schema.properties[rule.fieldName] = fieldType;
        
        // 如果字段是必填的，添加到 required 数组
        if (rule.validation?.required) {
          schema.required.push(rule.fieldName);
        }
      }
    }
    
    return schema;
  }

  private getDecisionSupportSchema(): any {
    return {
      type: 'object',
      properties: {
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              confidence: { type: 'number' },
              reasoning: { type: 'string' },
            },
          },
        },
        summary: { type: 'string' },
      },
    };
  }

  private getErrorHandlingSchema(): any {
    return {
      type: 'object',
      properties: {
        message: { type: 'string' },
        clarificationQuestions: { type: 'array', items: { type: 'string' } },
        suggestedActions: { type: 'array', items: { type: 'string' } },
      },
    };
  }

  /**
   * 使用 LLM 生成旅行规划师风格的智能澄清对话
   * 不再使用硬编码问题，而是根据上下文动态生成自然、专业的对话
   */
  private async generatePlannerStyleClarification(
    userInput: string,
    parsed: any,
    inferredFields?: string[]
  ): Promise<{
    reply: string;
    suggestedQuestions?: string[];
    conversationContext?: Record<string, any>;
    // 🆕 原始LLM输出（用于响应转换）
    llmRawOutput?: any;
  }> {
    const prompt = this.buildPlannerClarificationPrompt(userInput, parsed, inferredFields);
    
    try {
      const response = await this.callLlm(this.defaultProvider, prompt, this.getPlannerClarificationSchema());
      const result = this.extractJSON(response);
      
      // 🆕 保存原始LLM输出（用于响应转换）
      const llmRawOutput = result;
      
      return {
        reply: result.reply || '让我来帮您规划这趟旅程吧！',
        suggestedQuestions: result.suggestedQuestions,
        conversationContext: result.conversationContext,
        llmRawOutput: llmRawOutput, // 🆕 返回原始输出
      };
    } catch (error: any) {
      this.logger.warn(`LLM clarification failed, using fallback: ${error.message}`);
      // 降级使用简单的硬编码问题
      return {
        reply: this.buildFallbackClarificationReply(parsed, inferredFields),
        suggestedQuestions: this.generateFallbackQuestions(parsed, inferredFields),
      };
    }
  }

  /**
   * 构建旅行规划师澄清对话的 prompt
   */
  private buildPlannerClarificationPrompt(
    userInput: string,
    parsed: any,
    inferredFields?: string[]
  ): string {
    // 构建已知信息摘要
    const knownInfo: string[] = [];
    const missingInfo: string[] = [];
    const inferredInfo: string[] = [];

    if (parsed.destination) {
      if (inferredFields?.includes('destination')) {
        inferredInfo.push(`目的地: ${parsed.destination}（推断）`);
    } else {
        knownInfo.push(`目的地: ${parsed.destination}`);
      }
    } else {
      missingInfo.push('目的地');
    }

    if (parsed.startDate && parsed.endDate) {
      const startDate = parsed.startDate.includes('T') ? parsed.startDate.split('T')[0] : parsed.startDate;
      const endDate = parsed.endDate.includes('T') ? parsed.endDate.split('T')[0] : parsed.endDate;
      if (inferredFields?.includes('startDate') || inferredFields?.includes('endDate')) {
        inferredInfo.push(`日期: ${startDate} ~ ${endDate}（推断）`);
    } else {
        knownInfo.push(`日期: ${startDate} ~ ${endDate}`);
      }
    } else {
      missingInfo.push('出行日期');
    }

    if (parsed.totalBudget) {
      if (inferredFields?.includes('totalBudget')) {
        inferredInfo.push(`预算: ¥${parsed.totalBudget}（推断）`);
    } else {
        knownInfo.push(`预算: ¥${parsed.totalBudget}`);
      }
    } else {
      missingInfo.push('预算');
    }

    if (parsed.hasChildren) knownInfo.push('有小孩同行');
    if (parsed.hasElderly) knownInfo.push('有老人同行');

    return `你是一位专业、热情的旅行规划师。用户刚刚说了他们的旅行想法，你需要以自然、专业的方式与他们对话，帮助他们完善旅行计划。

## 用户原话
"${userInput}"

## 已提取的信息
${knownInfo.length > 0 ? `✅ 已确认: ${knownInfo.join('、')}` : '（暂无确认信息）'}
${inferredInfo.length > 0 ? `🤔 推断值（需确认）: ${inferredInfo.join('、')}` : ''}
${missingInfo.length > 0 ? `❓ 缺失: ${missingInfo.join('、')}` : ''}

## 你的任务
作为旅行规划师，生成结构化的回复内容，需要：

1. **开场要有温度** - 对用户的旅行想法表示兴趣和认可（使用paragraph类型）
2. **专业引导** - 像真正的旅行顾问一样，用专业知识引导用户
3. **结构化展示** - 使用不同的内容块类型展示信息：
   - paragraph: 普通段落文本
   - heading: 标题（level: 1-3）
   - list: 列表（title, items, ordered）
   - summary_card: 摘要卡片（如果信息完整，展示目的地、天数、预算等）
   - question_card: 问题卡片（关联到clarificationQuestions）
   - highlight: 高亮信息（重要提示）
4. **给出建议和洞察** - 如果有推断信息，可以解释为什么这样推断，并询问是否正确
5. **引导而非审问** - 多用"您是更倾向于..."、"通常我会建议..."这样的句式

**🆕 问题生成要求（重要）**：
- **问题分组**：必须为每个问题标记group字段（required=必需问题，optional=可选问题）
  - 必需问题（required）：缺失的关键信息（目的地、日期、预算等），用户必须回答才能继续
  - 可选问题（optional）：补充信息（偏好、安全等），用户可以选择跳过
- **问题数量限制**：
  - 必需问题（required）：不超过5个
  - 可选问题（optional）：不超过3个
  - 如果问题超过限制，请按优先级排序（metadata.priority: high > medium > low），只返回高优先级问题
- **选项设计要求**：
  - 选项应该清晰表达用户意图，避免语义重复
  - 使用具体动作（如"补充偏好信息"、"补充安全信息"、"暂不补充"）
  - 避免使用模糊的选项（如"是，我想补充"、"否，信息已完整"）
  - 每个选项应该明确表达用户的选择意图

## 对话风格示例
❌ 不好: "请告诉我您的出行日期？请告诉我您的预算范围？"
✅ 好: "带娃去东京，太棒了！东京确实是亲子游的天堂。我注意到您还没提到具体的时间，您是想趁寒假去还是有别的时间安排呢？另外，日本的消费层次很丰富，从经济型到奢华型都有很好的选择，您这趟大概想控制在什么预算范围内呢？"

## 输出格式要求（重要）
你必须返回结构化的JSON，包含：

### 1. responseBlocks（必填）
这是一个数组，每个元素是一个内容块，类型可以是：
- **paragraph**：普通段落文本
  - 必需字段：type="paragraph", content="文本内容"
- **heading**：标题
  - 必需字段：type="heading", level=1|2|3, text="标题文本"
- **list**：列表
  - 必需字段：type="list", items=["项1", "项2"]
  - 可选字段：title="列表标题", ordered=true|false
- **summary_card**：摘要卡片（用于展示行程概览，如果信息完整）
  - 必需字段：type="summary_card", summary={destination, duration, travelers, budget}
- **question_card**：问题卡片（必须关联到clarificationQuestions）
  - 必需字段：type="question_card", questionId="问题ID"
- **highlight**：高亮信息
  - 必需字段：type="highlight", highlightText="文本", highlightType="info|warning|success"

### 2. clarificationQuestions（必填）
这是一个数组，每个元素是一个结构化问题：
- **id**：唯一标识（必须与question_card中的questionId匹配）
- **question**：问题文本（使用question字段，兼容ClarificationQuestion接口）
- **type**：输入类型（text|single_choice|multi_choice|date|number|boolean）
- **options**：选项数组（type为single_choice/multiple_choice时必需）
- **required**：是否必填
- **hint**：提示信息（可选）
- **metadata**：元数据（category, priority，可选）
- **group**：问题分组（required=必需问题，optional=可选问题）🆕 **新增字段**
- **conditionalInputs**：条件输入字段（可选）🆕 **HCI优化：新增字段**

**🆕 条件输入字段（重要）**：
当问题类型为 single_choice 或 multi_choice 时，如果某个选项需要用户进一步输入信息，应该添加 conditionalInputs 字段：
- **triggerValue**：触发此输入字段的选项值（必须与options中的某个选项完全匹配）
- **inputType**：输入字段类型（text|date|number|date_range）
  - text：文本输入框（用于需要用户输入文本的情况）
  - date：日期选择框（用于需要用户选择日期的情况）
  - date_range：日期范围选择框（用于需要用户选择日期范围的情况）
  - number：数字输入框（用于需要用户输入数字的情况）
- **label**：输入字段标签（可选，如"请选择正确的日期"）
- **placeholder**：占位符（可选，如"请输入日期"）
- **required**：是否必填（默认true）
- **validation**：验证规则（可选）
- **hint**：提示文本（可选）

**示例**：
- 日期确认问题：选项"不准确，需要修改" → 应添加 conditionalInputs，inputType: "date_range"
- 预算确认问题：选项"需要调整，我的预算是____元" → 应添加 conditionalInputs，inputType: "number"

**🆕 问题分组要求（重要）**：
- **必需问题（required）**：缺失的关键信息（目的地、日期、预算等），用户必须回答才能继续
- **可选问题（optional）**：补充信息（偏好、安全等），用户可以选择跳过
- 每个clarificationQuestion必须包含group字段（required或optional）
- 必需问题应该优先生成，可选问题放在后面

**🆕 问题数量限制（重要）**：
- **必需问题（required）**：不超过5个
- **可选问题（optional）**：不超过3个
- 如果问题超过限制，请按优先级排序（metadata.priority: high > medium > low），只返回高优先级问题
- 优先生成缺失的关键信息问题（目的地、日期、预算）

**🆕 选项设计要求（重要）**：
- 选项应该清晰表达用户意图，避免语义重复
- 使用具体动作（如"补充偏好信息"、"补充安全信息"、"暂不补充"）
- 避免使用模糊的选项（如"是，我想补充"、"否，信息已完整"）
- 每个选项应该明确表达用户的选择意图

### 3. 关键约束
- question_card的questionId必须在clarificationQuestions中存在
- 每个clarificationQuestion必须有唯一的id
- responseBlocks的顺序应该符合阅读逻辑（先段落，再标题，再列表，最后问题）
- 如果信息完整，优先使用summary_card展示概览
- 🆕 **问题分组约束**：必需问题（required）必须在前，可选问题（optional）必须在后
- 🆕 **问题数量约束**：必需问题不超过5个，可选问题不超过3个
- 🆕 **选项设计约束**：选项必须清晰具体，避免语义重复

### 4. 向后兼容字段
- reply: 简单文本回复（可选，用于向后兼容）

## 示例输出
{
  "responseBlocks": [
    {
      "type": "paragraph",
      "content": "带娃去东京，太棒了！东京确实是亲子游的天堂。"
    },
    {
      "type": "heading",
      "level": 2,
      "text": "核心思路"
    },
    {
      "type": "list",
      "title": "行程框架",
      "items": [
        "以雷克雅未克为起点和终点，沿环岛公路向东行驶",
        "深入探索黄金圈、维克和杰古沙龙冰河湖"
      ],
      "ordered": false
    },
    {
      "type": "question_card",
      "questionId": "q1_date"
    }
  ],
  "clarificationQuestions": [
    {
      "id": "q1_date",
      "question": "您是想趁寒假去还是有别的时间安排呢？",
      "type": "single_choice",
      "options": ["寒假期间", "暑假期间", "其他时间"],
      "required": true,
      "group": "required",  // 🆕 必需问题
      "metadata": {
        "category": "dates",
        "priority": "high"
      }
    },
    {
      "id": "q2_preferences",
      "question": "是否需要补充其他偏好信息？（如旅行风格、兴趣点、节奏等）",
      "type": "single_choice",
      "options": ["补充偏好信息", "暂不补充"],  // 🆕 使用具体动作
      "required": false,
      "group": "optional",  // 🆕 可选问题
      "metadata": {
        "category": "preferences",
        "priority": "low"
      }
    },
    {
      "id": "q3_date_confirm",
      "question": "我注意到一个可能的时间段是2026年2月3日至9日 (共7天), 这个时间准确吗?",
      "type": "single_choice",
      "options": ["是的, 时间准确", "不准确, 需要修改"],
      "required": true,
      "group": "required",
      "conditionalInputs": [  // 🆕 HCI优化：条件输入字段
        {
          "triggerValue": "不准确, 需要修改",
          "inputType": "date_range",
          "label": "请选择正确的日期范围",
          "placeholder": "请选择出发日期和结束日期",
          "required": true,
          "hint": "确认日期是规划机票、酒店和活动的前提。"
        }
      ],
      "metadata": {
        "category": "dates",
        "priority": "high"
      }
    },
    {
      "id": "q4_budget_confirm",
      "question": "关于旅行预算, 我初步推断您的人均预算可能在15000元左右, 这个预算范围是否符合您的预期?",
      "type": "single_choice",
      "options": ["符合, 预算范围正常", "需要调整, 我的预算是____元"],
      "required": true,
      "group": "required",
      "conditionalInputs": [  // 🆕 HCI优化：条件输入字段
        {
          "triggerValue": "需要调整, 我的预算是____元",
          "inputType": "number",
          "label": "请输入您的预算金额",
          "placeholder": "请输入预算金额（元）",
          "required": true,
          "validation": {
            "min": 0
          },
          "hint": "预算将决定住宿、交通和活动的档次选择。"
        }
      ],
      "metadata": {
        "category": "budget",
        "priority": "high"
      }
    }
  ],
  "reply": "带娃去东京，太棒了！东京确实是亲子游的天堂。我注意到您还没提到具体的时间..."
}

注意：responseBlocks和clarificationQuestions是必填字段，reply是可选字段（向后兼容）。`;
  }

  /**
   * 获取旅行规划师澄清对话的 Schema
   * 🆕 支持结构化输出（responseBlocks和clarificationQuestions）
   */
  private getPlannerClarificationSchema(): any {
    return {
      type: 'object',
      properties: {
        // 🆕 结构化回复块
        responseBlocks: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          description: '结构化回复内容块数组',
          items: {
            oneOf: [
              // paragraph 类型
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['paragraph'] },
                  content: { type: 'string', description: '段落文本内容' },
                  id: { type: 'string', description: '可选：内容块ID' },
                },
                required: ['type', 'content'],
                additionalProperties: false,
              },
              // heading 类型
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['heading'] },
                  level: { type: 'number', enum: [1, 2, 3], description: '标题级别' },
                  text: { type: 'string', description: '标题文本' },
                  id: { type: 'string', description: '可选：内容块ID' },
                },
                required: ['type', 'level', 'text'],
                additionalProperties: false,
              },
              // list 类型
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['list'] },
                  title: { type: 'string', description: '列表标题（可选）' },
                  items: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: '列表项数组',
                    minItems: 1,
                  },
                  ordered: { type: 'boolean', description: '是否有序列表' },
                  id: { type: 'string', description: '可选：内容块ID' },
                },
                required: ['type', 'items'],
                additionalProperties: false,
              },
              // summary_card 类型
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['summary_card'] },
                  summary: {
                    type: 'object',
                    properties: {
                      destination: { type: 'string' },
                      duration: { type: 'string' },
                      travelers: { type: 'string' },
                      budget: {
                        type: 'object',
                        properties: {
                          amount: { type: 'number' },
                          currency: { type: 'string' },
                          details: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['amount', 'currency'],
                      },
                    },
                  },
                  id: { type: 'string', description: '可选：内容块ID' },
                },
                required: ['type', 'summary'],
                additionalProperties: false,
              },
              // question_card 类型
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['question_card'] },
                  questionId: { type: 'string', description: '关联到clarificationQuestions中的id' },
                  id: { type: 'string', description: '可选：内容块ID' },
                },
                required: ['type', 'questionId'],
                additionalProperties: false,
              },
              // highlight 类型
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['highlight'] },
                  highlightText: { type: 'string', description: '高亮文本' },
                  highlightType: { 
                    type: 'string', 
                    enum: ['info', 'warning', 'success'],
                    description: '高亮类型',
                  },
                  id: { type: 'string', description: '可选：内容块ID' },
                },
                required: ['type', 'highlightText'],
                additionalProperties: false,
              },
            ],
          },
        },
        // 🆕 结构化澄清问题
        clarificationQuestions: {
          type: 'array',
          // 🆕 P1优化：限制问题数量
          maxItems: 8, // 必需问题≤5 + 可选问题≤3 = 最多8个
          description: '结构化澄清问题数组（必需问题不超过5个，可选问题不超过3个）',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一标识，必须与question_card中的questionId匹配' },
              question: { type: 'string', description: '问题文本（兼容ClarificationQuestion接口）' },
              type: {
                type: 'string',
                enum: ['text', 'single_choice', 'multi_choice', 'date', 'number', 'boolean'],
                description: '输入类型（boolean会映射为single_choice）',
              },
              options: { 
                type: 'array', 
                items: { type: 'string' },
                description: '选项列表（type为single_choice/multi_choice时必需，选项应清晰具体，避免语义重复）',
              },
              required: { type: 'boolean', description: '是否必填' },
              hint: { type: 'string', description: '提示信息（可选）' },
              metadata: {
                type: 'object',
                properties: {
                  category: { type: 'string', description: '问题类别（如dates, budget, activities）' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级（用于排序，high > medium > low）' },
                },
              },
              // 🆕 P0优化：问题分组字段
              group: {
                type: 'string',
                enum: ['required', 'optional'],
                description: '问题分组（required=必需问题，缺失的关键信息；optional=可选问题，补充信息）',
              },
              // 🆕 HCI优化：条件输入字段
              conditionalInputs: {
                type: 'array',
                description: '条件输入字段配置（当用户选择特定选项时显示后续输入字段）',
                items: {
                  type: 'object',
                  properties: {
                    triggerValue: {
                      type: 'string',
                      description: '触发此输入字段的选项值（必须与options中的某个选项完全匹配）',
                    },
                    inputType: {
                      type: 'string',
                      enum: ['text', 'date', 'number', 'date_range'],
                      description: '输入字段类型（text=文本输入框，date=日期选择框，date_range=日期范围选择框，number=数字输入框）',
                    },
                    label: {
                      type: 'string',
                      description: '输入字段标签（可选）',
                    },
                    placeholder: {
                      type: 'string',
                      description: '占位符（可选）',
                    },
                    required: {
                      type: 'boolean',
                      description: '是否必填（默认true）',
                    },
                    validation: {
                      type: 'object',
                      properties: {
                        min: { type: 'number' },
                        max: { type: 'number' },
                        pattern: { type: 'string' },
                      },
                    },
                    hint: {
                      type: 'string',
                      description: '提示文本（可选）',
                    },
                  },
                  required: ['triggerValue', 'inputType'],
                },
              },
            },
            required: ['id', 'question', 'type', 'required'],
            additionalProperties: false,
          },
        },
        // 保留原有字段（向后兼容）
        reply: {
          type: 'string',
          description: '向后兼容：简单文本回复（可选）',
        },
        suggestedQuestions: {
          type: 'array',
          items: { type: 'string' },
          description: '用户可能的快速回复选项（向后兼容）',
        },
        conversationContext: {
          type: 'object',
          properties: {
            userIntent: { type: 'string' },
            travelStyle: { type: 'string' },
            urgency: { type: 'string' },
            specialNeeds: { type: 'array', items: { type: 'string' } },
          },
          description: '对话上下文',
        },
      },
      required: ['responseBlocks', 'clarificationQuestions'],
      additionalProperties: false,
    };
  }

  /**
   * 降级方案：生成简单的澄清回复
   */
  private buildFallbackClarificationReply(parsed: any, inferredFields?: string[]): string {
    const parts: string[] = [];
    
    if (parsed.destination) {
      parts.push(`我理解您想去${parsed.destination}旅行`);
    } else {
      parts.push('您想去哪里旅行呢');
    }

    if (!parsed.startDate && !parsed.endDate) {
      parts.push('什么时候出发比较方便');
    }

    if (!parsed.totalBudget) {
      parts.push('您这趟旅行的预算大概是多少');
    }

    return parts.join('，') + '？我来帮您规划一下！';
  }

  /**
   * 降级方案：生成简单的问题列表
   */
  private generateFallbackQuestions(parsed: any, inferredFields?: string[]): string[] {
    const questions: string[] = [];

    if (!parsed.destination) {
      questions.push('去日本', '去泰国', '去欧洲', '其他目的地');
    }
    if (!parsed.startDate || !parsed.endDate) {
      questions.push('这个月', '下个月', '寒假期间', '具体日期待定');
    }
    if (!parsed.totalBudget) {
      questions.push('1万以内', '1-2万', '2-5万', '5万以上');
    }

    return questions.slice(0, 5);
  }

  /**
   * @deprecated 使用 generatePlannerStyleClarification 替代
   */
  private generateClarificationQuestions(parsed: any, inferredFields?: string[]): string[] {
    // 保留作为降级方案
    return this.generateFallbackQuestions(parsed, inferredFields);
  }

  /**
   * 检查用户输入是否明确提到了日期
   */
  private hasExplicitDate(text: string): boolean {
    const datePatterns = [
      /\d{1,2}[月\-/]\d{1,2}[日号]?/,  // 1月1日, 12-25, 12/25
      /\d{4}[年\-/]\d{1,2}[月\-/]\d{1,2}[日号]?/,  // 2024-12-25, 2024年12月25日
      /\d{4}年\d{1,2}月/,  // 2026年1月, 2024年12月
      /\d{4}年/,  // 2026年（配合节假日使用）
      /(今天|明天|后天|下周|下个月|下下周)/,
      /(january|february|march|april|may|june|july|august|september|october|november|december)/i,
      /\d+\s*天/,  // 5天, 7天
      /\d+\s*days?/i,
      /(星期|周)[一二三四五六日天]/,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      // 中文节假日
      /(春节|元旦|清明|劳动节|端午|中秋|国庆|圣诞节|新年)/,
      /\d{4}年(春节|元旦|清明|劳动节|端午|中秋|国庆|圣诞节|新年)/,  // 2026年春节
      /(spring|summer|autumn|fall|winter)\s*festival/i,
      /(chinese|lunar)\s*new\s*year/i,
    ];
    
    return datePatterns.some(pattern => pattern.test(text));
  }

  /**
   * 检查用户输入是否明确提到了预算
   */
  private hasExplicitBudget(text: string): boolean {
    const budgetPatterns = [
      /(预算|花费|费用|支出).*?(\d+)/,  // 预算2万, 花费5000
      /(\d+).*?(万|千|元|块)/,  // 2万, 5000元, 1千块
      /(\d+).*?(yuan|rmb|usd|\$)/i,
      /(budget|cost|spend).*?(\d+)/i,
    ];
    
    return budgetPatterns.some(pattern => pattern.test(text));
  }

  /**
   * 检查推断值是否合理
   * 如果推断值存在且合理，可以直接使用，不需要澄清
   */
  private hasReasonableInferredValues(parsed: any, inferredFields: string[]): boolean {
    // 如果推断的字段都有合理的值，认为可以直接使用
    for (const field of inferredFields) {
      if (field === 'startDate' || field === 'endDate') {
        // 日期字段：检查是否有值且是有效的日期
        const dateValue = field === 'startDate' ? parsed.startDate : parsed.endDate;
        if (!dateValue) {
          return false; // 缺少日期值
        }
        try {
          const date = new Date(dateValue);
          if (isNaN(date.getTime())) {
            return false; // 无效日期
          }
          // 检查日期是否在未来（至少是今天）
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (date < today) {
            return false; // 日期在过去
          }
        } catch {
          return false; // 日期解析失败
        }
      } else if (field === 'totalBudget') {
        // 预算字段：检查是否有值且大于0
        if (!parsed.totalBudget || parsed.totalBudget <= 0) {
          return false; // 缺少预算或预算无效
        }
        // 检查预算是否在合理范围内（1000 - 1000000）
        if (parsed.totalBudget < 1000 || parsed.totalBudget > 1000000) {
          return false; // 预算超出合理范围
        }
      }
    }

    // 如果推断了日期，还需要检查日期范围是否合理
    if (inferredFields.includes('startDate') || inferredFields.includes('endDate')) {
      if (parsed.startDate && parsed.endDate) {
        try {
          const startDate = new Date(parsed.startDate);
          const endDate = new Date(parsed.endDate);
          if (endDate <= startDate) {
            return false; // 结束日期不晚于开始日期
          }
          // 检查行程天数是否合理（1-365天）
          const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          if (days < 1 || days > 365) {
            return false; // 行程天数不合理
          }
        } catch {
          return false; // 日期解析失败
        }
      }
    }

    return true; // 所有推断值都合理
  }
}
