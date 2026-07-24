/**
 * Lightweight DecisionRecord persistence in Trip.metadata.decisionSemantics.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  DecisionOutcomeValidation,
  DecisionProblemResolution,
  DecisionRecord,
  TripMutationSet,
} from '../types/decision-semantics.types';

const METADATA_KEY = 'decisionSemantics';
const MAX_RECORDS = 100;

export interface StoredDecisionSemanticsMeta {
  records?: DecisionRecord[];
  lastUpdatedAt?: string;
  /** nodeId → decisionId reverse index (mirrors ledger caused_by edges) */
  ledgerNodeToDecisionId?: Record<string, string>;
  /** User decisions that marked problems resolved (survives until source re-detects) */
  resolvedProblems?: import('../types/decision-semantics.types').DecisionProblemResolution[];
}

const MAX_RESOLVED_PROBLEMS = 200;

@Injectable()
export class DecisionRecordStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async appendRecord(
    tripId: string,
    record: DecisionRecord,
    opts?: { ledgerCausality?: Record<string, string> },
  ): Promise<DecisionRecord> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const block = (meta[METADATA_KEY] as StoredDecisionSemanticsMeta) ?? {};
    const records = [...(block.records ?? []), record].slice(-MAX_RECORDS);
    const ledgerNodeToDecisionId = {
      ...(block.ledgerNodeToDecisionId ?? {}),
      ...(opts?.ledgerCausality ?? {}),
    };

    const nextMeta = {
      ...meta,
      [METADATA_KEY]: {
        ...block,
        records,
        ledgerNodeToDecisionId,
        lastUpdatedAt: new Date().toISOString(),
      },
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(nextMeta) },
    });

    return record;
  }

  async listRecords(tripId: string): Promise<DecisionRecord[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as StoredDecisionSemanticsMeta | undefined;
    return block?.records ?? [];
  }

  /** Effective decision previously registered under idempotencyKey (excludes replay audit rows). */
  async findEffectiveByIdempotencyKey(
    tripId: string,
    idempotencyKey: string,
  ): Promise<DecisionRecord | undefined> {
    const key = idempotencyKey.trim();
    if (!key) return undefined;
    const records = await this.listRecords(tripId);
    for (let i = records.length - 1; i >= 0; i -= 1) {
      const r = records[i];
      if (r.idempotencyKey !== key) continue;
      if (r.recordKind === 'IDEMPOTENT_REPLAY_AUDIT') continue;
      if (r.status === 'SUPERSEDED') continue;
      return r;
    }
    return undefined;
  }

  async getRecord(tripId: string, decisionId: string): Promise<DecisionRecord | undefined> {
    return (await this.listRecords(tripId)).find((r) => r.id === decisionId);
  }

  async resolveDecisionForLedgerNode(
    tripId: string,
    ledgerNodeId: string,
  ): Promise<{ decisionId: string; record?: DecisionRecord } | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as StoredDecisionSemanticsMeta | undefined;
    const decisionId = block?.ledgerNodeToDecisionId?.[ledgerNodeId];
    if (!decisionId) return undefined;
    const record = block?.records?.find((r) => r.id === decisionId);
    return { decisionId, record };
  }

  async getLedgerCausalityIndex(tripId: string): Promise<Record<string, string>> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as StoredDecisionSemanticsMeta | undefined;
    return block?.ledgerNodeToDecisionId ?? {};
  }

  async updateRecord(
    tripId: string,
    decisionId: string,
    patch: Partial<DecisionRecord>,
  ): Promise<DecisionRecord | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const block = (meta[METADATA_KEY] as StoredDecisionSemanticsMeta) ?? {};
    const records = block.records ?? [];
    const idx = records.findIndex((r) => r.id === decisionId);
    if (idx < 0) return undefined;

    const updated: DecisionRecord = { ...records[idx], ...patch };
    records[idx] = updated;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: {
            ...block,
            records,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });

    return updated;
  }

  async listProblemResolutions(tripId: string): Promise<DecisionProblemResolution[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as StoredDecisionSemanticsMeta | undefined;
    return block?.resolvedProblems ?? [];
  }

  async markProblemResolved(
    tripId: string,
    resolution: DecisionProblemResolution,
  ): Promise<DecisionProblemResolution> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const block = (meta[METADATA_KEY] as StoredDecisionSemanticsMeta) ?? {};
    const withoutDup = (block.resolvedProblems ?? []).filter(
      (r) => r.semanticKey !== resolution.semanticKey && r.problemId !== resolution.problemId,
    );
    const resolvedProblems = [...withoutDup, resolution].slice(-MAX_RESOLVED_PROBLEMS);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: {
            ...block,
            resolvedProblems,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });

    return resolution;
  }

  async removeProblemResolutionsBySemanticKeys(
    tripId: string,
    semanticKeys: string[],
  ): Promise<void> {
    if (!semanticKeys.length) return;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const block = (meta[METADATA_KEY] as StoredDecisionSemanticsMeta) ?? {};
    const keySet = new Set(semanticKeys);
    const resolvedProblems = (block.resolvedProblems ?? []).filter((r) => !keySet.has(r.semanticKey));

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: {
            ...block,
            resolvedProblems,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });
  }

  buildRecord(input: {
    tripId: string;
    problemId: string;
    selectedOptionId: string;
    rejectedOptionIds?: string[];
    authoritySnapshot: DecisionRecord['authoritySnapshot'];
    reasons?: DecisionRecord['reasons'];
    tripVersionBefore: string;
    tripVersionAfter?: string;
    predictedImpact?: DecisionRecord['predictedImpact'];
    actualMutation?: TripMutationSet;
    status?: DecisionRecord['status'];
  }): DecisionRecord {
    return {
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tripId: input.tripId,
      problemId: input.problemId,
      selectedOptionId: input.selectedOptionId,
      rejectedOptionIds: input.rejectedOptionIds ?? [],
      decidedBy: [{ role: 'TRIP_OWNER' }],
      authoritySnapshot: input.authoritySnapshot,
      reasons: input.reasons ?? [],
      decidedAt: new Date().toISOString(),
      tripVersionBefore: input.tripVersionBefore,
      tripVersionAfter: input.tripVersionAfter,
      predictedImpact: input.predictedImpact,
      actualMutation: input.actualMutation,
      status: input.status ?? 'PROPOSED',
      validationStatus: 'PENDING',
    };
  }
}
