/**
 * Persist Proactive Decision surface after Orchestrator ingest (pipelines).
 * Phase 4 P1: Silent Learning → Travel Memory when gate suppresses notify.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { ProactiveOrchestratorRunResult } from '../orchestration/proactive-decision-orchestrator.service';
import { projectProactiveToErcItem } from '../erc/project-proactive-to-erc.util';
import { buildProactiveDecisionTrace } from '../trace/build-proactive-decision-trace.util';
import { ProactiveSilentLearningMemoryService } from '../memory/proactive-silent-learning-memory.service';
import type { ProactiveInterventionDecisionV1 } from '../intervention/evaluate-proactive-intervention.util';
import {
  appendProactiveShadowObservationToMetadata,
  buildProactiveShadowObservation,
  shouldRecordProactiveShadow,
} from '../shadow/build-proactive-shadow-observation.util';
import { resolveProactiveCanaryConfig } from '../config/proactive-canary-config.util';
import {
  appendProactiveDecisionDatasetRecord,
  buildProactiveDecisionDatasetRecord,
} from '../validation/build-proactive-decision-dataset.util';
import {
  buildProactiveDecisionSurfaceSnapshot,
  mergeProactiveDecisionSurfaceIntoMetadata,
} from './proactive-decision-surface-snapshot.util';

@Injectable()
export class ProactiveDecisionSurfacePersistService {
  private readonly logger = new Logger(ProactiveDecisionSurfacePersistService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly silentMemory?: ProactiveSilentLearningMemoryService,
  ) {}

  async persistFromOrchestratorRun(
    tripId: string,
    run: ProactiveOrchestratorRunResult,
  ): Promise<void> {
    if (run.intake.status !== 'CONTINUE' || !run.intake.impact) {
      return;
    }

    const impact = run.intake.impact;
    let intervention: ProactiveInterventionDecisionV1 | null = run.intervention;

    const decisionTrace = buildProactiveDecisionTrace({
      impact,
      lens: run.lensActivation,
      synthesis: run.synthesis,
      intervention,
      decisionProblemId: run.problem?.problemId ?? null,
    });

    if (
      intervention?.gate === 'SILENT_LEARNING' &&
      intervention.silentLearning &&
      this.silentMemory
    ) {
      const ingested = this.silentMemory.ingest({
        silentLearning: intervention.silentLearning,
        decisionProblemId: run.problem?.problemId ?? null,
        recommendedOptionId: run.synthesis?.recommended.optionId ?? null,
        decisionTrace,
      });
      intervention = {
        ...intervention,
        silentLearning: ingested.silentLearning,
      };
    }

    const ercProjection = projectProactiveToErcItem({
      impact,
      synthesis: run.synthesis,
      intervention,
      changeDraft: run.changeDraft,
      decisionProblemId: run.problem?.problemId ?? null,
    });

    const snapshot = buildProactiveDecisionSurfaceSnapshot({
      tripId,
      impact,
      synthesis: run.synthesis,
      intervention,
      changeDraft: run.changeDraft,
      ercProjection,
      decisionProblemId: run.problem?.problemId ?? null,
      decisionTrace,
      lensActivation: run.lensActivation,
    });

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      this.logger.warn(`PD surface persist skipped — trip not found ${tripId}`);
      return;
    }

    let metadata = mergeProactiveDecisionSurfaceIntoMetadata(
      trip.metadata,
      snapshot,
    );

    // Stage 0 Shadow：100% 可记、用户不可见
    let shadowQuality: number | null = null;
    let wouldNotify = intervention?.gate === 'NOTIFY_CARD';
    if (shouldRecordProactiveShadow()) {
      const shadow = buildProactiveShadowObservation({
        tripId,
        impact,
        synthesis: run.synthesis,
        intervention,
        decisionTrace,
        decisionProblemId: run.problem?.problemId ?? null,
      });
      metadata = appendProactiveShadowObservationToMetadata(metadata, shadow);
      shadowQuality = shadow.quality.score;
      wouldNotify = shadow.wouldNotify === 'WOULD_NOTIFY';
      this.logger.debug(
        `PD shadow trip=${tripId} would=${shadow.wouldNotify} quality=${shadow.quality.score.toFixed(2)}`,
      );
    }

    // Phase 5 — Decision Dataset（Shadow 亦写）
    const canary = resolveProactiveCanaryConfig();
    const datasetRecord = buildProactiveDecisionDatasetRecord({
      tripId,
      impact,
      synthesis: run.synthesis,
      intervention,
      decisionProblemId: run.problem?.problemId ?? null,
      canaryStage: canary.stage,
      userVisible: false,
      wouldNotify,
      qualityScore: shadowQuality,
      outcome:
        intervention?.gate === 'SILENT_LEARNING' ? 'SILENT_OK' : 'PENDING',
    });
    metadata = appendProactiveDecisionDatasetRecord(metadata, datasetRecord);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });
  }
}
