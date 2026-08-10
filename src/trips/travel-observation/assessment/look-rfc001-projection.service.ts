/**
 * S4+ — project Look DecisionProblem into RFC-001 store (idempotent).
 * Resolves planVersion / worldState snapshot when possible; invalidates Decision read model.
 * Preview-only: never Apply / PlanVersion write.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import {
  LOOK_RFC001_WRITER,
  type LookRfc001Writer,
} from './look-decision-problem.port';
import type { LookDecisionProblem } from './look-decision-problem.types';
import { LookTripDecisionContextResolver } from './look-trip-decision-context.resolver';
import {
  lookTriggerEventId,
  projectLookToRfc001DecisionProblem,
} from './project-look-to-rfc001';

@Injectable()
export class LookRfc001ProjectionService {
  private readonly logger = new Logger(LookRfc001ProjectionService.name);

  constructor(
    @Optional()
    @Inject(LOOK_RFC001_WRITER)
    private readonly writer?: LookRfc001Writer,
    @Optional()
    private readonly contextResolver?: LookTripDecisionContextResolver,
    @Optional()
    private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
  ) {}

  get enabled(): boolean {
    return !!this.writer;
  }

  /**
   * Upsert RFC-001 problem with same problemId as Look view.
   * Idempotent on triggerEventId = look_obs:{observationId}.
   */
  async project(
    look: LookDecisionProblem,
    opts?: { planVersionId?: string; worldStateSnapshotId?: string },
  ): Promise<Rfc001DecisionProblem | undefined> {
    if (!this.writer) return undefined;
    if (look.writesPlanVersion !== false) {
      throw new Error('Look projection refused: writesPlanVersion must be false');
    }

    const resolved = this.contextResolver
      ? await this.contextResolver.resolve(look.tripId, look.observationId)
      : undefined;

    const planVersionId =
      opts?.planVersionId ??
      resolved?.planVersionId ??
      'PLAN_VERSION_PENDING_LOOK';
    const worldStateSnapshotId =
      opts?.worldStateSnapshotId ??
      resolved?.worldStateSnapshotId ??
      `ws_look_${look.observationId}`;

    const triggerEventId = lookTriggerEventId(look.observationId);
    const existing = await this.writer.findOpenByTriggerEvent(
      look.tripId,
      triggerEventId,
    );

    let persisted: Rfc001DecisionProblem;
    if (existing) {
      const refreshed = projectLookToRfc001DecisionProblem({
        look: { ...look, problemId: existing.problemId },
        planVersionId: opts?.planVersionId ?? existing.planVersionId,
        worldStateSnapshotId:
          opts?.worldStateSnapshotId ?? existing.worldStateSnapshotId,
      });
      persisted = await this.writer.upsert(look.tripId, refreshed);
    } else {
      const draft = projectLookToRfc001DecisionProblem({
        look,
        planVersionId,
        worldStateSnapshotId,
      });
      persisted = await this.writer.upsert(look.tripId, draft);
    }

    this.invalidateDecisionReadModel(look.tripId);
    return persisted;
  }

  private invalidateDecisionReadModel(tripId: string): void {
    if (!isDecisionGatewayUnifiedEnabled() || !this.decisionReadModel) return;
    try {
      this.decisionReadModel.invalidateCache(tripId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Look decision read model cache invalidate failed trip=${tripId}: ${message}`,
      );
    }
  }
}
