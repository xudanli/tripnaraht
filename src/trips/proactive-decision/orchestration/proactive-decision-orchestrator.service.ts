/**
 * PD-1/PD-3/PD-4 — Thin orchestrator: normalize → intake → open RFC-001 problem
 * → Lens Activation plan (for evaluate metadata).
 * Not a new Agent. Feature-flagged; default OFF.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { WeatherHazardChangedEvent } from '../../guardian-decision-core/evidence/weather-hazard-changed.event';
import type { RoadStatusChangedEvent } from '../../guardian-decision-core/evidence/road-status-changed.event';
import type { WeatherActivityImpactResult } from '../../guardian-decision-core/detection/weather-activity-impact-analyzer';
import type { RoadCloseImpactResult } from '../../guardian-decision-core/detection/road-close-impact.types';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { EntityRef } from '../../guardian-decision-core/contracts/entity-ref.types';
import { Rfc001DecisionProblemStoreService } from '../../guardian-decision-core/persistence/rfc001-decision-problem.store';
import type { DecisionTriggerInput } from '../../../decision-runtime/contracts/decision-run-request';
import { isProactiveDecisionV1Enabled } from '../config/proactive-decision-feature-flags.util';
import {
  normalizeRoadStatusToProactiveSignal,
  normalizeWeatherHazardToProactiveSignal,
} from '../signals/normalize-proactive-world-signal.util';
import {
  runProactiveDecisionIntakeFromRoad,
  runProactiveDecisionIntakeFromWeather,
} from './run-proactive-decision-intake.util';
import { openProactiveDecisionProblem } from '../writers/open-proactive-decision-problem.util';
import { buildProactiveCanonicalEvaluateTriggerInput } from './build-proactive-evaluate-trigger.util';
import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveOrchestratorStepResult } from './proactive-decision-orchestrator.types';
import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import type { LensActivationDecisionV1 } from '../lenses/lens-activation.types';
import { isProactiveDecisionSynthesisEnabled } from '../config/proactive-decision-synthesis-flags.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';
import type { ProactiveInterventionDecisionV1 } from '../intervention/evaluate-proactive-intervention.util';
import { projectProactiveChangeDraft } from '../execution/project-proactive-change-draft.util';
import type { ProactiveChangeDraftV1 } from '../execution/proactive-change-draft.types';

export type ProactiveOrchestratorRunResult = {
  intake: ProactiveOrchestratorStepResult;
  problem: Rfc001DecisionProblem | null;
  /** Ready for Trigger Gateway.dispatch — caller owns dispatch */
  evaluateTrigger: DecisionTriggerInput | null;
  /** PD-4 — which lenses to run (null when silent) */
  lensActivation: LensActivationDecisionV1 | null;
  /** PD-5 — CGUS-shaped recommendation (null when silent / synthesis off) */
  synthesis: ProactiveSynthesisV1 | null;
  /** PD-6 — Intervention Gate + optional three-layer card */
  intervention: ProactiveInterventionDecisionV1 | null;
  /** PD-7 — Change Draft projection (null until NOTIFY_CARD) */
  changeDraft: ProactiveChangeDraftV1 | null;
};

export type ProactiveLensOverrides = {
  needAlternative?: boolean;
  mustAdjust?: boolean;
  mustRepair?: boolean;
  hardBlocked?: boolean;
};

@Injectable()
export class ProactiveDecisionOrchestratorService {
  private readonly logger = new Logger(ProactiveDecisionOrchestratorService.name);

  constructor(
    private readonly problemStore: Rfc001DecisionProblemStoreService,
  ) {}

  isEnabled(): boolean {
    return isProactiveDecisionV1Enabled();
  }

  async ingestWeatherHazard(input: {
    event: WeatherHazardChangedEvent;
    weatherImpact: WeatherActivityImpactResult;
    planVersionId: string;
    worldStateSnapshotId: string;
    affectedEntityRefs?: EntityRef[];
    activityWindowClosed?: boolean;
    preferPostpone?: boolean;
    affectedItemLabels?: string[];
    lens?: ProactiveLensOverrides;
  }): Promise<ProactiveOrchestratorRunResult> {
    const normalized = normalizeWeatherHazardToProactiveSignal(input.event);
    if (!normalized.ok) {
      return this.silentOnly({
        status: 'SILENT',
        reason: 'SIGNAL_NOT_ALLOWLISTED',
        idempotencyKey: `pd_v1:${input.event.aggregateId}:${input.event.eventId}:none`,
      });
    }

    const intake = runProactiveDecisionIntakeFromWeather({
      signal: normalized.signal,
      weatherImpact: input.weatherImpact,
      activityWindowClosed: input.activityWindowClosed,
      preferPostpone: input.preferPostpone,
      affectedItemLabels: input.affectedItemLabels,
    });

    return this.afterIntake(intake, {
      planVersionId: input.planVersionId,
      worldStateSnapshotId: input.worldStateSnapshotId,
      affectedEntityRefs: input.affectedEntityRefs,
      lens: input.lens,
    });
  }

  async ingestRoadStatus(input: {
    event: RoadStatusChangedEvent;
    roadImpact: Pick<
      RoadCloseImpactResult,
      'affectedPlanItemIds' | 'roadId' | 'affectedEntityRefs'
    >;
    planVersionId: string;
    worldStateSnapshotId: string;
    affectedItemLabels?: string[];
    lens?: ProactiveLensOverrides;
  }): Promise<ProactiveOrchestratorRunResult> {
    const normalized = normalizeRoadStatusToProactiveSignal(input.event);
    if (!normalized.ok) {
      return this.silentOnly({
        status: 'SILENT',
        reason: 'SIGNAL_NOT_ALLOWLISTED',
        idempotencyKey: `pd_v1:${input.event.aggregateId}:${input.event.eventId}:none`,
      });
    }

    const intake = runProactiveDecisionIntakeFromRoad({
      signal: normalized.signal,
      roadImpact: input.roadImpact,
      affectedItemLabels: input.affectedItemLabels,
    });

    return this.afterIntake(intake, {
      planVersionId: input.planVersionId,
      worldStateSnapshotId: input.worldStateSnapshotId,
      affectedEntityRefs: input.roadImpact.affectedEntityRefs,
      lens: {
        // Road reroute defaults to needing alternatives unless explicitly overridden
        needAlternative: input.lens?.needAlternative ?? true,
        mustAdjust: input.lens?.mustAdjust,
        mustRepair: input.lens?.mustRepair ?? true,
        hardBlocked: input.lens?.hardBlocked,
      },
    });
  }

  private silentOnly(
    intake: ProactiveOrchestratorStepResult,
  ): ProactiveOrchestratorRunResult {
    return {
      intake,
      problem: null,
      evaluateTrigger: null,
      lensActivation: null,
      synthesis: null,
      intervention: null,
      changeDraft: null,
    };
  }

  private async afterIntake(
    intake: ProactiveOrchestratorStepResult,
    ctx: {
      planVersionId: string;
      worldStateSnapshotId: string;
      affectedEntityRefs?: EntityRef[];
      lens?: ProactiveLensOverrides;
    },
  ): Promise<ProactiveOrchestratorRunResult> {
    if (intake.status !== 'CONTINUE') {
      this.logger.debug(
        `PD silent reason=${intake.reason} key=${intake.idempotencyKey}`,
      );
      return this.silentOnly(intake);
    }

    const impact: ProactiveImpactV1 = intake.impact;
    if (!impact.caseId) {
      return this.silentOnly({
        status: 'SILENT',
        reason: 'CASE_UNMAPPED',
        impact,
        idempotencyKey: intake.idempotencyKey,
      });
    }

    const lensActivation = planLensesForProactiveCase({
      caseId: impact.caseId,
      signalKind: impact.signalKind,
      needAlternative: ctx.lens?.needAlternative,
      mustAdjust: ctx.lens?.mustAdjust,
      mustRepair: ctx.lens?.mustRepair,
      hardBlocked: ctx.lens?.hardBlocked,
    });

    const opened = await openProactiveDecisionProblem(this.problemStore, {
      impact,
      planVersionId: ctx.planVersionId,
      worldStateSnapshotId: ctx.worldStateSnapshotId,
      affectedEntityRefs: ctx.affectedEntityRefs,
      idempotencyKey: intake.idempotencyKey,
    });

    if (!opened.opened) {
      return this.silentOnly({
        status: 'SILENT',
        reason: 'CASE_UNMAPPED',
        impact,
        idempotencyKey: intake.idempotencyKey,
      });
    }

    const evaluateTrigger = buildProactiveCanonicalEvaluateTriggerInput({
      tripId: impact.tripId,
      problemId: opened.problem.problemId,
      signalEventId: impact.signalEventId,
      caseId: impact.caseId,
      idempotencyKey: intake.idempotencyKey,
      semanticCapability: opened.problem.semanticCapability,
      lensActivation,
    });

    let synthesis: ProactiveSynthesisV1 | null = null;
    let intervention: ProactiveInterventionDecisionV1 | null = null;
    let changeDraft: ProactiveChangeDraftV1 | null = null;
    if (isProactiveDecisionSynthesisEnabled()) {
      const syn = synthesizeProactiveRecommendation({
        caseId: impact.caseId,
        lens: lensActivation,
        hardBlocked: ctx.lens?.hardBlocked,
        impactZh: impact.rationaleZh,
      });
      if (syn.ok) {
        synthesis = syn.synthesis;
        if (evaluateTrigger.metadata) {
          evaluateTrigger.metadata.recommendedOptionId =
            synthesis.recommended.optionId;
          evaluateTrigger.metadata.synthesisConfidence = synthesis.confidence;
          evaluateTrigger.metadata.surfaceL3 = synthesis.surfaceL3;
        }

        intervention = evaluateProactiveIntervention({
          impact,
          synthesis,
          decisionProblemId: opened.problem.problemId,
        });
        if (evaluateTrigger.metadata) {
          evaluateTrigger.metadata.interventionGate = intervention.gate;
          evaluateTrigger.metadata.interventionValue =
            intervention.value.interventionValue;
          evaluateTrigger.metadata.surfaceLevel =
            intervention.candidate.surfaceLevel;
        }
        if (intervention.gate === 'SILENT_LEARNING') {
          this.logger.debug(
            `PD silent learning reason=${intervention.silentLearning?.reason} value=${intervention.value.interventionValue.toFixed(3)}`,
          );
        } else if (intervention.card) {
          changeDraft = projectProactiveChangeDraft({
            impact,
            synthesis,
            card: intervention.card,
            intervention,
            decisionProblemId: opened.problem.problemId,
          });
          if (evaluateTrigger.metadata) {
            evaluateTrigger.metadata.changeDraftId = changeDraft.draftId;
            evaluateTrigger.metadata.changeDraftStatus = changeDraft.status;
          }
        }
      } else if (syn.ok === false) {
        this.logger.debug(
          `PD synthesis blocked reason=${syn.reason} key=${intake.idempotencyKey}`,
        );
      }
    }

    return {
      intake,
      problem: opened.problem,
      evaluateTrigger,
      lensActivation,
      synthesis,
      intervention,
      changeDraft,
    };
  }
}
