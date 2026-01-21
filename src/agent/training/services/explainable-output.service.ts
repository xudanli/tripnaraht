// src/agent/training/services/explainable-output.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ExplainableOutput } from '../interfaces/product.interface';
import { DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import { EvidenceRef } from '../../interfaces/trip-plan.interface';

/**
 * ExplainableOutputService
 * 
 * 职责：定义"可解释输出"的产品规范（证据链、决策日志）
 * 
 * 功能：
 * 1. generateExplanation() - 生成决策解释
 * 2. 用户友好的解释格式
 */
@Injectable()
export class ExplainableOutputService {
  private readonly logger = new Logger(ExplainableOutputService.name);

  /**
   * 生成决策解释
   */
  async generateExplanation(
    decisionLog: DecisionLogEntry[],
    evidenceRefs: EvidenceRef[],
    modelVersion: string,
    traceId: string,
  ): Promise<ExplainableOutput> {
    this.logger.debug(
      `[ExplainableOutput] 生成决策解释: traceId=${traceId}, decisionLogLength=${decisionLog.length}`,
    );

    // 生成摘要
    const summary = this.generateSummary(decisionLog);

    // 生成决策过程
    const decisionProcess = this.generateDecisionProcess(decisionLog);

    // 构建证据链
    const evidenceChain = this.buildEvidenceChain(evidenceRefs);

    // 生成可视化数据（决策树）
    const visualization = this.generateVisualization(decisionLog);

    const explanation: ExplainableOutput = {
      summary,
      decision_process: decisionProcess,
      evidence_chain: evidenceChain,
      visualization,
      metadata: {
        model_version: modelVersion,
        trace_id: traceId,
        generated_at: new Date().toISOString(),
      },
    };

    this.logger.log(
      `[ExplainableOutput] 决策解释已生成: traceId=${traceId}`,
    );

    return explanation;
  }

  /**
   * 生成摘要
   */
  private generateSummary(decisionLog: DecisionLogEntry[]): string {
    if (decisionLog.length === 0) {
      return '无决策记录';
    }

    const mainDecision = decisionLog[decisionLog.length - 1];
    const actor = mainDecision.actor || 'System';
    const step = mainDecision.step || 'unknown';

    return `${actor}在${step}步骤做出了${mainDecision.outputs_summary || '决策'}。`;
  }

  /**
   * 生成决策过程
   */
  private generateDecisionProcess(
    decisionLog: DecisionLogEntry[],
  ): ExplainableOutput['decision_process'] {
    const steps = decisionLog.map((entry, index) => ({
      step_name: entry.step || `Step ${index + 1}`,
      decision: entry.outputs_summary || 'N/A',
      reasoning: entry.inputs_summary || 'N/A',
      confidence: entry.metadata?.confidence || 0.5,
    }));

    return { steps };
  }

  /**
   * 构建证据链
   */
  private buildEvidenceChain(
    evidenceRefs: EvidenceRef[],
  ): ExplainableOutput['evidence_chain'] {
    return evidenceRefs.map((ref) => ({
      evidence_id: ref.evidence_id,
      evidence_type: ref.source || 'UNKNOWN',
      evidence_content: ref.excerpt || ref.data?.toString() || 'N/A',
      relevance: ref.relevance || ref.confidence || 0.5,
    }));
  }

  /**
   * 生成可视化数据
   */
  private generateVisualization(
    decisionLog: DecisionLogEntry[],
  ): ExplainableOutput['visualization'] {
    // 生成决策树格式
    const nodes = decisionLog.map((entry, index) => ({
      id: `node_${index}`,
      label: entry.step || `Decision ${index + 1}`,
      actor: entry.actor || 'System',
      decision: entry.outputs_summary || 'N/A',
      confidence: entry.metadata?.confidence || 0.5,
    }));

    const edges = decisionLog
      .slice(1)
      .map((_, index) => ({
        from: `node_${index}`,
        to: `node_${index + 1}`,
      }));

    return {
      type: 'DECISION_TREE',
      data: {
        nodes,
        edges,
      },
    };
  }

  /**
   * 生成用户友好的解释文本
   */
  generateUserFriendlyExplanation(explanation: ExplainableOutput): string {
    const parts: string[] = [];

    // 摘要
    parts.push(`## 决策摘要\n${explanation.summary}\n`);

    // 决策过程
    parts.push('## 决策过程');
    for (const step of explanation.decision_process.steps) {
      parts.push(
        `### ${step.step_name}\n- **决策**: ${step.decision}\n- **推理**: ${step.reasoning}\n- **置信度**: ${(step.confidence * 100).toFixed(0)}%\n`,
      );
    }

    // 证据链
    if (explanation.evidence_chain.length > 0) {
      parts.push('## 证据链');
      for (const evidence of explanation.evidence_chain.slice(0, 5)) {
        // 只显示前5个证据
        parts.push(
          `- **${evidence.evidence_type}**: ${evidence.evidence_content.substring(0, 100)}... (相关性: ${(evidence.relevance * 100).toFixed(0)}%)`,
        );
      }
    }

    return parts.join('\n');
  }
}
