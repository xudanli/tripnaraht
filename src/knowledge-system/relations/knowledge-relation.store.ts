/**
 * Prisma persistence for KnowledgeRelation.
 * DB unavailable → soft-fail（与 Identity / DecisionCase store 同模式）。
 */

import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  PROJECTED_RELATION_SOURCES,
  type KnowledgeRelation,
  type KnowledgeRelationSource,
  type KnowledgeRelationType,
} from '../contracts/knowledge-relation.types';

const logger = new Logger('KnowledgeRelationStore');

const PROJECTED = [...PROJECTED_RELATION_SOURCES];

export function relationToRow(r: KnowledgeRelation) {
  return {
    relationId: r.relationId.slice(0, 255),
    type: r.type,
    fromId: r.from.slice(0, 191),
    toId: r.to.slice(0, 191),
    confidence: r.confidence,
    source: r.source,
    sourceRef: r.sourceRef?.slice(0, 255) ?? null,
    country: r.country ?? null,
    validFrom: r.validFrom ? new Date(r.validFrom) : null,
    validTo: r.validTo ? new Date(r.validTo) : null,
    metadata: (r.metadata ?? {}) as object,
    condition: (r.condition ?? {}) as object,
    payload: r as object,
  };
}

export function rowToRelation(row: {
  relationId: string;
  type: string;
  fromId: string;
  toId: string;
  confidence: number;
  source: string;
  sourceRef: string | null;
  country: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  metadata: unknown;
  condition: unknown;
  payload: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}): KnowledgeRelation {
  const fromPayload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Partial<KnowledgeRelation>)
      : {};
  return {
    ...fromPayload,
    relationId: row.relationId,
    type: row.type as KnowledgeRelationType,
    from: row.fromId,
    to: row.toId,
    confidence: row.confidence,
    source: row.source as KnowledgeRelationSource,
    sourceRef: row.sourceRef ?? fromPayload.sourceRef,
    country: row.country ?? fromPayload.country,
    validFrom: row.validFrom?.toISOString() ?? fromPayload.validFrom,
    validTo: row.validTo?.toISOString() ?? fromPayload.validTo,
    metadata:
      (row.metadata as Record<string, unknown> | null) ?? fromPayload.metadata,
    condition:
      (row.condition as Record<string, unknown> | null) ?? fromPayload.condition,
    createdAt: row.createdAt?.toISOString() ?? fromPayload.createdAt,
    updatedAt: row.updatedAt?.toISOString() ?? fromPayload.updatedAt,
  };
}

export async function loadKnowledgeRelations(
  prisma: PrismaService,
  take = 20000,
): Promise<KnowledgeRelation[]> {
  if (!prisma.isDbConnected()) return [];
  try {
    const rows = await prisma.knowledgeRelation.findMany({
      orderBy: { relationId: 'asc' },
      take,
    });
    return rows.map(rowToRelation);
  } catch (err) {
    logger.warn(
      `load relations failed (table missing?): ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }
}

export async function upsertKnowledgeRelation(
  prisma: PrismaService,
  r: KnowledgeRelation,
): Promise<boolean> {
  if (!prisma.isDbConnected()) return false;
  try {
    const data = relationToRow(r);
    await prisma.knowledgeRelation.upsert({
      where: { relationId: data.relationId },
      create: data,
      update: {
        type: data.type,
        fromId: data.fromId,
        toId: data.toId,
        confidence: data.confidence,
        source: data.source,
        sourceRef: data.sourceRef,
        country: data.country,
        validFrom: data.validFrom,
        validTo: data.validTo,
        metadata: data.metadata,
        condition: data.condition,
        payload: data.payload,
      },
    });
    return true;
  } catch (err) {
    logger.warn(
      `upsert relation failed: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

export async function deleteKnowledgeRelation(
  prisma: PrismaService,
  relationId: string,
): Promise<boolean> {
  if (!prisma.isDbConnected()) return false;
  try {
    await prisma.knowledgeRelation.delete({ where: { relationId } });
    return true;
  } catch (err) {
    logger.warn(
      `delete relation failed: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

/**
 * Upsert adapter-projected rows (preserve created_at); leave `manual` untouched.
 */
export async function persistProjectedKnowledgeRelations(
  prisma: PrismaService,
  relations: KnowledgeRelation[],
): Promise<{ upserted: number; deleted: number }> {
  if (!prisma.isDbConnected()) return { upserted: 0, deleted: 0 };
  try {
    const projected = relations.filter((r) =>
      (PROJECTED_RELATION_SOURCES as readonly string[]).includes(r.source),
    );
    const rows = projected.map(relationToRow);
    const keep = new Set(rows.map((r) => r.relationId));
    const existing = await prisma.knowledgeRelation.findMany({
      where: { source: { in: PROJECTED } },
      select: { relationId: true },
    });
    const staleIds = existing
      .map((e) => e.relationId)
      .filter((id) => !keep.has(id));

    let upserted = 0;
    const chunkSize = 40;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map((data) =>
          prisma.knowledgeRelation.upsert({
            where: { relationId: data.relationId },
            create: data,
            update: {
              type: data.type,
              fromId: data.fromId,
              toId: data.toId,
              confidence: data.confidence,
              source: data.source,
              sourceRef: data.sourceRef,
              country: data.country,
              validFrom: data.validFrom,
              validTo: data.validTo,
              metadata: data.metadata,
              condition: data.condition,
              payload: data.payload,
            },
          }),
        ),
      );
      upserted += chunk.length;
    }

    let deleted = 0;
    for (let i = 0; i < staleIds.length; i += 200) {
      const chunk = staleIds.slice(i, i + 200);
      const result = await prisma.knowledgeRelation.deleteMany({
        where: { relationId: { in: chunk } },
      });
      deleted += result.count;
    }
    return { upserted, deleted };
  } catch (err) {
    logger.warn(
      `persist relations failed (table missing?): ${err instanceof Error ? err.message : err}`,
    );
    return { upserted: 0, deleted: 0 };
  }
}

export async function maxRelationUpdatedAt(
  prisma: PrismaService,
): Promise<Date | null> {
  if (!prisma.isDbConnected()) return null;
  try {
    const row = await prisma.knowledgeRelation.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    return row?.updatedAt ?? null;
  } catch {
    return null;
  }
}
