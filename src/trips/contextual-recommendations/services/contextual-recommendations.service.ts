import { BadRequestException, Injectable } from '@nestjs/common';
import { SameDayContextBuilderService } from './same-day-context-builder.service';
import { SameDayIntentCompileService } from './same-day-intent-compile.service';
import { SameDayLocalCandidatesService } from './same-day-local-candidates.service';
import { SameDayTravelEtaService } from './same-day-travel-eta.service';
import { mergeSameDayProblem } from '../utils/same-day-context-merge.util';
import { mergeCompiledIntentWithDelta } from '../utils/same-day-intent-compiler.util';
import { solveSameDayCombinations } from '../utils/same-day-combination-solver.util';
import { planArrivalDayMicroItinerary } from '../utils/same-day-arrival-planner.util';
import { planInTripDayMicroItinerary } from '../utils/same-day-in-trip-planner.util';
import { evaluateAndRepairMicroPlan } from '../utils/same-day-feasibility.util';
import type { ContextualRecommendationsRequestDto } from '../dto/contextual-recommendations.dto';
import type {
  ContextualRecommendationsView,
  MergedSameDayProblem,
} from '../types/contextual-recommendations.types';

@Injectable()
export class ContextualRecommendationsService {
  constructor(
    private readonly contextBuilder: SameDayContextBuilderService,
    private readonly intentCompile: SameDayIntentCompileService,
    private readonly localCandidates: SameDayLocalCandidatesService,
    private readonly travelEta: SameDayTravelEtaService,
  ) {}

  async recommend(
    tripId: string,
    body: ContextualRecommendationsRequestDto,
  ): Promise<ContextualRecommendationsView> {
    if (body.scenario !== 'SAME_DAY_ACTIVITY') {
      throw new BadRequestException(`暂不支持 scenario=${body.scenario}`);
    }

    const compiled = await this.intentCompile.compile(body.intent, {
      useLlm: body.useLlmIntent === true,
    });
    const contextDelta = mergeCompiledIntentWithDelta(
      compiled.contextDelta,
      body.contextDelta,
    );

    const canonical = await this.contextBuilder.buildCanonical(tripId, {
      focusDayIndex: body.dayIndex,
      nowIso: contextDelta.currentTime,
    });

    const problemBase = mergeSameDayProblem({
      canonical,
      intent: body.intent,
      contextDelta,
    });

    const [travelEta, localCandidates] = await Promise.all([
      this.travelEta.estimate({
        currentLocation: problemBase.currentLocation,
        hotel: canonical.hotel,
        countryCode: canonical.countryCode,
        useLiveRoutes: body.useLiveRoutes === true,
      }),
      this.localCandidates.loadNearHotel({
        countryCode: canonical.countryCode,
        hotel: canonical.hotel,
      }),
    ]);

    const problem: MergedSameDayProblem = {
      ...problemBase,
      travelEta,
      localCandidates,
    };

    const solved = solveSameDayCombinations(problem);
    const rawView =
      solved ??
      planArrivalDayMicroItinerary(problem) ??
      planInTripDayMicroItinerary(problem) ??
      this.buildFallback(problem);

    // Solver already ran feasibility; legacy planners still need a pass.
    const feasibility = solved
      ? {
          repaired: rawView.recommendation.feasibility?.repaired ?? false,
          violations: rawView.recommendation.feasibility?.violations ?? [],
          recommendation: rawView.recommendation,
          gate: rawView.recommendation.gate,
        }
      : evaluateAndRepairMicroPlan(problem, rawView.recommendation);

    const observation = { ...rawView.observation };
    if (!solved && feasibility.repaired) {
      observation.facts = [
        ...(observation.facts ?? []),
        '已按可行性约束收敛方案',
      ];
    }
    if (!solved && feasibility.gate === 'REJECT') {
      observation.facts = [
        ...(observation.facts ?? []),
        '当前约束下无可安全执行方案，请放宽返回时间或降低强度',
      ];
    }
    if (travelEta.method === 'live_route_api') {
      observation.facts = [...(observation.facts ?? []), '到达时间已用实时路线估算'];
    }

    return {
      ...rawView,
      observation,
      recommendation: {
        ...feasibility.recommendation,
        feasibility: {
          repaired: feasibility.repaired,
          violations: feasibility.violations,
        },
      },
      context: {
        ...rawView.context,
        intentCompileSource: body.intent?.trim() ? compiled.source : 'none',
        intentMatchedPhrases: compiled.matchedPhrases,
      },
    };
  }

  private buildFallback(problem: MergedSameDayProblem): ContextualRecommendationsView {
    const dining = problem.localCandidates?.find((c) => c.kind === 'DINING');
    return {
      scenario: 'SAME_DAY_ACTIVITY',
      observation: {
        summary: '当前情境下优先保护体力与已确认计划，建议以酒店周边轻松安排为主。',
        facts: [
          problem.canonical.hotel
            ? `住宿参考：${problem.canonical.hotel.name}`
            : '尚未解析到明确酒店锚点',
        ],
      },
      recommendation: {
        title: '以酒店为中心的轻松晚餐与休息',
        reasonCodes: [
          'SAME_DAY_FALLBACK',
          'LOW_DECISION_COST',
          ...(problem.canonical.hotel ? [] : ['HOTEL_ANCHOR_MISSING']),
        ],
        score: 60,
        schedule: [
          {
            type: 'DINING',
            startTime: '19:00',
            endTime: '20:00',
            title: dining?.name ?? '附近轻松用餐',
            placeId: dining?.placeId,
          },
          {
            type: 'REST',
            startTime: '20:00',
            endTime: problem.desiredReturnTime ?? problem.availableUntil ?? '21:00',
            title: '返回休息',
          },
        ],
        impact: {
          additionalDrivingMinutes: 0,
          walkingMinutes: 15,
          tomorrowPlanImpact: 'NONE',
        },
        gate: problem.canonical.hotel ? 'ALLOW' : 'NEED_CONFIRM',
      },
      alternatives: [
        { title: '直接休息', character: 'MOST_RELAXED' },
        { title: '短距城市散步', character: 'MORE_EXPERIENCE' },
      ],
      context: {
        tripPhase: problem.canonical.tripPhase,
        focusDayIndex: problem.canonical.focusDayIndex,
        hotelCity: problem.canonical.hotel?.cityName ?? null,
        energy: problem.energy,
        sources: problem.canonical.sources,
      },
    };
  }
}
