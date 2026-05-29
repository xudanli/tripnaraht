import { Injectable, Logger, Optional } from '@nestjs/common';
import { getFixtureByName } from '../../../route-directions/fixtures';
import {
  LAUGAVEGUR_DAY_SKELETON,
  ROUTE_DIRECTION_NAME,
} from '../../../hiking-demo/constants/laugavegur-demo.constants';
import { SmartTrailPlannerService } from '../../../trails/services/smart-trail-planner.service';
import type { PacingConfig } from '../../interfaces/pacing-config.interface';
import {
  createHumanCapabilityModelFromQuestionnaire,
  type FitnessQuestionnaireAnswers,
} from '../models/human-capability.model';

const DEFAULT_PACING: PacingConfig = {
  max_daily_hp: 100,
  hp_recovery_rate: 0.4,
  walk_speed_factor: 1.0,
  stairs_penalty_factor: 1.0,
  forced_rest_interval_min: 120,
  terrain_filter: 'ALL',
};

export type TrailPlanSegment = {
  day: number;
  titleZh: string;
  titleEn: string;
  distanceKm: number;
  ascentM: number;
  trailId?: number;
  trailName?: string;
  suitable: boolean;
  recommendation?: string;
};

export type TrailPlanPreviewResult = {
  routeDirectionName: string;
  mode: 'trail_segments' | 'poi_fallback';
  segments: TrailPlanSegment[];
  summary: {
    totalDistanceKm: number;
    totalAscentM: number;
    eligible: boolean;
    maxDailyAscentM: number;
    suggestedDays?: number;
  };
  messageZh?: string;
  smartPlannerUsed: boolean;
};

const SUPPORTED_ROUTES = new Set([
  ROUTE_DIRECTION_NAME,
  'IS_TREKKING_WILDERNESS',
  'NEPAL_EBC_TREK',
]);

@Injectable()
export class TrailPlanningAdapter {
  private readonly logger = new Logger(TrailPlanningAdapter.name);

  constructor(
    @Optional() private readonly smartPlanner?: SmartTrailPlannerService,
  ) {}

  async buildPreview(options: {
    routeDirectionName: string;
    longestHike?: number;
    placeIds?: number[];
    pacingConfig?: PacingConfig;
  }): Promise<TrailPlanPreviewResult> {
    const name = options.routeDirectionName;
    const fixture = getFixtureByName(name);
    const isHiking =
      SUPPORTED_ROUTES.has(name) ||
      (fixture?.tags ?? []).some((t) => t === '徒步' || /hik|trek|trail/i.test(t));
    if (!isHiking && !fixture) {
      throw new Error(`Unsupported routeDirectionName for trail preview: ${name}`);
    }

    const longestHike = Math.min(4, Math.max(0, options.longestHike ?? 2)) as 0 | 1 | 2 | 3 | 4;
    const questionnaire: FitnessQuestionnaireAnswers = {
      longestHike,
      ageGroup: '30-39',
      weeklyExercise: 2,
      elevationExperience: 2,
    };
    const capability = createHumanCapabilityModelFromQuestionnaire('trail-preview', questionnaire);
    const maxDailyAscentM = capability.maxDailyAscentM;
    const pacing = options.pacingConfig ?? DEFAULT_PACING;

    let smartPlannerUsed = false;
    if (this.smartPlanner && (options.placeIds?.length ?? 0) > 0) {
      try {
        const plan = await this.smartPlanner.planSmartRoute({
          placeIds: options.placeIds!,
          pacingConfig: pacing,
          preferences: { preferredDifficulty: 'HARD' },
        });
        if (plan.suggestedSchedule?.length) {
          smartPlannerUsed = true;
          const segments: TrailPlanSegment[] = plan.suggestedSchedule.map((s) => {
            const dayMeta = LAUGAVEGUR_DAY_SKELETON.find((d) => d.day === s.day);
            const ascentM = dayMeta?.ascentM ?? 400;
            return {
              day: s.day,
              titleZh: dayMeta?.titleZh ?? `Day ${s.day}`,
              titleEn: dayMeta?.titleEn ?? `Day ${s.day}`,
              distanceKm: s.distanceKm,
              ascentM,
              trailId: s.trailIds[0],
              suitable: ascentM <= maxDailyAscentM * 1.15,
              recommendation: plan.trails[0]?.recommendation,
            };
          });
          const totalDistanceKm = segments.reduce((a, s) => a + s.distanceKm, 0);
          const totalAscentM = segments.reduce((a, s) => a + s.ascentM, 0);
          return {
            routeDirectionName: name,
            mode: 'trail_segments',
            segments,
            summary: {
              totalDistanceKm,
              totalAscentM,
              eligible: segments.every((s) => s.suitable),
              maxDailyAscentM,
            },
            smartPlannerUsed,
          };
        }
      } catch (e) {
        this.logger.warn(`SmartTrailPlanner fallback to skeleton: ${e}`);
      }
    }

    const skeleton =
      name === ROUTE_DIRECTION_NAME
        ? LAUGAVEGUR_DAY_SKELETON
        : this.genericSkeletonForRoute(name);

    const segments: TrailPlanSegment[] = skeleton.map((d) => ({
      day: d.day,
      titleZh: d.titleZh,
      titleEn: d.titleEn,
      distanceKm: d.distanceKm,
      ascentM: d.ascentM,
      suitable: d.ascentM <= maxDailyAscentM * 1.15,
      recommendation: d.notes,
    }));

    const totalDistanceKm =
      segments.reduce((a, s) => a + s.distanceKm, 0) ||
      (fixture?.metadata?.totalDistanceKm as number | undefined) ||
      0;

    const overDays = segments.filter((s) => !s.suitable);
    return {
      routeDirectionName: name,
      mode: 'trail_segments',
      segments,
      summary: {
        totalDistanceKm,
        totalAscentM: segments.reduce((a, s) => a + s.ascentM, 0),
        eligible: segments.every((s) => s.suitable),
        maxDailyAscentM,
        suggestedDays: segments.length,
      },
      messageZh:
        overDays.length > 0
          ? `${overDays.length} 日爬升超出当前体能档位，建议加缓冲日或减负`
          : `已生成 ${segments.length} 日 Trail 段（${fixture?.nameCN ?? name}）`,
      smartPlannerUsed: false,
    };
  }

  private genericSkeletonForRoute(name: string) {
    const fixture = getFixtureByName(name);
    const days = (fixture?.metadata?.estimatedDuration as number) ?? 4;
    const totalKm = (fixture?.metadata?.totalDistanceKm as number) ?? 40;
    const perDayKm = totalKm / days;
    return Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      titleZh: `${fixture?.nameCN ?? name} 第 ${i + 1} 日`,
      titleEn: `Day ${i + 1}`,
      distanceKm: Math.round(perDayKm * 10) / 10,
      ascentM: 400,
      notes: undefined as string | undefined,
    }));
  }
}
