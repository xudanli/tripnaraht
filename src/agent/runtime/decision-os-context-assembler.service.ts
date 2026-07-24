import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { HydratedGovernanceRuntimeContext } from '../../governance/activation/governance-activation.types';
import {
  DecisionOsExecutionContext,
  type DecisionOsExecutionContextInitializer,
} from './decision-os-execution-context';
import { formatDecisionOsTripTime, type DecisionOsWorldState } from './decision-os-world-state.types';

export type DecisionOsContextAssembleInput = {
  request: RouteAndRunRequestDto;
  memory: AgentMemoryContext;
  governance?: HydratedGovernanceRuntimeContext | null;
};

/**
 * DOS Step 1：将 DB/Redis/Ledger/Governance 装配为不可变宪法上下文。
 * 唯一允许在 route_and_run 上游直读多源状态并收拢的入口。
 */
@Injectable()
export class DecisionOsContextAssemblerService {
  private readonly logger = new Logger(DecisionOsContextAssemblerService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async assemble(input: DecisionOsContextAssembleInput): Promise<DecisionOsExecutionContext> {
    const tripId = this.resolveTripId(input.request, input.memory);
    const worldState = tripId ? await this.loadWorldStateFromTrip(tripId) : null;

    const initializer: DecisionOsExecutionContextInitializer = {
      request: input.request,
      memory: input.memory,
      governance: input.governance ?? null,
      worldState,
      planDelta: [],
    };

    const ctx = new DecisionOsExecutionContext(initializer);
    this.logger.debug(
      `[DOS] context assembled trip_id=${ctx.tripId ?? 'null'} snapshot=${ctx.memorySnapshot.snapshotId} world=${!!worldState} (planDelta deferred to INTENT_COMPILE)`,
    );
    return ctx;
  }

  private resolveTripId(request: RouteAndRunRequestDto, memory: AgentMemoryContext): string | null {
    const fromReq = request.trip_id?.trim();
    if (fromReq) return fromReq;
    const fromMem = memory.tripId?.trim();
    return fromMem || null;
  }

  private async loadWorldStateFromTrip(tripId: string): Promise<DecisionOsWorldState | null> {
    if (!this.prisma) {
      this.logger.debug('[DOS] Prisma unavailable; skip world state hydration');
      return null;
    }

    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          destination: true,
          TripDay: {
            orderBy: { date: 'asc' },
            select: {
              date: true,
              ItineraryItem: {
                orderBy: { startTime: 'asc' },
                select: {
                  note: true,
                  type: true,
                  startTime: true,
                  endTime: true,
                  Place: { select: { nameCN: true, nameEN: true } },
                },
              },
            },
          },
        },
      });

      if (!trip) return null;

      return {
        revision: 'v1',
        tripId,
        name: trip.name,
        status: trip.status,
        destination: trip.destination,
        startDate: trip.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: trip.endDate?.toISOString().slice(0, 10) ?? null,
        days: (trip.TripDay ?? []).map((day) => ({
          date: day.date?.toISOString().slice(0, 10) ?? '?',
          items: (day.ItineraryItem ?? []).map((it) => ({
            type: it.type,
            note: it.note,
            placeName: it.Place?.nameCN ?? it.Place?.nameEN ?? null,
            startTime: formatDecisionOsTripTime(it.startTime),
            endTime: formatDecisionOsTripTime(it.endTime),
          })),
        })),
      };
    } catch (e: unknown) {
      this.logger.warn(
        `[DOS] world state load failed trip_id=${tripId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
