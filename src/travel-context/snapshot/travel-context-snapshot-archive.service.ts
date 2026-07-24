import { createHash } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID } from '../domain/travel-context.constants';
import type { TravelContextSnapshot } from '../domain/travel-context.types';

const MAX_ARCHIVES_PER_CONTEXT = 32;

export type TravelContextArchiveSource = 'INTENT' | 'ASSEMBLE' | 'REPLAY';

export interface TravelContextSnapshotArchiveMeta {
  archiveSource: TravelContextArchiveSource;
  intentType?: string;
}

export interface TravelContextSnapshotArchiveHead {
  contextId: string;
  revision: number;
  snapshotId: string;
  schemaId: string;
  stage: string;
  archiveSource: string;
  intentType?: string | null;
  createdAt: string;
}

function archiveReadEnabled(): boolean {
  const flag = process.env.TRAVEL_CONTEXT_SNAPSHOT_ARCHIVE_READ?.trim();
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  return flag === '1' || flag === 'true' || flag === 'yes' || process.env.NODE_ENV === 'production';
}

function archiveMemoryOnly(): boolean {
  const flag = process.env.TRAVEL_CONTEXT_SNAPSHOT_ARCHIVE_MEMORY?.trim();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function bindingsFingerprint(snapshot: TravelContextSnapshot): string {
  const payload = JSON.stringify({
    constraintsVersion: snapshot.meta.bindings.constraintsVersion,
    effectivePlanVersionId: snapshot.meta.bindings.effectivePlanVersionId ?? null,
    worldStateVersion: snapshot.meta.bindings.worldStateVersion,
    stage: snapshot.identity.stage,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function parseSnapshot(raw: unknown): TravelContextSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as TravelContextSnapshot;
  if (snap.schemaId !== TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID) return null;
  if (!snap.identity?.contextId || !snap.meta?.revision) return null;
  return snap;
}

@Injectable()
export class TravelContextSnapshotArchiveService {
  private readonly logger = new Logger(TravelContextSnapshotArchiveService.name);
  private readonly memoryStore = new Map<string, TravelContextSnapshot>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  isReadCacheEnabled(): boolean {
    return archiveReadEnabled();
  }

  async archive(
    snapshot: TravelContextSnapshot,
    meta: TravelContextSnapshotArchiveMeta,
  ): Promise<void> {
    const key = this.memoryKey(snapshot.identity.contextId, snapshot.meta.revision);
    this.memoryStore.set(key, snapshot);

    if (!this.prisma || archiveMemoryOnly()) {
      return;
    }

    try {
      await this.prisma.travelContextSnapshotArchiveEntry.upsert({
        where: {
          contextId_revision: {
            contextId: snapshot.identity.contextId,
            revision: BigInt(snapshot.meta.revision),
          },
        },
        create: {
          contextId: snapshot.identity.contextId,
          revision: BigInt(snapshot.meta.revision),
          snapshotId: snapshot.meta.snapshotId,
          schemaId: snapshot.schemaId,
          stage: snapshot.identity.stage,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          bindingsFingerprint: bindingsFingerprint(snapshot),
          archiveSource: meta.archiveSource,
          intentType: meta.intentType ?? null,
        },
        update: {
          snapshotId: snapshot.meta.snapshotId,
          schemaId: snapshot.schemaId,
          stage: snapshot.identity.stage,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          bindingsFingerprint: bindingsFingerprint(snapshot),
          archiveSource: meta.archiveSource,
          intentType: meta.intentType ?? null,
        },
      });
      await this.pruneOldEntries(snapshot.identity.contextId);
    } catch (err) {
      this.logger.warn(
        `Failed to persist snapshot archive for ${snapshot.identity.contextId}@${snapshot.meta.revision}: ${String(err)}`,
      );
    }
  }

  async getByRevision(
    contextId: string,
    revision: number,
  ): Promise<TravelContextSnapshot | null> {
    const memory = this.memoryStore.get(this.memoryKey(contextId, revision));
    if (memory) return memory;

    if (!this.prisma || archiveMemoryOnly()) {
      return null;
    }

    try {
      const row = await this.prisma.travelContextSnapshotArchiveEntry.findUnique({
        where: {
          contextId_revision: {
            contextId,
            revision: BigInt(revision),
          },
        },
        select: { snapshot: true },
      });
      const parsed = parseSnapshot(row?.snapshot);
      if (parsed) {
        this.memoryStore.set(this.memoryKey(contextId, revision), parsed);
      }
      return parsed;
    } catch (err) {
      this.logger.warn(`Failed to load snapshot archive ${contextId}@${revision}: ${String(err)}`);
      return null;
    }
  }

  async tryLoadCached(
    contextId: string,
    revision: number,
    expectedFingerprint?: string,
  ): Promise<TravelContextSnapshot | null> {
    if (!this.isReadCacheEnabled()) return null;

    const snapshot = await this.getByRevision(contextId, revision);
    if (!snapshot) return null;

    if (expectedFingerprint && bindingsFingerprint(snapshot) !== expectedFingerprint) {
      return null;
    }

    return snapshot;
  }

  async listHeads(contextId: string, limit = 10): Promise<TravelContextSnapshotArchiveHead[]> {
    if (!this.prisma || archiveMemoryOnly()) {
      return [...this.memoryStore.entries()]
        .filter(([key]) => key.startsWith(`${contextId}:`))
        .map(([, snap]) => this.toHead(snap, 'MEMORY'))
        .sort((a, b) => b.revision - a.revision)
        .slice(0, limit);
    }

    const rows = await this.prisma.travelContextSnapshotArchiveEntry.findMany({
      where: { contextId },
      orderBy: { revision: 'desc' },
      take: limit,
      select: {
        contextId: true,
        revision: true,
        snapshotId: true,
        schemaId: true,
        stage: true,
        archiveSource: true,
        intentType: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      contextId: row.contextId,
      revision: Number(row.revision),
      snapshotId: row.snapshotId,
      schemaId: row.schemaId,
      stage: row.stage,
      archiveSource: row.archiveSource,
      intentType: row.intentType,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private toHead(
    snapshot: TravelContextSnapshot,
    archiveSource: string,
  ): TravelContextSnapshotArchiveHead {
    return {
      contextId: snapshot.identity.contextId,
      revision: snapshot.meta.revision,
      snapshotId: snapshot.meta.snapshotId,
      schemaId: snapshot.schemaId,
      stage: snapshot.identity.stage,
      archiveSource,
      createdAt: snapshot.meta.generatedAt,
    };
  }

  private memoryKey(contextId: string, revision: number): string {
    return `${contextId}:${revision}`;
  }

  private async pruneOldEntries(contextId: string): Promise<void> {
    if (!this.prisma) return;

    const excess = await this.prisma.travelContextSnapshotArchiveEntry.findMany({
      where: { contextId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, contextId: true, revision: true },
      skip: MAX_ARCHIVES_PER_CONTEXT,
    });

    if (excess.length === 0) return;

    await this.prisma.travelContextSnapshotArchiveEntry.deleteMany({
      where: { id: { in: excess.map((row) => row.id) } },
    });

    for (const row of excess) {
      this.memoryStore.delete(this.memoryKey(row.contextId, Number(row.revision)));
    }
  }
}
