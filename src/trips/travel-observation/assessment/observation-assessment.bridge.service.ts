import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ObservationAssessment } from '../observation.types';
import {
  enrichAssessmentWithDecisionProblem,
  resolvePreviewCorridor,
} from './observation-action.builder';
import {
  LOOK_RFC001_WRITER,
  type LookRfc001Writer,
} from './look-decision-problem.port';
import { LookDecisionProblemStore } from './look-decision-problem.store';
import type { LookDecisionProblem } from './look-decision-problem.types';
import { LookRfc001ProjectionService } from './look-rfc001-projection.service';
import { lookTriggerEventId } from './project-look-to-rfc001';
import { buildLookDecisionProblemUpsert } from './observation-decision-problem.mapper';

/**
 * S4/S4+ bridge: ObservationAssessment → Look DecisionProblem + enriched actions.
 * Optionally projects into RFC-001 store (same problemId) for Decision Gateway.
 * Never writes PlanVersion / Apply.
 *
 * After the problem exists, Q2 priority #1 sets CTA to decision:{problemId}.
 */
@Injectable()
export class ObservationAssessmentBridgeService {
  constructor(
    private readonly problems: LookDecisionProblemStore,
    @Optional() private readonly rfcProjection?: LookRfc001ProjectionService,
    @Optional()
    @Inject(LOOK_RFC001_WRITER)
    private readonly rfcWriter?: LookRfc001Writer,
  ) {}

  async attachDecisionProblem(input: {
    tripId: string;
    observationId: string;
    assessment: ObservationAssessment;
    planVersionId?: string;
    worldStateSnapshotId?: string;
  }): Promise<{
    assessment: ObservationAssessment;
    problem?: LookDecisionProblem;
  }> {
    const existing = this.problems.getByObservation(input.observationId);

    let rfcExistingId: string | undefined;
    if (this.rfcWriter) {
      const rfcOpen = await this.rfcWriter.findOpenByTriggerEvent(
        input.tripId,
        lookTriggerEventId(input.observationId),
      );
      rfcExistingId = rfcOpen?.problemId;
    }

    const preferred =
      input.assessment.decisionProblem &&
      resolvePreviewCorridor({
        semanticKey: input.assessment.decisionProblem.semanticKey,
        assessmentStatus: input.assessment.status,
      });

    const upsert = buildLookDecisionProblemUpsert({
      tripId: input.tripId,
      observationId: input.observationId,
      assessment: input.assessment,
      existingProblemId: existing?.problemId ?? rfcExistingId,
    });

    if (!upsert) {
      return { assessment: input.assessment };
    }

    const created = this.problems.upsert(
      existing
        ? upsert
        : {
            ...upsert,
            preferredProblemId: rfcExistingId,
            preview: preferred ?? upsert.preview,
          },
    );

    const linked = buildLookDecisionProblemUpsert({
      tripId: input.tripId,
      observationId: input.observationId,
      assessment: input.assessment,
      existingProblemId: created.problemId,
    });

    const problem = linked
      ? this.problems.upsert({
          ...linked,
          preview: {
            corridor: 'DECISION',
            previewRef: `decision:${created.problemId}`,
            label: linked.preview.label,
          },
        })
      : created;

    if (problem.writesPlanVersion !== false) {
      throw new Error('Look DecisionProblem must not write PlanVersion');
    }

    if (this.rfcProjection?.enabled) {
      await this.rfcProjection.project(problem, {
        planVersionId: input.planVersionId,
        worldStateSnapshotId: input.worldStateSnapshotId,
      });
    }

    return {
      assessment: enrichAssessmentWithDecisionProblem(input.assessment, problem),
      problem,
    };
  }

  getProblem(problemId: string): LookDecisionProblem | undefined {
    return this.problems.get(problemId);
  }

  getByObservation(observationId: string): LookDecisionProblem | undefined {
    return this.problems.getByObservation(observationId);
  }
}
