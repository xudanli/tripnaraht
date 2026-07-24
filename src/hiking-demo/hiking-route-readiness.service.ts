import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HikingTrailDetailService } from './services/hiking-trail-detail.service';
import { buildReadinessFactors } from './services/hiking-readiness-factors.util';

@Injectable()
export class HikingRouteReadinessService {
  private readonly logger = new Logger(HikingRouteReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trailDetail: HikingTrailDetailService,
  ) {}

  async evaluateRoute(
    routeDirectionId: number,
    options?: {
      longestHike?: number;
      userId?: string;
      plannedDate?: string;
      hikePlanId?: string;
    },
  ) {
    if (options?.plannedDate || options?.hikePlanId) {
      this.logger.debug(
        `route-readiness context routeDirectionId=${routeDirectionId} plannedDate=${options.plannedDate ?? '-'} hikePlanId=${options.hikePlanId ?? '-'}`,
      );
    }
    const rd = await this.prisma.routeDirection.findUnique({
      where: { id: routeDirectionId },
    });
    if (!rd) {
      throw new NotFoundException(`Route direction ${routeDirectionId} not found`);
    }

    let longestHike = options?.longestHike;
    if (longestHike == null) longestHike = 2;

    const detail = await this.trailDetail.build(rd, { longestHike });
    const score = detail?.summary.readinessScore ?? 50;
    const fitness = detail?.fitnessMatch;
    const { factors, headlineZh, summaryZh } = buildReadinessFactors(detail, {
      longestHike,
      fitnessEligible: fitness?.eligible,
      baseScore: score,
    });

    const blockers: Array<{
      code: string;
      messageZh: string;
      severity: 'warning' | 'error';
    }> = [];

    if (detail?.permits?.some((p) => p.required)) {
      blockers.push({
        code: 'PERMIT_REQUIRED',
        messageZh: '需完成许可/山屋预订',
        severity: 'warning',
      });
    }
    if (fitness && !fitness.eligible) {
      blockers.push({
        code: 'PACE_TOO_HARD',
        messageZh: '按当前体能档位，部分日程爬升偏高',
        severity: 'warning',
      });
    }

    const level =
      score >= 70 && (!fitness || fitness.eligible)
        ? 'ready'
        : score >= 50
          ? 'caution'
          : 'not_ready';

    return {
      routeDirectionId,
      context:
        options?.plannedDate || options?.hikePlanId
          ? {
              plannedDate: options.plannedDate,
              hikePlanId: options.hikePlanId,
            }
          : undefined,
      score,
      level,
      headlineZh,
      summaryZh,
      factors,
      blockers,
      fitnessVerdict: fitness?.fitnessVerdict ?? (fitness?.eligible ? 'pace_ok' : 'pace_tight'),
      dayPaceVerdict: fitness?.dayPaceVerdict ?? [],
      longestHikeUsed: longestHike,
      routeSuggestedDays:
        detail?.summary.suggestedDays ??
        fitness?.suggestedDays ??
        detail?.daySkeleton?.length,
    };
  }
}
