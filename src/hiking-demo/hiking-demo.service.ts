import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DEMEffortMetadataService } from '../trips/dem/services/dem-effort-metadata.service';
import { getFixtureByName } from '../route-directions/fixtures';
import {
  createHumanCapabilityModelFromQuestionnaire,
  type FitnessQuestionnaireAnswers,
} from '../trips/decision/models/human-capability.model';
import {
  IS_LAUGAVEGUR,
  IS_LAUGAVEGUR_PHILOSOPHY,
} from '../route-directions/fixtures/is_laugavegur.fixture';
import {
  LAUGAVEGUR_DAY_SKELETON,
  LAUGAVEGUR_POLYLINE_POI_IDS,
  LAUGAVEGUR_ROUTE_POINTS,
  LAUGAVEGUR_SUPPLY_POI_IDS,
  ROUTE_DIRECTION_NAME,
} from './constants/laugavegur-demo.constants';
import type { HikingDemoComputeStepDto } from './dto/hiking-demo-preview.dto';

@Injectable()
export class HikingDemoService {
  private readonly logger = new Logger(HikingDemoService.name);

  constructor(private readonly demEffort: DEMEffortMetadataService) {}

  getLaugavegurSnapshot() {
    const fixture = getFixtureByName(ROUTE_DIRECTION_NAME) ?? IS_LAUGAVEGUR;
    return {
      routeDirectionName: ROUTE_DIRECTION_NAME,
      fixture,
      philosophy: IS_LAUGAVEGUR_PHILOSOPHY,
      daySkeleton: LAUGAVEGUR_DAY_SKELETON,
      polylinePoiIds: [...LAUGAVEGUR_POLYLINE_POI_IDS],
      supplyPoiIds: [...LAUGAVEGUR_SUPPLY_POI_IDS],
      routePoints: LAUGAVEGUR_ROUTE_POINTS,
      metadata: fixture.metadata,
    };
  }

  async buildLaugavegurPreview(options: {
    longestHike?: number;
    useCachedProfileFallback?: boolean;
  }) {
    const longestHike = Math.min(4, Math.max(0, options.longestHike ?? 2)) as 0 | 1 | 2 | 3 | 4;
    const useFallback = options.useCachedProfileFallback !== false;
    const steps: HikingDemoComputeStepDto[] = [];

    let elevationProfile: Array<{ distance: number; elevation: number; slope?: number }> = [];
    let effortSummary: Record<string, unknown> = {};

    steps.push({
      id: 'dem.elevation_profile',
      labelZh: '地形爬升解析中',
      labelEn: 'Parsing terrain ascent profile (DEM)',
      service: 'DEMEffortMetadataService',
      status: 'running',
    });

    try {
      const routePoints = LAUGAVEGUR_ROUTE_POINTS.map((p) => ({
        lat: p.lat,
        lng: p.lng,
      }));
      const effort = await this.demEffort.calculateEffortMetadata(routePoints, {
        samplingInterval: 500,
        includeElevationProfile: true,
      });
      elevationProfile =
        effort.elevationProfile?.map((p) => ({
          distance: p.distance,
          elevation: p.elevation,
          slope: p.slope,
        })) ?? [];
      effortSummary = {
        totalAscent: effort.totalAscent,
        totalDescent: effort.totalDescent,
        maxElevation: effort.maxElevation,
        effortScore: effort.effortScore,
        difficulty: effort.difficulty,
        estimatedDurationMin: effort.estimatedDuration,
      };
      steps[0] = { ...steps[0], status: 'done', summary: `爬升 ${effort.totalAscent}m` };
    } catch (e) {
      this.logger.warn(`DEM preview failed: ${e}`);
      if (useFallback) {
        const cached = this.loadCachedProfile();
        elevationProfile = cached.elevationProfile ?? [];
        effortSummary = {
          cumulativeAscentM: cached.cumulativeAscentM,
          maxElevationM: cached.maxElevationM,
          fatigueIndex: cached.fatigueIndex,
          source: cached.source,
        };
        steps[0] = { ...steps[0], status: 'done', summary: '使用 DEMO_LAUGAVEGUR.json 兜底' };
      } else {
        steps[0] = { ...steps[0], status: 'error', summary: String(e) };
      }
    }

    steps.push({
      id: 'decision.fitness_match',
      labelZh: '体能匹配评估',
      labelEn: 'Fitness capability match',
      service: 'HumanCapabilityModel',
      status: 'running',
    });

    const questionnaire: FitnessQuestionnaireAnswers = {
      longestHike,
      ageGroup: '30-39',
      weeklyExercise: 2,
      elevationExperience: 2,
    };
    const capability = createHumanCapabilityModelFromQuestionnaire('demo-user', questionnaire);
    const maxDailyAscent = capability.maxDailyAscentM;
    const dayLoads = LAUGAVEGUR_DAY_SKELETON.map((d) => ({
      day: d.day,
      ascentM: d.ascentM,
      eligible: d.ascentM <= maxDailyAscent * 1.15,
    }));
    const eligible = dayLoads.every((d) => d.eligible);
    steps[1] = {
      ...steps[1],
      status: 'done',
      summary: eligible ? '全部日程在体能阈值内' : '部分日程超出建议爬升',
    };

    steps.push({
      id: 'world.weather_risk',
      labelZh: '高地天气窗口',
      labelEn: 'Highland weather window rules',
      service: 'RouteDirectionFixture',
      status: 'done',
      summary: '最佳月份 7–8 月；其余月份 avoid',
    });

    const fixture = getFixtureByName(ROUTE_DIRECTION_NAME) ?? IS_LAUGAVEGUR;

    return {
      routeDirectionName: ROUTE_DIRECTION_NAME,
      computeSteps: steps,
      elevationProfile,
      effortSummary,
      fitnessMatch: {
        longestHike,
        maxDailyAscentM: maxDailyAscent,
        dayLoads,
        eligible,
        fitnessLevel: capability.fitnessLevel,
      },
      weatherRules: {
        bestMonths: fixture.seasonality?.bestMonths ?? [7, 8],
        avoidMonths: fixture.seasonality?.avoidMonths ?? [],
        nonNegotiableRules: IS_LAUGAVEGUR_PHILOSOPHY.nonNegotiableRules,
      },
      daySkeleton: LAUGAVEGUR_DAY_SKELETON,
      snapshot: this.getLaugavegurSnapshot(),
    };
  }

  private loadCachedProfile(): {
    elevationProfile?: Array<{ distance: number; elevation: number; slope?: number }>;
    cumulativeAscentM?: number;
    maxElevationM?: number;
    fatigueIndex?: number;
    source?: string;
  } {
    const filePath = path.join(process.cwd(), 'docs', 'DEMO_LAUGAVEGUR.json');
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as ReturnType<HikingDemoService['loadCachedProfile']>;
    } catch {
      return { elevationProfile: [], source: 'empty_fallback' };
    }
  }
}
