// src/kpu/services/integrated-rag-kpu.service.ts
/**
 * 集成RAG-KPU服务（核心融合服务）
 * 
 * 实现检索和验证的深度融合：
 * 1. 检索候选知识（扩大候选池）
 * 2. 实时验证候选知识
 * 3. 基于验证结果重排序
 * 4. 生成回答
 * 5. 验证生成内容
 * 6. 失败时自动调整重试
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChunkRetrievalService, ChunkRetrievalParams } from '../../rag/services/chunk-retrieval.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import type { RagSoftWorldScope } from '../../rag/reality-policy/rag-soft-world-policy';
import { getBoundDecisionContext } from '../../trips/reality-kernel/reality-context.storage';
import { KnowledgeValidationService } from './knowledge-validation.service';
import { ValidationScoringService } from './validation-scoring.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { KPUMonitoringService } from './kpu-monitoring.service';
import {
  ValidatedRetrievalResult,
  RetrievalAndValidateParams,
  GenerationWithValidationParams,
} from '../types/validation.types';
import { OutputValidationResult } from '../types/validation.types';

@Injectable()
export class IntegratedRAGKPUService {
  private readonly logger = new Logger(IntegratedRAGKPUService.name);

  constructor(
    private readonly chunkRetrievalService: ChunkRetrievalService,
    private readonly validationService: KnowledgeValidationService,
    private readonly scoringService: ValidationScoringService,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly monitoringService?: KPUMonitoringService,
    @Optional() private readonly ragRealityPolicyGate?: RagRealityPolicyGateService,
  ) {}

  /**
   * 检索并验证知识片段（核心方法）
   */
  async retrieveAndValidate(
    params: RetrievalAndValidateParams
  ): Promise<{
    results: ValidatedRetrievalResult[];
    metadata: {
      totalCandidates: number;
      validatedCount: number;
      filteredCount: number;
      avgValidationScore: number;
      latency: number;
    };
  }> {
    const startTime = Date.now();

    const isRagScope = (s: unknown): s is RagSoftWorldScope =>
      s === 'full' || s === 'restricted' || s === 'blocked';
    let ragScope: RagSoftWorldScope = 'full';
    if (isRagScope(params.context?.rag_scope)) {
      ragScope = params.context.rag_scope;
    } else if (this.ragRealityPolicyGate) {
      ragScope = this.ragRealityPolicyGate.resolve(getBoundDecisionContext()).scope;
    }
    if (ragScope === 'blocked') {
      const latency = Date.now() - startTime;
      return {
        results: [],
        metadata: {
          totalCandidates: 0,
          validatedCount: 0,
          filteredCount: 0,
          avgValidationScore: 0,
          latency,
        },
      };
    }
    
    // 记录检索开始
    if (this.monitoringService) {
      this.monitoringService.recordRetrieval(0, 0); // 延迟稍后更新
    }
    
    // 1. 扩大候选池检索（获取更多候选）
    const candidateMultiplier = params.enableSnippetValidation ? 2 : 1;
    let retrievalParams: ChunkRetrievalParams = {
      query: params.query,
      limit: (params.limit || 10) * candidateMultiplier,
      credibilityMin: params.credibilityMin,
      type: params.type,
      category: params.category,
      chunkCategory: params.chunkCategory,
      fileId: params.fileId,
      useHybridSearch: params.useHybridSearch,
      denseWeight: params.denseWeight,
      sparseWeight: params.sparseWeight,
      useReranking: params.useReranking,
      rerankTopK: params.rerankTopK,
      useQueryExpansion: params.useQueryExpansion,
      maxQueryVariants: params.maxQueryVariants,
      useIntentClassification: params.useIntentClassification,
    };
    if (this.ragRealityPolicyGate) {
      retrievalParams = this.ragRealityPolicyGate.mergeChunkRetrievalParams(retrievalParams, ragScope);
    }

    const candidates = await this.chunkRetrievalService.retrieve(retrievalParams);

    this.logger.debug(
      `检索到 ${candidates.length} 个候选知识片段`
    );

    // 2. 如果启用片段验证，并行验证候选知识片段
    let validated: ValidatedRetrievalResult[];
    if (params.enableSnippetValidation) {
      validated = await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const validation = await this.validationService.validateSnippet({
              content: candidate.content,
              source: candidate.sourceFile,
              metadata: candidate.metadata,
              context: params.context,
              options: params.validationOptions || {
                enableFactCheck: true,
                enableConsistencyCheck: true,
                enableCitationCheck: true,
              },
            });

            const overallScore = this.scoringService.calculateOverallScore({
              factCheck: validation.factCheck,
              credibility: validation.sourceCredibility,
              freshness: validation.freshness,
              completeness: validation.completeness,
              consistency: validation.consistency,
              similarity: candidate.similarity || candidate.hybridScore || 0,
            });

            return {
              ...candidate,
              validation: {
                factCheck: validation.factCheck,
                sourceCredibility: validation.sourceCredibility,
                freshness: validation.freshness,
                completeness: validation.completeness,
                consistency: validation.consistency,
                overallScore,
              },
              citations: validation.citations || [],
            } as ValidatedRetrievalResult;
          } catch (error: any) {
            this.logger.warn(
              `验证知识片段失败: ${error?.message || 'unknown error'}`,
              error?.stack
            );
            // 验证失败时返回未知状态
            return {
              ...candidate,
              validation: {
                factCheck: 'unknown',
                sourceCredibility: 0.5,
                freshness: 0.5,
                completeness: 0.5,
                consistency: 'unknown',
                overallScore: (candidate.similarity || candidate.hybridScore || 0) * 0.5,
              },
              citations: [],
            } as ValidatedRetrievalResult;
          }
        })
      );
    } else {
      // 如果不启用验证，直接使用检索结果，设置默认验证值
      validated = candidates.map(candidate => ({
        ...candidate,
        validation: {
          factCheck: 'unknown',
          sourceCredibility: candidate.credibilityScore || 0.5,
          freshness: 0.5,
          completeness: 0.8,
          consistency: 'unknown',
          overallScore: candidate.similarity || candidate.hybridScore || 0,
        },
        citations: [],
      })) as ValidatedRetrievalResult[];
    }

    // 3. 过滤低质量结果
    const minScore = params.minValidationScore || 0.5;
    const filtered = validated.filter(
      v => v.validation.overallScore >= minScore
    );

    // 4. 基于验证得分重新排序
    const reranked = filtered.sort((a, b) => {
      // 综合相似度和验证得分
      const scoreA = (a.similarity || a.hybridScore || 0) * 0.4 + 
                     a.validation.overallScore * 0.6;
      const scoreB = (b.similarity || b.hybridScore || 0) * 0.4 + 
                     b.validation.overallScore * 0.6;
      return scoreB - scoreA;
    }).slice(0, params.limit || 10);

    const avgScore = validated.length > 0
      ? validated.reduce((sum, v) => sum + v.validation.overallScore, 0) / validated.length
      : 0;

    const latency = Date.now() - startTime;

    // 记录指标
    if (this.monitoringService) {
      this.monitoringService.recordRetrieval(latency, candidates.length);
      if (validated.length > 0) {
        this.monitoringService.recordValidation(true, latency, avgScore);
      }
    }

    return {
      results: reranked,
      metadata: {
        totalCandidates: candidates.length,
        validatedCount: validated.length,
        filteredCount: reranked.length,
        avgValidationScore: avgScore,
        latency,
      },
    };
  }

  /**
   * 生成并验证回答（核心方法）
   */
  async generateWithValidation(
    params: GenerationWithValidationParams
  ): Promise<{
    answer: string;
    validation: OutputValidationResult;
    validatedSources: ValidatedRetrievalResult[];
    retried: boolean;
    metadata: {
      generationLatency: number;
      validationLatency: number;
      totalLatency: number;
    };
  }> {
    const startTime = Date.now();
    const { query, validatedResults, context, retryOnFailure = true, maxRetries = 2 } = params;

    // 1. 使用高质量知识生成回答
    const highQualityResults = validatedResults.filter(
      r => r.validation.overallScore >= 0.7
    );

    const generationStart = Date.now();
    const answer = await this.generateAnswer(
      query,
      highQualityResults.length > 0 ? highQualityResults : validatedResults,
      context
    );
    const generationLatency = Date.now() - generationStart;

    // 2. 验证生成内容
    const validationStart = Date.now();
    const validation = await this.validationService.validateOutput({
      output: answer,
      sources: validatedResults,
      query,
      context,
      options: {
        enableFactCheck: true,
        enableConsistencyCheck: true,
        enableCitationCheck: true,
        enableCompletenessCheck: true,
      },
    });
    const validationLatency = Date.now() - validationStart;

    // 3. 如果验证失败且允许重试，尝试调整策略
    let retried = false;
    let finalAnswer = answer;
    let finalValidation = validation;

    if (validation.overall === 'fail' && retryOnFailure) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // 使用更高置信度的知识重新生成
        const veryHighConfidenceResults = validatedResults.filter(
          r => r.validation.overallScore >= 0.8 + attempt * 0.1
        );

        if (veryHighConfidenceResults.length > 0) {
          this.logger.debug(
            `验证失败，尝试第 ${attempt + 1} 次重新生成（使用 ${veryHighConfidenceResults.length} 个高质量知识片段）`
          );

          const retryAnswer = await this.generateAnswer(
            query,
            veryHighConfidenceResults,
            {
              ...context,
              instructions: '只使用提供的高质量知识，不要添加未验证的信息，如果信息不足请明确说明',
            }
          );

          const retryValidation = await this.validationService.validateOutput({
            output: retryAnswer,
            sources: veryHighConfidenceResults,
            query,
            context,
            options: {
              enableFactCheck: true,
              enableConsistencyCheck: true,
              enableCitationCheck: true,
              enableCompletenessCheck: false,
            },
          });

          if (retryValidation.overall === 'pass' || retryValidation.score >= 0.8) {
            finalAnswer = retryAnswer;
            finalValidation = retryValidation;
            retried = true;
            break;
          }
        }
      }
    }

    const totalLatency = Date.now() - startTime;

    // 记录指标
    if (this.monitoringService) {
      const success = finalValidation.overall === 'pass' || finalValidation.score >= 60;
      this.monitoringService.recordGeneration(success, totalLatency, retried);
    }

    return {
      answer: finalAnswer,
      validation: finalValidation,
      validatedSources: validatedResults,
      retried,
      metadata: {
        generationLatency,
        validationLatency,
        totalLatency,
      },
    };
  }

  /**
   * 生成回答（调用LLM）
   */
  private async generateAnswer(
    query: string,
    validatedResults: ValidatedRetrievalResult[],
    context?: Record<string, any>
  ): Promise<string> {
    // 构建上下文文本
    const contextText = validatedResults
      .map((r, idx) => `[${idx + 1}] ${r.content}`)
      .join('\n\n');

    // 如果有LLM服务，使用LLM生成回答
    if (this.llmService) {
      try {
        const instructions = context?.instructions || 
          '请基于提供的知识源回答问题。只使用知识源中的信息，不要添加未验证的信息。如果知识源信息不足，请明确说明。';

        const prompt = `问题：${query}

知识源：
${contextText}

${instructions}

请提供详细、准确的回答：`;

        // 使用LlmService的公共方法生成回答
        const llmStartTime = Date.now();
        const answer = await this.llmService.callLlmWithSchema(
          LlmProvider.DEEPSEEK, // 使用DeepSeek作为默认provider
          prompt
        );
        const llmLatency = Date.now() - llmStartTime;

        // 记录LLM调用指标
        if (this.monitoringService) {
          this.monitoringService.recordLlmCall(true, llmLatency);
        }

        return answer;
      } catch (error: any) {
        this.logger.warn(`LLM生成回答失败: ${error?.message}，使用简单拼接`);
        // 记录LLM调用失败
        if (this.monitoringService) {
          this.monitoringService.recordLlmCall(false, 0);
        }
        // 降级到简单拼接
      }
    }

    // 降级方案：简单拼接
    const answer = validatedResults.length > 0
      ? `基于以下知识回答：${query}\n\n${contextText.substring(0, 1000)}`
      : `抱歉，无法找到相关信息来回答：${query}`;

    return answer;
  }
}
