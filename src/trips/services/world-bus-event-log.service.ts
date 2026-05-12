import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorldBusEvent } from '../draft-synthesis/autonomous-world';

/**
 * 世界总线事件 append-only 持久化（与内存编排器解耦；写失败不阻塞主路径）。
 */
@Injectable()
export class WorldBusEventLogService {
  private readonly logger = new Logger(WorldBusEventLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async append(event: WorldBusEvent): Promise<void> {
    const raw = JSON.parse(JSON.stringify(event)) as object;
    await this.prisma.worldBusEventLog.create({
      data: {
        kind: event.kind,
        subType: event.subType,
        eventAt: new Date(event.timestamp),
        cityKey: event.cityKey ?? null,
        placeId: event.placeId ?? null,
        payload: event.payload as object,
        raw,
      },
    });
  }

  async recent(params: { limit: number; kind?: string; cityKey?: string }) {
    const take = Math.min(200, Math.max(1, params.limit));
    return this.prisma.worldBusEventLog.findMany({
      where: {
        ...(params.kind ? { kind: params.kind } : {}),
        ...(params.cityKey ? { cityKey: params.cityKey } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take,
    });
  }
}
