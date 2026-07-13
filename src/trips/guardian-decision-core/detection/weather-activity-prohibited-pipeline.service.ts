/**
 * Slice 2 — Iceland weather hazard: evidence → impact → decision problem.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import {
  EvidenceResolverService,
  type ResolveWeatherHazardChangedResult,
} from '../evidence/evidence-resolver.service';
import type { WeatherHazardChangedEvent } from '../evidence/weather-hazard-changed.event';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import { DecisionProblemDetectorService } from './decision-problem-detector.service';
import {
  analyzeWeatherActivityImpact,
  type WeatherActivityImpactResult,
} from './weather-activity-impact-analyzer';
import type { TepRuntimeTriggerResult } from '../../tep/services/tep-runtime-trigger.service';
import type { TepRuntimePipelineBridgeService } from '../../tep/services/tep-runtime-pipeline.bridge';

export interface WeatherActivityProhibitedPipelineResult {
  evidence: ResolveWeatherHazardChangedResult;
  impact: WeatherActivityImpactResult;
  problem: Rfc001DecisionProblem | null;
  tepTrigger?: TepRuntimeTriggerResult | null;
}

@Injectable()
export class WeatherActivityProhibitedPipelineService {
  private readonly logger = new Logger(WeatherActivityProhibitedPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly problemDetector: DecisionProblemDetectorService,
    @Optional() private readonly tepBridge?: TepRuntimePipelineBridgeService,
  ) {}

  async runFromEvent(
    event: WeatherHazardChangedEvent,
  ): Promise<WeatherActivityProhibitedPipelineResult> {
    const tripId = event.aggregateId;
    const evidence = await this.evidenceResolver.resolveWeatherHazardChanged(event);
    return this.runFromResolvedEvidence(tripId, evidence);
  }

  async runFromResolvedEvidence(
    tripId: string,
    evidence: ResolveWeatherHazardChangedResult,
  ): Promise<WeatherActivityProhibitedPipelineResult> {
    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for trip ${tripId}`);
    }

    const impact = analyzeWeatherActivityImpact(plan, {
      tripId,
      dayIndex: evidence.event.payload.dayIndex,
      regionId: evidence.event.payload.regionId,
    });

    let tepTrigger: TepRuntimeTriggerResult | null = null;
    let problem: Rfc001DecisionProblem | null = null;

    if (this.tepBridge) {
      try {
        tepTrigger = await this.tepBridge.tryTriggerFromWeatherEvidence({ tripId, evidence });
        problem = tepTrigger?.problem ?? null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`TEP weather bridge failed trip=${tripId}: ${message}`);
      }
    }

    if (!problem) {
      problem = await this.problemDetector.detectWeatherActivityProblem({
        tripId,
        event: evidence.event,
        assertion: evidence.assertion,
        snapshot: evidence.snapshot,
        impact,
      });
    }

    this.logger.debug(
      `weather pipeline trip=${tripId} wind=${evidence.event.payload.windSpeedKmh} items=${impact.affectedPlanItemIds.length} problem=${problem?.problemId ?? 'none'} tep=${tepTrigger?.hook?.hookId ?? 'none'}`,
    );

    return { evidence, impact, problem, tepTrigger };
  }
}
