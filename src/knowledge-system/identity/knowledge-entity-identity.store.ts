/**
 * Prisma persistence for Knowledge Entity Identity.
 * DB unavailable → soft-fail（与 DecisionCase store 同模式）。
 */

import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EntityIdentity, EntitySourceRef } from '../contracts/entity-identity.types';

const logger = new Logger('KnowledgeEntityIdentityStore');

export function entityToRow(e: EntityIdentity) {
  return {
    canonicalEntityId: e.canonicalEntityId,
    entityType: e.entityType,
    domain: e.domain,
    displayName: e.displayName ?? null,
    aliases: e.aliases ?? [],
    country: e.country ?? null,
    status: e.status ?? 'ACTIVE',
    description: e.description ?? null,
    properties: (e.properties ?? {}) as object,
    sourceRefs: (e.sourceRefs ?? []) as object,
    origin: e.origin ?? 'ADMIN',
    payload: e as object,
  };
}

export function rowToEntity(row: {
  canonicalEntityId: string;
  entityType: string;
  domain: string;
  displayName: string | null;
  aliases: string[];
  country: string | null;
  status: string;
  description: string | null;
  properties: unknown;
  sourceRefs: unknown;
  origin: string;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): EntityIdentity {
  const fromPayload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Partial<EntityIdentity>)
      : {};
  return {
    ...fromPayload,
    canonicalEntityId: row.canonicalEntityId,
    entityType: row.entityType,
    domain: row.domain as EntityIdentity['domain'],
    displayName: row.displayName ?? fromPayload.displayName,
    aliases: row.aliases?.length ? row.aliases : fromPayload.aliases ?? [],
    country: row.country ?? fromPayload.country,
    status: (row.status as EntityIdentity['status']) ?? 'ACTIVE',
    description: row.description ?? fromPayload.description,
    properties:
      (row.properties as Record<string, unknown>) ?? fromPayload.properties ?? {},
    sourceRefs: (row.sourceRefs as EntitySourceRef[]) ?? fromPayload.sourceRefs ?? [],
    origin: (row.origin as EntityIdentity['origin']) ?? 'ADMIN',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertKnowledgeEntityIdentity(
  prisma: PrismaService,
  e: EntityIdentity,
): Promise<boolean> {
  if (!prisma.isDbConnected()) return false;
  try {
    const data = entityToRow(e);
    await prisma.knowledgeEntityIdentity.upsert({
      where: { canonicalEntityId: e.canonicalEntityId },
      create: data,
      update: {
        entityType: data.entityType,
        domain: data.domain,
        displayName: data.displayName,
        aliases: data.aliases,
        country: data.country,
        status: data.status,
        description: data.description,
        properties: data.properties,
        sourceRefs: data.sourceRefs,
        origin: data.origin,
        payload: data.payload,
      },
    });
    return true;
  } catch (err) {
    logger.warn(
      `upsert identity failed (table missing?): ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

/**
 * Sync upsert that does not overwrite ADMIN rows' displayName/aliases/description
 * unless forceOverwriteAdmin=true.
 */
export async function upsertSyncedIdentity(
  prisma: PrismaService,
  e: EntityIdentity,
  opts?: { forceOverwriteAdmin?: boolean },
): Promise<'created' | 'updated' | 'skipped_admin' | 'failed'> {
  if (!prisma.isDbConnected()) return 'failed';
  try {
    const existing = await prisma.knowledgeEntityIdentity.findUnique({
      where: { canonicalEntityId: e.canonicalEntityId },
    });
    if (existing?.origin === 'ADMIN' && !opts?.forceOverwriteAdmin) {
      // still refresh sourceRefs merge via soft memory path; DB row kept
      return 'skipped_admin';
    }
    const data = entityToRow(e);
    if (!existing) {
      await prisma.knowledgeEntityIdentity.create({ data });
      return 'created';
    }
    await prisma.knowledgeEntityIdentity.update({
      where: { canonicalEntityId: e.canonicalEntityId },
      data: {
        entityType: data.entityType,
        domain: data.domain,
        displayName: data.displayName,
        aliases: data.aliases,
        country: data.country,
        status: data.status,
        description: data.description,
        properties: data.properties,
        sourceRefs: data.sourceRefs,
        origin: data.origin,
        payload: data.payload,
      },
    });
    return 'updated';
  } catch (err) {
    logger.warn(`sync upsert failed: ${err instanceof Error ? err.message : err}`);
    return 'failed';
  }
}

export async function loadKnowledgeEntityIdentities(
  prisma: PrismaService,
): Promise<EntityIdentity[]> {
  if (!prisma.isDbConnected()) return [];
  try {
    const rows = await prisma.knowledgeEntityIdentity.findMany({
      orderBy: { canonicalEntityId: 'asc' },
      take: 20000,
    });
    return rows.map(rowToEntity);
  } catch (err) {
    logger.warn(
      `load identities failed (table missing?): ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }
}

export async function saveOntologyCatalogSnapshot(
  prisma: PrismaService,
  input: {
    id: string;
    catalogVersion: string;
    source: string;
    note?: string;
    typeCount: number;
    attributeCount: number;
    predicateCount: number;
    payload: unknown;
  },
): Promise<boolean> {
  if (!prisma.isDbConnected()) return false;
  try {
    await prisma.knowledgeOntologyCatalogSnapshot.create({
      data: {
        id: input.id,
        catalogVersion: input.catalogVersion,
        source: input.source,
        note: input.note,
        typeCount: input.typeCount,
        attributeCount: input.attributeCount,
        predicateCount: input.predicateCount,
        payload: input.payload as object,
      },
    });
    return true;
  } catch (err) {
    logger.warn(
      `ontology snapshot save failed: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

export async function recordIdentitySyncRun(
  prisma: PrismaService,
  run: {
    id: string;
    sources: string[];
    status: string;
    stats: Record<string, unknown>;
    errorMessage?: string;
    startedAt: Date;
    finishedAt?: Date;
  },
): Promise<boolean> {
  if (!prisma.isDbConnected()) return false;
  try {
    await prisma.knowledgeIdentitySyncRun.create({
      data: {
        id: run.id,
        sources: run.sources,
        status: run.status,
        stats: run.stats as object,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      },
    });
    return true;
  } catch (err) {
    logger.warn(`sync run record failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function listRecentIdentitySyncRuns(prisma: PrismaService, limit = 10) {
  if (!prisma.isDbConnected()) return [];
  try {
    return await prisma.knowledgeIdentitySyncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(50, Math.max(1, limit)),
    });
  } catch {
    return [];
  }
}
