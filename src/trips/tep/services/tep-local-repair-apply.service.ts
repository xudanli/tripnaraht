/**
 * WP-TEP-12 — Local Repair writeback: RecoveryOption → PlanVersion → itinerary materialization
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import type { PlanOperation } from '../../guardian-decision-core/contracts/plan-operation.types';
import type { PlanVersion } from '../../guardian-decision-core/contracts/plan-version.types';
import { Rfc001ItineraryMaterializerService } from '../../guardian-decision-core/execution/rfc001-itinerary-materializer.service';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import type { RecoveryOption } from '../contracts/tep-self-drive.types';
import { buildTepPlanVersionMetadata } from '../contracts/tep-plan-metadata.types';
import { ExecutabilityAssessmentService } from './executability-assessment.service';
import { TepPlanMetadataService } from './tep-plan-metadata.service';
import {
  buildTepRepairDecisionId,
  buildTepRepairIdempotencyKey,
  buildTepRepairPlanVersionId,
  parseTepRepairOptionId,
  resolveItineraryItemIdFromActivityRef,
} from '../utils/tep-repair-intervention.util';
import { assertTepRepairOptionFresh } from '../utils/tep-repair-stale-guard.util';
import { withTepRepairAdvisoryLock } from '../utils/tep-repair-advisory-lock.util';
import { TepRepairExecutionStore } from './tep-repair-execution.store';

export interface TepLocalRepairApplyInput {
  tripId: string;
  interventionOrOptionId: string;
  userId: string;
  comment?: string;
  /** Plan version when user saw the repair preview; mismatch → STALE_REPAIR_OPTION */
  basePlanVersionId?: string;
}

export interface TepLocalRepairApplyResult {
  planVersionId: string;
  parentPlanVersionId: string;
  appliedOptionId: string;
  appliedAction: RecoveryOption['action'];
  removedRefs: string[];
  removedItemIds: string[];
  /** REPLACE_ITEM 物化创建的行 id */
  createdItemIds?: string[];
  replacementPoiId?: string;
  confirmedBy: 'USER';
  confirmedAt: string;
  idempotentReplay: boolean;
  itineraryMaterialized: boolean;
  executabilityRefreshed: boolean;
  metadataPatch: {
    recoveryGraphApplied: string;
    planVersionId: string;
  };
}

@Injectable()
export class TepLocalRepairApplyService {
  private readonly logger = new Logger(TepLocalRepairApplyService.name);
  private readonly inflightApplies = new Map<string, Promise<TepLocalRepairApplyResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    private readonly planMetadata: TepPlanMetadataService,
    private readonly itineraryMaterializer: Rfc001ItineraryMaterializerService,
    private readonly effectivePlanWriteGuard: EffectivePlanWriteGuardService,
    private readonly executability: ExecutabilityAssessmentService,
    private readonly repairExecutionStore: TepRepairExecutionStore,
    @Optional() private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
  ) {}

  async applyRecoveryOption(input: TepLocalRepairApplyInput): Promise<TepLocalRepairApplyResult> {
    const optionId = parseTepRepairOptionId(input.interventionOrOptionId);
    const idempotencyKey = buildTepRepairIdempotencyKey(input.tripId, optionId);

    const inflight = this.inflightApplies.get(idempotencyKey);
    if (inflight) {
      return inflight;
    }

    const run = this.applyRecoveryOptionOnce(input, optionId, idempotencyKey).finally(() => {
      this.inflightApplies.delete(idempotencyKey);
    });
    this.inflightApplies.set(idempotencyKey, run);
    return run;
  }

  private async applyRecoveryOptionOnce(
    input: TepLocalRepairApplyInput,
    optionId: string,
    idempotencyKey: string,
  ): Promise<TepLocalRepairApplyResult> {
    return withTepRepairAdvisoryLock(this.prisma, input.tripId, optionId, async (tx) => {
      const claim = await this.repairExecutionStore.claimOrReplay(tx, {
        tripId: input.tripId,
        optionId,
        idempotencyKey,
      });

      if (claim.action === 'in_progress') {
        this.repairExecutionStore.throwRepairInProgress(optionId);
      }

      if (claim.action === 'replay') {
        const existing = await this.planVersionStore.get(input.tripId, claim.planVersionId);
        if (existing?.status === 'EFFECTIVE') {
          return this.buildReplayResult({
            planVersion: existing,
            optionId,
            removedRefs: this.extractTargetRefs(existing),
            removedItemIds: this.extractTargetItemIds(existing),
          });
        }
      }

      try {
        const result = await this.executeRecoveryWriteback(input, optionId, idempotencyKey);
        await this.repairExecutionStore.markApplied(tx, idempotencyKey, {
          planVersionId: result.planVersionId,
          decisionId: buildTepRepairDecisionId(optionId),
        });
        return result;
      } catch (err: unknown) {
        await this.repairExecutionStore.markFailed(tx, idempotencyKey);
        throw err;
      }
    });
  }

  private async executeRecoveryWriteback(
    input: TepLocalRepairApplyInput,
    optionId: string,
    idempotencyKey: string,
  ): Promise<TepLocalRepairApplyResult> {
    const priorExecution = await this.planVersionStore.getExecution(
      input.tripId,
      idempotencyKey,
    );
    if (priorExecution) {
      const existing = await this.planVersionStore.get(
        input.tripId,
        priorExecution.planVersionId,
      );
      if (existing?.status === 'EFFECTIVE') {
        return this.buildReplayResult({
          planVersion: existing,
          optionId,
          removedRefs: this.extractTargetRefs(existing),
          removedItemIds: this.extractTargetItemIds(existing),
        });
      }
    }

    const loaded = await this.planMetadata.loadTepMetadata(input.tripId);
    const recoveryGraph = loaded.tep?.recoveryGraph;
    if (!recoveryGraph?.fallbackOptions?.length) {
      throw new NotFoundException(`No TEP recovery graph for trip ${input.tripId}`);
    }

    assertTepRepairOptionFresh({
      basePlanVersionId: input.basePlanVersionId,
      currentEffectivePlanVersionId: loaded.planVersionId,
      optionId,
    });

    const option = recoveryGraph.fallbackOptions.find((o) => o.optionId === optionId);
    if (!option) {
      throw new NotFoundException(`Recovery option ${optionId} not found`);
    }

    if (option.action !== 'REMOVE' && option.action !== 'REPLACE') {
      throw new BadRequestException(
        `Recovery option ${optionId} action ${option.action} is not yet supported for writeback`,
      );
    }

    const targetActivityRefs = option.targetRefs.filter((r) => r.startsWith('activity_'));
    if (targetActivityRefs.length === 0) {
      throw new BadRequestException(
        `Recovery option ${optionId} has no activity target refs for writeback`,
      );
    }

    const targetItemIds = await this.resolveAndValidateItemIds(input.tripId, targetActivityRefs);

    let operations: PlanOperation[];
    let removedRefs = targetActivityRefs;
    let removedItemIds = targetItemIds;
    let replacementPoiId: string | undefined;

    if (option.action === 'REMOVE') {
      operations = this.buildRemoveOperations(option, targetItemIds);
    } else {
      replacementPoiId = option.replacementPoiId?.trim();
      if (!replacementPoiId) {
        throw new BadRequestException(
          `Recovery option ${optionId} REPLACE requires precomputed replacementPoiId`,
        );
      }
      if (targetItemIds.length !== 1) {
        throw new BadRequestException(
          `Recovery option ${optionId} REPLACE supports exactly one target activity`,
        );
      }
      operations = this.buildReplaceOperations(option, targetItemIds[0]!, replacementPoiId);
    }

    const parentPlanVersionId =
      loaded.planVersionId ??
      (await this.planVersionStore.getEffectivePlanVersionId(input.tripId)) ??
      `plan_${input.tripId}`;

    const decisionId = buildTepRepairDecisionId(optionId);
    const planVersionId = buildTepRepairPlanVersionId(parentPlanVersionId, optionId);
    const now = new Date().toISOString();

    const pendingVersion: PlanVersion = {
      planVersionId,
      tripId: input.tripId,
      parentPlanVersionId,
      createdBy: 'USER',
      sourceDecisionId: decisionId,
      operations,
      materializedPlanSnapshotRef: `snap_${planVersionId}`,
      status: 'PENDING_AUTHORIZATION',
      createdAt: now,
      metadata: {
        tep: buildTepPlanVersionMetadata({
          decisionHooks: loaded.tep?.decisionHooks ?? [],
          recoveryGraph,
          recoveryGraphApplied: optionId,
          syncedAt: now,
        }),
      },
    };

    const materialization = await this.effectivePlanWriteGuard.runWithAuthority('execute', async () => {
      await this.planVersionStore.upsert(input.tripId, pendingVersion);
      try {
        const result = await this.itineraryMaterializer.applyPlanOperations({
          tripId: input.tripId,
          decisionId,
          operations,
        });
        if (!result.applied && !result.skipped) {
          throw new BadRequestException('Itinerary materialization did not apply');
        }
        await this.planVersionStore.setEffective(input.tripId, planVersionId);
        await this.planVersionStore.recordExecution(input.tripId, idempotencyKey, {
          planVersionId,
          decisionId,
        });
        return result;
      } catch (err: unknown) {
        try {
          await this.itineraryMaterializer.rollbackMaterialization({
            tripId: input.tripId,
            decisionId,
          });
        } catch (rollbackErr: unknown) {
          const rollbackMessage =
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          this.logger.warn(
            `tep repair materialization rollback failed trip=${input.tripId} option=${optionId}: ${rollbackMessage}`,
          );
        }
        await this.planVersionStore.upsert(input.tripId, {
          ...pendingVersion,
          status: 'REJECTED',
        });
        throw err;
      }
    });

    let executabilityRefreshed = false;
    try {
      await this.executability.getExecutability(input.tripId, { refresh: true });
      executabilityRefreshed = true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`post-repair executability refresh failed trip=${input.tripId}: ${message}`);
    }

    this.invalidateDecisionReadModel(input.tripId);

    return {
      planVersionId,
      parentPlanVersionId,
      appliedOptionId: optionId,
      appliedAction: option.action,
      removedRefs,
      removedItemIds,
      createdItemIds: materialization.createdItemIds,
      replacementPoiId,
      confirmedBy: 'USER',
      confirmedAt: now,
      idempotentReplay: false,
      itineraryMaterialized: materialization.applied && !materialization.skipped,
      executabilityRefreshed,
      metadataPatch: {
        recoveryGraphApplied: optionId,
        planVersionId,
      },
    };
  }

  private async resolveAndValidateItemIds(
    tripId: string,
    activityRefs: string[],
  ): Promise<string[]> {
    const itemIds = activityRefs
      .map(resolveItineraryItemIdFromActivityRef)
      .filter((id): id is string => Boolean(id));

    if (itemIds.length !== activityRefs.length) {
      throw new BadRequestException('Recovery option contains non-activity refs');
    }

    const items = await this.prisma.itineraryItem.findMany({
      where: {
        id: { in: itemIds },
        TripDay: { tripId },
      },
      select: { id: true },
    });

    if (items.length !== itemIds.length) {
      const found = new Set(items.map((i) => i.id));
      const missing = itemIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Itinerary items not found: ${missing.join(', ')}`);
    }

    return itemIds;
  }

  private buildRemoveOperations(option: RecoveryOption, itemIds: string[]): PlanOperation[] {
    return itemIds.map((itemId, index) => ({
      operationId: `tep_rm_${option.optionId}_${index}_${randomUUID().slice(0, 8)}`,
      kind: 'REMOVE_ITEM' as const,
      targetRefs: [{ kind: 'PLAN_ITEM', id: itemId }],
      parameters: { itineraryItemId: itemId, recoveryOptionId: option.optionId },
    }));
  }

  private buildReplaceOperations(
    option: RecoveryOption,
    itemId: string,
    substitutePoiId: string,
  ): PlanOperation[] {
    return [
      {
        operationId: `tep_rp_${option.optionId}_${randomUUID().slice(0, 8)}`,
        kind: 'REPLACE_ITEM' as const,
        targetRefs: [{ kind: 'PLAN_ITEM', id: itemId }],
        parameters: {
          itineraryItemId: itemId,
          substitutePoiId,
          recoveryOptionId: option.optionId,
          replacementRef: option.replacementRef,
          exposure: 'indoor',
        },
      },
    ];
  }

  private extractTargetRefs(version: PlanVersion): string[] {
    return version.operations
      .filter((op) => op.kind === 'REMOVE_ITEM' || op.kind === 'REPLACE_ITEM')
      .map((op) => {
        const itemId = op.parameters.itineraryItemId as string | undefined;
        return itemId ? `activity_${itemId}` : '';
      })
      .filter(Boolean);
  }

  private extractTargetItemIds(version: PlanVersion): string[] {
    return version.operations
      .filter((op) => op.kind === 'REMOVE_ITEM' || op.kind === 'REPLACE_ITEM')
      .map((op) => op.parameters.itineraryItemId as string | undefined)
      .filter((id): id is string => Boolean(id));
  }

  private extractRemovedRefs(version: PlanVersion): string[] {
    return this.extractTargetRefs(version);
  }

  private extractRemovedItemIds(version: PlanVersion): string[] {
    return this.extractTargetItemIds(version);
  }

  private buildReplayResult(input: {
    planVersion: PlanVersion;
    optionId: string;
    removedRefs: string[];
    removedItemIds: string[];
  }): TepLocalRepairApplyResult {
    const replaceOp = input.planVersion.operations.find((op) => op.kind === 'REPLACE_ITEM');
    return {
      planVersionId: input.planVersion.planVersionId,
      parentPlanVersionId: input.planVersion.parentPlanVersionId ?? input.planVersion.planVersionId,
      appliedOptionId: input.optionId,
      appliedAction: replaceOp ? 'REPLACE' : 'REMOVE',
      removedRefs: input.removedRefs,
      removedItemIds: input.removedItemIds,
      replacementPoiId: replaceOp?.parameters.substitutePoiId as string | undefined,
      confirmedBy: 'USER',
      confirmedAt: input.planVersion.effectiveAt ?? input.planVersion.createdAt,
      idempotentReplay: true,
      itineraryMaterialized: input.planVersion.operations.length > 0,
      executabilityRefreshed: false,
      metadataPatch: {
        recoveryGraphApplied: input.optionId,
        planVersionId: input.planVersion.planVersionId,
      },
    };
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
