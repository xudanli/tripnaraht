/**
 * PR-A + PR-B — Iceland road close: evidence → impact → decision problem.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import { EvidenceResolverService, type ResolveRoadStatusChangedResult } from '../evidence/evidence-resolver.service';
import { RoadCloseImpactAnalyzerService } from './road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from './decision-problem-detector.service';
import type { RoadCloseImpactResult } from './road-close-impact.types';
import type { RoadSegmentBindings } from './road-close-impact.types';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import type { TepRuntimeTriggerResult } from '../../tep/services/tep-runtime-trigger.service';
import type { TepRuntimePipelineBridgeService } from '../../tep/services/tep-runtime-pipeline.bridge';

export interface RoadSegmentUnavailablePipelineResult {
  evidence: ResolveRoadStatusChangedResult;
  impact: RoadCloseImpactResult;
  problem: Rfc001DecisionProblem | null;
  /** WP-TEP-11 — Hook-based trigger when PlanVersion.metadata.tep hooks match */
  tepTrigger?: TepRuntimeTriggerResult | null;
}

@Injectable()
export class RoadSegmentUnavailablePipelineService {
  private readonly logger = new Logger(RoadSegmentUnavailablePipelineService.name);

  constructor(
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly impactAnalyzer: RoadCloseImpactAnalyzerService,
    private readonly problemDetector: DecisionProblemDetectorService,
    @Optional() private readonly tepBridge?: TepRuntimePipelineBridgeService,
  ) {}

  async runFromEvent(
    event: RoadStatusChangedEvent,
    opts?: { bindings?: RoadSegmentBindings },
  ): Promise<RoadSegmentUnavailablePipelineResult> {
    const tripId = event.aggregateId;
    const evidence = await this.evidenceResolver.resolveRoadStatusChanged(event);
    return this.runFromResolvedEvidence(tripId, evidence, opts);
  }

  async runFromResolvedEvidence(
    tripId: string,
    evidence: ResolveRoadStatusChangedResult,
    opts?: { bindings?: RoadSegmentBindings },
  ): Promise<RoadSegmentUnavailablePipelineResult> {
    const impact = await this.impactAnalyzer.analyzeForTrip(tripId, {
      roadId: evidence.event.payload.roadId,
      primarySegmentId:
        evidence.event.payload.segmentId ?? evidence.assertion.subjectRef.id,
      bindings: opts?.bindings,
    });

    let tepTrigger: TepRuntimeTriggerResult | null = null;
    let problem: Rfc001DecisionProblem | null = null;

    if (this.tepBridge) {
      try {
        tepTrigger = await this.tepBridge.tryTriggerFromRoadEvidence({ tripId, evidence });
        problem = tepTrigger?.problem ?? null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`TEP road bridge failed trip=${tripId}: ${message}`);
      }
    }

    if (!problem) {
      problem = await this.problemDetector.detectRoadCloseProblem({
        tripId,
        event: evidence.event,
        assertion: evidence.assertion,
        snapshot: evidence.snapshot,
        impact,
      });
    }

    this.logger.debug(
      `pipeline trip=${tripId} road=${evidence.event.payload.roadId} items=${impact.affectedPlanItemIds.length} problem=${problem?.problemId ?? 'none'} tep=${tepTrigger?.hook?.hookId ?? 'none'}`,
    );

    return { evidence, impact, problem, tepTrigger };
  }
}
