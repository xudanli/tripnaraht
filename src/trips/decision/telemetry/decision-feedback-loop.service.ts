/**
 * Decision Feedback Loop — 用户偏好 → B 端履约 → 满意度 初步闭环
 *
 * MVP：连接决策埋点、履约记录与满意度，供人工 vs 推荐对比分析。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionTelemetryService } from './decision-telemetry.service';
import { FulfillmentCapabilityService } from './fulfillment-capability.service';
import { TravelDnaInferenceService } from './travel-dna-inference.service';

export interface FeedbackLoopCloseInput {
  decisionLogId: string;
  userId: string;
  tripId: string;
  satisfaction: number;
  feedback?: string;
  supplierId?: string;
  fulfillmentRecordId?: string;
}

export interface FeedbackLoopSummary {
  decisionLogId: string;
  userId: string;
  alignmentScore: number | null;
  satisfaction: number;
  travelDnaTags: string[];
  supplierId?: string;
}

@Injectable()
export class DecisionFeedbackLoopService {
  private readonly logger = new Logger(DecisionFeedbackLoopService.name);

  constructor(
    private readonly telemetry: DecisionTelemetryService,
    @Optional() private readonly fulfillment?: FulfillmentCapabilityService,
    @Optional() private readonly travelDna?: TravelDnaInferenceService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /** 关闭单次决策反馈环：补录满意度并可选更新 B 端履约指标 */
  async closeLoop(input: FeedbackLoopCloseInput): Promise<FeedbackLoopSummary> {
    await this.telemetry.recordOutcome(input.decisionLogId, {
      satisfaction: input.satisfaction,
      feedback: input.feedback,
      fulfillmentRecordId: input.fulfillmentRecordId,
    });

    if (input.supplierId && this.fulfillment && this.prisma) {
      const existing = await this.fulfillment.listByCountry('IS', {
        supplierId: input.supplierId,
        limit: 1,
      });
      const prev = existing[0];
      const prevMetrics = (prev?.metrics as { sampleCount?: number; avgSatisfaction?: number }) ?? {};
      const n = (prevMetrics.sampleCount ?? 0) + 1;
      const prevAvg = prevMetrics.avgSatisfaction ?? input.satisfaction;
      const avgSatisfaction = (prevAvg * (n - 1) + input.satisfaction) / n;

      await this.fulfillment.record({
        supplierId: input.supplierId,
        countryCode: 'IS',
        capabilityType: 'route_success',
        capabilityKey: 'aggregate',
        metrics: { sampleCount: n, avgSatisfaction, successRate: avgSatisfaction / 5 },
        evidenceTripIds: [input.tripId],
      });
    }

    const dna = await this.travelDna?.getBehavioralProfile(input.userId);
    const log = this.prisma
      ? await this.prisma.decisionLog.findUnique({
          where: { id: input.decisionLogId },
          select: { alignmentScore: true },
        })
      : null;

    const summary: FeedbackLoopSummary = {
      decisionLogId: input.decisionLogId,
      userId: input.userId,
      alignmentScore: log?.alignmentScore ?? null,
      satisfaction: input.satisfaction,
      travelDnaTags: dna?.tags.filter((t) => t.score >= 0.3).map((t) => t.tag) ?? [],
      supplierId: input.supplierId,
    };

    this.logger.log(
      `[FeedbackLoop] closed decision=${input.decisionLogId} satisfaction=${input.satisfaction}`,
    );
    return summary;
  }
}
