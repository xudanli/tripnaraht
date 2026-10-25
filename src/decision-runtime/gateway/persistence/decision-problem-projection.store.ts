/**
 * Decision Problem 物化投影读写 — decision_problem_projections
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { UnifiedDecisionProblemListItem } from '../contracts/unified-decision-ui.types';

export type DecisionProblemProjectionRow = {
  tripId: string;
  problemId: string;
  title: string;
  summary: string | null;
  semanticKey: string | null;
  issueKind: string | null;
  type: string | null;
  dimension: string | null;
  workflowStatus: string | null;
  phase: string | null;
  categoryLabel: string | null;
  enforcement: string | null;
  isOpen: boolean;
  isSameDayTravel: boolean;
  tripRevision: string;
  tripName: string | null;
  tripDestination: string | null;
  tripStatus: string | null;
  listItemJson: UnifiedDecisionProblemListItem | null;
  materializedAt: Date;
  updatedAt: Date;
};

export function extractIssueKind(
  semanticKey?: string | null,
  problemId?: string | null,
  type?: string | null,
): string | null {
  const blob = `${semanticKey ?? ''} ${problemId ?? ''} ${type ?? ''}`.toLowerCase();
  const known = [
    'same_day_travel',
    'inter_day_travel',
    'time_conflict',
    'excessive_daily_load',
    'weather',
    'road_closure',
    'road_status',
  ];
  for (const k of known) {
    if (blob.includes(k)) return k;
  }
  const m = blob.match(/travel:([a-z0-9_]+)/);
  return m?.[1] ?? null;
}

export function isSameDayTravelLike(input: {
  title?: string | null;
  semanticKey?: string | null;
  problemId?: string | null;
  issueKind?: string | null;
}): boolean {
  if (input.issueKind === 'same_day_travel') return true;
  const blob = `${input.title ?? ''} ${input.semanticKey ?? ''} ${input.problemId ?? ''}`;
  return /同日交通偏紧|交通偏紧|same_day_travel/i.test(blob);
}

function stripCausalForStorage(
  item: UnifiedDecisionProblemListItem,
): UnifiedDecisionProblemListItem {
  const {
    causalStoryView: _a,
    guardianCausalStoryView: _b,
    travelCausalDecision: _c,
    causalDecisionCard: _d,
    causalTraceRef: _e,
    debug: _f,
    ...rest
  } = item;
  return rest;
}

@Injectable()
export class DecisionProblemProjectionStoreService {
  private readonly logger = new Logger(DecisionProblemProjectionStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTripRevisionHint(tripId: string): Promise<string | null> {
    const row = await this.prisma.decisionProblemProjection.findFirst({
      where: { tripId },
      select: { tripRevision: true },
      orderBy: { materializedAt: 'desc' },
    });
    return row?.tripRevision ?? null;
  }

  async listOpenForTrip(tripId: string): Promise<DecisionProblemProjectionRow[]> {
    const rows = await this.prisma.decisionProblemProjection.findMany({
      where: { tripId, isOpen: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.mapRow(r));
  }

  async listAdmin(filters: {
    tripId?: string;
    sameDayTravelOnly?: boolean;
    isOpen?: boolean;
    q?: string;
    skip: number;
    take: number;
  }): Promise<{ items: DecisionProblemProjectionRow[]; total: number }> {
    const where: Prisma.DecisionProblemProjectionWhereInput = {};
    if (filters.tripId) where.tripId = filters.tripId;
    if (filters.sameDayTravelOnly) where.isSameDayTravel = true;
    if (filters.isOpen !== false) where.isOpen = true;
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
        { semanticKey: { contains: q, mode: 'insensitive' } },
        { tripId: { contains: q } },
        { tripName: { contains: q, mode: 'insensitive' } },
        { problemId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.decisionProblemProjection.count({ where }),
      this.prisma.decisionProblemProjection.findMany({
        where,
        orderBy: [{ isSameDayTravel: 'desc' }, { updatedAt: 'desc' }],
        skip: filters.skip,
        take: filters.take,
      }),
    ]);
    return { items: rows.map((r) => this.mapRow(r)), total };
  }

  /**
   * 用一次物化结果替换该行程开放问题集合：upsert 当前 items，其余旧开放行标 isOpen=false。
   */
  async replaceTripOpenProblems(input: {
    tripId: string;
    tripRevision: string;
    tripName: string | null;
    tripDestination: string | null;
    tripStatus: string | null;
    items: UnifiedDecisionProblemListItem[];
  }): Promise<{ upserted: number; closed: number }> {
    const now = new Date();
    const openIds = new Set(input.items.map((i) => i.problemId));

    await this.prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        const issueKind = extractIssueKind(item.semanticKey, item.problemId, String(item.type ?? ''));
        const sameDay = isSameDayTravelLike({
          title: item.title,
          semanticKey: item.semanticKey,
          problemId: item.problemId,
          issueKind,
        });
        const data = {
          title: (item.title || item.problemId).slice(0, 500),
          summary: item.summary ?? null,
          semanticKey: item.semanticKey ?? null,
          issueKind,
          type: item.type ? String(item.type).slice(0, 64) : null,
          dimension: item.dimension ? String(item.dimension).slice(0, 64) : null,
          workflowStatus: item.workflowStatus
            ? String(item.workflowStatus).slice(0, 64)
            : null,
          phase: item.phase ? String(item.phase).slice(0, 64) : null,
          categoryLabel: item.categoryLabel?.slice(0, 128) ?? null,
          enforcement: item.enforcement ? String(item.enforcement).slice(0, 64) : null,
          isOpen: true,
          isSameDayTravel: sameDay,
          tripRevision: input.tripRevision,
          tripName: input.tripName,
          tripDestination: input.tripDestination,
          tripStatus: input.tripStatus,
          listItemJson: stripCausalForStorage(item) as unknown as Prisma.InputJsonValue,
          materializedAt: now,
        };

        await tx.decisionProblemProjection.upsert({
          where: {
            tripId_problemId: {
              tripId: input.tripId,
              problemId: item.problemId,
            },
          },
          create: {
            tripId: input.tripId,
            problemId: item.problemId,
            ...data,
          },
          update: data,
        });
      }

      if (openIds.size === 0) {
        await tx.decisionProblemProjection.updateMany({
          where: { tripId: input.tripId, isOpen: true },
          data: {
            isOpen: false,
            tripRevision: input.tripRevision,
            materializedAt: now,
          },
        });
      } else {
        await tx.decisionProblemProjection.updateMany({
          where: {
            tripId: input.tripId,
            isOpen: true,
            problemId: { notIn: [...openIds] },
          },
          data: {
            isOpen: false,
            tripRevision: input.tripRevision,
            materializedAt: now,
          },
        });
      }
    });

    return { upserted: input.items.length, closed: 0 };
  }

  private mapRow(r: {
    tripId: string;
    problemId: string;
    title: string;
    summary: string | null;
    semanticKey: string | null;
    issueKind: string | null;
    type: string | null;
    dimension: string | null;
    workflowStatus: string | null;
    phase: string | null;
    categoryLabel: string | null;
    enforcement: string | null;
    isOpen: boolean;
    isSameDayTravel: boolean;
    tripRevision: string;
    tripName: string | null;
    tripDestination: string | null;
    tripStatus: string | null;
    listItemJson: Prisma.JsonValue | null;
    materializedAt: Date;
    updatedAt: Date;
  }): DecisionProblemProjectionRow {
    return {
      tripId: r.tripId,
      problemId: r.problemId,
      title: r.title,
      summary: r.summary,
      semanticKey: r.semanticKey,
      issueKind: r.issueKind,
      type: r.type,
      dimension: r.dimension,
      workflowStatus: r.workflowStatus,
      phase: r.phase,
      categoryLabel: r.categoryLabel,
      enforcement: r.enforcement,
      isOpen: r.isOpen,
      isSameDayTravel: r.isSameDayTravel,
      tripRevision: r.tripRevision,
      tripName: r.tripName,
      tripDestination: r.tripDestination,
      tripStatus: r.tripStatus,
      listItemJson: (r.listItemJson as unknown as UnifiedDecisionProblemListItem | null) ?? null,
      materializedAt: r.materializedAt,
      updatedAt: r.updatedAt,
    };
  }

  /** 表未迁移时吞掉，让读路径回退现算 */
  isMissingTableError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      msg.includes('decision_problem_projections') &&
      (msg.includes('does not exist') ||
        msg.includes('P2021') ||
        msg.includes('Unknown arg') ||
        msg.includes('decisionProblemProjection'))
    );
  }

  logMissingTableOnce = false;
  warnMissingTable(e: unknown): void {
    if (this.logMissingTableOnce) return;
    this.logMissingTableOnce = true;
    this.logger.warn(
      `decision_problem_projections unavailable (migrate?): ${e instanceof Error ? e.message : e}`,
    );
  }
}
