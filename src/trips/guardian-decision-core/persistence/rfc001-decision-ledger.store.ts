/**
 * PR-D — persist RFC-001 DecisionRecord + run lineage on trip.metadata.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';

const LEDGER_KEY = 'rfc001DecisionLedger';
const RUNS_KEY = 'rfc001DecisionRuns';
const DECISION_REF_KEY = 'rfc001DecisionRef';
const MAX_DECISIONS = 100;
const MAX_RUNS = 100;

export interface Rfc001DecisionRun {
  runId: string;
  tripId: string;
  problemId: string;
  workspaceId: string;
  decisionId: string;
  shadowMode: boolean;
  humanDecisionRequired: boolean;
  createdAt: string;
}

export interface StoredRfc001DecisionLedger {
  items: Rfc001DecisionRecord[];
  lastUpdatedAt?: string;
}

export interface StoredRfc001DecisionRuns {
  items: Rfc001DecisionRun[];
  lastUpdatedAt?: string;
}

export interface Rfc001DecisionRef {
  decisionId: string;
  problemId: string;
  workspaceId: string;
  runId: string;
  shadowMode: boolean;
  updatedAt: string;
}

@Injectable()
export class Rfc001DecisionLedgerStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async appendDecision(
    tripId: string,
    record: Rfc001DecisionRecord,
  ): Promise<Rfc001DecisionRecord> {
    const block = await this.readLedger(tripId);
    const items = [...block.items, record].slice(-MAX_DECISIONS);
    await this.writeLedger(tripId, { items });
    return record;
  }

  async upsertDecision(
    tripId: string,
    record: Rfc001DecisionRecord,
  ): Promise<Rfc001DecisionRecord> {
    const block = await this.readLedger(tripId);
    const idx = block.items.findIndex((d) => d.decisionId === record.decisionId);
    const items =
      idx >= 0
        ? block.items.map((d, i) => (i === idx ? record : d))
        : [...block.items, record].slice(-MAX_DECISIONS);
    await this.writeLedger(tripId, { items });
    return record;
  }

  async getDecision(
    tripId: string,
    decisionId: string,
  ): Promise<Rfc001DecisionRecord | undefined> {
    return (await this.readLedger(tripId)).items.find(
      (d) => d.decisionId === decisionId,
    );
  }

  async listDecisions(tripId: string): Promise<Rfc001DecisionRecord[]> {
    return (await this.readLedger(tripId)).items;
  }

  async appendRun(
    tripId: string,
    run: Rfc001DecisionRun,
  ): Promise<Rfc001DecisionRun> {
    const block = await this.readRuns(tripId);
    const items = [...block.items, run].slice(-MAX_RUNS);
    await this.writeRuns(tripId, { items });
    return run;
  }

  async getRun(
    tripId: string,
    runId: string,
  ): Promise<Rfc001DecisionRun | undefined> {
    return (await this.readRuns(tripId)).items.find((r) => r.runId === runId);
  }

  async listRuns(tripId: string): Promise<Rfc001DecisionRun[]> {
    return (await this.readRuns(tripId)).items;
  }

  async setDecisionRef(
    tripId: string,
    ref: Omit<Rfc001DecisionRef, 'updatedAt'>,
  ): Promise<Rfc001DecisionRef> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const nextRef: Rfc001DecisionRef = {
      ...ref,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [DECISION_REF_KEY]: nextRef,
        }),
      },
    });
    return nextRef;
  }

  async getDecisionRef(tripId: string): Promise<Rfc001DecisionRef | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    return meta[DECISION_REF_KEY] as Rfc001DecisionRef | undefined;
  }

  private async readLedger(tripId: string): Promise<StoredRfc001DecisionLedger> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[LEDGER_KEY] as StoredRfc001DecisionLedger | undefined;
    return { items: block?.items ?? [], lastUpdatedAt: block?.lastUpdatedAt };
  }

  private async writeLedger(
    tripId: string,
    block: StoredRfc001DecisionLedger,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [LEDGER_KEY]: {
            ...block,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });
  }

  private async readRuns(tripId: string): Promise<StoredRfc001DecisionRuns> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[RUNS_KEY] as StoredRfc001DecisionRuns | undefined;
    return { items: block?.items ?? [], lastUpdatedAt: block?.lastUpdatedAt };
  }

  private async writeRuns(
    tripId: string,
    block: StoredRfc001DecisionRuns,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [RUNS_KEY]: {
            ...block,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });
  }
}
