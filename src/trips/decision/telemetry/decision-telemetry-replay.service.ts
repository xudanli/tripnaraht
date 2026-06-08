/**
 * Decision Telemetry Replay — 从 logging 到 intelligence 的分水岭
 *
 * 输入：历史决策 + 未选候选
 * 输出：若当时选另一条，会发生什么
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CounterfactualReplayResult } from './decision-counterfactual.types';
import type { DecisionTelemetryEvent, DecisionTelemetryCandidate } from './decision-telemetry.types';
import type { DecisionCausalStructure } from './decision-causality.types';
import type { DecisionContextLayer } from './decision-context.types';

export interface ReplayCounterfactualInput {
  decisionLogId: string;
  alternativeOptionId: string;
}

type StoredTelemetryPayload = {
  telemetry_v2?: DecisionTelemetryEvent;
  causality_id?: string;
  context?: DecisionContextLayer;
  causality?: DecisionCausalStructure;
};

@Injectable()
export class DecisionTelemetryReplayService {
  private readonly logger = new Logger(DecisionTelemetryReplayService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async replayCounterfactual(input: ReplayCounterfactualInput): Promise<CounterfactualReplayResult> {
    if (!this.prisma) {
      throw new NotFoundException('Database unavailable');
    }

    const log = await this.prisma.decisionLog.findUnique({
      where: { id: input.decisionLogId },
    });
    if (!log) {
      throw new NotFoundException(`Decision log ${input.decisionLogId} not found`);
    }

    const meta = (log.metadata ?? {}) as StoredTelemetryPayload;
    const telemetry = meta.telemetry_v2;
    const candidates = this.resolveCandidates(telemetry, log.availableOptions);
    const chosenId = telemetry?.decision?.optionId ?? this.extractChosenId(log.userChoice);
    const alt = candidates.find((c) => c.optionId === input.alternativeOptionId);

    if (!chosenId) {
      throw new NotFoundException('Cannot determine chosen option');
    }
    if (!alt) {
      throw new NotFoundException(`Alternative ${input.alternativeOptionId} not in candidate set`);
    }
    if (alt.optionId === chosenId) {
      throw new NotFoundException('Alternative must differ from chosen option');
    }

    const chosen = candidates.find((c) => c.optionId === chosenId);
    const context = telemetry?.context ?? (meta.context as DecisionContextLayer | undefined);
    const causality = telemetry?.causality ?? (meta.causality as DecisionCausalStructure | undefined);

    if (alt.counterfactual) {
      return {
        decision_log_id: input.decisionLogId,
        chosen_option_id: chosenId,
        alternative_option_id: alt.optionId,
        question_zh: `如果当时选择「${alt.label}」而不是「${chosen?.label ?? chosenId}」，会发生什么？`,
        answer_zh:
          alt.counterfactual.narrative_zh ??
          this.synthesizeNarrative(alt, chosen, context, causality),
        projection: alt.counterfactual,
        replay_confidence: 0.85,
        source: 'stored_projection',
      };
    }

    const inferred = this.inferCounterfactual(alt, chosen, context, causality);
    return {
      decision_log_id: input.decisionLogId,
      chosen_option_id: chosenId,
      alternative_option_id: alt.optionId,
      question_zh: `如果当时选择「${alt.label}」而不是「${chosen?.label ?? chosenId}」，会发生什么？`,
      answer_zh: inferred.narrative_zh ?? this.synthesizeNarrative(alt, chosen, context, causality),
      projection: inferred,
      replay_confidence: 0.45,
      source: 'inferred_from_context',
    };
  }

  private resolveCandidates(
    telemetry: DecisionTelemetryEvent | undefined,
    availableOptions: unknown,
  ): DecisionTelemetryCandidate[] {
    if (telemetry?.candidates?.length) return telemetry.candidates;
    if (!Array.isArray(availableOptions)) return [];
    return availableOptions.map((o: Record<string, unknown>) => ({
      optionId: String(o.optionId ?? ''),
      label: String(o.name ?? o.label ?? o.optionId ?? ''),
      description: o.description as string | undefined,
      characteristics: o.characteristics as Record<string, unknown> | undefined,
      counterfactual: o.counterfactual as DecisionTelemetryCandidate['counterfactual'],
    }));
  }

  private extractChosenId(userChoice: unknown): string | null {
    if (!userChoice || typeof userChoice !== 'object') return null;
    const uc = userChoice as Record<string, unknown>;
    return String(uc.selectedOptionId ?? uc.optionId ?? '') || null;
  }

  private inferCounterfactual(
    alt: DecisionTelemetryCandidate,
    chosen: DecisionTelemetryCandidate | undefined,
    context?: DecisionContextLayer,
    causality?: DecisionCausalStructure,
  ): NonNullable<DecisionTelemetryCandidate['counterfactual']> {
    const friction =
      context?.weather?.severity === 'high' && alt.characteristics?.transport_mode === 'self_drive'
        ? 0.75
        : 0.35;
    const utilityDelta = alt.rejected ? -0.2 : 0.1;
    const topFactor = causality?.active_factors?.[0];

    return {
      projected_outcome: {
        trip_friction_score: friction,
        satisfaction: Math.max(1, 4 - friction * 3),
      },
      projected_friction_score: friction,
      feasibility_probability: alt.rejected ? 0.4 : 0.7,
      utility_delta_vs_chosen: utilityDelta,
      causal_factor_deltas: topFactor
        ? [{ factor_id: topFactor.factor_id, direction: 'decreases', magnitude: topFactor.weight }]
        : undefined,
      narrative_zh: undefined,
    };
  }

  private synthesizeNarrative(
    alt: DecisionTelemetryCandidate,
    chosen: DecisionTelemetryCandidate | undefined,
    context?: DecisionContextLayer,
    causality?: DecisionCausalStructure,
  ): string {
    const parts: string[] = [];
    const top = causality?.active_factors?.slice(0, 2) ?? [];
    if (top.length) {
      parts.push(
        `主要因果因子：${top.map((f) => `${f.label}(权重${(f.weight * 100).toFixed(0)}%)`).join('、')}`,
      );
    }
    if (context?.weather?.severity === 'high') {
      parts.push('当时天气条件较差');
    }
    if (context?.travelExperienceLevel === 'first_time') {
      parts.push('用户为首次到访');
    }
    parts.push(`选「${alt.label}」相较「${chosen?.label ?? '已选方案'}」摩擦与风险结构不同`);
    return parts.join('；') + '。';
  }
}
