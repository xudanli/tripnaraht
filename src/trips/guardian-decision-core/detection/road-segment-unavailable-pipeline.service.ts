/**
 * PR-A + PR-B — Iceland road close: evidence → impact → decision problem.
 * RFC-PD-001 — optional Proactive Decision enrichment when flag enabled.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import {
  EvidenceResolverService,
  type ResolveRoadStatusChangedResult,
} from '../evidence/evidence-resolver.service';
import { RoadCloseImpactAnalyzerService } from './road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from './decision-problem-detector.service';
import type { RoadCloseImpactResult } from './road-close-impact.types';
import type { RoadSegmentBindings } from './road-close-impact.types';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import type { TepRuntimeTriggerResult } from '../../tep/services/tep-runtime-trigger.service';
import type { TepRuntimePipelineBridgeService } from '../../tep/services/tep-runtime-pipeline.bridge';
import {
  resolveTripRevision,
  revisionToString,
} from '../../trip-constraint-solver/utils/trip-revision.util';
import { ProactiveDecisionOrchestratorService } from '../../proactive-decision/orchestration/proactive-decision-orchestrator.service';
import { ProactiveDecisionSurfacePersistService } from '../../proactive-decision/surface/proactive-decision-surface-persist.service';
import type { DecisionTriggerInput } from '../../../decision-runtime/contracts/decision-run-request';
import type { LensActivationDecisionV1 } from '../../proactive-decision/lenses/lens-activation.types';

export interface RoadSegmentUnavailablePipelineResult {
  evidence: ResolveRoadStatusChangedResult;
  impact: RoadCloseImpactResult;
  problem: Rfc001DecisionProblem | null;
  /** WP-TEP-11 — Hook-based trigger when PlanVersion.metadata.tep hooks match */
  tepTrigger?: TepRuntimeTriggerResult | null;
  /** RFC-PD-001 — present when PROACTIVE_DECISION_V1_ENABLED */
  proactiveEvaluateTrigger?: DecisionTriggerInput | null;
  lensActivation?: LensActivationDecisionV1 | null;
}

@Injectable()
export class RoadSegmentUnavailablePipelineService {
  private readonly logger = new Logger(RoadSegmentUnavailablePipelineService.name);

  constructor(
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly impactAnalyzer: RoadCloseImpactAnalyzerService,
    private readonly problemDetector: DecisionProblemDetectorService,
    @Optional() private readonly tepBridge?: TepRuntimePipelineBridgeService,
    @Optional()
    private readonly proactiveOrchestrator?: ProactiveDecisionOrchestratorService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional()
    private readonly proactiveSurfacePersist?: ProactiveDecisionSurfacePersistService,
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
    let proactiveEvaluateTrigger: DecisionTriggerInput | null = null;
    let lensActivation: LensActivationDecisionV1 | null = null;

    if (this.tepBridge) {
      try {
        tepTrigger = await this.tepBridge.tryTriggerFromRoadEvidence({
          tripId,
          evidence,
        });
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

    if (this.proactiveOrchestrator?.isEnabled()) {
      try {
        let planVersionId =
          problem?.planVersionId ?? `plan_unknown_${tripId.slice(0, 8)}`;
        if (!problem?.planVersionId && this.prisma) {
          const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { metadata: true, updatedAt: true },
          });
          if (trip) {
            planVersionId = `plan_${revisionToString(resolveTripRevision(trip))}`;
          }
        }

        const pd = await this.proactiveOrchestrator.ingestRoadStatus({
          event: evidence.event,
          roadImpact: impact,
          planVersionId,
          worldStateSnapshotId: evidence.snapshot.snapshotId,
          lens: { mustRepair: true, needAlternative: true },
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
        this.logger.warn(`PD road ingest failed trip=${tripId}: ${message}`);
      }
    }

    this.logger.debug(
      `pipeline trip=${tripId} road=${evidence.event.payload.roadId} items=${impact.affectedPlanItemIds.length} problem=${problem?.problemId ?? 'none'} tep=${tepTrigger?.hook?.hookId ?? 'none'} pd=${proactiveEvaluateTrigger ? 'trigger' : 'off'}`,
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
