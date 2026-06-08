/**
 * Decision Telemetry Service — 决策仪表层统一写入
 *
 * logging → instrumented → intelligence 三级样本质量
 */

import { Injectable, Logger, Optional, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionLoggingService } from '../services/decision-logging.service';
import type { DecisionOption, UserChoice, SystemAnalysis } from '../interfaces/decision-logging.interface';
import type { DecisionPointType } from '../interfaces/decision-logging.interface';
import type { DecisionSource } from '../shared/decision-result.types';
import {
  type DecisionTelemetryEvent,
  type DecisionTelemetryRecordResult,
  type DecisionTelemetryCandidate,
} from './decision-telemetry.types';
import type { DecisionNormalizedOutcome } from './decision-outcome-normalized.types';
import {
  assessTelemetryCompleteness,
  gradeTelemetry,
  inferCausalStructure,
  validateTelemetryEvent,
} from './decision-telemetry.validator';
import { TravelDnaInferenceService } from './travel-dna-inference.service';

type LoggingDecisionSource = 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';

function toLoggingDecisionSource(source?: DecisionSource): LoggingDecisionSource {
  switch (source) {
    case 'PHYSICAL':
    case 'HUMAN':
    case 'PHILOSOPHY':
    case 'HEURISTIC':
      return source;
    case 'UTILITY':
      return 'HEURISTIC';
    case 'USER':
    default:
      return 'HUMAN';
  }
}

@Injectable()
export class DecisionTelemetryService {
  private readonly logger = new Logger(DecisionTelemetryService.name);

  constructor(
    private readonly decisionLogging: DecisionLoggingService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly travelDnaInference?: TravelDnaInferenceService,
  ) {}

  private isStrictMode(): boolean {
    return process.env.DECISION_TELEMETRY_STRICT === '1';
  }

  assessCompleteness(
    event: Pick<
      DecisionTelemetryEvent,
      'decision' | 'candidates' | 'reasons' | 'outcome' | 'context' | 'causality'
    >,
  ) {
    return assessTelemetryCompleteness(event);
  }

  async record(event: DecisionTelemetryEvent): Promise<DecisionTelemetryRecordResult> {
    const validation = validateTelemetryEvent(event);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join('; '));
    }
    if (this.isStrictMode() && validation.intelligence_grade === 'logging') {
      throw new BadRequestException(
        `intelligence_grade=logging rejected in strict mode: ${validation.warnings.join('; ')}`,
      );
    }
    for (const w of validation.warnings) {
      this.logger.warn(`[Telemetry] ${w}`);
    }

    const eventId = event.eventId ?? randomUUID();
    const causality_id = event.causality?.causality_id ?? randomUUID();
    const causality = event.causality ?? inferCausalStructure(event);
    const enriched: DecisionTelemetryEvent = { ...event, causality: { ...causality, causality_id } };

    const tripId = event.tripId!.trim();
    const completeness = assessTelemetryCompleteness(enriched);
    const intelligence_grade = gradeTelemetry(completeness);

    const options = this.toDecisionOptions(enriched.candidates);
    const userChoice: UserChoice = {
      optionId: enriched.decision.optionId,
      selectionTime: new Date(enriched.decision.selectedAt),
      reasoning: enriched.reasons.userReasoning,
      confidenceLevel: enriched.decision.confidenceLevel,
    };
    const systemAnalysis: SystemAnalysis = {
      topRecommendation: enriched.systemRecommendation
        ? {
            optionId: enriched.systemRecommendation.optionId,
            rationale: enriched.systemRecommendation.rationale,
          }
        : undefined,
      recommendationRationale: enriched.systemRecommendation?.rationale,
      alignmentWithUserChoice: enriched.alignmentScore,
    };

    const { id: decisionLogId } = await this.decisionLogging.logDecision(
      tripId,
      enriched.decisionPoint as DecisionPointType,
      options,
      userChoice,
      systemAnalysis,
      {
        countryCode: enriched.countryCode,
        routeDirectionId: enriched.routeDirectionId,
        persona: (enriched.persona as 'ABU' | 'DR_DRE' | 'NEPTUNE') ?? 'NEPTUNE',
        decisionSource: toLoggingDecisionSource(enriched.decisionSource),
        decisionStage: enriched.decisionStage ?? 'FINALIZE',
        explanation: enriched.reasons.userReasoning ?? `决策点：${enriched.decisionPoint}`,
        reasonCodes: enriched.reasons.reasonCodes,
        action: enriched.decision.action,
      },
    );

    await this.persistTelemetryPayload(decisionLogId, enriched, causality_id, intelligence_grade);

    if (enriched.outcome) {
      await this.recordOutcome(decisionLogId, enriched.outcome, causality_id);
    }

    if (enriched.userId && this.travelDnaInference) {
      this.travelDnaInference
        .inferFromTelemetryEvent({ userId: enriched.userId, event: enriched })
        .catch((err: unknown) => {
          this.logger.warn(
            `[Telemetry] Travel DNA inference failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    this.logger.log(
      `[Telemetry] recorded eventId=${eventId} grade=${intelligence_grade} intelligence=${completeness.intelligence_score.toFixed(2)}`,
    );

    return { decisionLogId, eventId, completeness, causality_id, intelligence_grade };
  }

  async recordOutcome(
    decisionLogId: string,
    outcome: DecisionNormalizedOutcome,
    causalityId?: string,
  ): Promise<{ outcomeId: string }> {
    const result = await this.decisionLogging.logOutcome(
      decisionLogId,
      {},
      {
        actualCharacteristics: {
          regret: outcome.regret,
          recommendation_would_change: outcome.recommendation_would_change,
          trip_friction_score: outcome.trip_friction_score,
        },
        actualSatisfaction: outcome.satisfaction,
      },
      outcome.satisfaction,
      outcome.feedback,
      causalityId ?? outcome.fulfillmentRecordId
        ? { decisionCausalityId: causalityId ?? outcome.fulfillmentRecordId }
        : undefined,
    );
    return { outcomeId: result.id };
  }

  private async persistTelemetryPayload(
    decisionLogId: string,
    event: DecisionTelemetryEvent,
    causality_id: string,
    intelligence_grade: string,
  ): Promise<void> {
    if (!this.prisma) return;

    const existing = await this.prisma.decisionLog.findUnique({
      where: { id: decisionLogId },
      select: { metadata: true },
    });
    const prev = (existing?.metadata as Record<string, unknown>) ?? {};

    await this.prisma.decisionLog.update({
      where: { id: decisionLogId },
      data: {
        metadata: {
          ...prev,
          telemetry_v2: event as unknown as Prisma.InputJsonValue,
          causality_id,
          context: event.context as unknown as Prisma.InputJsonValue,
          causality: event.causality as unknown as Prisma.InputJsonValue,
          intelligence_grade,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private toDecisionOptions(candidates: DecisionTelemetryCandidate[]): DecisionOption[] {
    return candidates.map((c) => ({
      optionId: c.optionId,
      name: c.label,
      description: c.description,
      characteristics: {
        ...c.characteristics,
        ...(c.supplierId ? { supplierId: c.supplierId } : {}),
        ...(c.rejected ? { rejected: true } : {}),
        ...(c.rejectionReasonCodes?.length ? { rejectionReasonCodes: c.rejectionReasonCodes } : {}),
        ...(c.counterfactual ? { counterfactual: c.counterfactual } : {}),
      },
    }));
  }
}
