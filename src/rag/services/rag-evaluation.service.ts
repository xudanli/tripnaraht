// src/rag/services/rag-evaluation.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagRetrievalParams } from '../interfaces/rag.interface';
import { ChunkRetrievalService, ChunkRetrievalParams } from './chunk-retrieval.service';

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

  constructor(
    private readonly ragService: RagService,
    private readonly chunkRetrievalService: ChunkRetrievalService,
  ) {}

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
   * 评估 Chunk 检索质量（新系统：Chunk 表）
   */
  async evaluateChunkRetrieval(
    query: string,
    params: ChunkRetrievalParams,
    groundTruthChunkIds: string[],
  ): Promise<{
    recallAtK: Record<number, number>;
    mrr: number;
    ndcg: Record<number, number>;
    retrievedIds: string[];
    scores: number[];
  }> {
    this.logger.debug(
      `[RAGEvaluation] 评估 Chunk 检索质量: query="${query.substring(0, 50)}...", groundTruthCount=${groundTruthChunkIds.length}`,
    );

    const results = await this.chunkRetrievalService.retrieve(params);
    const retrievedIds = results.map((r) => r.id);
    const scores = results.map((r) => r.rerankScore ?? r.hybridScore ?? r.similarity ?? 0);

    const recallAtK = this.calculateRecallAtK(retrievedIds, groundTruthChunkIds, [1, 5, 10]);
    const mrr = this.calculateMRR(retrievedIds, groundTruthChunkIds);
    const ndcg = this.calculateNDCGAtK(retrievedIds, groundTruthChunkIds, scores, [1, 5, 10]);

    return { recallAtK, mrr, ndcg, retrievedIds, scores };
  }

  /**
   * 批量评估 Chunk 检索质量
   */
  async evaluateChunkBatch(
    testCases: Array<{
      query: string;
      params: ChunkRetrievalParams;
      groundTruthChunkIds: string[];
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
    this.logger.log(`[RAGEvaluation] 批量评估 Chunk: testCasesCount=${testCases.length}`);

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
      const result = await this.evaluateChunkRetrieval(
        testCase.query,
        testCase.params,
        testCase.groundTruthChunkIds,
      );

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

    const averageRecallAtK: Record<number, number> = {};
    const averageNDCGAtK: Record<number, number> = {};
    for (const k of [1, 5, 10]) {
      averageRecallAtK[k] =
        allRecallAtK[k].reduce((sum, val) => sum + val, 0) / (allRecallAtK[k].length || 1);
      averageNDCGAtK[k] =
        allNDCGAtK[k].reduce((sum, val) => sum + val, 0) / (allNDCGAtK[k].length || 1);
    }
    const averageMRR = allMRR.reduce((sum, val) => sum + val, 0) / (allMRR.length || 1);

    return { averageRecallAtK, averageMRR, averageNDCGAtK, perQueryResults };
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
    _scores: number[],
    kValues: number[],
  ): Record<number, number> {
    const ndcgAtK: Record<number, number> = {};

    // 构建相关性数组（1 = 相关，0 = 不相关）
    const relevance = retrievedIds.map((id) => (groundTruthIds.includes(id) ? 1 : 0));

    for (const k of kValues) {
      const topKRelevance = relevance.slice(0, k);

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

  // ========================================
  // Gate 决策专属评估指标（新增）
  // ========================================

  /**
   * 评估 Should-Exist Gate 决策准确率
   *
   * 用于评估 Gate 的决策质量：是否正确识别了不可行/高风险的路线
   *
   * 指标：
   * - Accuracy: 决策准确率（正确决策 / 总决策数）
   * - Confidence: 平均置信度
   * - Evidence Count: 平均证据数量
   * - Alternatives Coverage: 提供替代方案的比例
   */
  async evaluateGateAccuracy(
    testSet: Array<{
      requestId: string;
      request: any; // TripPlanRequest
      expectedGateResult: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
      expectedViolations?: string[]; // 期望的违规类型
    }>,
  ): Promise<{
    accuracy: number;
    avgConfidence: number;
    avgEvidenceCount: number;
    alternativesCoverage: number;
    perCaseResults: Array<{
      requestId: string;
      predicted: string;
      expected: string;
      correct: boolean;
      confidence: number;
      evidenceCount: number;
      hasAlternatives: boolean;
    }>;
  }> {
    this.logger.log(
      `[GateEvaluation] 开始评估 Gate 准确率: testSetSize=${testSet.length}`,
    );

    const results: Array<{
      requestId: string;
      predicted: string;
      expected: string;
      correct: boolean;
      confidence: number;
      evidenceCount: number;
      hasAlternatives: boolean;
    }> = [];

    for (const testCase of testSet) {
      // TODO: 调用 Gatekeeper Agent 执行 Should-Exist Gate
      // const predicted = await this.gatekeeperService.shouldExist(testCase.request);

      // 临时模拟数据（待 Gatekeeper Service 实现后替换）
      const predicted = {
        gate_result: 'ALLOW',
        confidence: 0.85,
        evidence_refs: [{}, {}],
        alternatives: [],
      };

      const actual = testCase.expectedGateResult;

      results.push({
        requestId: testCase.requestId,
        predicted: predicted.gate_result,
        expected: actual,
        correct: predicted.gate_result === actual,
        confidence: predicted.confidence,
        evidenceCount: predicted.evidence_refs.length,
        hasAlternatives: predicted.alternatives.length > 0,
      });
    }

    // 计算指标
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = correctCount / results.length;
    const avgConfidence = this.avg(results.map((r) => r.confidence));
    const avgEvidenceCount = this.avg(results.map((r) => r.evidenceCount));
    const alternativesCoverage = results.filter((r) => r.hasAlternatives).length / results.length;

    this.logger.log(
      `[GateEvaluation] 评估完成: accuracy=${accuracy.toFixed(3)}, avgConfidence=${avgConfidence.toFixed(3)}, avgEvidence=${avgEvidenceCount.toFixed(1)}`,
    );

    return {
      accuracy,
      avgConfidence,
      avgEvidenceCount,
      alternativesCoverage,
      perCaseResults: results,
    };
  }

  /**
   * 评估 Gate 决策的证据覆盖率
   *
   * 充分证据定义：至少 2 个 RAG chunks + 至少 1 个 Tool 调用
   */
  async evaluateEvidenceCoverage(
    decisionLogs: Array<{
      requestId: string;
      evidenceRefs: Array<{ source: string }>;
    }>,
  ): Promise<{
    coverageRate: number; // 充分证据覆盖率
    avgRagEvidence: number;
    avgToolEvidence: number;
    insufficientCases: Array<{
      requestId: string;
      ragCount: number;
      toolCount: number;
    }>;
  }> {
    this.logger.log(
      `[GateEvaluation] 评估证据覆盖率: logsCount=${decisionLogs.length}`,
    );

    const stats = decisionLogs.map((log) => {
      const ragEvidence = log.evidenceRefs.filter((e) => e.source.startsWith('RAG'));
      const toolEvidence = log.evidenceRefs.filter((e) => e.source.startsWith('Tool'));

      const ragCount = ragEvidence.length;
      const toolCount = toolEvidence.length;
      const sufficient = ragCount >= 2 && toolCount >= 1;

      return {
        requestId: log.requestId,
        ragCount,
        toolCount,
        sufficient,
      };
    });

    const sufficientCount = stats.filter((s) => s.sufficient).length;
    const coverageRate = sufficientCount / stats.length;
    const avgRagEvidence = this.avg(stats.map((s) => s.ragCount));
    const avgToolEvidence = this.avg(stats.map((s) => s.toolCount));
    const insufficientCases = stats.filter((s) => !s.sufficient);

    this.logger.log(
      `[GateEvaluation] 证据覆盖率: ${coverageRate.toFixed(3)} (${sufficientCount}/${stats.length})`,
    );

    return {
      coverageRate,
      avgRagEvidence,
      avgToolEvidence,
      insufficientCases,
    };
  }

  /**
   * 评估 Gate 决策的替代方案质量
   *
   * 指标：
   * - 提供替代方案的比例
   * - 替代方案的平均数量
   * - 替代方案的相关性（如果有 ground truth）
   */
  async evaluateAlternativesQuality(
    testSet: Array<{
      requestId: string;
      alternatives: Array<{ description: string; type: string }>;
      expectedAlternatives?: Array<{ type: string }>; // 期望的替代方案类型
    }>,
  ): Promise<{
    provisionRate: number; // 提供替代方案的比例
    avgAlternativesCount: number;
    typeMatchRate?: number; // 类型匹配率（如果有 ground truth）
  }> {
    this.logger.log(
      `[GateEvaluation] 评估替代方案质量: testSetSize=${testSet.length}`,
    );

    const withAlternatives = testSet.filter((t) => t.alternatives.length > 0);
    const provisionRate = withAlternatives.length / testSet.length;
    const avgAlternativesCount = this.avg(testSet.map((t) => t.alternatives.length));

    // 如果有 ground truth，计算类型匹配率
    let typeMatchRate: number | undefined;
    if (testSet.some((t) => t.expectedAlternatives)) {
      const matchCount = testSet.filter((t) => {
        if (!t.expectedAlternatives) return false;
        const actualTypes = new Set(t.alternatives.map((a) => a.type));
        const expectedTypes = new Set(t.expectedAlternatives.map((e) => e.type));
        return [...expectedTypes].some((type) => actualTypes.has(type));
      }).length;
      typeMatchRate = matchCount / testSet.filter((t) => t.expectedAlternatives).length;
    }

    this.logger.log(
      `[GateEvaluation] 替代方案质量: provisionRate=${provisionRate.toFixed(3)}, avgCount=${avgAlternativesCount.toFixed(1)}`,
    );

    return {
      provisionRate,
      avgAlternativesCount,
      typeMatchRate,
    };
  }

  /**
   * 辅助方法：计算平均值
   */
  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
}
