// src/kpu/kpu.controller.ts
/**
 * KPU Controller
 * 
 * 提供KPU知识处理单元相关的API端点
 */

import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { IntegratedRAGKPUService } from './services/integrated-rag-kpu.service';
import { KnowledgeValidationService } from './services/knowledge-validation.service';
import { ValidationCacheService } from './services/validation-cache.service';
import { KPUMonitoringService } from './services/kpu-monitoring.service';
import { KPUHealthService } from './services/kpu-health.service';
import {
  RetrievalAndValidateRequestDto,
  RetrievalAndValidateResponseDto,
} from './dto/retrieval-and-validate.dto';
import {
  GenerateAndValidateRequestDto,
  GenerateAndValidateResponseDto,
} from './dto/generate-and-validate.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('kpu')
@Controller('kpu')
export class KPUController {
  constructor(
    private readonly integratedRAGKPU: IntegratedRAGKPUService,
    private readonly validationService: KnowledgeValidationService,
    private readonly cacheService: ValidationCacheService,
    private readonly monitoringService: KPUMonitoringService,
    private readonly healthService: KPUHealthService,
  ) {}

  /**
   * 检索并验证知识片段
   */
  @Public()
  @Post('retrieve-and-validate')
  @ApiOperation({
    summary: '检索并验证知识片段',
    description: '从知识库检索相关片段，并进行实时验证和重排序',
  })
  @ApiBody({ type: RetrievalAndValidateRequestDto })
  @ApiResponse({
    status: 200,
    description: '检索并验证成功',
    type: RetrievalAndValidateResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: '服务器错误', type: ApiErrorResponseDto })
  async retrieveAndValidate(
    @Body() request: RetrievalAndValidateRequestDto,
  ) {
    try {
      const result = await this.integratedRAGKPU.retrieveAndValidate({
        query: request.query,
        limit: request.limit,
        credibilityMin: request.credibilityMin,
        type: request.type,
        category: request.category,
        chunkCategory: request.chunkCategory,
        fileId: request.fileId,
        useHybridSearch: request.useHybridSearch,
        denseWeight: request.denseWeight,
        sparseWeight: request.sparseWeight,
        useReranking: request.useReranking,
        rerankTopK: request.rerankTopK,
        useQueryExpansion: request.useQueryExpansion,
        maxQueryVariants: request.maxQueryVariants,
        useIntentClassification: request.useIntentClassification,
        minValidationScore: request.minValidationScore,
        enableSnippetValidation: request.enableSnippetValidation,
        validationOptions: request.validationOptions ? {
          enableFactCheck: request.validationOptions.enableFactCheck ?? true,
          enableConsistencyCheck: request.validationOptions.enableConsistencyCheck ?? true,
          enableCitationCheck: request.validationOptions.enableCitationCheck ?? true,
        } : undefined,
        context: request.context,
      });

      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 生成并验证回答
   */
  @Public()
  @Post('generate-and-validate')
  @ApiOperation({
    summary: '生成并验证回答',
    description: '基于验证后的知识源生成回答，并进行验证。如果验证失败，自动重试。',
  })
  @ApiBody({ type: GenerateAndValidateRequestDto })
  @ApiResponse({
    status: 200,
    description: '生成并验证成功',
    type: GenerateAndValidateResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误', type: ApiErrorResponseDto })
  @ApiResponse({ status: 500, description: '服务器错误', type: ApiErrorResponseDto })
  async generateAndValidate(
    @Body() request: GenerateAndValidateRequestDto,
  ) {
    try {
      // 转换DTO到服务层类型
      const validatedResults = request.validatedResults.map(r => ({
        ...r,
        validation: r.validation,
        citations: r.citations,
      })) as any;

      const result = await this.integratedRAGKPU.generateWithValidation({
        query: request.query,
        validatedResults,
        context: request.context,
        retryOnFailure: request.retryOnFailure,
        maxRetries: request.maxRetries,
      });

      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 验证知识片段
   */
  @Public()
  @Post('validate-snippet')
  @ApiOperation({
    summary: '验证知识片段',
    description: '验证单个知识片段的准确性、一致性、完整性等',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '知识片段内容' },
        source: { type: 'string', description: '来源' },
        metadata: { type: 'object', description: '元数据' },
        context: { type: 'object', description: '上下文' },
        options: {
          type: 'object',
          properties: {
            enableFactCheck: { type: 'boolean' },
            enableConsistencyCheck: { type: 'boolean' },
            enableCitationCheck: { type: 'boolean' },
          },
        },
      },
      required: ['content'],
    },
  })
  @ApiResponse({ status: 200, description: '验证成功' })
  async validateSnippet(
    @Body() body: {
      content: string;
      source?: string;
      metadata?: Record<string, any>;
      context?: Record<string, any>;
      options?: {
        enableFactCheck?: boolean;
        enableConsistencyCheck?: boolean;
        enableCitationCheck?: boolean;
      };
    },
  ) {
    try {
      const result = await this.validationService.validateSnippet({
        content: body.content,
        source: body.source,
        metadata: body.metadata,
        context: body.context,
        options: body.options ? {
          enableFactCheck: body.options.enableFactCheck ?? true,
          enableConsistencyCheck: body.options.enableConsistencyCheck ?? true,
          enableCitationCheck: body.options.enableCitationCheck ?? true,
        } : undefined,
      });

      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 清除验证缓存
   */
  @Public()
  @Post('cache/clear')
  @ApiOperation({
    summary: '清除验证缓存',
    description: '清除所有验证结果的缓存',
  })
  @ApiResponse({ status: 200, description: '缓存清除成功' })
  async clearCache() {
    try {
      await this.cacheService.clearCache();
      return successResponse({ message: '缓存已清除' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取缓存统计
   */
  @Public()
  @Get('cache/stats')
  @ApiOperation({
    summary: '获取缓存统计',
    description: '获取验证缓存的统计信息',
  })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getCacheStats() {
    try {
      const metrics = this.monitoringService.getMetrics();
      return successResponse({
        cacheHits: metrics.cacheHits,
        cacheMisses: metrics.cacheMisses,
        cacheHitRate: metrics.cacheHitRate,
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取KPU指标
   */
  @Public()
  @Get('metrics')
  @ApiOperation({
    summary: '获取KPU指标',
    description: '获取KPU的性能指标和运行状态',
  })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getMetrics() {
    try {
      const metrics = this.monitoringService.getMetrics();
      const summary = this.monitoringService.getMetricsSummary();
      return successResponse({
        metrics,
        summary,
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 重置KPU指标
   */
  @Public()
  @Post('metrics/reset')
  @ApiOperation({
    summary: '重置KPU指标',
    description: '重置所有KPU性能指标',
  })
  @ApiResponse({ status: 200, description: '重置成功' })
  async resetMetrics() {
    try {
      this.monitoringService.resetMetrics();
      return successResponse({ message: '指标已重置' });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 健康检查
   */
  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'KPU健康检查',
    description: '检查KPU服务及其依赖的健康状态',
  })
  @ApiResponse({ status: 200, description: '健康检查成功' })
  async healthCheck() {
    try {
      const health = await this.healthService.checkHealth();
      return successResponse(health);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
