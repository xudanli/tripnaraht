/**
 * Trip.metadata — pending Decision Problem resolutions (Phase 3 SSOT).
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import type { DecisionWriteChain } from '../contracts/unified-decision-ui.types';

const METADATA_KEY = 'decisionProblemResolutions';

export type StoredResolutionStatus =
  | 'PROPOSED'
  | 'AUTHORIZED'
  | 'APPLYING'
  | 'APPLIED'
  | 'VERIFIED'
  | 'FAILED'
  | 'ROLLED_BACK';

export interface StoredDecisionProblemResolution {
  resolutionId: string;
  problemId: string;
  semanticKey?: string;
  selectedActionId: string;
  writeChain: DecisionWriteChain;
  status: StoredResolutionStatus;
  decidedAt: string;
  decidedByUserId: string;
  /** Canonical or Legacy decision record id */
  decisionId?: string;
  actionPlanId?: string;
  idempotencyKey?: string;
  failureMessage?: string;
  acknowledgement?: string[];
  /** Auto-apply metadata for change summary + undo */
  automationMeta?: AutomationResolutionMeta;
}

export interface AutomationResolutionMeta {
  changeSummary: string;
  matchedActionKeys?: string[];
  changeLogId?: string;
  itemsChanged?: number;
  affectedDayNumbers?: number[];
  actionTitle?: string;
  undoActionId?: string;
  appliedAt?: string;
}

export interface DecisionProblemResolutionStoreState {
  byProblemId: Record<string, StoredDecisionProblemResolution>;
}

export function readDecisionProblemResolutionsFromMetadata(
  metadata: unknown,
): Record<string, StoredDecisionProblemResolution> {
  const root = (metadata ?? {}) as Record<string, unknown>;
  const raw = root[METADATA_KEY] as DecisionProblemResolutionStoreState | undefined;
  return { ...(raw?.byProblemId ?? {}) };
}

@Injectable()
export class DecisionProblemResolutionStoreService {
  constructor(private readonly prisma: PrismaService) {}

  read(metadata: unknown): DecisionProblemResolutionStoreState {
    return { byProblemId: readDecisionProblemResolutionsFromMetadata(metadata) };
  }

  async getForProblem(tripId: string, problemId: string): Promise<StoredDecisionProblemResolution | undefined> {
    const byProblemId = await this.listForTrip(tripId);
    return byProblemId[problemId];
  }

  async listForTrip(tripId: string): Promise<Record<string, StoredDecisionProblemResolution>> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return { ...this.read(trip?.metadata).byProblemId };
  }

  async findByIdempotencyKey(
    tripId: string,
    idempotencyKey: string,
  ): Promise<StoredDecisionProblemResolution | undefined> {
    const byProblemId = await this.listForTrip(tripId);
    return Object.values(byProblemId).find((r) => r.idempotencyKey === idempotencyKey);
  }

  async findByResolutionId(
    tripId: string,
    resolutionId: string,
  ): Promise<StoredDecisionProblemResolution | undefined> {
    const byProblemId = await this.listForTrip(tripId);
    return Object.values(byProblemId).find((r) => r.resolutionId === resolutionId);
  }

  async upsert(
    tripId: string,
    resolution: StoredDecisionProblemResolution,
  ): Promise<StoredDecisionProblemResolution> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const state = this.read(meta);
    state.byProblemId[resolution.problemId] = resolution;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: state,
        }),
      },
    });

    return resolution;
  }

  buildResolutionId(problemId: string): string {
    return `res_${problemId}_${randomUUID().slice(0, 8)}`;
  }

  buildIdempotencyKey(tripId: string, problemId: string, actionId: string): string {
    return `resolution:${tripId}:${problemId}:${actionId}`;
  }
}
