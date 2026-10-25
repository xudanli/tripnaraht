/**
 * Admin 聚合：行程「决策问题」列表（含「同日交通偏紧」等），供 /admin/decision 联查。
 * 优先读 decision_problem_projections 物化表；miss 时按行程触发物化。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionEngineGatewayService } from './decision-engine-gateway.service';
import { DecisionProblemMaterializerService } from './decision-problem-materializer.service';
import {
  DecisionProblemProjectionStoreService,
  isSameDayTravelLike,
} from '../persistence/decision-problem-projection.store';
import { isDecisionProblemProjectionEnabled } from '../config/decision-problem-projection.config';

export type AdminDecisionProblemItem = {
  tripId: string;
  tripName: string | null;
  tripDestination: string | null;
  tripStatus: string | null;
  problemId: string;
  title: string;
  summary?: string;
  semanticKey?: string;
  type?: string;
  dimension?: string;
  workflowStatus?: string;
  phase?: string;
  categoryLabel?: string;
  /** 是否像「同日交通偏紧」一类交通/日程风险 */
  isSameDayTravelLike: boolean;
  source: 'projection' | 'live';
  links: {
    optionsPath: string;
    causalTracePath: string;
    productProblemsPath: string;
    adminDetailPath: string;
  };
};

@Injectable()
export class DecisionProblemsAdminService {
  private readonly logger = new Logger(DecisionProblemsAdminService.name);
  private static readonly PER_TRIP_TIMEOUT_MS = 2_500;
  private static readonly SCAN_CONCURRENCY = 4;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: DecisionEngineGatewayService,
    private readonly projectionStore: DecisionProblemProjectionStoreService,
    private readonly materializer: DecisionProblemMaterializerService,
  ) {}

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timeout ${ms}ms: ${label}`));
      }, ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  private toAdminItem(
    trip: {
      id: string;
      name: string | null;
      destination: string | null;
      status: string | null;
    },
    problem: {
      problemId: string;
      title: string;
      summary?: string;
      semanticKey?: string;
      type?: string;
      dimension?: string;
      workflowStatus?: string;
      phase?: string;
      categoryLabel?: string;
    },
    source: 'projection' | 'live',
  ): AdminDecisionProblemItem {
    const title = problem.title || problem.problemId;
    return {
      tripId: trip.id,
      tripName: trip.name,
      tripDestination: trip.destination,
      tripStatus: trip.status,
      problemId: problem.problemId,
      title,
      summary: problem.summary,
      semanticKey: problem.semanticKey,
      type: problem.type,
      dimension: problem.dimension,
      workflowStatus: problem.workflowStatus,
      phase: problem.phase,
      categoryLabel: problem.categoryLabel,
      isSameDayTravelLike: isSameDayTravelLike({
        title,
        semanticKey: problem.semanticKey,
        problemId: problem.problemId,
      }),
      source,
      links: {
        optionsPath: `/api/decision/admin/decision-problems/${trip.id}/${encodeURIComponent(problem.problemId)}/options`,
        causalTracePath: `/api/decision/admin/decision-problems/${trip.id}/${encodeURIComponent(problem.problemId)}/causal-trace`,
        productProblemsPath: `/api/trips/${trip.id}/decision-problems`,
        adminDetailPath: `/api/decision/admin/decision-problems/${trip.id}/${encodeURIComponent(problem.problemId)}`,
      },
    };
  }

  /**
   * 跨行程或单行程聚合决策问题（含同日交通偏紧等）。
   */
  async listProblems(filters: {
    tripId?: string;
    scanTrips?: number;
    page?: number;
    limit?: number;
    sameDayTravelOnly?: boolean;
    q?: string;
  }): Promise<{
    items: AdminDecisionProblemItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    meta: {
      scannedTrips: number;
      skippedTrips: number;
      source: 'projection' | 'live' | 'mixed' | 'gateway_disabled';
      note: string;
    };
  }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const scanTrips = Math.min(30, Math.max(1, Number(filters.scanTrips) || 10));
    const skip = (page - 1) * limit;

    try {
      this.gateway.assertGatewayEnabled();
    } catch (e: any) {
      this.logger.warn(`Decision gateway unavailable: ${e?.message ?? e}`);
      return {
        items: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        meta: {
          scannedTrips: 0,
          skippedTrips: 0,
          source: 'gateway_disabled',
          note: 'Decision Gateway 未启用或不可用；无法聚合决策问题',
        },
      };
    }

    // 优先物化表（Admin 跨行程扫描必须走索引，不能现算）
    if (isDecisionProblemProjectionEnabled()) {
      try {
        // 单行程且投影过期：先刷新再读
        if (filters.tripId?.trim()) {
          const fresh = await this.materializer.isFresh(filters.tripId.trim());
          if (!fresh) {
            await this.withTimeout(
              this.materializer.refreshTrip(filters.tripId.trim()),
              20_000,
              `admin-refresh ${filters.tripId}`,
            ).catch((e) => {
              this.logger.debug(`admin refresh: ${e?.message ?? e}`);
            });
          }
        }

        const { items: rows, total } = await this.projectionStore.listAdmin({
          tripId: filters.tripId?.trim(),
          sameDayTravelOnly: filters.sameDayTravelOnly,
          isOpen: true,
          q: filters.q,
          skip,
          take: limit,
        });

        // 跨行程且投影为空：对最近行程触发异步物化，本次仍可能空
        if (!filters.tripId && total === 0) {
          const trips = await this.prisma.trip.findMany({
            orderBy: { updatedAt: 'desc' },
            take: scanTrips,
            select: { id: true },
          });
          for (const t of trips) {
            this.materializer.scheduleRefresh(t.id);
          }
        }

        const items = rows.map((r) =>
          this.toAdminItem(
            {
              id: r.tripId,
              name: r.tripName,
              destination: r.tripDestination,
              status: r.tripStatus,
            },
            {
              problemId: r.problemId,
              title: r.title,
              summary: r.summary ?? undefined,
              semanticKey: r.semanticKey ?? undefined,
              type: r.type ?? undefined,
              dimension: r.dimension ?? undefined,
              workflowStatus: r.workflowStatus ?? undefined,
              phase: r.phase ?? undefined,
              categoryLabel: r.categoryLabel ?? undefined,
            },
            'projection',
          ),
        );

        return {
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 0,
          },
          meta: {
            scannedTrips: filters.tripId ? 1 : scanTrips,
            skippedTrips: 0,
            source: 'projection',
            note:
              '本列表优先读 decision_problem_projections 物化表。' +
              '「同日交通偏紧」等在此；编排步骤请用 GET /decision/admin/logs。' +
              (total === 0 && !filters.tripId
                ? ' 投影为空时已对最近行程触发后台物化，请稍后重试。'
                : ''),
          },
        };
      } catch (e: any) {
        if (!this.projectionStore.isMissingTableError(e)) {
          this.logger.warn(`projection admin list failed, fallback live: ${e?.message ?? e}`);
        } else {
          this.projectionStore.warnMissingTable(e);
        }
      }
    }

    // Fallback：旧版 live 扫描（慢）
    return this.listProblemsLiveFallback(filters, page, limit, scanTrips);
  }

  private async listProblemsLiveFallback(
    filters: {
      tripId?: string;
      sameDayTravelOnly?: boolean;
      q?: string;
    },
    page: number,
    limit: number,
    scanTrips: number,
  ) {
    const perTripTimeoutMs = filters.tripId?.trim()
      ? 15_000
      : DecisionProblemsAdminService.PER_TRIP_TIMEOUT_MS;
    const concurrency = DecisionProblemsAdminService.SCAN_CONCURRENCY;

    let trips: Array<{
      id: string;
      name: string | null;
      destination: string | null;
      status: string | null;
    }> = [];

    if (filters.tripId?.trim()) {
      const t = await this.prisma.trip.findUnique({
        where: { id: filters.tripId.trim() },
        select: { id: true, name: true, destination: true, status: true },
      });
      if (t) trips = [t];
    } else {
      trips = await this.prisma.trip.findMany({
        orderBy: { updatedAt: 'desc' },
        take: scanTrips,
        select: { id: true, name: true, destination: true, status: true },
      });
    }

    const collected: AdminDecisionProblemItem[] = [];
    let skippedTrips = 0;
    let cursor = 0;

    const loadTrip = async (trip: (typeof trips)[number]) => {
      try {
        if (filters.tripId?.trim()) {
          const view = await this.withTimeout(
            this.gateway.listProblems(trip.id, { includeDebug: false }),
            perTripTimeoutMs,
            `listProblems ${trip.id}`,
          );
          for (const item of view.items ?? []) {
            collected.push(
              this.toAdminItem(
                trip,
                {
                  problemId: item.problemId,
                  title: item.title,
                  summary: item.summary,
                  semanticKey: item.semanticKey,
                  type: String(item.type ?? ''),
                  dimension: String(item.dimension ?? ''),
                  workflowStatus: String(item.workflowStatus ?? ''),
                  phase: String(item.phase ?? ''),
                  categoryLabel: item.categoryLabel,
                },
                'live',
              ),
            );
          }
          return;
        }

        const seeds = await this.withTimeout(
          this.gateway.listOpenProblemSeedsLite(trip.id),
          perTripTimeoutMs,
          `seeds ${trip.id}`,
        );
        for (const seed of seeds) {
          collected.push(
            this.toAdminItem(
              trip,
              {
                problemId: seed.problemId,
                title: seed.title,
                summary: seed.description,
                type: String(seed.type ?? ''),
                workflowStatus: String(seed.status ?? ''),
              },
              'live',
            ),
          );
        }
      } catch (e: any) {
        skippedTrips += 1;
        this.logger.debug(`Skip trip ${trip.id}: ${e?.message ?? e}`);
      }
    };

    while (cursor < trips.length) {
      const batch = trips.slice(cursor, cursor + concurrency);
      cursor += concurrency;
      await Promise.all(batch.map((trip) => loadTrip(trip)));
    }

    let filtered = collected;
    if (filters.sameDayTravelOnly) {
      filtered = filtered.filter((i) => i.isSameDayTravelLike);
    }
    if (filters.q?.trim()) {
      const q = filters.q.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.summary ?? '').toLowerCase().includes(q) ||
          (i.semanticKey ?? '').toLowerCase().includes(q) ||
          i.tripId.toLowerCase().includes(q) ||
          (i.tripName ?? '').toLowerCase().includes(q),
      );
    }

    filtered.sort((a, b) => {
      if (a.isSameDayTravelLike !== b.isSameDayTravelLike) {
        return a.isSameDayTravelLike ? -1 : 1;
      }
      return a.title.localeCompare(b.title, 'zh');
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
      meta: {
        scannedTrips: trips.length,
        skippedTrips,
        source: 'live' as const,
        note:
          '物化表不可用，已回退 live 扫描（慢）。请执行 migration decision_problem_projections。' +
          (skippedTrips > 0 ? ` 有 ${skippedTrips} 个行程跳过。` : ''),
      },
    };
  }

  async getProblemDetail(tripId: string, problemId: string) {
    this.gateway.assertGatewayEnabled();
    const detail = await this.gateway.getProblem(tripId, problemId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, name: true, destination: true, status: true },
    });
    return {
      trip,
      problem: detail,
      links: {
        optionsPath: `/api/decision/admin/decision-problems/${tripId}/${encodeURIComponent(problemId)}/options`,
        causalTracePath: `/api/decision/admin/decision-problems/${tripId}/${encodeURIComponent(problemId)}/causal-trace`,
        productPath: `/api/trips/${tripId}/decision-problems/${encodeURIComponent(problemId)}`,
      },
    };
  }

  async getOptions(tripId: string, problemId: string) {
    this.gateway.assertGatewayEnabled();
    return this.gateway.getOptions(tripId, problemId);
  }

  async getCausalTrace(tripId: string, problemId: string) {
    this.gateway.assertGatewayEnabled();
    return this.gateway.getCausalTraceReplay(tripId, problemId);
  }
}
