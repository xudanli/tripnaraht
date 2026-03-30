// src/agent/training/services/quality-scorer.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QualityScoreResult,
  DiagnosticLabel,
} from '../interfaces/enhancement.interface';
import { DiagnosticLabelSystemService } from './diagnostic-label-system.service';
import { JudgePromptDesignerService } from './judge-prompt-designer.service';
import { RollRewardAdapterService } from './roll-reward-adapter.service';
import { LlmService } from '../../../llm/services/llm.service';

/**
 * QualityScorerService
 * 
 * 职责：实现LLM Judge + RM融合评分
 */
@Injectable()
export class QualityScorerService {
  private readonly logger = new Logger(QualityScorerService.name);
  private readonly useExternalJudge: boolean;
  private readonly llmJudgeUrl?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly diagnosticLabelSystem: DiagnosticLabelSystemService,
    private readonly judgePromptDesigner: JudgePromptDesignerService,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly rollRewardAdapter?: RollRewardAdapterService,
  ) {
    // 检查是否使用外部 LLM Judge 服务（向后兼容）
    this.useExternalJudge =
      this.configService.get<boolean>('USE_EXTERNAL_LLM_JUDGE') === true;
    this.llmJudgeUrl =
      this.configService.get<string>('LLM_JUDGE_URL') ||
      'http://localhost:8003';
  }

  /**
   * 评分（LLM Judge + RM融合）
   */
  async score(
    plan: any,
    userRequest: string,
    evidence: any[],
    decisionLog: any[],
    useRM: boolean = false,
  ): Promise<QualityScoreResult> {
    this.logger.debug(`[QualityScorer] 开始评分`);

    // 1. 检测诊断标签
    const diagnosticLabels = await this.diagnosticLabelSystem.detectLabels(
      plan,
      evidence,
      decisionLog,
    );

    // 2. LLM Judge评分
    const llmJudgeScore = await this.scoreWithLLMJudge(
      plan,
      userRequest,
      evidence,
    );

    // 3. RM评分（如果启用）
    let rmScore: number | undefined;
    if (useRM) {
      // 优先使用 ROLL Reward-Worker（如果启用）
      if (this.rollRewardAdapter) {
        try {
          const rollRewardResult = await this.rollRewardAdapter.computeReward(
            plan,
            userRequest,
            evidence,
            decisionLog,
          );
          if (rollRewardResult.success && rollRewardResult.reward !== undefined) {
            rmScore = rollRewardResult.reward;
            this.logger.debug(
              `[QualityScorer] 使用 ROLL Reward-Worker 评分: ${rmScore}`,
            );
          } else {
            // 回退到本地 RM 评分
            rmScore = await this.scoreWithRM(plan, userRequest);
          }
        } catch (error: any) {
          this.logger.warn(
            `[QualityScorer] ROLL Reward-Worker 调用失败，回退到本地 RM: ${error?.message}`,
          );
          rmScore = await this.scoreWithRM(plan, userRequest);
        }
      } else {
        rmScore = await this.scoreWithRM(plan, userRequest);
      }
    }

    // 4. 融合评分
    let finalScore: number;
    if (rmScore !== undefined) {
      // 融合LLM Judge和RM（加权平均）
      finalScore = llmJudgeScore * 0.6 + rmScore * 0.4;
    } else {
      finalScore = llmJudgeScore;
    }

    // 5. 应用诊断标签影响
    const labelImpact = diagnosticLabels.reduce(
      (sum, label) => sum + label.impact_on_score,
      0,
    );
    finalScore = Math.max(0, Math.min(1, finalScore + labelImpact));

    // 6. 生成解释
    const explanation = this.generateExplanation(
      finalScore,
      llmJudgeScore,
      rmScore,
      diagnosticLabels,
    );

    // 7. 计算置信度
    const confidence = this.calculateConfidence(
      llmJudgeScore,
      rmScore,
      diagnosticLabels,
    );

    const result: QualityScoreResult = {
      score: finalScore,
      llm_judge_score: llmJudgeScore,
      rm_score: rmScore,
      diagnostic_labels: diagnosticLabels,
      explanation,
      confidence,
    };

    this.logger.log(
      `[QualityScorer] 评分完成: score=${finalScore.toFixed(3)}, confidence=${confidence.toFixed(2)}`,
    );

    return result;
  }

  /**
   * LLM Judge评分
   */
  private async scoreWithLLMJudge(
    plan: any,
    userRequest: string,
    evidence: any[],
  ): Promise<number> {
    // 如果使用外部服务（向后兼容）
    if (this.useExternalJudge && this.llmJudgeUrl) {
      return await this.scoreWithExternalJudge(plan, userRequest, evidence);
    }

    // 使用内置 LlmService（推荐）
    if (this.llmService) {
      return await this.scoreWithLlmService(plan, userRequest, evidence);
    }

    // 降级到默认评分
    this.logger.warn('[QualityScorer] LLM服务不可用，使用默认评分');
    return 0.5;
  }

  /**
   * 使用外部 LLM Judge 服务（向后兼容）
   */
  private async scoreWithExternalJudge(
    plan: any,
    userRequest: string,
    evidence: any[],
  ): Promise<number> {
    try {
      const template = this.judgePromptDesigner.getTemplate();
      if (!template) {
        this.logger.warn('[QualityScorer] 未找到Judge Prompt模板，使用默认评分');
        return 0.5;
      }

      const response = await fetch(`${this.llmJudgeUrl}/judge/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan,
          user_request: userRequest,
          evidence,
          prompt_template: template.prompt_template,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM Judge error: ${response.statusText}`);
      }

      const result = (await response.json()) as { score: number };
      return result.score;
    } catch (error: any) {
      this.logger.warn(
        `[QualityScorer] 外部LLM Judge评分失败: ${error?.message}`,
      );
      return 0.5;
    }
  }

  /**
   * 使用内置 LlmService 进行评分（推荐）
   */
  private async scoreWithLlmService(
    plan: any,
    userRequest: string,
    evidence: any[],
  ): Promise<number> {
    try {
      const template = this.judgePromptDesigner.getTemplate();
      if (!template) {
        this.logger.warn('[QualityScorer] 未找到Judge Prompt模板，使用默认评分');
        return 0.5;
      }

      // 构建评分 Prompt
      const prompt = this.buildJudgePrompt(
        template.prompt_template,
        plan,
        userRequest,
        evidence,
      );

      // 定义评分响应 Schema
      const scoreSchema = {
        type: 'object',
        properties: {
          overall_score: {
            type: 'number',
            description: 'Overall quality score from 0 to 1',
            minimum: 0,
            maximum: 1,
          },
          dimension_scores: {
            type: 'object',
            properties: {
              executability: { type: 'number', minimum: 0, maximum: 1 },
              safety: { type: 'number', minimum: 0, maximum: 1 },
              user_satisfaction: { type: 'number', minimum: 0, maximum: 1 },
              evidence_quality: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
          reasoning: {
            type: 'string',
            description: 'Brief reasoning for the score',
          },
          diagnostic_labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Any issues detected (EVIDENCE_MISSING, HALLUCINATION_RISK, etc.)',
          },
        },
        required: ['overall_score', 'reasoning'],
      };

      // 调用 LlmService
      if (!this.llmService) {
        throw new Error('LlmService 未注入，无法进行质量评分');
      }
      const provider = this.llmService.getDefaultProvider();
      const response = await this.llmService.callLlmWithSchema(
        provider,
        prompt,
        scoreSchema,
      );

      // 解析响应
      const result = this.parseJudgeResponse(response);
      return result.overall_score;
    } catch (error: any) {
      this.logger.warn(
        `[QualityScorer] LlmService评分失败: ${error?.message}`,
      );
      return 0.5;
    }
  }

  /**
   * 构建 Judge Prompt
   */
  private buildJudgePrompt(
    template: string,
    plan: any,
    userRequest: string,
    evidence: any[],
  ): string {
    return template
      .replace('{plan}', JSON.stringify(plan, null, 2))
      .replace('{user_request}', userRequest)
      .replace('{evidence}', JSON.stringify(evidence, null, 2));
  }

  /**
   * 解析 Judge 响应
   */
  private parseJudgeResponse(response: string): {
    overall_score: number;
    dimension_scores?: Record<string, number>;
    reasoning?: string;
    diagnostic_labels?: string[];
  } {
    try {
      // 移除可能的 markdown 代码块标记
      let cleaned = response.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
      cleaned = cleaned.replace(/\s*```$/i, '');
      cleaned = cleaned.trim();

      // 提取 JSON 对象
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      const parsed = JSON.parse(cleaned);
      return {
        overall_score: parsed.overall_score ?? 0.5,
        dimension_scores: parsed.dimension_scores,
        reasoning: parsed.reasoning,
        diagnostic_labels: parsed.diagnostic_labels,
      };
    } catch (error: any) {
      this.logger.warn(
        `[QualityScorer] 解析Judge响应失败: ${error?.message}`,
      );
      return { overall_score: 0.5 };
    }
  }

  /**
   * RM评分
   */
  private async scoreWithRM(plan: any, userRequest: string): Promise<number> {
    try {
      // 调用RM服务
      const response = await fetch(`${this.llmJudgeUrl}/rm/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan,
          user_request: userRequest,
        }),
      });

      if (!response.ok) {
        throw new Error(`RM scoring error: ${response.statusText}`);
      }

      const result = (await response.json()) as { score: number };
      return result.score;
    } catch (error: any) {
      this.logger.warn(`[QualityScorer] RM评分失败: ${error?.message}`);
      return undefined as any;
    }
  }

  /**
   * 生成解释
   */
  private generateExplanation(
    finalScore: number,
    llmJudgeScore: number,
    rmScore: number | undefined,
    diagnosticLabels: DiagnosticLabel[],
  ): string {
    const parts: string[] = [];

    parts.push(`Overall quality score: ${(finalScore * 100).toFixed(0)}%`);

    if (rmScore !== undefined) {
      parts.push(
        `LLM Judge score: ${(llmJudgeScore * 100).toFixed(0)}%, RM score: ${(rmScore * 100).toFixed(0)}%`,
      );
    } else {
      parts.push(`LLM Judge score: ${(llmJudgeScore * 100).toFixed(0)}%`);
    }

    if (diagnosticLabels.length > 0) {
      parts.push(
        `Diagnostic labels: ${diagnosticLabels.map((l) => l.label_type).join(', ')}`,
      );
    }

    return parts.join('. ');
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    llmJudgeScore: number,
    rmScore: number | undefined,
    diagnosticLabels: DiagnosticLabel[],
  ): number {
    // 如果有RM评分且两个评分接近，置信度较高
    if (rmScore !== undefined) {
      const scoreDiff = Math.abs(llmJudgeScore - rmScore);
      if (scoreDiff < 0.1) {
        return 0.9; // 高置信度
      } else if (scoreDiff < 0.2) {
        return 0.7; // 中等置信度
      } else {
        return 0.5; // 低置信度（评分差异大）
      }
    }

    // 如果没有RM，基于诊断标签数量调整置信度
    if (diagnosticLabels.length === 0) {
      return 0.8; // 无问题，置信度较高
    } else {
      return Math.max(0.3, 0.8 - diagnosticLabels.length * 0.1); // 问题越多，置信度越低
    }
  }
}
