/**
 * RFC-002 — persist route lineage on trip.metadata (Phase 1; migrate to table in Production).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import type { DecisionRouteLineageEntry, DecisionRouteResult } from '../contracts/decision-gateway.types';
import { randomUUID } from 'crypto';

const METADATA_KEY = 'decisionEngineRoutes';
const MAX_ENTRIES = 200;

@Injectable()
export class RouteLineageStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    tripId: string,
    input: {
      problemId?: string;
      semanticKey?: string;
      route: DecisionRouteResult;
    },
  ): Promise<DecisionRouteLineageEntry> {
    const [entry] = await this.appendBatch(tripId, [input]);
    return entry;
  }

  async appendBatch(
    tripId: string,
    inputs: Array<{
      problemId?: string;
      semanticKey?: string;
      route: DecisionRouteResult;
    }>,
  ): Promise<DecisionRouteLineageEntry[]> {
    if (!inputs.length) return [];

    const entries: DecisionRouteLineageEntry[] = inputs.map((input) => ({
      routeId: `route_${randomUUID().slice(0, 12)}`,
      tripId,
      problemId: input.problemId,
      semanticKey: input.semanticKey,
      engineId: input.route.engineId,
      resolution: input.route.resolution,
      reason: input.route.reason,
      createdAt: input.route.recordedAt,
    }));

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const block = (meta[METADATA_KEY] as { items?: DecisionRouteLineageEntry[] }) ?? {};
    const items = [...(block.items ?? []), ...entries].slice(-MAX_ENTRIES);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: { items, lastUpdatedAt: new Date().toISOString() },
        }),
      },
    });

    return entries;
  }

  async list(tripId: string): Promise<DecisionRouteLineageEntry[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as { items?: DecisionRouteLineageEntry[] } | undefined;
    return block?.items ?? [];
  }
}
