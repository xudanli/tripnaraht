// src/agent/training/services/explainable-output.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ExplainableOutput } from '../interfaces/product.interface';
import { DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import { EvidenceRef } from '../../interfaces/trip-plan.interface';
import { projectExplainableOutputFromEnvelope } from '../../../trips/decision/explainability/project-explainable-output-from-envelope.util';
import type { UnifiedExplainabilityEnvelopeV1 } from '../../../trips/decision/explainability/unified-explainability.types';

/**
 * ExplainableOutputService
 *
 * 训练/产品侧可解释输出。优先 unified-explainability@v1 信封投影，legacy 路径仅作降级。
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
    options?: { unifiedEnvelope?: UnifiedExplainabilityEnvelopeV1 },
  ): Promise<ExplainableOutput> {
    this.logger.debug(
      `[ExplainableOutput] 生成决策解释: traceId=${traceId}, decisionLogLength=${decisionLog.length}`,
    );

    if (options?.unifiedEnvelope) {
      const explanation = projectExplainableOutputFromEnvelope(
        options.unifiedEnvelope,
        modelVersion,
      );
      this.logger.log(
        `[ExplainableOutput] 决策解释已生成（unified envelope）: traceId=${traceId}`,
      );
      return explanation;
    }

    // Legacy：orchestration decision_log 启发式摘要（无 envelope 时降级）
    const summary = this.generateSummary(decisionLog);
    const decisionProcess = this.generateDecisionProcess(decisionLog);
    const evidenceChain = this.buildEvidenceChain(evidenceRefs);
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

    this.logger.log(`[ExplainableOutput] 决策解释已生成: traceId=${traceId}`);
    return explanation;
  }

  private generateSummary(decisionLog: DecisionLogEntry[]): string {
    if (decisionLog.length === 0) {
      return '无决策记录';
    }

    const mainDecision = decisionLog[decisionLog.length - 1];
    const actor = mainDecision.actor || 'System';
    const step = mainDecision.step || 'unknown';

    return `${actor}在${step}步骤做出了${mainDecision.outputs_summary || '决策'}。`;
  }

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

  private generateVisualization(
    decisionLog: DecisionLogEntry[],
  ): ExplainableOutput['visualization'] {
    const nodes = decisionLog.map((entry, index) => ({
      id: `node_${index}`,
      label: entry.step || `Decision ${index + 1}`,
      actor: entry.actor || 'System',
      decision: entry.outputs_summary || 'N/A',
      confidence: entry.metadata?.confidence || 0.5,
    }));

    const edges = decisionLog.slice(1).map((_, index) => ({
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

  generateUserFriendlyExplanation(explanation: ExplainableOutput): string {
    const parts: string[] = [];

    parts.push(`## 决策摘要\n${explanation.summary}\n`);

    parts.push('## 决策过程');
    for (const step of explanation.decision_process.steps) {
      parts.push(
        `### ${step.step_name}\n- **决策**: ${step.decision}\n- **推理**: ${step.reasoning}\n- **置信度**: ${(step.confidence * 100).toFixed(0)}%\n`,
      );
    }

    if (explanation.evidence_chain.length > 0) {
      parts.push('## 证据链');
      for (const evidence of explanation.evidence_chain.slice(0, 5)) {
        parts.push(
          `- **${evidence.evidence_type}**: ${evidence.evidence_content.substring(0, 100)}... (相关性: ${(evidence.relevance * 100).toFixed(0)}%)`,
        );
      }
    }

    return parts.join('\n');
  }
}
