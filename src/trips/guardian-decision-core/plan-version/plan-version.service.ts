/**
 * PR-E — PlanVersion lifecycle from DecisionRecord + RepairCandidate.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlanVersion } from '../contracts/plan-version.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { PlanOperation } from '../contracts/plan-operation.types';
import { Rfc001PlanVersionStoreService } from './plan-version.store';
import { resolveTripRevision, revisionToString } from '../../trip-constraint-solver/utils/trip-revision.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { ORIGINAL_CANDIDATE_ID } from '../adapters/repair-candidate.adapter';

@Injectable()
export class Rfc001PlanVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: Rfc001PlanVersionStoreService,
  ) {}

  async createPendingFromDecision(input: {
    tripId: string;
    record: Rfc001DecisionRecord;
    workspace: DecisionWorkspace;
    candidateId?: string;
  }): Promise<PlanVersion> {
    // RD-08: same decisionId must not create a second Plan Version
    const existing = await this.store.findBySourceDecision(
      input.tripId,
      input.record.decisionId,
    );
    if (existing) {
      return existing;
    }

    const candidateId =
      input.candidateId ?? input.record.selectedCandidateId ?? ORIGINAL_CANDIDATE_ID;
    const operations = this.resolveOperations(input.workspace, candidateId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) throw new NotFoundException(`Trip ${input.tripId} not found`);

    const rev = resolveTripRevision(trip);
    const parentId =
      (await this.store.getEffectivePlanVersionId(input.tripId)) ??
      input.record.basePlanVersionId ??
      `plan_${revisionToString(rev)}`;

    const planVersionId = `plan_v${rev.revision + 1}_${input.record.decisionId.slice(-8)}`;
    const snapshotRef = `snap_${planVersionId}`;

    const version: PlanVersion = {
      planVersionId,
      tripId: input.tripId,
      parentPlanVersionId: parentId,
      createdBy: 'DECISION_CORE',
      sourceDecisionId: input.record.decisionId,
      operations,
      materializedPlanSnapshotRef: snapshotRef,
      status: 'PENDING_AUTHORIZATION',
      createdAt: new Date().toISOString(),
    };

    return this.store.upsert(input.tripId, version);
  }

  async rebindToCandidate(input: {
    tripId: string;
    decisionId: string;
    workspace: DecisionWorkspace;
    candidateId: string;
  }): Promise<PlanVersion> {
    const existing = await this.store.findBySourceDecision(input.tripId, input.decisionId);
    if (!existing) {
      throw new NotFoundException(`PlanVersion for decision ${input.decisionId} not found`);
    }
    const operations = this.resolveOperations(input.workspace, input.candidateId);
    return this.store.upsert(input.tripId, {
      ...existing,
      operations,
      materializedPlanSnapshotRef: `snap_${existing.planVersionId}_${input.candidateId}`,
    });
  }

  resolveOperations(
    workspace: DecisionWorkspace,
    candidateId: string,
  ): PlanOperation[] {
    if (candidateId === ORIGINAL_CANDIDATE_ID) return [];
    const repair = workspace.repairCandidates.find(
      (c) => c.candidateId === candidateId,
    );
    return repair?.proposedOperations ?? [];
  }
}

export function buildPlanVersionIdempotencyKey(
  tripId: string,
  decisionId: string,
): string {
  return `trip:${tripId}:decision:${decisionId}:apply-plan-version`;
}
