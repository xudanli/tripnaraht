// src/rag/services/query-expansion.service.ts
/**
 * 查询扩展服务
 * 
 * 使用 LLM 生成查询变体，提升检索召回率
 * 
 * 策略：
 * - 生成同义词、相关词、改写查询
 * - 多查询并行检索后合并结果
 * - 使用 RRF 或加权合并策略
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { ChunkRetrievalResult } from './chunk-retrieval.service';

export interface QueryExpansionParams {
  query: string;
  maxVariants?: number; // 最大变体数量（默认3）
  useLLM?: boolean; // 是否使用LLM生成变体（默认true）
}

export interface ExpandedQuery {
  original: string;
  variants: string[];
  allQueries: string[]; // original + variants
}

@Injectable()
export class QueryExpansionService {
  private readonly logger = new Logger(QueryExpansionService.name);
  private readonly DEFAULT_MAX_VARIANTS = 3;

  constructor(
    @Optional() private readonly llmService?: LlmService,
  ) {
    if (!llmService) {
      this.logger.warn('LlmService 未注入，查询扩展将使用简单的同义词扩展');
    }
  }

  /**
   * 扩展查询
   */
  async expandQuery(params: QueryExpansionParams): Promise<ExpandedQuery> {
    const {
      query,
      maxVariants = this.DEFAULT_MAX_VARIANTS,
      useLLM = true,
    } = params;

    this.logger.debug(`查询扩展: query="${query.substring(0, 50)}...", maxVariants=${maxVariants}`);

    try {
      if (useLLM && this.llmService) {
        return await this.expandWithLLM(query, maxVariants);
      } else {
        return this.expandWithSynonyms(query, maxVariants);
      }
    } catch (error: any) {
      this.logger.warn(`查询扩展失败，降级到简单扩展: ${error.message}`);
      return this.expandWithSynonyms(query, maxVariants);
    }
  }

  /**
   * 使用 LLM 生成查询变体
   */
  private async expandWithLLM(query: string, maxVariants: number): Promise<ExpandedQuery> {
    const prompt = this.buildExpansionPrompt(query, maxVariants);

    try {
      const provider = this.llmService!.getDefaultProvider();
      const response = await this.llmService!.callLlmWithSchema(
        provider,
        prompt,
        this.getExpansionSchema()
      );

      // 解析响应
      const variants = this.parseExpansionResponse(response, maxVariants);

      return {
        original: query,
        variants,
        allQueries: [query, ...variants],
      };
    } catch (error: any) {
      this.logger.error(`LLM 查询扩展失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 使用简单同义词扩展（降级策略）
   */
  private expandWithSynonyms(query: string, maxVariants: number): ExpandedQuery {
    // 简单的同义词映射（可以扩展）
    const synonymMap: Record<string, string[]> = {
      '租车': ['租车', '汽车租赁', '租用车辆'],
      '保险': ['保险', '保障', '保护'],
      '路线': ['路线', '路径', '行程', '路线规划'],
      '景点': ['景点', '旅游景点', '景点推荐', '必游景点'],
      '酒店': ['酒店', '住宿', '旅馆', '宾馆'],
      '餐厅': ['餐厅', '饭店', '餐馆', '美食'],
    };

    const variants: string[] = [];
    const words = query.split(/\s+/);

    // 尝试替换每个词
    for (const word of words) {
      if (synonymMap[word]) {
        for (const synonym of synonymMap[word]) {
          if (synonym !== word && variants.length < maxVariants) {
            const variant = query.replace(word, synonym);
            if (!variants.includes(variant)) {
              variants.push(variant);
            }
          }
        }
      }
    }

    // 如果没有找到同义词，生成简单的改写
    if (variants.length === 0) {
      // 添加"如何"、"什么"等疑问词变体
      if (!query.startsWith('如何') && !query.startsWith('什么') && !query.startsWith('哪里')) {
        variants.push(`如何${query}`);
        if (variants.length < maxVariants) {
          variants.push(`${query}是什么`);
        }
      }
    }

    return {
      original: query,
      variants: variants.slice(0, maxVariants),
      allQueries: [query, ...variants.slice(0, maxVariants)],
    };
  }

  /**
   * 构建扩展提示
   */
  private buildExpansionPrompt(query: string, maxVariants: number): string {
    return `你是一个专业的查询扩展专家。请为以下查询生成 ${maxVariants} 个查询变体，用于提升检索召回率。

要求：
1. 生成同义词、相关词、改写查询
2. 保持查询的核心意图不变
3. 考虑不同的表达方式和角度
4. 返回JSON数组格式

原始查询: "${query}"

请返回 ${maxVariants} 个查询变体（JSON数组）：`;
  }

  /**
   * 获取扩展的 JSON Schema
   */
  private getExpansionSchema(): any {
    return {
      type: 'array',
      items: {
        type: 'string',
        description: '查询变体',
      },
      minItems: 1,
      maxItems: 5,
    };
  }

  /**
   * 解析 LLM 响应
   */
  private parseExpansionResponse(response: string, maxVariants: number): string[] {
    try {
      // 尝试提取JSON
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

      // 过滤空字符串和重复项
      const variants = parsed
        .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
        .map((v: string) => v.trim())
        .filter((v: string, index: number, arr: string[]) => arr.indexOf(v) === index)
        .slice(0, maxVariants);

      return variants;
    } catch (error: any) {
      this.logger.warn(`解析查询扩展响应失败: ${error.message}, response: ${response.substring(0, 200)}`);
      return [];
    }
  }

  /**
   * 合并多个查询的检索结果
   * 
   * 使用加权合并策略：
   * - 原始查询结果权重最高
   * - 变体查询结果权重递减
   */
  mergeResults(
    resultsMap: Map<string, ChunkRetrievalResult[]>,
    originalQuery: string,
    limit: number
  ): ChunkRetrievalResult[] {
    const resultScores = new Map<string, { result: ChunkRetrievalResult; score: number }>();

    // 处理原始查询结果（权重1.0）
    const originalResults = resultsMap.get(originalQuery) || [];
    originalResults.forEach((result) => {
      const existing = resultScores.get(result.id);
      const score = (result.hybridScore || result.similarity || 0) * 1.0;
      
      if (!existing || score > existing.score) {
        resultScores.set(result.id, { result, score });
      }
    });

    // 处理变体查询结果（权重递减）
    let variantIndex = 0;
    for (const [query, results] of resultsMap.entries()) {
      if (query === originalQuery) continue;
      
      const weight = 0.7 / (variantIndex + 1); // 权重递减：0.7, 0.35, 0.23, ...
      results.forEach((result) => {
        const existing = resultScores.get(result.id);
        const score = (result.hybridScore || result.similarity || 0) * weight;
        
        if (!existing || score > existing.score) {
          resultScores.set(result.id, { result, score });
        }
      });
      
      variantIndex++;
    }

    // 按分数排序并返回Top-K
    return Array.from(resultScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ result, score }) => ({
        ...result,
        similarity: score, // 更新相似度分数
      }));
  }
}
