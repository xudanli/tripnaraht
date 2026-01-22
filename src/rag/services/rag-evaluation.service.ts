// src/rag/services/rag-evaluation.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagRetrievalParams, RagRetrievalResult } from '../interfaces/rag.interface';

/**
 * RAGEvaluationService
 * 
 * 职责：评估 RAG 检索质量
 * 
 * 评估指标：
 * 1. Recall@K：前 K 个结果中包含正确答案的比例
 * 2. MRR (Mean Reciprocal Rank)：平均倒数排名
 * 3. NDCG (Normalized Discounted Cumulative Gain)：归一化折损累积增益
 */
@Injectable()
export class RAGEvaluationService {
  private readonly logger = new Logger(RAGEvaluationService.name);

  constructor(private readonly ragService: RagService) {}

  /**
   * 评估检索质量
   */
  async evaluateRetrieval(
    query: string,
    params: RagRetrievalParams,
    groundTruthDocumentIds: string[], // 正确答案文档 ID 列表
  ): Promise<{
    recallAtK: Record<number, number>; // Recall@1, Recall@5, Recall@10
    mrr: number; // Mean Reciprocal Rank
    ndcg: Record<number, number>; // NDCG@1, NDCG@5, NDCG@10
    retrievedIds: string[];
    scores: number[];
  }> {
    this.logger.debug(
      `[RAGEvaluation] 评估检索质量: query="${query.substring(0, 50)}...", groundTruthCount=${groundTruthDocumentIds.length}`,
    );

    // 执行检索
    const results = await this.ragService.retrieve(params);
    const retrievedIds = results.map((r) => r.id);
    const scores = results.map((r) => r.score);

    // 计算 Recall@K
    const recallAtK = this.calculateRecallAtK(retrievedIds, groundTruthDocumentIds, [1, 5, 10]);

    // 计算 MRR
    const mrr = this.calculateMRR(retrievedIds, groundTruthDocumentIds);

    // 计算 NDCG@K
    const ndcg = this.calculateNDCGAtK(
      retrievedIds,
      groundTruthDocumentIds,
      scores,
      [1, 5, 10],
    );

    return {
      recallAtK,
      mrr,
      ndcg,
      retrievedIds,
      scores,
    };
  }

  /**
   * 批量评估检索质量
   */
  async evaluateBatch(
    testCases: Array<{
      query: string;
      params: RagRetrievalParams;
      groundTruthDocumentIds: string[];
    }>,
  ): Promise<{
    averageRecallAtK: Record<number, number>;
    averageMRR: number;
    averageNDCGAtK: Record<number, number>;
    perQueryResults: Array<{
      query: string;
      recallAtK: Record<number, number>;
      mrr: number;
      ndcg: Record<number, number>;
    }>;
  }> {
    this.logger.log(`[RAGEvaluation] 批量评估: testCasesCount=${testCases.length}`);

    const allRecallAtK: Record<number, number[]> = { 1: [], 5: [], 10: [] };
    const allMRR: number[] = [];
    const allNDCGAtK: Record<number, number[]> = { 1: [], 5: [], 10: [] };
    const perQueryResults: Array<{
      query: string;
      recallAtK: Record<number, number>;
      mrr: number;
      ndcg: Record<number, number>;
    }> = [];

    for (const testCase of testCases) {
      const result = await this.evaluateRetrieval(
        testCase.query,
        testCase.params,
        testCase.groundTruthDocumentIds,
      );

      // 收集指标
      for (const k of [1, 5, 10]) {
        allRecallAtK[k].push(result.recallAtK[k]);
        allNDCGAtK[k].push(result.ndcg[k]);
      }
      allMRR.push(result.mrr);

      perQueryResults.push({
        query: testCase.query,
        recallAtK: result.recallAtK,
        mrr: result.mrr,
        ndcg: result.ndcg,
      });
    }

    // 计算平均值
    const averageRecallAtK: Record<number, number> = {};
    const averageNDCGAtK: Record<number, number> = {};

    for (const k of [1, 5, 10]) {
      averageRecallAtK[k] =
        allRecallAtK[k].reduce((sum, val) => sum + val, 0) / allRecallAtK[k].length;
      averageNDCGAtK[k] =
        allNDCGAtK[k].reduce((sum, val) => sum + val, 0) / allNDCGAtK[k].length;
    }

    const averageMRR = allMRR.reduce((sum, val) => sum + val, 0) / allMRR.length;

    this.logger.log(
      `[RAGEvaluation] 批量评估完成: avgRecall@5=${averageRecallAtK[5].toFixed(3)}, avgMRR=${averageMRR.toFixed(3)}`,
    );

    return {
      averageRecallAtK,
      averageMRR,
      averageNDCGAtK,
      perQueryResults,
    };
  }

  /**
   * 计算 Recall@K
   * 
   * Recall@K = (前 K 个结果中包含的正确答案数量) / (总正确答案数量)
   */
  private calculateRecallAtK(
    retrievedIds: string[],
    groundTruthIds: string[],
    kValues: number[],
  ): Record<number, number> {
    const recallAtK: Record<number, number> = {};

    for (const k of kValues) {
      const topKIds = retrievedIds.slice(0, k);
      const relevantRetrieved = topKIds.filter((id) => groundTruthIds.includes(id)).length;
      recallAtK[k] = groundTruthIds.length > 0 ? relevantRetrieved / groundTruthIds.length : 0;
    }

    return recallAtK;
  }

  /**
   * 计算 MRR (Mean Reciprocal Rank)
   * 
   * MRR = 1 / (第一个正确答案的排名)
   * 如果没有正确答案，MRR = 0
   */
  private calculateMRR(retrievedIds: string[], groundTruthIds: string[]): number {
    if (groundTruthIds.length === 0) {
      return 0;
    }

    for (let i = 0; i < retrievedIds.length; i++) {
      if (groundTruthIds.includes(retrievedIds[i])) {
        return 1 / (i + 1); // 排名从 1 开始
      }
    }

    return 0; // 没有找到正确答案
  }

  /**
   * 计算 NDCG@K (Normalized Discounted Cumulative Gain)
   * 
   * DCG@K = sum(rel_i / log2(i + 1)) for i in [1, K]
   * IDCG@K = DCG@K of ideal ranking (所有正确答案排在前面)
   * NDCG@K = DCG@K / IDCG@K
   */
  private calculateNDCGAtK(
    retrievedIds: string[],
    groundTruthIds: string[],
    scores: number[],
    kValues: number[],
  ): Record<number, number> {
    const ndcgAtK: Record<number, number> = {};

    // 构建相关性数组（1 = 相关，0 = 不相关）
    const relevance = retrievedIds.map((id) => (groundTruthIds.includes(id) ? 1 : 0));

    for (const k of kValues) {
      const topKRelevance = relevance.slice(0, k);
      const topKScores = scores.slice(0, k);

      // 计算 DCG@K
      let dcg = 0;
      for (let i = 0; i < topKRelevance.length; i++) {
        dcg += topKRelevance[i] / Math.log2(i + 2); // i+2 因为 log2(1) = 0
      }

      // 计算 IDCG@K（理想情况：所有相关文档排在前面）
      const idealRelevance = [...groundTruthIds]
        .slice(0, k)
        .map(() => 1)
        .concat(new Array(Math.max(0, k - groundTruthIds.length)).fill(0));

      let idcg = 0;
      for (let i = 0; i < idealRelevance.length; i++) {
        idcg += idealRelevance[i] / Math.log2(i + 2);
      }

      // 计算 NDCG@K
      ndcgAtK[k] = idcg > 0 ? dcg / idcg : 0;
    }

    return ndcgAtK;
  }
}
