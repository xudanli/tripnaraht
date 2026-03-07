/**
 * Travel World Model Phase 5: Travel Simulation Service
 *
 * 综合 world state 预测单点体验分数
 * 复用 BestVisitTimeResolver，整合 timing/weather/crowd
 * 降级：缺数据时返回 0.5
 *
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BestVisitTimeResolver } from './best-visit-time.resolver';
import { CrowdCurveService } from '../../places/services/crowd-curve.service';
import { TimeSlot } from '../dto/trip-draft.dto';
import type {
  TravelSimulationInput,
  TravelSimulationOutput,
} from './travel-simulation.interface';

@Injectable()
export class TravelSimulationService {
  private readonly logger = new Logger(TravelSimulationService.name);

  constructor(
    private readonly bestVisitTimeResolver: BestVisitTimeResolver,
    @Optional() private readonly crowdCurve?: CrowdCurveService,
  ) {}

  /**
   * 预测单点体验分数 (0-1)
   * 因素：timing(bestVisitTime)、weather、crowd
   */
  async simulatePlace(input: TravelSimulationInput): Promise<TravelSimulationOutput> {
    const factors: TravelSimulationOutput['factors'] = {};
    let score = 0.5;

    try {
      const hour = this.parseHour(input.visitTime);
      const slot = this.visitTimeToSlot(input.visitTime);
      let crowdLevel = input.crowd?.level;
      if (crowdLevel == null && this.crowdCurve) {
        crowdLevel = await this.crowdCurve.getCrowdLevel(input.placeId, hour);
      }
      if (crowdLevel != null) {
        input = { ...input, crowd: { level: crowdLevel } };
      }
      const place = {
        physicalMetadata: { bestVisitTime: input.placeSnapshot?.bestVisitTime },
        category: input.placeSnapshot?.category,
      };
      const timingScore = this.bestVisitTimeResolver.matchScore(place, slot);
      factors.timing = timingScore;
      score = 0.4 * timingScore + 0.3;

      if (input.placeSnapshot?.rating != null) {
        const ratingNorm = Math.min(1, (input.placeSnapshot.rating ?? 0) / 5);
        score += 0.2 * ratingNorm;
      }

      if (input.weather?.accessibilityScore != null) {
        const w = Math.max(0, Math.min(1, input.weather.accessibilityScore));
        factors.weather = w;
        score += 0.15 * w;
      }

      if (input.crowd?.level != null) {
        const c = 1 - Math.max(0, Math.min(1, input.crowd.level));
        factors.crowd = c;
        score += 0.1 * c;
      }

      score = Math.max(0, Math.min(1, score));
      const suggestion =
        timingScore < 0.8
          ? `建议调整时段，当前时段与最佳访问时间匹配度较低`
          : undefined;

      return { predictedExperienceScore: score, factors, suggestion };
    } catch (e) {
      this.logger.warn(`TravelSimulation 失败: ${(e as Error)?.message}`);
      return { predictedExperienceScore: 0.5, factors: {} };
    }
  }

  /**
   * 批量预测（用于 RouteOptimization 选点）
   */
  async simulatePlaces(
    inputs: TravelSimulationInput[],
  ): Promise<Map<number, TravelSimulationOutput>> {
    const results = await Promise.all(
      inputs.map((i) => this.simulatePlace(i).then((o) => [i.placeId, o] as const)),
    );
    return new Map(results);
  }

  private visitTimeToSlot(visitTime: string): TimeSlot {
    const hour = this.parseHour(visitTime);
    if (hour < 10) return TimeSlot.MORNING;
    if (hour < 12) return TimeSlot.MORNING;
    if (hour < 14) return TimeSlot.LUNCH;
    if (hour < 17) return TimeSlot.AFTERNOON;
    if (hour < 20) return TimeSlot.DINNER;
    return TimeSlot.EVENING;
  }

  private parseHour(visitTime: string): number {
    const h = parseInt(visitTime, 10);
    if (!Number.isNaN(h) && h >= 0 && h <= 23) return h;
    const m = visitTime.match(/T(\d{2})/);
    if (m) return parseInt(m[1], 10);
    const d = new Date(visitTime);
    if (!Number.isNaN(d.getTime())) return d.getHours();
    return 12;
  }
}
