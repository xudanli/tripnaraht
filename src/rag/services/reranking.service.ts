// src/rag/services/reranking.service.ts
/**
 * Reranking 服务
 * 
 * 对检索结果进行重新排序，提升准确率
 * 
 * 策略：
 * - 使用 LLM 对 Top-K 结果进行相关性评分
 * - 支持批量重排序（并行处理）
 * - 可配置重排序数量（默认对 Top-20 重排序，返回 Top-10）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { ChunkRetrievalResult } from './chunk-retrieval.service';

export interface RerankingParams {
  query: string;
  results: ChunkRetrievalResult[];
  topK?: number; // 重排序的Top-K数量（默认20）
  returnTop?: number; // 返回的Top数量（默认10）
  useLLM?: boolean; // 是否使用LLM重排序（默认true）
}

export interface RerankingResult extends ChunkRetrievalResult {
  rerankScore?: number; // 重排序分数
  rerankReason?: string; // 重排序原因
}

@Injectable()
export class RerankingService {
  private readonly logger = new Logger(RerankingService.name);
  private readonly DEFAULT_TOP_K = 20; // 默认重排序Top-20
  private readonly DEFAULT_RETURN_TOP = 10; // 默认返回Top-10

  constructor(
    @Optional() private readonly llmService?: LlmService,
  ) {
    if (!llmService) {
      this.logger.warn('LlmService 未注入，Reranking 将使用基于分数的简单重排序');
    }
  }

  /**
   * 对检索结果进行重排序
   */
  async rerank(params: RerankingParams): Promise<RerankingResult[]> {
    const {
      query,
      results,
      topK = this.DEFAULT_TOP_K,
      returnTop = this.DEFAULT_RETURN_TOP,
      useLLM = true,
    } = params;

    if (results.length === 0) {
      return [];
    }

    // 如果结果数量少于topK，使用所有结果
    const candidates = results.slice(0, Math.min(topK, results.length));

    this.logger.debug(
      `Reranking: query="${query.substring(0, 50)}...", candidates=${candidates.length}, returnTop=${returnTop}`
    );

    try {
      if (useLLM && this.llmService) {
        return await this.rerankWithLLM(query, candidates, returnTop);
      } else {
        // 降级：使用基于分数的简单重排序
        return this.rerankByScore(candidates, returnTop);
      }
    } catch (error: any) {
      this.logger.warn(`Reranking 失败，降级到基于分数的排序: ${error.message}`);
      return this.rerankByScore(candidates, returnTop);
    }
  }

  /**
   * 使用 LLM 进行重排序
   */
  private async rerankWithLLM(
    query: string,
    candidates: ChunkRetrievalResult[],
    returnTop: number
  ): Promise<RerankingResult[]> {
    // 构建重排序提示
    const prompt = this.buildRerankingPrompt(query, candidates);

    try {
      // 调用 LLM 进行重排序（使用 callLlmWithSchema）
      const fullPrompt = `你是一个专业的文档检索质量评估专家。你的任务是对检索结果进行重新排序，找出与查询最相关的文档。

${prompt}`;

      // 获取默认provider
      const provider = this.llmService.getDefaultProvider();
      const response = await this.llmService.callLlmWithSchema(
        provider,
        fullPrompt,
        this.getRerankingSchema()
      );

      // 解析 LLM 响应
      const rerankedResults = this.parseLLMResponse(response, candidates);

      // 如果解析失败，降级到基于分数的排序
      if (rerankedResults.length === 0) {
        this.logger.warn('LLM 响应解析失败，降级到基于分数的排序');
        return this.rerankByScore(candidates, returnTop);
      }

      return rerankedResults.slice(0, returnTop);
    } catch (error: any) {
      this.logger.error(`LLM 重排序失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 构建重排序提示
   */
  private buildRerankingPrompt(query: string, candidates: ChunkRetrievalResult[]): string {
    const candidatesText = candidates
      .map((candidate, index) => {
        const contentPreview = candidate.content.substring(0, 500);
        const score = candidate.hybridScore || candidate.similarity || 0;
        return `[${index + 1}] 分数: ${score.toFixed(3)}
内容: ${contentPreview}${candidate.content.length > 500 ? '...' : ''}
类型: ${candidate.type}
可信度: ${candidate.credibilityScore.toFixed(2)}`;
      })
      .join('\n\n');

    return `查询: "${query}"

请对以下检索结果进行重新排序，找出与查询最相关的文档。

要求：
1. 评估每个文档与查询的相关性（0-1分）
2. 考虑语义相关性、信息完整性、可信度
3. 返回排序后的文档编号列表（按相关性从高到低）
4. 格式：JSON数组，每个元素包含 {"index": 文档编号(1-based), "score": 相关性分数(0-1), "reason": "简短原因"}

检索结果：
${candidatesText}

请返回JSON格式的排序结果：`;
  }

  /**
   * 解析 LLM 响应
   */
  private parseLLMResponse(
    response: string,
    candidates: ChunkRetrievalResult[]
  ): RerankingResult[] {
    try {
      // 尝试提取JSON（可能包含markdown代码块）
      let jsonStr = response.trim();
      
      // 移除markdown代码块标记
      if (jsonStr.startsWith('```')) {
        const lines = jsonStr.split('\n');
        jsonStr = lines.slice(1, -1).join('\n');
      }
      
      // 移除可能的json标记
      if (jsonStr.startsWith('json\n')) {
        jsonStr = jsonStr.substring(4);
      }

      // 解析JSON
      const parsed = JSON.parse(jsonStr);
      
      if (!Array.isArray(parsed)) {
        throw new Error('响应不是数组格式');
      }

      // 构建重排序结果
      const rerankedMap = new Map<number, { score: number; reason?: string }>();
      parsed.forEach((item: any) => {
        const index = item.index || item.rank || item.id;
        if (typeof index === 'number' && index >= 1 && index <= candidates.length) {
          rerankedMap.set(index - 1, {
            score: item.score || 0,
            reason: item.reason || item.explanation || '',
          });
        }
      });

      // 如果解析失败，返回空数组
      if (rerankedMap.size === 0) {
        return [];
      }

      // 按重排序分数排序
      const reranked = Array.from(rerankedMap.entries())
        .map(([originalIndex, rerankInfo]) => ({
          ...candidates[originalIndex],
          rerankScore: rerankInfo.score,
          rerankReason: rerankInfo.reason,
        }))
        .sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));

      return reranked;
    } catch (error: any) {
      this.logger.warn(`解析LLM响应失败: ${error.message}, response: ${response.substring(0, 200)}`);
      return [];
    }
  }

  /**
   * 基于分数的简单重排序（降级策略）
   */
  private rerankByScore(
    candidates: ChunkRetrievalResult[],
    returnTop: number
  ): RerankingResult[] {
    // 使用混合分数或相似度分数进行排序
    return candidates
      .map((candidate) => ({
        ...candidate,
        rerankScore: candidate.hybridScore || candidate.similarity || 0,
        rerankReason: '基于检索分数排序',
      }))
      .sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0))
      .slice(0, returnTop);
  }

  /**
   * 获取重排序的 JSON Schema
   */
  private getRerankingSchema(): any {
    return {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: '文档编号（1-based，从1开始）',
          },
          score: {
            type: 'number',
            description: '相关性分数（0-1）',
            minimum: 0,
            maximum: 1,
          },
          reason: {
            type: 'string',
            description: '简短的重排序原因',
          },
        },
        required: ['index', 'score'],
      },
    };
  }

  /**
   * 批量重排序（并行处理多个查询）
   */
  async rerankBatch(
    queries: Array<{ query: string; results: ChunkRetrievalResult[] }>,
    topK?: number,
    returnTop?: number
  ): Promise<RerankingResult[][]> {
    const rerankPromises = queries.map(({ query, results }) =>
      this.rerank({
        query,
        results,
        topK,
        returnTop,
      })
    );

    return Promise.all(rerankPromises);
  }
}
