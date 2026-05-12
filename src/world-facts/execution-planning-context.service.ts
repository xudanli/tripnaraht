import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorldFactResolverService } from './world-fact-resolver.service';
import type { ExecutionPlanningContext } from './execution-planning-context.types';
import type { TripDecisionExecutionHistoryEntry } from './decision-execution-sync.types';

/**
 * P5：结构化读取 Trip 执行历史 + World 派生 dispatch 信号，供 Planner（RD Selector）消费。
 */
@Injectable()
export class ExecutionPlanningContextService {
  private readonly logger = new Logger(ExecutionPlanningContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: WorldFactResolverService,
  ) {}

  async loadContext(params: {
    tripId?: string;
    countryCode: string;
  }): Promise<ExecutionPlanningContext | null> {
    const cc = params.countryCode?.trim().toUpperCase();
    if (!cc) return null;

    const hints = {
      routeDegradeCountByRouteDirectionId: {} as Record<string, number>,
      ambientDegradeEvents: 0,
    };

    let tripExecutionHistory: TripDecisionExecutionHistoryEntry[] = [];

    const tid = params.tripId?.trim();
    if (tid) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tid },
          select: { metadata: true },
        });
        const meta = (trip?.metadata as Record<string, unknown> | null) ?? null;
        const raw = meta?.['decisionExecutionHistory'];
        if (Array.isArray(raw)) {
          tripExecutionHistory = (raw as TripDecisionExecutionHistoryEntry[]).filter(
            (e) => String(e.countryCode).toUpperCase() === cc,
          );
        }
      } catch (e: any) {
        this.logger.warn(`loadContext trip read failed: ${e?.message ?? e}`);
      }

      for (const e of tripExecutionHistory) {
        if (!e.hadSuccessfulDispatch) continue;
        const hasDegrade = e.traceSummary?.some(
          (t) => t.actionType === 'ROUTE_DEGRADE' && t.status === 'SUCCESS',
        );
        if (!hasDegrade) continue;
        if (e.routeDirectionId) {
          const k = String(e.routeDirectionId);
          hints.routeDegradeCountByRouteDirectionId[k] =
            (hints.routeDegradeCountByRouteDirectionId[k] ?? 0) + 1;
        } else {
          hints.ambientDegradeEvents += 1;
        }
      }
    }

    let lastCountryDispatchFact: ExecutionPlanningContext['lastCountryDispatchFact'];

    try {
      const resolved = await this.resolver.resolveLatestByFactKey(
        `country:${cc}:execution_route_dispatch_last`,
      );
      if (resolved?.fact?.valueJson && typeof resolved.fact.valueJson === 'object') {
        const v = resolved.fact.valueJson as Record<string, unknown>;
        const traces = v['traces'] as Array<{ status?: string; actionType?: string }> | undefined;
        const ok = traces?.some((t) => t.actionType === 'ROUTE_DEGRADE' && t.status === 'SUCCESS');
        if (ok) {
          hints.ambientDegradeEvents += 1;
        }
        lastCountryDispatchFact = {
          factId: resolved.fact.id,
          observedAt:
            resolved.fact.observedAt instanceof Date
              ? resolved.fact.observedAt.toISOString()
              : resolved.fact.observedAt
                ? String(resolved.fact.observedAt)
                : null,
          valueJson: v,
        };
      }
    } catch (e: any) {
      this.logger.debug(`loadContext world signal skipped: ${e?.message ?? e}`);
    }

    return {
      tripId: tid,
      countryCode: cc,
      tripExecutionHistory,
      lastCountryDispatchFact,
      hints,
    };
  }
}
