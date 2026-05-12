import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorldFactService } from './world-fact.service';
import type {
  RouteDispatchExecutionSyncInput,
  RouteDispatchExecutionSyncResult,
  TripDecisionExecutionHistoryEntry,
} from './decision-execution-sync.types';

/**
 * P4：Execution → State Reconciliation
 * - Trip：将执行摘要写入 metadata.decisionExecutionHistory（有 tripId 时）
 * - World：可选 append 派生事实 country:{CC}:execution_route_dispatch_last（弱闭环信号）
 */
@Injectable()
export class DecisionExecutionReconciliationService {
  private readonly logger = new Logger(DecisionExecutionReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worldFacts: WorldFactService,
    private readonly config: ConfigService,
  ) {}

  private worldFactSyncEnabled(): boolean {
    const v =
      this.config.get<string>('DECISION_EXECUTION_WORLD_FACT_SYNC') ??
      process.env.DECISION_EXECUTION_WORLD_FACT_SYNC;
    return v === '1' || v === 'true' || v === 'yes';
  }

  private snapshotVersion(): string {
    return (
      this.config.get<string>('WORLD_FACT_SNAPSHOT_VERSION') ??
      process.env.WORLD_FACT_SNAPSHOT_VERSION ??
      'poc/v1'
    );
  }

  async syncRouteDispatchOutcome(
    input: RouteDispatchExecutionSyncInput,
  ): Promise<RouteDispatchExecutionSyncResult> {
    const cc = input.countryCode.trim().toUpperCase();
    const hadSuccess = input.traces.some((t) => t.status === 'SUCCESS');

    let tripStateUpdated = false;
    let worldFactAppended = false;
    let worldFactRowId: string | undefined;

    const tripId = input.tripId?.trim();
    if (tripId) {
      try {
        await this.patchTripExecutionHistory(tripId, {
          countryCode: cc,
          routeDirectionId: input.routeDirectionId?.trim(),
          traces: input.traces,
          rollbackTokens: input.rollbackTokens,
          hadSuccessfulDispatch: hadSuccess,
        });
        tripStateUpdated = true;
      } catch (e: any) {
        this.logger.warn(`Trip execution sync failed tripId=${tripId}: ${e?.message ?? e}`);
      }
    }

    if (this.worldFactSyncEnabled() && hadSuccess) {
      try {
        const { id } = await this.worldFacts.append({
          factKey: `country:${cc}:execution_route_dispatch_last`,
          subjectType: 'country',
          subjectId: cc,
          predicate: 'execution_route_dispatch_last',
          valueJson: {
            syncVersion: 'p4/v1',
            occurredAt: new Date().toISOString(),
            routeDirectionId: input.routeDirectionId ?? null,
            traces: input.traces.map((t) => ({
              actionIndex: t.actionIndex,
              actionType: t.actionType,
              status: t.status,
              rollbackToken: t.rollbackToken ?? null,
            })),
            rollbackTokens: input.rollbackTokens,
          },
          confidence: 1,
          sourceType: 'decision_execution_sync',
          sourceRef: `route_dispatch:${randomUUID()}`,
          observedAt: new Date(),
          snapshotVersion: this.snapshotVersion(),
        });
        worldFactAppended = true;
        worldFactRowId = id;
      } catch (e: any) {
        this.logger.warn(`WorldFact execution sync failed: ${e?.message ?? e}`);
      }
    }

    return { tripStateUpdated, worldFactAppended, worldFactRowId };
  }

  private async patchTripExecutionHistory(
    tripId: string,
    params: {
      countryCode: string;
      routeDirectionId?: string;
      traces: RouteDispatchExecutionSyncInput['traces'];
      rollbackTokens: string[];
      hadSuccessfulDispatch: boolean;
    },
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      this.logger.debug(`syncRouteDispatchOutcome: trip not found ${tripId}`);
      return;
    }

    const meta = (trip.metadata as Record<string, unknown> | null) ?? {};
    const rawHist = meta['decisionExecutionHistory'];
    const history: TripDecisionExecutionHistoryEntry[] = Array.isArray(rawHist)
      ? (rawHist as TripDecisionExecutionHistoryEntry[])
      : [];

    const entry: TripDecisionExecutionHistoryEntry = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      countryCode: params.countryCode,
      routeDirectionId: params.routeDirectionId,
      traceSummary: params.traces.map((t) => ({
        actionIndex: t.actionIndex,
        actionType: t.actionType,
        status: t.status,
      })),
      rollbackTokenCount: params.rollbackTokens.length,
      hadSuccessfulDispatch: params.hadSuccessfulDispatch,
    };

    history.push(entry);
    meta['decisionExecutionHistory'] = history.slice(-40);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: meta as object },
    });
  }
}
