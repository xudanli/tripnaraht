import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { TrailPlanPreviewResult } from '../../trips/decision/adapters/trail-planning.adapter';

/** F8：generate-plan 产出写入 Trip.metadata */
@Injectable()
export class HardTrekTripMetadataService {
  private readonly logger = new Logger(HardTrekTripMetadataService.name);

  constructor(private readonly prisma: PrismaService) {}

  async persistHardTrekTrailPlan(
    tripId: string,
    plan: TrailPlanPreviewResult & { messageZh?: string },
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const prev =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};

    const payload = {
      ...plan,
      messageZh:
        plan.messageZh ??
        (plan.mode === 'trail_segments'
          ? `已生成 ${plan.segments.length} 日 Trail 段（${plan.routeDirectionName}）`
          : plan.mode === 'poi_fallback'
            ? '未能生成 Trail 段，已回退 POI 日程骨架'
            : undefined),
      summary: {
        ...plan.summary,
        suggestedDays: plan.segments.length,
      },
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...prev,
          hardTrekTrailPlan: payload,
          routeDirectionName: plan.routeDirectionName,
          hikingPlanningMode: plan.mode,
        },
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Persisted hardTrekTrailPlan to trip ${tripId} mode=${plan.mode} days=${plan.segments.length}`,
    );
  }
}
