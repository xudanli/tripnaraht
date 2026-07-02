/**
 * PR-E — apply authorized PlanVersion with idempotency (metadata materialization).
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import {
  resolveTripRevision,
} from '../../trip-constraint-solver/utils/trip-revision.util';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { PlanVersion } from '../contracts/plan-version.types';
import { Rfc001DecisionLedgerStoreService } from '../persistence/rfc001-decision-ledger.store';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001PlanVersionStoreService } from '../plan-version/plan-version.store';
import {
  buildPlanVersionIdempotencyKey,
  Rfc001PlanVersionService,
} from '../plan-version/plan-version.service';
import {
  assertPlanVersionPreExecuteGuards,
  PlanVersionPreExecuteGuardError,
} from '../policy/plan-version-preexecute.guard';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import {
  applyProposedOperationsToPlan,
  ORIGINAL_CANDIDATE_ID,
} from '../adapters/repair-candidate.adapter';
import { assertEffectivePlanRequiresDecision } from '../policy/write-permission.guard';
import { Rfc001ItineraryMaterializerService } from './rfc001-itinerary-materializer.service';
import { isRfc001ItineraryMaterializeEnabled } from '../config/rfc001-iceland.config';
import { assertExecutionLock, Rfc001TripRevisionStaleError } from './rfc001-execution-lock.util';
import { Rfc001DecisionSemanticsProjectorService } from '../read-model/rfc001-decision-semantics-projector.service';
import { buildTripMutationSetFromPlanOperations } from '../adapters/plan-operation-to-mutation.adapter';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import { assertRecordExecutableForExecute } from '../cutover/cutover-reconciliation.util';

export interface ExecutePlanVersionInput {
  tripId: string;
  decisionId: string;
  idempotencyKey?: string;
}

export interface ExecutePlanVersionResult {
  planVersion: PlanVersion;
  record: Rfc001DecisionRecord;
  idempotentReplay: boolean;
  materializedPlanSnapshotRef: string;
  itineraryMaterialized?: boolean;
}

@Injectable()
export class Rfc001PlanVersionApplyExecutor {
  private readonly logger = new Logger(Rfc001PlanVersionApplyExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerStore: Rfc001DecisionLedgerStoreService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    private readonly planVersionService: Rfc001PlanVersionService,
    private readonly worldStateStore: WorldStateStoreService,
    private readonly itineraryMaterializer: Rfc001ItineraryMaterializerService,
    private readonly effectivePlanWriteGuard: EffectivePlanWriteGuardService,
    @Optional() private readonly v15Projector?: Rfc001DecisionSemanticsProjectorService,
  ) {}

  async execute(input: ExecutePlanVersionInput): Promise<ExecutePlanVersionResult> {
    return this.effectivePlanWriteGuard.runWithAuthority('execute', () =>
      this.executeAuthorized(input),
    );
  }

  private async executeAuthorized(
    input: ExecutePlanVersionInput,
  ): Promise<ExecutePlanVersionResult> {
    const idempotencyKey =
      input.idempotencyKey ??
      buildPlanVersionIdempotencyKey(input.tripId, input.decisionId);

    const prior = await this.planVersionStore.getExecution(
      input.tripId,
      idempotencyKey,
    );
    if (prior) {
      const planVersion = await this.planVersionStore.get(
        input.tripId,
        prior.planVersionId,
      );
      const record = await this.ledgerStore.getDecision(
        input.tripId,
        input.decisionId,
      );
      if (!planVersion || !record) {
        throw new NotFoundException('Idempotent replay missing plan version or record');
      }
      return {
        planVersion,
        record,
        idempotentReplay: true,
        materializedPlanSnapshotRef: planVersion.materializedPlanSnapshotRef,
      };
    }

    const record = await this.ledgerStore.getDecision(input.tripId, input.decisionId);
    if (!record) {
      throw new NotFoundException(`Decision ${input.decisionId} not found`);
    }
    assertRecordExecutableForExecute(record);
    if (record.recordStatus !== 'AUTHORIZED') {
      throw new BadRequestException(
        `Decision ${input.decisionId} is ${record.recordStatus}; expected AUTHORIZED`,
      );
    }

    const planVersion = await this.planVersionStore.findBySourceDecision(
      input.tripId,
      input.decisionId,
    );
    if (!planVersion) {
      throw new NotFoundException(`PlanVersion for decision ${input.decisionId} not found`);
    }

    const workspace = await this.workspaceService.get(input.tripId, record.workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${record.workspaceId} not found`);
    }

    await this.assertPreExecuteGuards(input.tripId, record, planVersion);

    const candidateId = record.selectedCandidateId ?? ORIGINAL_CANDIDATE_ID;
    const basePlan = await synthesizeRoutePlanDraftFromTrip(this.prisma, input.tripId);
    if (!basePlan) {
      throw new BadRequestException(`Cannot synthesize plan for trip ${input.tripId}`);
    }

    const operations = this.planVersionService.resolveOperations(workspace, candidateId);

    let itineraryMaterialized = false;
    if (isRfc001ItineraryMaterializeEnabled() && candidateId !== ORIGINAL_CANDIDATE_ID) {
      const materialization = await this.itineraryMaterializer.applyPlanOperations({
        tripId: input.tripId,
        decisionId: input.decisionId,
        operations,
      });
      itineraryMaterialized = materialization.applied;
    }

    const materializedPlan =
      candidateId === ORIGINAL_CANDIDATE_ID
        ? basePlan
        : applyProposedOperationsToPlan(basePlan, operations);

    const snapshotRef = planVersion.materializedPlanSnapshotRef;
    await this.planVersionStore.saveSnapshot(input.tripId, snapshotRef, materializedPlan);

    const effectiveBlock = await this.planVersionStore.setEffective(
      input.tripId,
      planVersion.planVersionId,
    );
    const effectiveVersion = effectiveBlock.items.find(
      (v) => v.planVersionId === planVersion.planVersionId,
    )!;

    assertEffectivePlanRequiresDecision({
      planVersion: effectiveVersion,
      decision: record,
    });

    const now = new Date().toISOString();
    const updatedRecord: Rfc001DecisionRecord = {
      ...record,
      recordStatus: 'EFFECTIVE',
      effectivePlanVersionId: planVersion.planVersionId,
      decidedAt: now,
    };
    await this.ledgerStore.upsertDecision(input.tripId, updatedRecord);

    await this.projectToV15Semantics(input.tripId, updatedRecord, {
      operations,
      markProblemResolved: true,
    });

    await this.bumpTripRevisionAndAppliedMarkers(input.tripId, {
      decisionId: input.decisionId,
      planVersionId: planVersion.planVersionId,
      candidateId,
      operations,
      snapshotRef,
    });

    const problem = await this.problemStore.get(input.tripId, record.problemId);
    if (problem) {
      await this.problemStore.upsert(input.tripId, {
        ...problem,
        status: 'RESOLVED',
      });
    }

    await this.planVersionStore.recordExecution(input.tripId, idempotencyKey, {
      planVersionId: planVersion.planVersionId,
      decisionId: input.decisionId,
    });

    this.logger.debug(
      `execute trip=${input.tripId} decision=${input.decisionId} planVersion=${planVersion.planVersionId}`,
    );

    return {
      planVersion: effectiveVersion,
      record: updatedRecord,
      idempotentReplay: false,
      materializedPlanSnapshotRef: snapshotRef,
      itineraryMaterialized,
    };
  }

  async rollback(input: {
    tripId: string;
    decisionId: string;
  }): Promise<{
    record: Rfc001DecisionRecord;
    effectivePlanVersionId: string;
    rollbackRecord: Rfc001DecisionRecord;
  }> {
    return this.effectivePlanWriteGuard.runWithAuthority('rollback', () =>
      this.rollbackAuthorized(input),
    );
  }

  private async rollbackAuthorized(input: {
    tripId: string;
    decisionId: string;
  }): Promise<{
    record: Rfc001DecisionRecord;
    effectivePlanVersionId: string;
    rollbackRecord: Rfc001DecisionRecord;
  }> {
    const record = await this.ledgerStore.getDecision(input.tripId, input.decisionId);
    if (!record?.effectivePlanVersionId) {
      throw new BadRequestException('Decision has no effective plan version to rollback');
    }

    const current = await this.planVersionStore.get(
      input.tripId,
      record.effectivePlanVersionId,
    );
    if (!current?.parentPlanVersionId) {
      throw new BadRequestException('No parent plan version to rollback to');
    }

    await this.planVersionStore.setEffective(input.tripId, current.parentPlanVersionId);

    if (isRfc001ItineraryMaterializeEnabled()) {
      await this.itineraryMaterializer.rollbackMaterialization({
        tripId: input.tripId,
        decisionId: input.decisionId,
      });
    }

    const now = new Date().toISOString();
    const rolledBack: Rfc001DecisionRecord = {
      ...record,
      recordStatus: 'ROLLED_BACK',
      decidedAt: now,
    };
    await this.ledgerStore.upsertDecision(input.tripId, rolledBack);

    const rollbackRecord: Rfc001DecisionRecord = {
      ...record,
      decisionId: `dec_rollback_${input.decisionId}_${Date.now()}`,
      finalAction: 'NO_ACTION',
      recordStatus: 'EFFECTIVE',
      effectivePlanVersionId: current.parentPlanVersionId,
      reasonCodes: ['ROLLBACK'],
      createdAt: now,
      decidedAt: now,
      selectedCandidateId: undefined,
    };
    await this.ledgerStore.appendDecision(input.tripId, rollbackRecord);

    if (this.v15Projector?.isEnabled()) {
      await this.v15Projector.upsertFromRfcRecord({
        tripId: input.tripId,
        record: rolledBack,
      });
      await this.v15Projector.upsertFromRfcRecord({
        tripId: input.tripId,
        record: rollbackRecord,
      });
    }

    return {
      record: rolledBack,
      effectivePlanVersionId: current.parentPlanVersionId,
      rollbackRecord,
    };
  }

  private async assertPreExecuteGuards(
    tripId: string,
    record: Rfc001DecisionRecord,
    planVersion: PlanVersion,
  ): Promise<void> {
    const worldStore = await this.worldStateStore.readStore(tripId);
    const snapshot = worldStore.snapshots.find(
      (s) => s.snapshotId === record.worldStateSnapshotId,
    );
    const snapshotAssertions = worldStore.assertions.filter((a) =>
      snapshot?.assertionIds.includes(a.assertionId),
    );
    const roadAssertion = snapshotAssertions.find(
      (a) => a.predicate === 'road.status',
    ) as WorldStateAssertion<RoadStatusAssertionPayload> | undefined;
    const activeRoadAssertion = roadAssertion
      ? ((await this.worldStateStore.getActiveAssertionForRoad(
          tripId,
          roadAssertion.payload.roadId,
        )) as WorldStateAssertion<RoadStatusAssertionPayload> | undefined)
      : undefined;

    try {
      if (isRfc001ItineraryMaterializeEnabled()) {
        await assertExecutionLock(this.prisma, tripId, record.decisionId);
      }
      assertPlanVersionPreExecuteGuards({
        record,
        planVersion,
        currentEffectivePlanVersionId:
          await this.planVersionStore.getEffectivePlanVersionId(tripId),
        worldStateSnapshot: snapshot,
        snapshotAssertions,
        activeRoadAssertion,
      });
    } catch (err) {
      if (
        err instanceof PlanVersionPreExecuteGuardError ||
        err instanceof Rfc001TripRevisionStaleError
      ) {
        const needsRepair: Rfc001DecisionRecord = {
          ...record,
          recordStatus: 'NEEDS_REPAIR',
        };
        await this.ledgerStore.upsertDecision(tripId, needsRepair);
        if (this.v15Projector?.isEnabled()) {
          await this.v15Projector.upsertFromRfcRecord({
            tripId,
            record: needsRepair,
          });
        }
      }
      throw err;
    }
  }

  private async projectToV15Semantics(
    tripId: string,
    record: Rfc001DecisionRecord,
    opts: {
      operations?: import('../contracts/plan-operation.types').PlanOperation[];
      markProblemResolved?: boolean;
    },
  ): Promise<void> {
    if (!this.v15Projector?.isEnabled()) return;

    const problem = await this.problemStore.get(tripId, record.problemId);
    const semanticKey = problem
      ? this.v15Projector.buildSemanticKey(problem.problemId, problem.triggerEventId)
      : undefined;

    const actualMutation =
      opts.operations?.length && record.recordStatus === 'EFFECTIVE'
        ? buildTripMutationSetFromPlanOperations({
            tripId,
            decisionId: record.decisionId,
            versionBefore: record.basePlanVersionId,
            operations: opts.operations,
          })
        : undefined;

    await this.v15Projector.upsertFromRfcRecord({
      tripId,
      record,
      actualMutation,
      semanticKey,
      markProblemResolved: opts.markProblemResolved,
    });
  }

  private async bumpTripRevisionAndAppliedMarkers(
    tripId: string,
    input: {
      decisionId: string;
      planVersionId: string;
      candidateId: string;
      operations: import('../contracts/plan-operation.types').PlanOperation[];
      snapshotRef: string;
    },
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) return;

    const meta = ((trip.metadata ?? {}) as Record<string, unknown>) ?? {};
    const rev = resolveTripRevision(trip);
    const nextRevision = rev.revision + 1;
    const applied = (meta.rfc001AppliedRepairs ?? {}) as Record<string, unknown>;

    for (const op of input.operations) {
      const itemId = op.parameters.itineraryItemId as string | undefined;
      if (itemId) {
        applied[itemId] = {
          decisionId: input.decisionId,
          planVersionId: input.planVersionId,
          candidateId: input.candidateId,
          operationId: op.operationId,
          appliedAt: new Date().toISOString(),
        };
      }
    }

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          revision: nextRevision,
          rfc001AppliedRepairs: applied,
          rfc001LastMaterializedSnapshot: input.snapshotRef,
          rfc001LastAppliedDecision: input.decisionId,
        }),
      },
    });
  }
}
