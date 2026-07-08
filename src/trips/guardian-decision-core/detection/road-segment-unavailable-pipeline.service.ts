/**
 * PR-A + PR-B — Iceland road close: evidence → impact → decision problem.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import { EvidenceResolverService, type ResolveRoadStatusChangedResult } from '../evidence/evidence-resolver.service';
import { RoadCloseImpactAnalyzerService } from './road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from './decision-problem-detector.service';
import type { RoadCloseImpactResult } from './road-close-impact.types';
import type { RoadSegmentBindings } from './road-close-impact.types';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';

export interface RoadSegmentUnavailablePipelineResult {
  evidence: ResolveRoadStatusChangedResult;
  impact: RoadCloseImpactResult;
  problem: Rfc001DecisionProblem | null;
}

@Injectable()
export class RoadSegmentUnavailablePipelineService {
  private readonly logger = new Logger(RoadSegmentUnavailablePipelineService.name);

  constructor(
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly impactAnalyzer: RoadCloseImpactAnalyzerService,
    private readonly problemDetector: DecisionProblemDetectorService,
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

    const problem = await this.problemDetector.detectRoadCloseProblem({
      tripId,
      event: evidence.event,
      assertion: evidence.assertion,
      snapshot: evidence.snapshot,
      impact,
    });

    this.logger.debug(
      `pipeline trip=${tripId} road=${evidence.event.payload.roadId} items=${impact.affectedPlanItemIds.length} problem=${problem?.problemId ?? 'none'}`,
    );

    return { evidence, impact, problem };
  }
}
