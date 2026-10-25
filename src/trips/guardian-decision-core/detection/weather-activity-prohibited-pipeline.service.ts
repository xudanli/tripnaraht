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
import {
  resolveTripRevision,
  revisionToString,
} from '../../trip-constraint-solver/utils/trip-revision.util';
import { DecisionProblemDetectorService } from './decision-problem-detector.service';
import {
  analyzeWeatherActivityImpact,
  type WeatherActivityImpactResult,
} from './weather-activity-impact-analyzer';
import type { TepRuntimeTriggerResult } from '../../tep/services/tep-runtime-trigger.service';
import type { TepRuntimePipelineBridgeService } from '../../tep/services/tep-runtime-pipeline.bridge';
import { ProactiveDecisionOrchestratorService } from '../../proactive-decision/orchestration/proactive-decision-orchestrator.service';
import { ProactiveDecisionSurfacePersistService } from '../../proactive-decision/surface/proactive-decision-surface-persist.service';
import type { DecisionTriggerInput } from '../../../decision-runtime/contracts/decision-run-request';
import type { LensActivationDecisionV1 } from '../../proactive-decision/lenses/lens-activation.types';

export interface WeatherActivityProhibitedPipelineResult {
  evidence: ResolveWeatherHazardChangedResult;
  impact: WeatherActivityImpactResult;
  problem: Rfc001DecisionProblem | null;
  tepTrigger?: TepRuntimeTriggerResult | null;
  /** RFC-PD-001 — present when PROACTIVE_DECISION_V1_ENABLED */
  proactiveEvaluateTrigger?: DecisionTriggerInput | null;
  lensActivation?: LensActivationDecisionV1 | null;
}

@Injectable()
export class WeatherActivityProhibitedPipelineService {
  private readonly logger = new Logger(WeatherActivityProhibitedPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly problemDetector: DecisionProblemDetectorService,
    @Optional() private readonly tepBridge?: TepRuntimePipelineBridgeService,
    @Optional()
    private readonly proactiveOrchestrator?: ProactiveDecisionOrchestratorService,
    @Optional()
    private readonly proactiveSurfacePersist?: ProactiveDecisionSurfacePersistService,
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
    let proactiveEvaluateTrigger: DecisionTriggerInput | null = null;
    let lensActivation: LensActivationDecisionV1 | null = null;

    if (this.tepBridge) {
      try {
        tepTrigger = await this.tepBridge.tryTriggerFromWeatherEvidence({
          tripId,
          evidence,
        });
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

    if (this.proactiveOrchestrator?.isEnabled()) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { metadata: true, updatedAt: true },
        });
        const planVersionId =
          problem?.planVersionId ??
          (trip
            ? `plan_${revisionToString(resolveTripRevision(trip))}`
            : `plan_unknown_${tripId.slice(0, 8)}`);

        const pd = await this.proactiveOrchestrator.ingestWeatherHazard({
          event: evidence.event,
          weatherImpact: impact,
          planVersionId,
          worldStateSnapshotId: evidence.snapshot.snapshotId,
          affectedEntityRefs: impact.affectedEntityRefs,
        });
        if (pd.problem) {
          problem = pd.problem;
        }
        proactiveEvaluateTrigger = pd.evaluateTrigger;
        lensActivation = pd.lensActivation;
        if (this.proactiveSurfacePersist) {
          await this.proactiveSurfacePersist.persistFromOrchestratorRun(tripId, pd);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`PD weather ingest failed trip=${tripId}: ${message}`);
      }
    }

    this.logger.debug(
      `weather pipeline trip=${tripId} wind=${evidence.event.payload.windSpeedKmh} items=${impact.affectedPlanItemIds.length} problem=${problem?.problemId ?? 'none'} tep=${tepTrigger?.hook?.hookId ?? 'none'} pd=${proactiveEvaluateTrigger ? 'trigger' : 'off'}`,
    );

    return {
      evidence,
      impact,
      problem,
      tepTrigger,
      proactiveEvaluateTrigger,
      lensActivation,
    };
  }
}
