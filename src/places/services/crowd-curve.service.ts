/**
 * Travel World Model Phase 6: Crowd Curve Service
 *
 * Place × Hour → crowdLevel (0-1)
 * 降级：无数据时返回 null，调用方不纳入 crowd 因子
 *
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CrowdCurveService {
  private readonly logger = new Logger(CrowdCurveService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取单点某时段的 crowdLevel (0-1)
   * 优先匹配 dayOfWeek，无则用 dayOfWeek=null 的通用曲线
   */
  async getCrowdLevel(
    placeId: number,
    hour: number,
    dayOfWeek?: number,
  ): Promise<number | null> {
    const h = Math.max(0, Math.min(23, Math.floor(hour)));
    const rows = await this.prisma.crowdCurve.findMany({
      where: { placeId, hour: h },
      select: { crowdLevel: true, dayOfWeek: true },
    });
    if (rows.length === 0) return null;

    const withDow = rows.find((r) => r.dayOfWeek === dayOfWeek);
    if (withDow) return withDow.crowdLevel;

    const fallback = rows.find((r) => r.dayOfWeek === null);
    return fallback?.crowdLevel ?? null;
  }

  /**
   * 批量获取 crowdLevel（用于 TravelSimulation 批量预测）
   */
  async getCrowdLevels(
    items: Array<{ placeId: number; hour: number; dayOfWeek?: number }>,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (items.length === 0) return result;

    const placeIds = [...new Set(items.map((i) => i.placeId))];
    const curves = await this.prisma.crowdCurve.findMany({
      where: { placeId: { in: placeIds } },
      select: { placeId: true, hour: true, dayOfWeek: true, crowdLevel: true },
    });

    for (const item of items) {
      const h = Math.max(0, Math.min(23, Math.floor(item.hour)));
      const withDow = curves.find(
        (c) =>
          c.placeId === item.placeId &&
          c.hour === h &&
          c.dayOfWeek === (item.dayOfWeek ?? null),
      );
      const fallback = curves.find(
        (c) =>
          c.placeId === item.placeId &&
          c.hour === h &&
          c.dayOfWeek === null,
      );
      const level = withDow?.crowdLevel ?? fallback?.crowdLevel;
      if (level != null) {
        result.set(`${item.placeId}:${h}:${item.dayOfWeek ?? 'any'}`, level);
      }
    }
    return result;
  }
}
