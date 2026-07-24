/**
 * PR-E — PlanVersion persistence (trip.metadata).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { PlanVersion } from '../contracts/plan-version.types';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';

const VERSIONS_KEY = 'rfc001PlanVersions';
const SNAPSHOTS_KEY = 'rfc001PlanSnapshots';
const EXECUTIONS_KEY = 'rfc001PlanVersionExecutions';
const MAX_VERSIONS = 50;
const MAX_SNAPSHOTS = 50;

export interface StoredRfc001PlanVersions {
  items: PlanVersion[];
  effectivePlanVersionId?: string;
  lastUpdatedAt?: string;
}

export interface StoredRfc001PlanSnapshots {
  items: Array<{ snapshotRef: string; payload: unknown; createdAt: string }>;
}

export interface StoredRfc001PlanExecutions {
  keys: Record<
    string,
    { planVersionId: string; decisionId: string; appliedAt: string }
  >;
}

@Injectable()
export class Rfc001PlanVersionStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectivePlanWriteGuard: EffectivePlanWriteGuardService,
  ) {}

  async readBlock(tripId: string): Promise<StoredRfc001PlanVersions> {
    const meta = await this.readMeta(tripId);
    const block = meta[VERSIONS_KEY] as StoredRfc001PlanVersions | undefined;
    return {
      items: block?.items ?? [],
      effectivePlanVersionId: block?.effectivePlanVersionId,
      lastUpdatedAt: block?.lastUpdatedAt,
    };
  }

  async getEffectivePlanVersionId(tripId: string): Promise<string | undefined> {
    return (await this.readBlock(tripId)).effectivePlanVersionId;
  }

  async get(
    tripId: string,
    planVersionId: string,
  ): Promise<PlanVersion | undefined> {
    return (await this.readBlock(tripId)).items.find(
      (v) => v.planVersionId === planVersionId,
    );
  }

  async findBySourceDecision(
    tripId: string,
    decisionId: string,
  ): Promise<PlanVersion | undefined> {
    return (await this.readBlock(tripId)).items.find(
      (v) => v.sourceDecisionId === decisionId,
    );
  }

  async upsert(tripId: string, version: PlanVersion): Promise<PlanVersion> {
    const block = await this.readBlock(tripId);
    const idx = block.items.findIndex((v) => v.planVersionId === version.planVersionId);
    const items =
      idx >= 0
        ? block.items.map((v, i) => (i === idx ? version : v))
        : [...block.items, version].slice(-MAX_VERSIONS);
    await this.writeBlock(tripId, { ...block, items });
    return version;
  }

  async setEffective(
    tripId: string,
    planVersionId: string,
  ): Promise<StoredRfc001PlanVersions> {
    this.effectivePlanWriteGuard.assertSetEffectiveAllowed('Rfc001PlanVersionStoreService.setEffective');
    const block = await this.readBlock(tripId);
    const now = new Date().toISOString();
    const items = block.items.map((v) => {
      if (v.planVersionId === planVersionId) {
        return { ...v, status: 'EFFECTIVE' as const, effectiveAt: now };
      }
      if (v.status === 'EFFECTIVE') {
        return { ...v, status: 'SUPERSEDED' as const };
      }
      return v;
    });
    const next = { items, effectivePlanVersionId: planVersionId };
    await this.writeBlock(tripId, next);
    return next;
  }

  async saveSnapshot(
    tripId: string,
    snapshotRef: string,
    payload: unknown,
  ): Promise<void> {
    const meta = await this.readMeta(tripId);
    const block = (meta[SNAPSHOTS_KEY] as StoredRfc001PlanSnapshots | undefined) ?? {
      items: [],
    };
    const items = [
      ...block.items.filter((s) => s.snapshotRef !== snapshotRef),
      { snapshotRef, payload, createdAt: new Date().toISOString() },
    ].slice(-MAX_SNAPSHOTS);
    await this.writeMeta(tripId, { ...meta, [SNAPSHOTS_KEY]: { items } });
  }

  async getExecution(
    tripId: string,
    idempotencyKey: string,
  ): Promise<{ planVersionId: string; decisionId: string; appliedAt: string } | undefined> {
    const meta = await this.readMeta(tripId);
    const block = meta[EXECUTIONS_KEY] as StoredRfc001PlanExecutions | undefined;
    return block?.keys[idempotencyKey];
  }

  async recordExecution(
    tripId: string,
    idempotencyKey: string,
    entry: { planVersionId: string; decisionId: string },
  ): Promise<void> {
    const meta = await this.readMeta(tripId);
    const block = (meta[EXECUTIONS_KEY] as StoredRfc001PlanExecutions | undefined) ?? {
      keys: {},
    };
    await this.writeMeta(tripId, {
      ...meta,
      [EXECUTIONS_KEY]: {
        keys: {
          ...block.keys,
          [idempotencyKey]: {
            ...entry,
            appliedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  private async writeBlock(
    tripId: string,
    block: Omit<StoredRfc001PlanVersions, 'lastUpdatedAt'>,
  ): Promise<void> {
    const meta = await this.readMeta(tripId);
    await this.writeMeta(tripId, {
      ...meta,
      [VERSIONS_KEY]: {
        ...block,
        lastUpdatedAt: new Date().toISOString(),
      },
    });
  }

  private async readMeta(tripId: string): Promise<Record<string, unknown>> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
  }

  private async writeMeta(
    tripId: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(meta) },
    });
  }
}
