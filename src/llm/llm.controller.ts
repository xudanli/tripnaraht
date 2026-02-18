// src/llm/llm.controller.ts
import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { LlmService } from './services/llm.service';
import {
  NaturalLanguageToParamsDto,
  HumanizeResultDto,
  DecisionSupportDto,
  LlmProvider,
} from './dto/llm-request.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { TokenStatsService } from '../agent/services/token-stats.service';
import { LlmCostService } from './services/llm-cost.service';
import { PythonAIService } from './services/python-ai.service';

@ApiTags('llm')
@Controller('llm')
export class LlmController {
  constructor(
    private readonly llmService: LlmService,
    private readonly tokenStatsService: TokenStatsService,
    private readonly llmCostService: LlmCostService,
    private readonly pythonAIService?: PythonAIService,
  ) {}

  @Post('natural-language-to-params')
  @ApiOperation({
    summary: '自然语言转接口参数',
    description: '将用户的口语化需求转换为创建行程的接口参数。例如："帮我规划带娃去东京5天的行程，预算2万"',
  })
  @ApiBody({ type: NaturalLanguageToParamsDto })
  @ApiResponse({
    status: 200,
    description: '成功转换参数（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async naturalLanguageToParams(@Body() dto: NaturalLanguageToParamsDto) {
    try {
      const result = await this.llmService.naturalLanguageToTripParams(dto);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('humanize-result')
  @ApiOperation({
    summary: '结果人性化转化',
    description: '将接口返回的结构化数据转化为自然语言描述，让用户更容易理解。',
  })
  @ApiBody({ type: HumanizeResultDto })
  @ApiResponse({
    status: 200,
    description: '成功转化结果（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async humanizeResult(@Body() dto: HumanizeResultDto) {
    try {
      const result = await this.llmService.humanizeResult(dto);
      return successResponse({ description: result });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('decision-support')
  @ApiOperation({
    summary: '决策支持',
    description: '基于接口数据提供智能决策建议，如 What-If 评估、多方案对比等。',
  })
  @ApiBody({ type: DecisionSupportDto })
  @ApiResponse({
    status: 200,
    description: '成功返回决策建议（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async decisionSupport(@Body() dto: DecisionSupportDto) {
    try {
      const result = await this.llmService.provideDecisionSupport(dto);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== 后台管理接口 ====================

  /**
   * 获取可用模型列表
   */
  @Public()
  @Get('models')
  @ApiOperation({
    summary: '获取可用模型列表',
    description: '获取系统中可用的 LLM 模型列表，包括提供商、模型名称、状态等信息',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回模型列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getModels() {
    try {
      const models = [
        {
          provider: LlmProvider.OPENAI,
          models: [
            { name: 'gpt-4-turbo', label: 'GPT-4 Turbo', available: !!process.env.OPENAI_API_KEY },
            { name: 'gpt-4o', label: 'GPT-4o', available: !!process.env.OPENAI_API_KEY },
            { name: 'gpt-4o-mini', label: 'GPT-4o Mini', available: !!process.env.OPENAI_API_KEY },
            { name: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', available: !!process.env.OPENAI_API_KEY },
          ],
        },
        {
          provider: LlmProvider.ANTHROPIC,
          models: [
            { name: 'claude-3-opus-20240229', label: 'Claude 3 Opus', available: !!process.env.ANTHROPIC_API_KEY },
            { name: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', available: !!process.env.ANTHROPIC_API_KEY },
            { name: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', available: !!process.env.ANTHROPIC_API_KEY },
          ],
        },
        {
          provider: LlmProvider.DEEPSEEK,
          models: [
            { name: 'deepseek-chat', label: 'DeepSeek Chat', available: !!process.env.DEEPSEEK_API_KEY },
            { name: 'deepseek-coder', label: 'DeepSeek Coder', available: !!process.env.DEEPSEEK_API_KEY },
          ],
        },
        {
          provider: LlmProvider.GEMINI,
          models: [
            { name: 'gemini-pro', label: 'Gemini Pro', available: !!process.env.GEMINI_API_KEY },
            { name: 'gemini-pro-vision', label: 'Gemini Pro Vision', available: !!process.env.GEMINI_API_KEY },
          ],
        },
      ];

      const defaultProvider = this.llmService.getDefaultProvider();

      return successResponse({
        models,
        defaultProvider,
        totalModels: models.reduce((sum, p) => sum + p.models.length, 0),
        availableModels: models.reduce(
          (sum, p) => sum + p.models.filter((m) => m.available).length,
          0,
        ),
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取 Token 使用统计
   */
  @Public()
  @Get('usage')
  @ApiOperation({
    summary: 'Token 使用统计',
    description: '获取 LLM Token 使用统计信息，包括按 Sub-Agent、任务类型、提供商等维度的统计',
  })
  @ApiQuery({ name: 'subAgent', required: false, description: 'Sub-Agent 类型' })
  @ApiQuery({ name: 'provider', required: false, enum: LlmProvider, description: 'LLM 提供商' })
  @ApiQuery({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' })
  @ApiQuery({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' })
  @ApiResponse({
    status: 200,
    description: '成功返回 Token 使用统计（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getUsage(
    @Query('subAgent') subAgent?: string,
    @Query('provider') provider?: LlmProvider,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    try {
      const timeRange = startTime && endTime
        ? { start: new Date(startTime), end: new Date(endTime) }
        : undefined;

      let stats: any = {};

      if (subAgent) {
        const subAgentStats = await this.tokenStatsService.getSubAgentStats(
          subAgent as any,
          timeRange,
        );
        stats.subAgent = subAgentStats;
      } else if (provider) {
        const providerStats = await this.tokenStatsService.getProviderStats(provider, timeRange);
        stats.provider = providerStats;
      } else {
        // 返回总体统计
        const allRecords = this.tokenStatsService.getAllRecords();
        const filteredRecords = timeRange
          ? allRecords.filter(
              (r) =>
                new Date(r.timestamp) >= timeRange.start &&
                new Date(r.timestamp) <= timeRange.end,
            )
          : allRecords;

        const totalTokens = filteredRecords.reduce((sum, r) => sum + r.total_tokens, 0);
        const totalPromptTokens = filteredRecords.reduce((sum, r) => sum + r.prompt_tokens, 0);
        const totalCompletionTokens = filteredRecords.reduce(
          (sum, r) => sum + r.completion_tokens,
          0,
        );
        const totalCalls = filteredRecords.length;
        const successfulCalls = filteredRecords.filter((r) => r.success).length;

        const byStep = this.tokenStatsService.getStatsByStep(timeRange);
        stats = {
          totalTokens,
          totalPromptTokens,
          totalCompletionTokens,
          totalCalls,
          successfulCalls,
          failedCalls: totalCalls - successfulCalls,
          successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
          avgTokensPerCall: totalCalls > 0 ? totalTokens / totalCalls : 0,
          byStep, // P0: 按阶段 Token（INTAKE/RESEARCH/GATE_EVAL/PLAN_GEN/VERIFY）
          timeRange: timeRange
            ? {
                start: timeRange.start.toISOString(),
                end: timeRange.end.toISOString(),
              }
            : undefined,
        };
      }

      return successResponse(stats);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取成本统计
   */
  @Public()
  @Get('cost')
  @ApiOperation({
    summary: '成本统计',
    description: '获取 LLM 调用成本统计信息，包括总成本、按提供商/Sub-Agent 的成本分布等',
  })
  @ApiQuery({ name: 'subAgent', required: false, description: 'Sub-Agent 类型' })
  @ApiQuery({ name: 'provider', required: false, enum: LlmProvider, description: 'LLM 提供商' })
  @ApiQuery({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' })
  @ApiQuery({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' })
  @ApiResponse({
    status: 200,
    description: '成功返回成本统计（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getCost(
    @Query('subAgent') subAgent?: string,
    @Query('provider') provider?: LlmProvider,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    try {
      const timeRange = startTime && endTime
        ? { start: new Date(startTime), end: new Date(endTime) }
        : undefined;

      const costStats = await this.llmCostService.getCostStats({
        subAgent: subAgent as any,
        provider,
        timeRange,
      });

      return successResponse(costStats);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取 Python AI Service 状态
   */
  @Public()
  @Get('python-ai/status')
  @ApiOperation({
    summary: 'Python AI Service 状态',
    description: '获取 Python AI Service 的连接状态、健康状态、熔断器状态等信息',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回服务状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getPythonAIStatus() {
    try {
      if (!this.pythonAIService) {
        return successResponse({
          enabled: false,
          message: 'Python AI Service is not available',
        });
      }

      const status = this.pythonAIService.getServiceStatus();
      
      // 尝试获取健康检查信息
      let healthCheck: any = null;
      try {
        healthCheck = await this.pythonAIService.checkHealth();
      } catch (error: any) {
        healthCheck = {
          error: error.message,
          available: false,
        };
      }

      return successResponse({
        ...status,
        healthCheck,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
