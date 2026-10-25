/**
 * Prisma persistence for KnowledgeDecisionCase (beyond process Map).
 */

import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { KnowledgeDecisionCase } from '../contracts/knowledge-decision-case.types';
import { KNOWLEDGE_DECISION_CASE_SCHEMA } from '../contracts/knowledge-decision-case.types';

const logger = new Logger('KnowledgeDecisionCaseStore');

export function caseToRow(c: KnowledgeDecisionCase) {
  return {
    id: c.caseId,
    episodeId: c.episodeId,
    tripId: c.tripId,
    country: c.country,
    decisionType: c.decisionType,
    situationTags: c.situationTags,
    riskType: c.riskType,
    situationSnapshotId: c.situationSnapshotId,
    userChoiceAction: c.userChoice.action,
    outcomeLabel: c.outcome.label,
    regret: c.regret,
    confidence: c.confidence,
    payload: c as object,
    projectedAt: new Date(c.projectedAt),
  };
}

export function rowToCase(row: {
  id: string;
  payload: unknown;
}): KnowledgeDecisionCase | null {
  const p = row.payload;
  if (!p || typeof p !== 'object') return null;
  const c = p as KnowledgeDecisionCase;
  if (c.schemaId !== KNOWLEDGE_DECISION_CASE_SCHEMA) {
    return { ...c, schemaId: KNOWLEDGE_DECISION_CASE_SCHEMA, caseId: row.id };
  }
  return { ...c, caseId: row.id };
}

export async function upsertKnowledgeDecisionCase(
  prisma: PrismaService,
  c: KnowledgeDecisionCase,
): Promise<boolean> {
  if (!prisma.isDbConnected()) return false;
  try {
    const data = caseToRow(c);
    await prisma.knowledgeDecisionCase.upsert({
      where: { id: c.caseId },
      create: data,
      update: {
        episodeId: data.episodeId,
        tripId: data.tripId,
        country: data.country,
        decisionType: data.decisionType,
        situationTags: data.situationTags,
        riskType: data.riskType,
        situationSnapshotId: data.situationSnapshotId,
        userChoiceAction: data.userChoiceAction,
        outcomeLabel: data.outcomeLabel,
        regret: data.regret,
        confidence: data.confidence,
        payload: data.payload,
        projectedAt: data.projectedAt,
      },
    });
    return true;
  } catch (e) {
    logger.warn(
      `upsert failed (table missing?): ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }
}

export async function loadKnowledgeDecisionCases(
  prisma: PrismaService,
  take = 500,
): Promise<KnowledgeDecisionCase[]> {
  if (!prisma.isDbConnected()) return [];
  try {
    const rows = await prisma.knowledgeDecisionCase.findMany({
      orderBy: { projectedAt: 'desc' },
      take,
    });
    const out: KnowledgeDecisionCase[] = [];
    for (const row of rows) {
      const c = rowToCase(row);
      if (c) out.push({ ...c, durable: true });
    }
    return out;
  } catch (e) {
    logger.warn(
      `load failed (table missing?): ${e instanceof Error ? e.message : e}`,
    );
    return [];
  }
}

export async function querySimilarKnowledgeDecisionCases(
  prisma: PrismaService,
  query: {
    country?: string;
    decisionType?: string;
    situationTags?: string[];
    riskType?: string | null;
    excludeCaseId?: string;
    limit?: number;
  },
): Promise<Array<{ caseId: string; payload: unknown }>> {
  if (!prisma.isDbConnected()) return [];
  try {
    const where: Record<string, unknown> = {};
    if (query.country) where.country = query.country.toUpperCase();
    if (query.decisionType) {
      where.decisionType = { contains: query.decisionType, mode: 'insensitive' };
    }
    if (query.riskType) where.riskType = query.riskType;
    if (query.situationTags?.length) {
      where.situationTags = { hasSome: query.situationTags };
    }
    if (query.excludeCaseId) where.id = { not: query.excludeCaseId };

    return await prisma.knowledgeDecisionCase.findMany({
      where,
      take: Math.min(50, Math.max(1, query.limit ?? 10)),
      orderBy: { projectedAt: 'desc' },
      select: { id: true, payload: true },
    }).then((rows) =>
      rows.map((r) => ({ caseId: r.id, payload: r.payload })),
    );
  } catch (e) {
    logger.warn(
      `similar SQL failed: ${e instanceof Error ? e.message : e}`,
    );
    return [];
  }
}
