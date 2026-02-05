/**
 * LLM Judge Client Service
 *
 * 职责：调用 LLM Judge 服务进行质量评分和模型评估
 *
 * 功能：
 * 1. scorePlan - 对计划进行质量评分
 * 2. batchScore - 批量评分
 * 3. comparePlans - 比较两个计划
 * 4. evaluateLora - 评估 LoRA 模型输出质量
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

// ===================== 类型定义 =====================

export enum QualityDimension {
  SAFETY = 'SAFETY',
  FEASIBILITY = 'FEASIBILITY',
  RELEVANCE = 'RELEVANCE',
  COMPLETENESS = 'COMPLETENESS',
  CLARITY = 'CLARITY',
  DECISION_QUALITY = 'DECISION_QUALITY',
  TOOL_USAGE = 'TOOL_USAGE',
}

export enum DiagnosticLabel {
  EVIDENCE_MISSING = 'EVIDENCE_MISSING',
  HALLUCINATION_RISK = 'HALLUCINATION_RISK',
  NOT_EXECUTABLE = 'NOT_EXECUTABLE',
  SAFETY_CONCERN = 'SAFETY_CONCERN',
  COMPLIANCE_ISSUE = 'COMPLIANCE_ISSUE',
  TOOL_CALL_ERROR = 'TOOL_CALL_ERROR',
  REASONING_WEAK = 'REASONING_WEAK',
}

export interface PlanItem {
  day: number;
  activities: Record<string, any>[];
  summary?: string;
}

export interface DimensionScore {
  dimension: QualityDimension;
  score: number;
  reasoning: string;
}

export interface ScoreRequest {
  request_id: string;
  plan: PlanItem[];
  user_request: string;
  evidence?: Record<string, any>[];
  decision_log?: Record<string, any>[];
  context?: Record<string, any>;
}

export interface ScoreResponse {
  request_id: string;
  overall_score: number;
  dimension_scores: DimensionScore[];
  diagnostic_labels: DiagnosticLabel[];
  reasoning: string;
  suggestions: string[];
  latency_ms: number;
  timestamp: string;
  llm_provider: string;
}

export interface CompareRequest {
  request_id: string;
  plan_a: PlanItem[];
  plan_b: PlanItem[];
  user_request: string;
}

export interface CompareResponse {
  request_id: string;
  winner: 'A' | 'B' | 'TIE';
  score_a: number;
  score_b: number;
  reasoning: string;
  latency_ms: number;
  timestamp: string;
}

export interface LoraEvalRequest {
  request_id: string;
  prompt: string;
  baseline_response: string;
  lora_response: string;
  task_type?: string;
  ground_truth?: string;
}

export interface LoraEvalResponse {
  request_id: string;
  baseline_score: number;
  lora_score: number;
  winner: 'baseline' | 'lora' | 'tie';
  dimension_comparison: Record<string, { baseline: number; lora: number }>;
  reasoning: string;
  recommendations: string[];
  latency_ms: number;
  timestamp: string;
}

export interface JudgeHealthStatus {
  status: string;
  service: string;
  version: string;
  llm_provider: string;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  vllm_url: string;
}

// ===================== 服务实现 =====================

@Injectable()
export class LlmJudgeClientService implements OnModuleInit {
  private readonly logger = new Logger(LlmJudgeClientService.name);
  private readonly baseUrl: string;
  private readonly timeout: number;
  private isHealthy = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'LLM_JUDGE_URL',
      'http://localhost:8003',
    );
    this.timeout = this.configService.get<number>(
      'LLM_JUDGE_TIMEOUT',
      30000,
    );
  }

  async onModuleInit() {
    await this.checkHealth();
  }

  // ===================== 健康检查 =====================

  async checkHealth(): Promise<JudgeHealthStatus | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<JudgeHealthStatus>(`${this.baseUrl}/health`, {
          timeout: 5000,
        }),
      );
      this.isHealthy = (response as AxiosResponse<JudgeHealthStatus>).data.status === 'healthy';
      this.logger.log(
        `LLM Judge 服务健康检查: ${this.isHealthy ? '✅ 健康' : '❌ 不健康'}`,
      );
      return (response as AxiosResponse<JudgeHealthStatus>).data;
    } catch (error: any) {
      this.isHealthy = false;
      this.logger.warn(`LLM Judge 服务不可用: ${error?.message || error}`);
      return null;
    }
  }

  isServiceHealthy(): boolean {
    return this.isHealthy;
  }

  // ===================== 质量评分 =====================

  /**
   * 对计划进行质量评分
   */
  async scorePlan(request: ScoreRequest): Promise<ScoreResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<ScoreResponse>(
          `${this.baseUrl}/score`,
          request,
          { timeout: this.timeout },
        ),
      );
      return (response as AxiosResponse<ScoreResponse>).data;
    } catch (error: any) {
      this.logger.error(`评分失败: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * 批量评分
   */
  async batchScore(
    requests: ScoreRequest[],
  ): Promise<{ responses: ScoreResponse[]; total_latency_ms: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          responses: ScoreResponse[];
          total_latency_ms: number;
        }>(`${this.baseUrl}/batch-score`, { requests }, { timeout: this.timeout * 2 }),
      );
      return (response as AxiosResponse<{ responses: ScoreResponse[]; total_latency_ms: number }>).data;
    } catch (error: any) {
      this.logger.error(`批量评分失败: ${error?.message || error}`);
      throw error;
    }
  }

  // ===================== 计划比较 =====================

  /**
   * 比较两个计划
   */
  async comparePlans(request: CompareRequest): Promise<CompareResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<CompareResponse>(
          `${this.baseUrl}/compare`,
          request,
          { timeout: this.timeout },
        ),
      );
      return (response as AxiosResponse<CompareResponse>).data;
    } catch (error: any) {
      this.logger.error(`计划比较失败: ${error?.message || error}`);
      throw error;
    }
  }

  // ===================== LoRA 模型评估 =====================

  /**
   * 评估 LoRA 模型输出质量
   */
  async evaluateLora(request: LoraEvalRequest): Promise<LoraEvalResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<LoraEvalResponse>(
          `${this.baseUrl}/evaluate-lora`,
          request,
          { timeout: this.timeout },
        ),
      );
      return (response as AxiosResponse<LoraEvalResponse>).data;
    } catch (error: any) {
      this.logger.error(`LoRA 评估失败: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * 批量评估 LoRA 模型
   */
  async batchEvaluateLora(
    requests: LoraEvalRequest[],
  ): Promise<LoraEvalResponse[]> {
    const results: LoraEvalResponse[] = [];
    for (const request of requests) {
      try {
        const result = await this.evaluateLora(request);
        results.push(result);
      } catch (error: any) {
        this.logger.error(
          `LoRA 评估失败 (request_id=${request.request_id}): ${error?.message || error}`,
        );
      }
    }
    return results;
  }

  // ===================== 评估报告生成 =====================

  /**
   * 生成 LoRA 模型评估报告
   */
  async generateLoraEvalReport(
    evalResults: LoraEvalResponse[],
  ): Promise<{
    total_evaluations: number;
    lora_wins: number;
    baseline_wins: number;
    ties: number;
    average_lora_score: number;
    average_baseline_score: number;
    win_rate: number;
    dimension_comparison: Record<string, { avg_baseline: number; avg_lora: number }>;
    recommendations: string[];
  }> {
    if (evalResults.length === 0) {
      return {
        total_evaluations: 0,
        lora_wins: 0,
        baseline_wins: 0,
        ties: 0,
        average_lora_score: 0,
        average_baseline_score: 0,
        win_rate: 0,
        dimension_comparison: {},
        recommendations: ['需要更多评估数据'],
      };
    }

    const loraWins = evalResults.filter((r) => r.winner === 'lora').length;
    const baselineWins = evalResults.filter((r) => r.winner === 'baseline').length;
    const ties = evalResults.filter((r) => r.winner === 'tie').length;

    const avgLoraScore =
      evalResults.reduce((sum, r) => sum + r.lora_score, 0) / evalResults.length;
    const avgBaselineScore =
      evalResults.reduce((sum, r) => sum + r.baseline_score, 0) / evalResults.length;

    // 汇总维度比较
    const dimensionSums: Record<string, { baseline: number; lora: number; count: number }> = {};
    for (const result of evalResults) {
      if (result.dimension_comparison) {
        for (const [dim, scores] of Object.entries(result.dimension_comparison)) {
          if (!dimensionSums[dim]) {
            dimensionSums[dim] = { baseline: 0, lora: 0, count: 0 };
          }
          dimensionSums[dim].baseline += scores.baseline;
          dimensionSums[dim].lora += scores.lora;
          dimensionSums[dim].count++;
        }
      }
    }

    const dimensionComparison: Record<string, { avg_baseline: number; avg_lora: number }> = {};
    for (const [dim, sums] of Object.entries(dimensionSums)) {
      dimensionComparison[dim] = {
        avg_baseline: sums.baseline / sums.count,
        avg_lora: sums.lora / sums.count,
      };
    }

    // 收集所有建议
    const allRecommendations = new Set<string>();
    for (const result of evalResults) {
      for (const rec of result.recommendations || []) {
        allRecommendations.add(rec);
      }
    }

    return {
      total_evaluations: evalResults.length,
      lora_wins: loraWins,
      baseline_wins: baselineWins,
      ties,
      average_lora_score: avgLoraScore,
      average_baseline_score: avgBaselineScore,
      win_rate: loraWins / evalResults.length,
      dimension_comparison: dimensionComparison,
      recommendations: Array.from(allRecommendations),
    };
  }
}
