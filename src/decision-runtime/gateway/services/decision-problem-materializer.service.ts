/**
 * Decision Problem 物化刷新（快路径）：
 * - collector.collect +（可选）canonical lite seeds → 投影表
 * - 不跑 listProblems 全量因果 enrich（避免 Admin/首刷卡死）
 * - 写路径 invalidate → scheduleRefresh；读 miss → sync refresh
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionProblemCollectorService } from '../../../trips/decision-semantics/collectors/decision-problem.collector';
import { buildPlanningConflictsCacheKey } from '../../../trips/trip-constraint-solver/utils/planning-conflicts-cache-key.util';
import { isDecisionProblemProjectionEnabled } from '../config/decision-problem-projection.config';
import { DecisionProblemProjectionStoreService } from '../persistence/decision-problem-projection.store';
import { CanonicalDecisionEngineAdapter } from '../engines/canonical-decision-engine.adapter';
import {
  mapLegacyDetailToRow,
  projectRowToListItem,
} from '../utils/unified-decision-problem-projection.util';
import { isTerminalDecisionWorkflowStatus, qualifiesForDecisionQueue } from '../utils/decision-queue-admission.util';
import type { UnifiedDecisionProblemListItem } from '../contracts/unified-decision-ui.types';
import type { UnifiedDecisionProblemListView } from '../contracts/unified-decision-ui.types';

/** 旧投影文案兼容：把「首项开始时间偏早」改成用户能懂的说法 */
function rewriteConsumerDecisionListCopy(
  item: UnifiedDecisionProblemListItem,
): UnifiedDecisionProblemListItem {
  const summary = item.summary ?? '';
  if (!/首项开始时间偏早/.test(summary) && item.title !== '同日交通偏紧' && item.title !== '交通时间不足') {
    return item;
  }
  const looksTravel =
    /same_day_travel|inter_day_travel|同日交通|跨天交通|赶不上/.test(
      `${item.semanticKey ?? ''} ${item.problemId} ${item.title}`,
    ) || /首项开始时间偏早/.test(summary);
  if (!looksTravel) return item;

  const nextSummary = summary
    .replace(
      /，首项开始时间偏早/g,
      '，两站时间对不上，赶不上下一站开始时间',
    )
    .replace(
      /，路上要这么久，按当前安排会迟到约 (\d+) 分钟/g,
      '，两站时间对不上，下一站会晚到约 $1 分钟',
    )
    .replace(
      /，路上要这么久，按当前安排赶不上下一站开始时间/g,
      '，两站时间对不上，赶不上下一站开始时间',
    );
  const nextTitle =
    /偏早|赶不上|时间不足/.test(`${item.title} ${summary}`)
      ? item.title.includes('跨天')
        ? '跨天赶不上下一站'
        : '赶不上下一站'
      : item.title === '同日交通偏紧' || item.title === '交通缓冲偏紧'
        ? '两站之间缓冲偏紧'
        : item.title;

  return { ...item, title: nextTitle, summary: nextSummary || item.summary };
}

@Injectable()
export class DecisionProblemMaterializerService {
  private readonly logger = new Logger(DecisionProblemMaterializerService.name);
  private readonly inflight = new Map<string, Promise<UnifiedDecisionProblemListView | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: DecisionProblemProjectionStoreService,
    private readonly collector: DecisionProblemCollectorService,
    private readonly canonical: CanonicalDecisionEngineAdapter,
  ) {}

  async resolveTripRevision(tripId: string): Promise<{
    revision: string;
    name: string | null;
    destination: string | null;
    status: string | null;
  } | null> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        name: true,
        destination: true,
        status: true,
        metadata: true,
        updatedAt: true,
      },
    });
    if (!trip) return null;
    return {
      revision: buildPlanningConflictsCacheKey(trip),
      name: trip.name,
      destination: trip.destination,
      status: trip.status,
    };
  }

  async isFresh(tripId: string): Promise<boolean> {
    if (!isDecisionProblemProjectionEnabled()) return false;
    try {
      const meta = await this.resolveTripRevision(tripId);
      if (!meta) return false;
      const stored = await this.store.getTripRevisionHint(tripId);
      return stored != null && stored === meta.revision;
    } catch (e) {
      if (this.store.isMissingTableError(e)) this.store.warnMissingTable(e);
      return false;
    }
  }

  async tryReadList(
    tripId: string,
    opts?: { queueOnly?: boolean },
  ): Promise<UnifiedDecisionProblemListView | null> {
    if (!isDecisionProblemProjectionEnabled()) return null;
    try {
      const meta = await this.resolveTripRevision(tripId);
      if (!meta) return null;
      const storedRev = await this.store.getTripRevisionHint(tripId);
      if (!storedRev || storedRev !== meta.revision) return null;

      const rows = await this.store.listOpenForTrip(tripId);
      const items = rows
        .map((r) => r.listItemJson)
        .filter((x): x is NonNullable<typeof x> => !!x);

      const fallbackItems: UnifiedDecisionProblemListItem[] = rows
        .filter((r) => !r.listItemJson)
        .map((r) => this.rowFallbackItem(tripId, r));

      const allItemsRaw = [...items, ...fallbackItems].map((item) =>
        rewriteConsumerDecisionListCopy(item),
      );
      const allItems =
        opts?.queueOnly === false
          ? allItemsRaw
          : allItemsRaw.filter((item) =>
              qualifiesForDecisionQueue({
                enforcement: item.enforcement,
                workflowStatus: item.workflowStatus,
                problemId: item.problemId,
                semanticKey: item.semanticKey,
                title: item.title,
                summary: item.summary,
                hasExecutableOptions: (item.actionability?.allowedActions?.length ?? 0) > 0,
                blocksPlan: item.enforcement === 'BLOCK',
                requiresAdjustment: item.enforcement === 'REQUIRE_ADJUSTMENT',
                requiresConfirmation: item.enforcement === 'REQUIRE_CONFIRMATION',
                requiresDecision: item.actionability?.requiresAction === true,
              }),
            );
      const byEnforcement: Record<string, number> = {};
      let actionableCount = 0;
      for (const item of allItems) {
        byEnforcement[item.enforcement] = (byEnforcement[item.enforcement] ?? 0) + 1;
        if (item.actionability?.requiresAction) actionableCount += 1;
      }

      return {
        schemaId: 'tripnara.unified_decision_problems@v2',
        tripId,
        generatedAt: new Date().toISOString(),
        meta: {
          total: allItems.length,
          openCount: allItems.length,
          actionableCount,
          occurrenceCount: allItems.length,
          byEnforcement: byEnforcement as any,
        },
        items: allItems,
      };
    } catch (e) {
      if (this.store.isMissingTableError(e)) this.store.warnMissingTable(e);
      else this.logger.debug(`tryReadList failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async refreshTrip(tripId: string): Promise<UnifiedDecisionProblemListView | null> {
    if (!isDecisionProblemProjectionEnabled()) return null;
    const existing = this.inflight.get(tripId);
    if (existing) return existing;
    const run = this.doRefresh(tripId).finally(() => this.inflight.delete(tripId));
    this.inflight.set(tripId, run);
    return run;
  }

  async persistListView(
    tripId: string,
    view: UnifiedDecisionProblemListView,
  ): Promise<void> {
    if (!isDecisionProblemProjectionEnabled()) return;
    try {
      const meta = await this.resolveTripRevision(tripId);
      if (!meta) return;
      await this.store.replaceTripOpenProblems({
        tripId,
        tripRevision: meta.revision,
        tripName: meta.name,
        tripDestination: meta.destination,
        tripStatus: meta.status,
        items: view.items,
      });
    } catch (e) {
      if (this.store.isMissingTableError(e)) this.store.warnMissingTable(e);
      else {
        this.logger.debug(
          `persistListView failed trip=${tripId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  scheduleRefresh(tripId: string): void {
    if (!isDecisionProblemProjectionEnabled()) return;
    void this.refreshTrip(tripId).catch((e) => {
      this.logger.debug(
        `scheduleRefresh ${tripId} failed: ${e instanceof Error ? e.message : e}`,
      );
    });
  }

  private async doRefresh(tripId: string): Promise<UnifiedDecisionProblemListView | null> {
    try {
      const items = await this.buildItemsFast(tripId);
      const view: UnifiedDecisionProblemListView = {
        schemaId: 'tripnara.unified_decision_problems@v2',
        tripId,
        generatedAt: new Date().toISOString(),
        meta: {
          total: items.length,
          openCount: items.length,
          actionableCount: items.filter((i) => i.actionability?.requiresAction).length,
          occurrenceCount: items.length,
          byEnforcement: {},
        },
        items,
      };
      await this.persistListView(tripId, view);
      this.logger.log(
        `materialized trip=${tripId} problems=${items.length} (collector fast path)`,
      );
      return view;
    } catch (e) {
      if (this.store.isMissingTableError(e)) this.store.warnMissingTable(e);
      else {
        this.logger.warn(
          `materialize failed trip=${tripId}: ${e instanceof Error ? e.message : e}`,
        );
      }
      return null;
    }
  }

  /** 快路径：feasibility collector + canonical titles，无因果 enrich */
  private async buildItemsFast(tripId: string): Promise<UnifiedDecisionProblemListItem[]> {
    const byId = new Map<string, UnifiedDecisionProblemListItem>();

    const collected = await this.collector.collect(tripId, { mode: 'fast' });
    for (const detail of collected.items) {
      const linked = collected.issueByProblemId.get(detail.id);
      const row = mapLegacyDetailToRow(detail, tripId, undefined, linked);
      const item = projectRowToListItem(row, false);
      if (isTerminalDecisionWorkflowStatus(item.workflowStatus)) continue;
      if (
        !qualifiesForDecisionQueue({
          enforcement: item.enforcement,
          workflowStatus: item.workflowStatus,
          problemId: item.problemId,
          semanticKey: item.semanticKey,
          title: item.title,
          summary: item.summary,
          hasExecutableOptions: (item.actionability?.allowedActions?.length ?? 0) > 0,
          blocksPlan: item.enforcement === 'BLOCK',
          requiresAdjustment: item.enforcement === 'REQUIRE_ADJUSTMENT',
          requiresConfirmation: item.enforcement === 'REQUIRE_CONFIRMATION',
          requiresDecision: item.actionability?.requiresAction === true,
        })
      ) {
        continue;
      }
      byId.set(item.problemId, rewriteConsumerDecisionListCopy(item));
    }

    try {
      const seeds = await this.canonical.listProblemSummariesLite(tripId);
      for (const seed of seeds) {
        if (byId.has(seed.problemId)) continue;
        if (['RESOLVED', 'FAILED', 'DISMISSED'].includes(String(seed.status))) continue;
        if (
          !qualifiesForDecisionQueue({
            enforcement: 'REQUIRE_CONFIRMATION',
            workflowStatus: 'WAITING_DECISION',
            problemId: seed.problemId,
            semanticKey: seed.problemId,
            title: seed.title,
            summary: seed.description || seed.title,
            requiresDecision: true,
          })
        ) {
          continue;
        }
        byId.set(
          seed.problemId,
          rewriteConsumerDecisionListCopy({
            problemId: seed.problemId,
            semanticKey: seed.problemId,
            instanceKey: seed.problemId,
            type: seed.type as any,
            dimension: 'UNKNOWN' as any,
            enforcement: 'REQUIRE_CONFIRMATION' as any,
            phase: 'EXECUTION' as any,
            affectsPlan: true,
            workflowStatus: 'WAITING_DECISION' as any,
            executionStatus: 'IDLE' as any,
            title: seed.title,
            summary: seed.description || seed.title,
            scope: { tripId, dayIds: [] },
            evidenceSummary: { count: 0, freshness: 'UNKNOWN' as any },
            actionability: {
              requiresAction: true,
              allowedActions: [],
            },
            occurrenceCount: 1,
            detectors: [],
            origin: 'CANONICAL' as any,
          }),
        );
      }
    } catch {
      // canonical optional
    }

    return [...byId.values()];
  }

  private rowFallbackItem(
    tripId: string,
    r: {
    problemId: string;
    title: string;
    summary: string | null;
    semanticKey: string | null;
    type: string | null;
    dimension: string | null;
    enforcement: string | null;
    workflowStatus: string | null;
    phase: string | null;
    categoryLabel: string | null;
  }): UnifiedDecisionProblemListItem {
    return {
      problemId: r.problemId,
      semanticKey: r.semanticKey ?? r.problemId,
      instanceKey: r.problemId,
      type: (r.type as any) ?? 'UNKNOWN',
      dimension: (r.dimension as any) ?? 'UNKNOWN',
      enforcement: (r.enforcement as any) ?? 'REQUIRE_CONFIRMATION',
      phase: (r.phase as any) ?? 'PLANNING',
      affectsPlan: true,
      workflowStatus: (r.workflowStatus as any) ?? 'WAITING_DECISION',
      executionStatus: 'IDLE' as any,
      title: r.title,
      summary: r.summary ?? '',
      categoryLabel: r.categoryLabel ?? undefined,
      scope: { tripId, dayIds: [] },
      evidenceSummary: { count: 0, freshness: 'UNKNOWN' as any },
      actionability: {
        requiresAction: true,
        allowedActions: [],
      },
      occurrenceCount: 1,
      detectors: [],
      origin: 'FEASIBILITY' as any,
    };
  }
}
