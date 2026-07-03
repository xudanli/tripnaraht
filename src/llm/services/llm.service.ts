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
import { extractTokenUsage } from '../utils/token-extractor.util';
import { parseJsonFromLlmText, stripLlmJsonMarkdown } from '../utils/parse-llm-json.util';
import type { OrchestrationStep, SubAgentType } from '../../agent/interfaces/trip-plan.interface';
import { TokenStatsService } from '../../agent/services/token-stats.service';
import { LlmUsageRecorderService } from './llm-usage-recorder.service';
import type {
  ChatCompletionMessage,
  ChatCompletionsWithToolsResult,
  ChatCompletionsToolCallParsed,
  OpenAiFunctionToolDefinition,
  ToolChoice,
} from '../interfaces/chat-completion-tools.interface';
import { assertFreshLlmCallAllowedUnderReplayStrictSeal } from '../../agent/runtime/replay-strict-seal.util';

/** P0: Skills 内 LLM 打点上下文 */
export interface LlmTokenContext {
  request_id: string;
  state_machine_step: OrchestrationStep;
  sub_agent: SubAgentType;
  /**
   * 覆盖 DeepSeek 单次 chat HTTP 超时（毫秒），用于轻量咨询等长流式回答。
   * 见 `LIGHTWEIGHT_LLM_HTTP_TIMEOUT_MS` / `DEEPSEEK_CHAT_TIMEOUT_MS`。
   */
  http_timeout_ms?: number;
  /**
   * 当上游因网络类错误降级为占位正文前调用（仅 `callLlm` 内网络回退路径）。
   */
  on_llm_network_fallback?: (info: { provider: LlmProvider; error_message: string }) => void;
}

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
  private readonly defaultProvider!: LlmProvider; // 由 constructor 逻辑保证赋值
  private readonly useMock: boolean;
  
  // OpenAI HTTP 客户端（使用显式代理配置）
  private readonly openaiHttp: AxiosInstance;
  // 共享的 HTTPS Agent（用于其他 LLM 提供商，如 DeepSeek、Anthropic）
  private readonly httpsAgent: https.Agent | HttpsProxyAgent<string>;
  // 熔断器（用于在连续失败后禁用 API 调用）
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    @Optional() private configService?: ConfigService,
    @Optional() private tokenStatsService?: TokenStatsService,
    @Optional() private llmUsageRecorder?: LlmUsageRecorderService,
  ) {
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
    // 支持 LLM_DEFAULT_PROVIDER 显式指定（如 vllm 自托管模式，可不依赖外部 API）
    const defaultProviderConfig =
      this.configService?.get<string>('LLM_DEFAULT_PROVIDER') || process.env.LLM_DEFAULT_PROVIDER;
    if (defaultProviderConfig) {
      const mapped = this.parseDefaultProvider(defaultProviderConfig);
      if (mapped) {
        this.defaultProvider = mapped;
        this.logger.log(`[LLM] 默认 Provider 由 LLM_DEFAULT_PROVIDER 指定: ${mapped}`);
      }
    }

    if (!defaultProviderConfig || !this.parseDefaultProvider(defaultProviderConfig)) {
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
        // 无 API Key 时优先尝试 vLLM 自托管（若配置了 VLLM_URL）
        const vllmUrl = this.configService?.get<string>('VLLM_URL') || process.env.VLLM_URL;
        this.defaultProvider = vllmUrl ? LlmProvider.VLLM : LlmProvider.DEEPSEEK;
        if (!this.useMock) {
          this.logger.warn(
            `⚠️ LlmService: No LLM API key configured, 使用 ${this.defaultProvider} (${vllmUrl ? 'vLLM 自托管' : 'Mock 模式'})`
          );
        }
      }
    }
  }

  private parseDefaultProvider(config: string): LlmProvider | null {
    const m: Record<string, LlmProvider> = {
      vllm: LlmProvider.VLLM,
      openai: LlmProvider.OPENAI,
      deepseek: LlmProvider.DEEPSEEK,
      gemini: LlmProvider.GEMINI,
      anthropic: LlmProvider.ANTHROPIC,
    };
    return m[config.toLowerCase()] ?? null;
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
    return parseJsonFromLlmText(response);
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
      dto.destinationConfig,
      dto.dslClarificationContext
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
        // 🆕 优化：若首次 LLM 已返回 reply/suggestedQuestions，直接使用，避免第二次 LLM 调用（节省 15-60 秒）
        const hasInlineClarification = parsed.reply && parsed.suggestedQuestions && Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0;
        let clarification: { reply: string; suggestedQuestions?: string[]; conversationContext?: Record<string, any>; llmRawOutput?: any };

        if (hasInlineClarification) {
          this.logger.debug('Using inline clarification from single LLM call (no second call)');
          const suggestedQuestions = parsed.suggestedQuestions as string[];
          clarification = {
            reply: parsed.reply as string,
            suggestedQuestions,
            llmRawOutput: {
              reply: parsed.reply,
              suggestedQuestions,
              responseBlocks: [{ type: 'paragraph', content: parsed.reply as string }],
              clarificationQuestions: suggestedQuestions.map((q, i) => ({
                id: `q_${i}`,
                question: q,
                type: 'text' as const,
                required: true,
              })),
            },
          };
        } else {
          this.logger.debug('Generating planner-style clarification via second LLM call');
          clarification = await this.generatePlannerStyleClarification(
            dto.text,
            parsed,
            parsed.inferredFields,
            dto.dslClarificationContext
          );
        }

        return {
          params: parsed as TripCreationParams,
          needsClarification: true,
          clarificationQuestions: clarification.suggestedQuestions || this.generateFallbackQuestions(parsed, parsed.inferredFields),
          plannerReply: clarification.reply,
          suggestedQuestions: clarification.suggestedQuestions,
          conversationContext: clarification.conversationContext,
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
   * @param tokenContext P0: 可选，用于 Skills 内按阶段打点（GATE_EVAL/PLAN_GEN/VERIFY）
   * @returns LLM 响应文本
   */
  async callLlmWithSchema(
    provider: LlmProvider,
    prompt: string,
    schema?: any,
    tokenContext?: LlmTokenContext,
  ): Promise<string> {
    return this.callLlm(provider, prompt, schema, tokenContext);
  }

  /**
   * OpenAI 兼容 chat/completions，支持原生 tools + tool_calls（Agent Loop）。
   * 支持：OPENAI、DEEPSEEK、VLLM。其余 provider 暂不支持 function calling。
   */
  async callChatWithTools(
    provider: LlmProvider,
    messages: ChatCompletionMessage[],
    tools: OpenAiFunctionToolDefinition[],
    options?: {
      tool_choice?: ToolChoice;
      temperature?: number;
      max_tokens?: number;
      tokenContext?: LlmTokenContext;
      /** OpenAI / 部分兼容端点：json_object 时需对话中出现 “json” 字样 */
      response_format?: { type: 'json_object' };
    },
  ): Promise<ChatCompletionsWithToolsResult> {
    assertFreshLlmCallAllowedUnderReplayStrictSeal();
    if (this.useMock) {
      throw new Error('callChatWithTools: mock LLM mode does not support tool calling');
    }
    if (this.circuitBreaker.isOpen()) {
      throw new Error('callChatWithTools: circuit breaker open');
    }

    const startTime = Date.now();
    let rawResponse: unknown;

    try {
      switch (provider) {
        case LlmProvider.OPENAI:
          rawResponse = await this.postOpenAICompatibleChatCompletions('openai', messages, tools, options);
          break;
        case LlmProvider.DEEPSEEK:
          rawResponse = await this.postOpenAICompatibleChatCompletions('deepseek', messages, tools, options);
          break;
        case LlmProvider.VLLM:
          rawResponse = await this.postOpenAICompatibleChatCompletions('vllm', messages, tools, options);
          break;
        default:
          throw new Error(
            `callChatWithTools: provider ${provider} is not supported for tool calling; use openai, deepseek, or vllm`,
          );
      }

      const parsed = this.parseChatCompletionsToolResponse(rawResponse);
      const durationMs = Date.now() - startTime;

      const promptStr = JSON.stringify(messages);
      this.emitLlmUsageLog({
        provider,
        prompt: promptStr,
        response: JSON.stringify(parsed.message),
        rawResponse: rawResponse as any,
        durationMs,
        success: true,
        tokenContext: options?.tokenContext,
      });

      this.circuitBreaker.recordSuccess();
      return parsed;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.emitLlmUsageLog({
        provider,
        prompt: JSON.stringify(messages),
        response: '',
        rawResponse: undefined,
        durationMs,
        success: false,
        error: error?.message,
        tokenContext: options?.tokenContext,
      });
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * 调用 LLM API（内部方法）
   * P0: 支持 tokenContext 时记录 Token 到 TokenStatsService
   */
  private async callLlm(
    provider: LlmProvider,
    prompt: string,
    schema?: any,
    tokenContext?: LlmTokenContext,
  ): Promise<string> {
    assertFreshLlmCallAllowedUnderReplayStrictSeal();
    const startTime = Date.now();
    // 如果启用 Mock 模式，返回模拟响应
    if (this.useMock) {
      this.logger.warn('Using mock LLM response');
      return this.getMockResponse(prompt, schema, 'env_mock');
    }

    // 检查熔断器状态
    if (this.circuitBreaker.isOpen()) {
      const state = this.circuitBreaker.getState();
      this.logger.warn(`Circuit breaker is ${state}, falling back to mock mode`);
      return this.getMockResponse(prompt, schema, 'circuit_breaker');
    }

    try {
      let result: { content: string; rawResponse?: any };
      switch (provider) {
        case LlmProvider.OPENAI:
          result = await this.callOpenAIWithUsage(prompt, schema);
          break;
        case LlmProvider.GEMINI:
          result = await this.callGeminiWithUsage(prompt, schema);
          break;
        case LlmProvider.DEEPSEEK:
          result = await this.callDeepSeekWithUsage(prompt, schema, tokenContext);
          break;
        case LlmProvider.ANTHROPIC:
          result = await this.callAnthropicWithUsage(prompt, schema);
          break;
        case LlmProvider.VLLM:
          result = await this.callVllmWithUsage(prompt, schema);
          break;
        default:
          throw new Error(`Unsupported LLM provider: ${provider}`);
      }
      const durationMs = Date.now() - startTime;
      this.emitLlmUsageLog({
        provider,
        prompt,
        response: result.content,
        rawResponse: result.rawResponse,
        durationMs,
        success: true,
        tokenContext,
      });
      return schema ? stripLlmJsonMarkdown(result.content) : result.content;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.emitLlmUsageLog({
        provider,
        prompt,
        response: '',
        rawResponse: undefined,
        durationMs,
        success: false,
        error: error?.message,
        tokenContext,
      });
      // 如果网络请求失败，自动回退到 Mock 模式
      const status = error.response?.status;
      const isNetworkError =
        error.message?.includes('no response received') ||
        error.message?.includes('network') ||
        error.message?.includes('aborted') ||
        error.message?.includes('timeout') ||
        error.message?.includes('503') ||
        error.message?.includes('502') ||
        error.message?.includes('504') ||
        error.message?.includes('socket hang up') ||
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ESOCKETTIMEDOUT' ||
        error.code === 'ECONNABORTED';

      if (isNetworkError) {
        const errorDetails = error.response?.status
          ? `HTTP ${error.response.status}: ${error.response?.data?.error?.message || error.message}`
          : error.message;
        this.logger.warn(`LLM API call failed (${errorDetails}), falling back to mock mode`);
        try {
          tokenContext?.on_llm_network_fallback?.({
            provider,
            error_message: String(errorDetails),
          });
        } catch {
          // 回调内勿影响降级主路径
        }
        return this.getMockResponse(prompt, schema, 'network_fallback');
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
  /** 无上游模型时的占位原因（与「从未配置模型」区分，避免误导用户） */
  private getMockResponse(
    prompt: string,
    schema?: any,
    mockCause: 'env_mock' | 'circuit_breaker' | 'network_fallback' = 'env_mock',
  ): string {
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
      const hasTimeMissing = prompt.includes('ROBUST_TIME_MISSING') || prompt.includes('缺少时间矩阵');
      
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

    // SafeTravel RSS refined v2（与 `SAFETRAVEL_RSS_LLM_JSON_SCHEMA.description` 同步）
    if ((schema as { description?: string } | undefined)?.description === 'safetravel_rss_refined_v2') {
      const m = prompt.match(/Rule-JSON:\s*(\{[\s\S]*?\})\s*(?:\n\r?|\r?\n|$)/);
      if (m) {
        try {
          const echo = JSON.parse(m[1]) as Record<string, unknown>;
          const pack = {
            severity: typeof echo.severity === 'string' ? echo.severity : 'low',
            title: String(echo.title ?? ''),
            body: String(echo.body ?? ''),
            published_at: echo.published_at ?? null,
            valid_until: echo.valid_until ?? null,
            coordinates: echo.coordinates ?? null,
            affected_regions: Array.isArray(echo.affected_regions) ? echo.affected_regions : [],
          };
          this.logger.debug('Mock mode: echoing SafeTravel RSS Rule-JSON for LLM refine');
          return JSON.stringify(pack);
        } catch {
          /* fall through */
        }
      }
      return JSON.stringify({
        severity: 'low',
        title: '',
        body: '',
        published_at: null,
        valid_until: null,
        coordinates: null,
        affected_regions: [],
      });
    }

    // 无结构化 schema（常见于轻量咨询等「纯文本 + 可选系统块」调用）：不得返回 "{}" 字符串，否则前端会原样展示。
    const noStructuredSchema =
      schema === undefined ||
      schema === null ||
      (typeof schema === 'object' &&
        !Array.isArray(schema) &&
        schema !== null &&
        Object.keys(schema as object).length === 0);

    if (noStructuredSchema) {
      const userQuestion =
        (prompt.match(/用户问题[:：]\s*([\s\S]+)$/)?.[1] ?? '').trim() || '（未解析到用户问题）';
      const q = userQuestion.slice(0, 240);
      const isLightweightConsult =
        prompt.includes('CONSULTATION_UI_JSON') ||
        prompt.includes('<<<CONSULTATION_UI_JSON>>>') ||
        prompt.includes('咨询/检索') ||
        prompt.includes('轻量知识');

      const tag =
        mockCause === 'network_fallback'
          ? '【模型请求失败】'
          : mockCause === 'circuit_breaker'
            ? '【服务降级】'
            : '【Mock 模式】';

      let body: string;
      if (mockCause === 'network_fallback') {
        body = isLightweightConsult
          ? `${tag}访问大模型时出现超时、网络中断或上游服务暂时不可用（本轮已尝试真实请求）。以下为临时占位说明，**不是**基于模型的行程建议。\n\n关于「${q}」：请稍后重试；若多次失败，请检查到模型服务商的网络、代理、防火墙与 API 配额/账单。`
          : `${tag}大模型请求失败，以下为临时占位说明。\n\n问题摘要：${q}\n\n请稍后重试或检查网络与上游服务状态。`;
      } else if (mockCause === 'circuit_breaker') {
        body = isLightweightConsult
          ? `${tag}LLM 熔断器已打开，暂以占位说明代替真实模型输出。\n\n关于「${q}」：请稍后重试；若持续出现请联系运维检查上游模型可用性。`
          : `${tag}LLM 熔断已触发，占位说明如下。\n\n问题摘要：${q}`;
      } else {
        body = isLightweightConsult
          ? `${tag}当前启用了模拟模式（如环境变量 LLM_USE_MOCK=true）或未配置可用的模型密钥，以下为占位说明。\n\n关于「${q}」：关闭模拟并配置 ANTHROPIC_API_KEY / OPENAI_API_KEY 等后将生成正式建议。`
          : `${tag}以下为占位说明。\n\n用户侧摘要问题：${q}\n\n配置真实模型后将返回完整结果。`;
      }

      this.logger.warn(
        `Mock mode: no structured schema; cause=${mockCause}; returning narrative placeholder instead of "{}"`,
      );
      return body;
    }

    // 其他场景：返回符合 schema 的默认结构
    this.logger.warn(`Mock mode: unknown schema, returning empty object`);
    return JSON.stringify({});
  }

  /**
   * Unified usage sink: DB (LlmTokenLog) + in-memory TokenStats.
   * Uses AsyncLocalStorage when explicit tokenContext is omitted.
   */
  private emitLlmUsageLog(params: {
    provider: LlmProvider;
    prompt: string;
    response: string;
    rawResponse?: unknown;
    durationMs: number;
    success: boolean;
    error?: string;
    tokenContext?: LlmTokenContext;
  }): void {
    if (!this.llmUsageRecorder && !this.tokenStatsService) {
      return;
    }

    const resolved = this.llmUsageRecorder?.resolveContext(
      params.tokenContext
        ? {
            request_id: params.tokenContext.request_id,
            state_machine_step: params.tokenContext.state_machine_step,
            sub_agent: params.tokenContext.sub_agent,
          }
        : undefined,
    ) ?? {
      request_id: params.tokenContext?.request_id ?? 'SYSTEM_INTERNAL',
      step_name: String(params.tokenContext?.state_machine_step ?? 'UNKNOWN'),
      sub_agent: String(params.tokenContext?.sub_agent ?? 'Orchestrator'),
    };

    let usage = extractTokenUsage(params.provider, params.rawResponse ?? {}, params.prompt);
    const isEstimated = !(params.rawResponse as any)?.usage;

    const model = this.getModelName(params.provider);
    const spanId = `llm-${resolved.step_name}-${Date.now()}`;

    const record = {
      request_id: resolved.request_id,
      span_id: spanId,
      provider: params.provider,
      model,
      step_name: resolved.step_name,
      sub_agent: resolved.sub_agent,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens || usage.prompt_tokens + usage.completion_tokens,
      is_estimated: isEstimated,
      success: params.success,
      duration_ms: params.durationMs,
      error: params.error,
    };

    if (this.llmUsageRecorder) {
      this.llmUsageRecorder.record(record);
      return;
    }

    if (this.tokenStatsService) {
      void this.tokenStatsService.recordTokenUsage({
        request_id: record.request_id,
        trace_id: record.request_id,
        span_id: record.span_id,
        sub_agent: record.sub_agent as SubAgentType,
        state_machine_step: record.step_name as OrchestrationStep,
        task_type: record.step_name,
        provider: params.provider,
        model: record.model,
        prompt_tokens: record.prompt_tokens,
        completion_tokens: record.completion_tokens,
        total_tokens: record.total_tokens,
        duration_ms: record.duration_ms,
        success: record.success,
        error: record.error,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private getModelName(provider: LlmProvider): string {
    switch (provider) {
      case LlmProvider.OPENAI:
        return this.configService?.get<string>('OPENAI_MODEL') || process.env.OPENAI_MODEL || 'gpt-4o';
      case LlmProvider.ANTHROPIC:
        return this.configService?.get<string>('ANTHROPIC_MODEL') || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet';
      case LlmProvider.DEEPSEEK:
        return this.configService?.get<string>('DEEPSEEK_MODEL') || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      case LlmProvider.GEMINI:
        return this.configService?.get<string>('GEMINI_MODEL') || process.env.GEMINI_MODEL || 'gemini-pro';
      case LlmProvider.VLLM:
        return this.configService?.get<string>('VLLM_MODEL') || process.env.VLLM_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
      default:
        return 'unknown';
    }
  }

  /**
   * 调用 OpenAI API（返回 content + rawResponse 用于 Token 打点）
   */
  private async callOpenAIWithUsage(prompt: string, schema?: any): Promise<{ content: string; rawResponse?: any }> {
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
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      } | null;
      const content = data?.choices?.[0]?.message?.content || '';
      this.circuitBreaker.recordSuccess();
      return { content, rawResponse: data ?? undefined };
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
   * OpenAI / DeepSeek / vLLM 共用：chat/completions + tools
   */
  private async postOpenAICompatibleChatCompletions(
    kind: 'openai' | 'deepseek' | 'vllm',
    messages: ChatCompletionMessage[],
    tools: OpenAiFunctionToolDefinition[],
    options?: {
      tool_choice?: ToolChoice;
      temperature?: number;
      max_tokens?: number;
      response_format?: { type: 'json_object' };
    },
  ): Promise<unknown> {
    const temperature = options?.temperature ?? 0.2;
    const max_tokens = options?.max_tokens ?? 2048;
    const tool_choice = options?.tool_choice ?? 'auto';

    const body: Record<string, unknown> = {
      messages,
      temperature,
      max_tokens,
    };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = tool_choice;
    }
    if (options?.response_format) {
      body.response_format = options.response_format;
    }

    if (kind === 'openai') {
      const apiKey = this.configService?.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured (checked ConfigService and process.env)');
      }
      const model =
        this.configService?.get<string>('OPENAI_MODEL') || process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const response = await retryWithBackoff(
        () =>
          this.openaiHttp.post('/chat/completions', { ...body, model }, {
            headers: { Authorization: `Bearer ${apiKey}` },
          }),
        {
          maxRetries: 3,
          initialDelayMs: 200,
          maxDelayMs: 2000,
          factor: 2,
          jitter: true,
        },
      );
      return response.data;
    }

    if (kind === 'deepseek') {
      const apiKey = this.configService?.get<string>('DEEPSEEK_API_KEY') || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY not configured (checked ConfigService and process.env)');
      }
      const model =
        this.configService?.get<string>('DEEPSEEK_MODEL') || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      const promptLength = JSON.stringify(messages).length;
      const timeout = promptLength > 50000 ? 180000 : promptLength > 20000 ? 120000 : 60000;
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        { ...body, model },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          timeout,
          proxy: false,
          httpsAgent: this.httpsAgent,
        },
      );
      return response.data;
    }

    const vllmUrl = this.configService?.get<string>('VLLM_URL') || process.env.VLLM_URL || 'http://localhost:8080';
    let model = this.configService?.get<string>('VLLM_MODEL') || process.env.VLLM_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
    const loraAdapter = this.configService?.get<string>('VLLM_LORA_ADAPTER') || process.env.VLLM_LORA_ADAPTER;
    if (loraAdapter) {
      model = `${model}:${loraAdapter}`;
    }
    const apiUrl = `${vllmUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const promptLength = JSON.stringify(messages).length;
    const timeout = promptLength > 50000 ? 180000 : promptLength > 20000 ? 120000 : 60000;
    const response = await retryWithBackoff(
      () =>
        axios.post(apiUrl, { ...body, model }, {
          headers: { 'Content-Type': 'application/json' },
          timeout,
          proxy: false,
          ...(vllmUrl.startsWith('https') && { httpsAgent: this.httpsAgent }),
        }),
      {
        maxRetries: 2,
        initialDelayMs: 500,
        maxDelayMs: 3000,
        retryCondition: (error: any) =>
          ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error?.code) ||
          error?.response?.status === 503,
      },
    );
    return response.data;
  }

  private parseChatCompletionsToolResponse(raw: unknown): ChatCompletionsWithToolsResult {
    const data = raw as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    const choice = data?.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      throw new Error('Invalid chat completions response: missing choices[0].message');
    }

    let tool_calls: ChatCompletionsToolCallParsed[] | undefined;
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      tool_calls = msg.tool_calls.map((tc) => {
        const name = tc.function?.name || '';
        let args: Record<string, unknown> = {};
        try {
          const rawArgs = tc.function?.arguments;
          if (rawArgs && typeof rawArgs === 'string') {
            args = JSON.parse(rawArgs) as Record<string, unknown>;
          } else if (rawArgs && typeof rawArgs === 'object') {
            args = rawArgs as Record<string, unknown>;
          }
        } catch {
          args = { _parse_error: true, raw: tc.function?.arguments };
        }
        return {
          id: tc.id || `call_${name}_${Math.random().toString(36).slice(2, 9)}`,
          name,
          args,
        };
      });
    }

    return {
      message: {
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls,
      },
      finishReason: choice.finish_reason ?? null,
      rawResponse: raw,
    };
  }

  /**
   * 调用 Gemini API（返回 content + rawResponse 用于 Token 打点）
   */
  private async callGeminiWithUsage(prompt: string, schema?: any): Promise<{ content: string; rawResponse?: any }> {
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
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { content, rawResponse: data };
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Gemini API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Gemini API request failed: ${error.message}`);
    }
  }

  private resolveDeepSeekChatTimeoutMs(promptLength: number, tokenContext?: LlmTokenContext): number {
    if (typeof tokenContext?.http_timeout_ms === 'number' && tokenContext.http_timeout_ms >= 5000) {
      return Math.min(600_000, tokenContext.http_timeout_ms);
    }
    const envRaw = this.configService?.get<string>('DEEPSEEK_CHAT_TIMEOUT_MS') ?? process.env.DEEPSEEK_CHAT_TIMEOUT_MS;
    const envMs = envRaw != null && String(envRaw).trim() !== '' ? parseInt(String(envRaw).trim(), 10) : NaN;
    const smallTier = Number.isFinite(envMs) && envMs >= 30_000 ? envMs : 120_000;
    if (promptLength > 50000) return 180_000;
    if (promptLength > 20000) return 120_000;
    return smallTier;
  }

  /**
   * 调用 DeepSeek API（返回 content + rawResponse 用于 Token 打点）
   */
  private async callDeepSeekWithUsage(
    prompt: string,
    schema?: any,
    tokenContext?: LlmTokenContext,
  ): Promise<{ content: string; rawResponse?: any }> {
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

    const promptLength = prompt.length;
    const timeout = this.resolveDeepSeekChatTimeoutMs(promptLength, tokenContext);

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
      } | null;
      if (data == null) {
        this.logger.warn(
          `DeepSeek 响应 body 为空 (HTTP ${response.status})，请检查代理/网络或 API 状态`,
        );
      }
      const content = data?.choices?.[0]?.message?.content || '';
      if (!content.trim() && response.status >= 200 && response.status < 300) {
        throw new Error(
          `DeepSeek returned empty completion (HTTP ${response.status}). Body: ${JSON.stringify(data)?.slice(0, 800)}`,
        );
      }
      return { content, rawResponse: data ?? undefined };
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
   * 调用 Anthropic API（返回 content + rawResponse 用于 Token 打点）
   */
  private async callAnthropicWithUsage(prompt: string, schema?: any): Promise<{ content: string; rawResponse?: any }> {
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
      const content = data.content?.[0]?.text || '';
      return { content, rawResponse: data };
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

  /**
   * 调用 vLLM API（Qwen2.5-7B 自托管，OpenAI 兼容接口）
   * 返回 content + rawResponse 用于 Token 打点
   */
  private async callVllmWithUsage(prompt: string, schema?: any): Promise<{ content: string; rawResponse?: any }> {
    const vllmUrl = this.configService?.get<string>('VLLM_URL') || process.env.VLLM_URL || 'http://localhost:8080';
    let model = this.configService?.get<string>('VLLM_MODEL') || process.env.VLLM_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
    const loraAdapter = this.configService?.get<string>('VLLM_LORA_ADAPTER') || process.env.VLLM_LORA_ADAPTER;

    if (loraAdapter) {
      model = `${model}:${loraAdapter}`;
    }

    let effectivePrompt = prompt;
    if (schema) {
      effectivePrompt += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
    }

    const body: any = {
      model,
      messages: [{ role: 'user', content: effectivePrompt }],
      temperature: 0.7,
      max_tokens: 2048,
    };

    const apiUrl = `${vllmUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const timeout = prompt.length > 50000 ? 180000 : prompt.length > 20000 ? 120000 : 60000;

    try {
      this.logger.debug(`[vLLM] 调用 ${apiUrl}, model=${model}`);
      const response = await retryWithBackoff(
        () =>
          axios.post(apiUrl, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout,
            proxy: false,
            ...(vllmUrl.startsWith('https') && { httpsAgent: this.httpsAgent }),
          }),
        {
          maxRetries: 2,
          initialDelayMs: 500,
          maxDelayMs: 3000,
          retryCondition: (error: any) =>
            ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error?.code) ||
            error?.response?.status === 503,
        }
      );

      const data = response.data as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      } | null;
      const content = data?.choices?.[0]?.message?.content || '';
      this.circuitBreaker.recordSuccess();
      return { content, rawResponse: data ?? undefined };
    } catch (error: any) {
      this.circuitBreaker.recordFailure();
      if (error.response) {
        throw new Error(`vLLM API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`vLLM API request failed: ${error.message}`);
    }
  }

  // ========== Prompt 构建方法 ==========

  private buildTripCreationPrompt(
    text: string,
    contextBlocks?: any[],
    destinationCode?: string,
    destinationConfig?: any,
    dslClarificationContext?: string
  ): string {
    // 获取当前日期用于日期推算
    const now = new Date();
    const currentYear = now.getFullYear();
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

    const dslSection =
      dslClarificationContext && dslClarificationContext.trim().length > 0
        ? `\n## 澄清 DSL 约束（系统权威，优先遵守）\n${dslClarificationContext.trim()}\n`
        : '';

    return `你是一位经验丰富的旅行规划师，正在帮助用户规划旅行。用户说："${text}"

当前日期：${currentDate}${dslSection}${contextSection}

## 你的任务
从用户的自然语言中理解他们的旅行需求，并提取关键信息。

## 需要提取的信息
### 硬约束（必需）
- destination: 目的地国家代码（ISO 3166-1 alpha-2）
- startDate, endDate: 出行日期
- totalBudget: 总预算（人民币，元）
### 人员与偏好
- hasChildren, hasElderly: 是否有小孩/老人
- preferences: 旅行偏好（style、interests、pace、accommodation、dining 等）
### 专业规划师框架（可选，有则提取）
- departureCity: 出发城市
- travelStyle: relaxed|deep|dense|photo|food（放松/深度探索/高效打卡/摄影/美食）
- pace: 2-3|3-5|5+（每天核心点数量，对应轻松/平衡/密集）
- riskTolerance: low|medium|high
- coreExpectation: 核心期待（relax/成就感/陪伴/逃离/探索未知）
- whatToAvoid: 最不想发生（太累/太赶/迷路/下雨/被宰）
- needsClarification, inferredFields: 推断标记

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
- 中国：CN | 杭州、千岛湖、西湖、苏堤、灵隐、北京、上海、成都、西安

### 行程结构提取（多城市/多景点时必填）
当用户描述了**多个城市**或**具体景点**时，必须提取：
- **cities**: 城市列表，如 ["杭州", "千岛湖"]
- **mustHavePois**: 必含景点/POI，如 ["苏堤", "灵隐寺", "茶园", "运河", "西湖"]
- **dayAllocation**: 按天的城市分配，如 [{"city": "杭州", "days": 2}, {"city": "千岛湖", "days": 1}]
  - 用户说"杭州2-3天、千岛湖1-2天" → dayAllocation: [{city: "杭州", days: 2}, {city: "千岛湖", days: 1}]
  - 用户说"以西湖为核心，苏堤、灵隐" → mustHavePois: ["苏堤", "灵隐寺", "西湖"]

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
   - 用户没提日期 → **禁止默认从今天/明天起算**；若用户已提到具体月份或季节（如「十一月」「春节后」），必须按该时间窗口推断，不得用近端日期凑数
   - 若用户提到未来月份但具体日期不清 → **不要填写 startDate/endDate**，将二者留空并把 "startDate","endDate" 放入 inferredFields，在 reply 中追问具体出发日期
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
返回纯 JSON。**重要**：当 needsClarification 为 true 时，必须同时输出 reply（规划师风格的自然语言回复）和 suggestedQuestions（追问问题数组，1-5 个），避免二次调用。

示例（无需澄清）：
{
  "destination": "JP",
  "startDate": "2026-04-01T00:00:00.000Z",
  "endDate": "2026-04-07T00:00:00.000Z",
  "totalBudget": 20000,
  "needsClarification": false,
  "inferredFields": []
}

示例（需要澄清时必填 reply 和 suggestedQuestions）：
{
  "destination": "CN",
  "startDate": "2026-04-01T00:00:00.000Z",
  "endDate": "2026-04-05T00:00:00.000Z",
  "totalBudget": 15000,
  "needsClarification": true,
  "inferredFields": ["totalBudget"],
  "reply": "好的，杭州+千岛湖是个很棒的选择！您提到的预算 1.5 万是单人还是全家总预算呢？",
  "suggestedQuestions": ["预算 1.5 万是单人还是全家总预算？", "出发城市是哪里？"]
}

**当 needsClarification 为 true 时，必须同时输出**：
- reply: 规划师风格的自然语言回复（热情、专业，帮助用户完善计划）
- suggestedQuestions: 1-5 个追问问题（字符串数组），按优先级排列，缺什么问什么

**澄清文案约束（与目的地卡片澄清并发时尤其重要）**：
- reply **禁止**使用「1. 2. 3.」等编号列表逐条追问；具体问题由系统澄清卡片/表单展示，你只需 1–4 句短过渡与鼓励即可。
- suggestedQuestions 若无法与后续系统卡片对齐，可输出 **空数组 []**；**禁止**在 suggestedQuestions 里发明与系统阶段无关的新问题（如系统即将用卡片问季节/活动时，不要再列「出发城市/预算」若该轮并非收集这些字段）。
${specializedSection ? `\n\n## 目的地特化提取规则（${destinationConfig.destinationName}）\n\n${specializedSection}` : ''}`;
  }

  /**
   * 🆕 构建目的地特化 Prompt 片段
   */
  private buildDestinationSpecificPromptSection(
    config: any,
    _destinationCode?: string
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
        // 🆕 专业规划师框架：硬约束层
        departureCity: {
          type: 'string',
          description: '出发城市，影响航线成本和路线结构',
        },
        dateFlexibility: {
          type: 'number',
          description: '日期是否可调整（±天数），0表示固定',
        },
        // 🆕 专业规划师框架：旅行偏好层
        travelStyle: {
          type: 'string',
          description: '旅行风格: relaxed=放松度假, deep=深度探索, dense=高效打卡, photo=摄影创作, food=美食巡礼',
        },
        pace: {
          type: 'string',
          description: '节奏偏好: 2-3=轻松(每天2-3核心点), 3-5=平衡, 5+=密集',
        },
        riskTolerance: {
          type: 'string',
          description: '风险接受度: low=安全舒适, medium=愿意冒一些风险, high=追求刺激',
        },
        // 🆕 专业规划师框架：心理层
        coreExpectation: {
          type: 'string',
          description: '核心期待: relax/成就感/陪伴/逃离/探索未知',
        },
        whatToAvoid: {
          type: 'array',
          items: { type: 'string' },
          description: '最不想发生: 太累/太赶/迷路/下雨/被宰',
        },
        needsClarification: {
          type: 'boolean',
          description: '如果任何关键信息（日期、预算）是推断的，设置为 true',
        },
        inferredFields: {
          type: 'array',
          items: { type: 'string' },
          description: '推断的字段列表，如 ["startDate", "totalBudget"]',
        },
        cities: {
          type: 'array',
          items: { type: 'string' },
          description: '用户指定的城市列表，如 ["杭州", "千岛湖"]',
        },
        mustHavePois: {
          type: 'array',
          items: { type: 'string' },
          description: '必含景点/POI 列表，如 ["苏堤", "灵隐寺", "茶园", "运河"]',
        },
        dayAllocation: {
          type: 'array',
          items: {
            type: 'object',
            properties: { city: { type: 'string' }, days: { type: 'number' } },
            required: ['city', 'days'],
          },
          description: '按天的城市分配，如 [{"city": "杭州", "days": 2}, {"city": "千岛湖", "days": 1}]',
        },
        // 🆕 合并澄清到单次调用：当 needsClarification 为 true 时必须输出
        reply: {
          type: 'string',
          description: '规划师风格的自然语言回复（当 needsClarification 为 true 时必填）',
        },
        suggestedQuestions: {
          type: 'array',
          items: { type: 'string' },
          description: '追问问题列表，1-5 个（当 needsClarification 为 true 时必填）',
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
    inferredFields?: string[],
    dslClarificationContext?: string
  ): Promise<{
    reply: string;
    suggestedQuestions?: string[];
    conversationContext?: Record<string, any>;
    // 🆕 原始LLM输出（用于响应转换）
    llmRawOutput?: any;
  }> {
    const dslPrefix =
      dslClarificationContext && dslClarificationContext.trim().length > 0
        ? `## 澄清 DSL 约束（系统权威）\n${dslClarificationContext.trim()}\n\n`
        : '';
    const prompt = dslPrefix + this.buildPlannerClarificationPrompt(userInput, parsed, inferredFields);
    
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
    if (parsed.departureCity) knownInfo.push(`出发城市: ${parsed.departureCity}`);
    if (parsed.travelStyle) knownInfo.push(`旅行风格: ${parsed.travelStyle}`);
    if (parsed.pace) knownInfo.push(`节奏: ${parsed.pace}`);
    if (parsed.riskTolerance) knownInfo.push(`风险偏好: ${parsed.riskTolerance}`);
    if (parsed.preferences?.style) knownInfo.push(`风格: ${parsed.preferences.style}`);
    if (parsed.preferences?.pace) knownInfo.push(`节奏: ${parsed.preferences.pace}`);

    return `你是一位专业、热情的旅行规划师。用户刚刚说了他们的旅行想法，你需要以自然、专业的方式与他们对话，帮助他们完善旅行计划。

## 用户原话
"${userInput}"

## 已提取的信息
${knownInfo.length > 0 ? `✅ 已确认: ${knownInfo.join('、')}` : '（暂无确认信息）'}
${inferredInfo.length > 0 ? `🤔 推断值（需确认）: ${inferredInfo.join('、')}` : ''}
${missingInfo.length > 0 ? `❓ 缺失: ${missingInfo.join('、')}` : ''}

## 专业规划师分层采集框架（重要）
优秀规划师关注的 5 个核心变量：时间窗口、人群能力结构、节奏容忍度、风险容忍度、旅行心理目标。

**按阶段顺序采集**（缺什么问什么，不跳阶段）：
1. **第一阶段·硬约束**：出发城市、日期、人数与年龄、预算区间（缺失时优先生成）
2. **第二阶段·风格选择**：旅行更接近哪种？A放松度假 B深度探索 C高效打卡 D摄影创作 E美食巡礼
3. **第三阶段·节奏校准**：每天 2-3 核心点（轻松）| 3-5（平衡）| 5+（密集）
4. **第四阶段·风险偏好**：可否接受夜间自驾、山路、小众地区、复杂换乘、天气不稳定

效用函数输入：ExperienceWeight + RelaxationWeight + ExplorationWeight - FatigueRisk - TransferComplexity - WeatherRisk - BudgetOverrunRisk。你的问题应帮助补齐这些维度。

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

- **避免内容重复**：
  - summary_card 与规划基础：若 responseBlocks 中已有 summary_card，不要再添加 paragraph/list 重复解释 目的地、出行时间、预算 等；卡片已展示，最多加一句简短过渡语
  - hint 与 placeholder：同一问题的提示与占位符不得重复（示例如「日本关西、新西兰南岛」只写一处）
  - 补充偏好问题：仅保留一个「是否需要补充偏好信息」类问题，不要同时在 required 和 optional 都出现

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
- **inputType**：输入字段类型（text|single_choice|multi_choice|number|date|date_range）
  - text：文本输入框
  - single_choice：单选（需提供 options）
  - multi_choice：多选（需提供 options）
  - date：日期选择框
  - date_range：日期范围选择框
  - number：数字输入框
- **label**：输入字段标签（推荐，如"请选择旅行节奏"）
- **options**：single_choice/multi_choice 时必填，格式 string[] 或 {value,label}[]
- **placeholder**：占位符（可选）
- **paramKey**：参数键名（推荐，用于存储到 preferences）
- **required**：是否必填（默认true）
- **validation**：验证规则（可选，number 可用 min/max）
- **hint**：提示文本（可选）

**示例**：
- 补充节奏：inputType: "single_choice", options: ["紧凑","悠闲","适中"]
- 补充美食偏好：inputType: "multi_choice", options: ["中餐","西餐","海鲜","当地特色"]
- 日期确认：inputType: "date_range"
- 预算调整：inputType: "number", validation: {min:1,max:10000000}

**🆕 补充偏好信息约束（重要）**：
- 当选项包含「补充偏好信息」时，conditionalInputs 必须**直接**展示节奏、美食、住宿等输入项
- **禁止**多一层「请选择您感兴趣的方面」「请选择感兴趣的方面」等 meta 问题
- 禁止出现「请至少选择一项」—— 补充偏好相关 conditionalInputs 必须 required: false，用户可全部跳过

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

**🆕 目的地问题约束（极其重要）**：
- **当「已确认」或「推断值」中已包含目的地时**，绝对不要生成目的地选择类问题
- 禁止出现选项为「去日本」「去泰国」「去欧洲」「其他目的地」等目的地列举的问题
- 用户已明确说去哪（如新西兰南岛、冰岛、日本），就不要再问「您想去哪里」

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
  private buildFallbackClarificationReply(parsed: any, _inferredFields?: string[]): string {
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
  private generateFallbackQuestions(parsed: any, _inferredFields?: string[]): string[] {
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
