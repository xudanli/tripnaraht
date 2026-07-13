/**
 * WP-TEP-11/12 — Runtime: stored DecisionHook + observation → DecisionProblem (persisted)
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import { DecisionProblemDetectorService } from '../../guardian-decision-core/detection/decision-problem-detector.service';
import {
  projectHookToDecisionProblemDraft,
  shouldTriggerHookTransition,
} from '../adapters/tep-hook-to-decision-problem.adapter';
import type { DecisionHook } from '../contracts/tep-self-drive.types';
import { matchAllDecisionHooks, matchDecisionHook } from '../registry/decision-hook.registry';
import { TepPlanMetadataService } from './tep-plan-metadata.service';

export interface TepRuntimeTriggerInput {
  tripId: string;
  planVersionId: string;
  triggerEventId: string;
  worldStateSnapshotId: string;
  currentObservation: Record<string, number | string | string[]>;
  previousObservation?: Record<string, number | string | string[]>;
  /** Override stored hooks (harness / tests) */
  decisionHooks?: DecisionHook[];
  detectedAt?: string;
}

export interface TepRuntimeTriggerResult {
  matched: boolean;
  hook?: DecisionHook;
  problem?: Rfc001DecisionProblem;
  transitioned: boolean;
}

@Injectable()
export class TepRuntimeTriggerService {
  private readonly logger = new Logger(TepRuntimeTriggerService.name);

  constructor(
    private readonly planMetadata: TepPlanMetadataService,
    private readonly problemDetector: DecisionProblemDetectorService,
    @Optional() private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
  ) {}

  async processObservation(input: TepRuntimeTriggerInput): Promise<TepRuntimeTriggerResult> {
    const hooks =
      input.decisionHooks ?? (await this.planMetadata.loadDecisionHooks(input.tripId));
    if (hooks.length === 0) {
      return { matched: false, transitioned: false };
    }

    const matched = matchDecisionHook(hooks, input.currentObservation);
    if (!matched) {
      return { matched: false, transitioned: false };
    }

    const prev = input.previousObservation ?? {};
    const transitioned = shouldTriggerHookTransition({
      hook: matched,
      previousObservation: prev,
      currentObservation: input.currentObservation,
    });

    const draft = projectHookToDecisionProblemDraft({
      tripId: input.tripId,
      planVersionId: input.planVersionId,
      hook: matched,
      triggerEventId: input.triggerEventId,
      worldStateSnapshotId: input.worldStateSnapshotId,
      detectedAt: input.detectedAt,
    });

    const problem = await this.problemDetector.persistTepHookProblem({
      tripId: input.tripId,
      problem: draft,
    });

    this.invalidateDecisionReadModel(input.tripId);

    return {
      matched: true,
      hook: matched,
      problem,
      transitioned,
    };
  }

  /** Match all hooks for a single observation (diagnostics / multi-impact). */
  async processAllMatchingHooks(
    input: Omit<TepRuntimeTriggerInput, 'decisionHooks'> & { decisionHooks?: DecisionHook[] },
  ): Promise<TepRuntimeTriggerResult[]> {
    const hooks =
      input.decisionHooks ?? (await this.planMetadata.loadDecisionHooks(input.tripId));
    const matchedHooks = matchAllDecisionHooks(hooks, input.currentObservation);

    const results: TepRuntimeTriggerResult[] = [];
    for (const hook of matchedHooks) {
      const draft = projectHookToDecisionProblemDraft({
        tripId: input.tripId,
        planVersionId: input.planVersionId,
        hook,
        triggerEventId: `${input.triggerEventId}_${hook.hookId}`,
        worldStateSnapshotId: input.worldStateSnapshotId,
        detectedAt: input.detectedAt,
      });
      const problem = await this.problemDetector.persistTepHookProblem({
        tripId: input.tripId,
        problem: draft,
      });
      this.invalidateDecisionReadModel(input.tripId);
      results.push({
        matched: true,
        hook,
        problem,
        transitioned: shouldTriggerHookTransition({
          hook,
          previousObservation: input.previousObservation ?? {},
          currentObservation: input.currentObservation,
        }),
      });
    }

    return results;
  }

  private invalidateDecisionReadModel(tripId: string): void {
    if (!isDecisionGatewayUnifiedEnabled() || !this.decisionReadModel) return;
    try {
      this.decisionReadModel.invalidateCache(tripId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`decision read model cache invalidate failed trip=${tripId}: ${message}`);
    }
  }
}
