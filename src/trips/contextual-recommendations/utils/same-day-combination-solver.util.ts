import {
  formatMinutesAsClock,
  parseClockToMinutes,
} from './same-day-context-merge.util';
import { buildArrivalScheduleForVariant } from './same-day-arrival-planner.util';
import { evaluateAndRepairMicroPlan } from './same-day-feasibility.util';
import type {
  AlternativeCharacter,
  ContextualRecommendationsObservation,
  ContextualRecommendationsView,
  MergedSameDayProblem,
  MicroPlanAlternative,
  MicroPlanImpact,
  MicroPlanRecommendation,
  MicroPlanScheduleSlot,
  SameDayLocalCandidate,
} from '../types/contextual-recommendations.types';

export type SameDaySolverMethod = 'enumeration_v1';

type CombinationDraft = {
  templateId: string;
  character: AlternativeCharacter;
  title: string;
  schedule: MicroPlanScheduleSlot[];
  reasonCodes: string[];
  baseScore: number;
};

function isAdverseWeather(hint?: string | null): boolean {
  return !!hint && /rain|wind|storm|雨|风|风暴|大风/i.test(hint);
}

function hotelLabel(problem: MergedSameDayProblem): string {
  return (
    problem.canonical.hotel?.cityName?.trim() ||
    problem.canonical.hotel?.name?.trim() ||
    '今晚住宿点'
  );
}

function estimateImpact(
  problem: MergedSameDayProblem,
  schedule: MicroPlanScheduleSlot[],
  character: AlternativeCharacter,
): MicroPlanImpact {
  const hasWalk = schedule.some((s) => s.type === 'LIGHT_ACTIVITY');
  const drive = problem.travelEta?.driveMinutes ?? 0;
  return {
    additionalDrivingMinutes:
      character === 'MORE_EXPERIENCE' ? Math.max(4, Math.round(drive * 0.05)) : 0,
    walkingMinutes: hasWalk
      ? character === 'MORE_EXPERIENCE'
        ? 35
        : 25
      : character === 'MOST_RELAXED'
        ? 10
        : 15,
    estimatedCost: hasWalk ? 12000 : 8000,
    currency: 'ISK',
    tomorrowPlanImpact: 'NONE',
  };
}

function utilityBonus(
  problem: MergedSameDayProblem,
  character: AlternativeCharacter,
  schedule: MicroPlanScheduleSlot[],
): number {
  let bonus = 0;
  const hasWalk = schedule.some((s) => s.type === 'LIGHT_ACTIVITY');
  const adverse = isAdverseWeather(problem.canonical.weatherHint);

  if (problem.energy === 'LOW') {
    bonus += character === 'MOST_RELAXED' ? 14 : character === 'BALANCED' ? 6 : -10;
  } else if (problem.energy === 'HIGH') {
    bonus += character === 'MORE_EXPERIENCE' ? 12 : 4;
  } else {
    bonus += character === 'BALANCED' ? 10 : 5;
  }

  if (problem.desiredIntensity === 'LIGHT') {
    bonus += hasWalk ? -8 : 8;
  } else if (problem.desiredIntensity === 'FULL') {
    bonus += hasWalk ? 10 : -4;
  }

  if (adverse) {
    bonus += hasWalk ? -16 : 10;
  }
  if (problem.canonical.tomorrow?.earlyDeparture) {
    bonus += character === 'MORE_EXPERIENCE' ? -6 : 5;
  }
  if (problem.temporaryConstraints.some((c) => /motion|晕车|疲劳|飞行|jet\s*lag/i.test(c))) {
    bonus += character === 'MOST_RELAXED' ? 8 : character === 'MORE_EXPERIENCE' ? -10 : 2;
  }
  if (schedule.some((s) => s.placeId != null)) bonus += 4;
  if (!problem.canonical.hotel) bonus -= 12;
  return bonus;
}

function bindDining(
  schedule: MicroPlanScheduleSlot[],
  dining: SameDayLocalCandidate | undefined,
): MicroPlanScheduleSlot[] {
  if (!dining) return schedule;
  return schedule.map((slot) =>
    slot.type === 'DINING'
      ? {
          ...slot,
          title: dining.name,
          placeId: dining.placeId,
          note:
            dining.distanceKm != null
              ? `距酒店约 ${dining.distanceKm} km`
              : slot.note,
        }
      : slot,
  );
}

function bindActivity(
  schedule: MicroPlanScheduleSlot[],
  activity: SameDayLocalCandidate | undefined,
): MicroPlanScheduleSlot[] {
  if (!activity) return schedule;
  return schedule.map((slot) =>
    slot.type === 'LIGHT_ACTIVITY'
      ? {
          ...slot,
          title: activity.name,
          placeId: activity.placeId,
          productId: activity.productId ?? slot.productId,
          note:
            activity.distanceKm != null
              ? `距酒店约 ${activity.distanceKm} km · 视体力可缩短`
              : slot.note,
        }
      : slot,
  );
}

function remainingWindow(problem: MergedSameDayProblem): {
  now: number;
  until: number;
  remaining: number;
} {
  const now = parseClockToMinutes(problem.currentTimeIso) ?? 15 * 60;
  const until =
    parseClockToMinutes(problem.desiredReturnTime) ??
    parseClockToMinutes(problem.availableUntil) ??
    21 * 60;
  return { now, until, remaining: Math.max(0, until - now) };
}

function buildInTripRestOnly(
  problem: MergedSameDayProblem,
  now: number,
  until: number,
): MicroPlanScheduleSlot[] {
  return [
    {
      type: 'REST',
      startTime: formatMinutesAsClock(now),
      endTime: formatMinutesAsClock(until),
      title: '直接返回休息',
      note: `围绕 ${hotelLabel(problem)}`,
    },
  ];
}

function buildInTripDinnerRest(
  problem: MergedSameDayProblem,
  now: number,
  until: number,
  dining?: SameDayLocalCandidate,
): MicroPlanScheduleSlot[] {
  const dinnerStart = Math.min(now + 20, until - 50);
  const dinnerEnd = Math.min(dinnerStart + 50, until - 10);
  return [
    {
      type: 'DINING',
      startTime: formatMinutesAsClock(Math.max(now, dinnerStart)),
      endTime: formatMinutesAsClock(Math.max(dinnerEnd, dinnerStart + 30)),
      title: dining?.name ?? '附近轻松用餐',
      placeId: dining?.placeId,
      note:
        dining?.distanceKm != null
          ? `距锚点约 ${dining.distanceKm} km`
          : `围绕 ${hotelLabel(problem)}`,
    },
    {
      type: 'REST',
      startTime: formatMinutesAsClock(Math.max(dinnerEnd, dinnerStart + 30)),
      endTime: formatMinutesAsClock(until),
      title: '返回休息',
    },
  ];
}

function buildInTripDinnerWalk(
  problem: MergedSameDayProblem,
  now: number,
  until: number,
  dining?: SameDayLocalCandidate,
  activity?: SameDayLocalCandidate,
): MicroPlanScheduleSlot[] {
  const dinnerStart = Math.max(now + 15, Math.min(now + 30, until - 90));
  const dinnerEnd = dinnerStart + 55;
  const slots: MicroPlanScheduleSlot[] = [
    {
      type: 'DINING',
      startTime: formatMinutesAsClock(dinnerStart),
      endTime: formatMinutesAsClock(dinnerEnd),
      title: dining?.name ?? `${hotelLabel(problem)}附近晚餐`,
      placeId: dining?.placeId,
      note: dining?.distanceKm != null
        ? `距锚点约 ${dining.distanceKm} km`
        : '步行约 10 分钟范围内',
    },
  ];
  if (until - dinnerEnd >= 35) {
    const walkStart = dinnerEnd + 10;
    const walkEnd = Math.min(walkStart + 25, until - 10);
    slots.push({
      type: 'LIGHT_ACTIVITY',
      startTime: formatMinutesAsClock(walkStart),
      endTime: formatMinutesAsClock(walkEnd),
      title: activity?.name ?? '住宿点附近短距散步',
      placeId: activity?.placeId,
      productId: activity?.productId,
      note:
        activity?.distanceKm != null
          ? `距锚点约 ${activity.distanceKm} km`
          : '不离开今晚活动区',
    });
  }
  slots.push({
    type: 'REST',
    startTime: formatMinutesAsClock(
      until - dinnerEnd >= 35 ? Math.min(dinnerEnd + 35, until - 5) : dinnerEnd,
    ),
    endTime: formatMinutesAsClock(until),
    title: '返回休息',
  });
  return slots;
}

function enumerateArrivalDrafts(problem: MergedSameDayProblem): CombinationDraft[] {
  const diningList =
    problem.localCandidates?.filter((c) => c.kind === 'DINING').slice(0, 2) ?? [];
  const activities =
    problem.localCandidates?.filter((c) => c.kind === 'LIGHT_ACTIVITY').slice(0, 2) ??
    [];

  const drafts: CombinationDraft[] = [];

  const relaxed = buildArrivalScheduleForVariant(problem, 'MOST_RELAXED');
  drafts.push({
    templateId: 'ARRIVAL_CHECKIN_DINNER_REST',
    character: 'MOST_RELAXED',
    title: relaxed.title,
    schedule: bindDining(relaxed.schedule, diningList[0]),
    reasonCodes: [...relaxed.reasonCodes, 'SOLVER_ENUMERATION'],
    baseScore: 72,
  });

  const primary = buildArrivalScheduleForVariant(problem, 'PRIMARY');
  drafts.push({
    templateId: 'ARRIVAL_PRIMARY',
    character: 'BALANCED',
    title: primary.title,
    schedule: bindActivity(
      bindDining(primary.schedule, diningList[0]),
      activities[0],
    ),
    reasonCodes: [...primary.reasonCodes, 'SOLVER_ENUMERATION'],
    baseScore: 78,
  });

  const experience = buildArrivalScheduleForVariant(problem, 'MORE_EXPERIENCE');
  drafts.push({
    templateId: 'ARRIVAL_CHECKIN_DINNER_WALK',
    character: 'MORE_EXPERIENCE',
    title: experience.title,
    schedule: bindActivity(
      bindDining(experience.schedule, diningList[0] ?? diningList[1]),
      activities[1] ?? activities[0],
    ),
    reasonCodes: [...experience.reasonCodes, 'SOLVER_ENUMERATION'],
    baseScore: 70,
  });

  if (diningList[1]) {
    drafts.push({
      templateId: 'ARRIVAL_ALT_DINING',
      character: 'BALANCED',
      title: `先入住，晚餐改去 ${diningList[1].name}`,
      schedule: bindDining(relaxed.schedule, diningList[1]),
      reasonCodes: ['ARRIVAL_DAY', 'ALT_DINING', 'SOLVER_ENUMERATION'],
      baseScore: 66,
    });
  }

  return drafts;
}

function enumerateInTripDrafts(problem: MergedSameDayProblem): CombinationDraft[] {
  const { now, until, remaining } = remainingWindow(problem);
  const diningList =
    problem.localCandidates?.filter((c) => c.kind === 'DINING').slice(0, 2) ?? [];
  const activities =
    problem.localCandidates?.filter((c) => c.kind === 'LIGHT_ACTIVITY').slice(0, 2) ??
    [];

  const drafts: CombinationDraft[] = [
    {
      templateId: 'IN_TRIP_REST_ONLY',
      character: 'MOST_RELAXED',
      title: '直接休息，不做额外安排',
      schedule: buildInTripRestOnly(problem, now, until),
      reasonCodes: ['IN_TRIP_DAY', 'MOST_RELAXED', 'SOLVER_ENUMERATION'],
      baseScore: remaining < 60 ? 80 : 62,
    },
    {
      templateId: 'IN_TRIP_DINNER_REST',
      character: 'BALANCED',
      title: '利用剩余时间安排轻松晚餐后休息',
      schedule: buildInTripDinnerRest(problem, now, until, diningList[0]),
      reasonCodes: ['IN_TRIP_DAY', 'BALANCED', 'SOLVER_ENUMERATION'],
      baseScore: 74,
    },
  ];

  if (remaining >= 100) {
    drafts.push({
      templateId: 'IN_TRIP_DINNER_WALK',
      character: 'MORE_EXPERIENCE',
      title: '在今晚住宿区安排晚餐与短距活动',
      schedule: buildInTripDinnerWalk(
        problem,
        now,
        until,
        diningList[0],
        activities[0],
      ),
      reasonCodes: ['IN_TRIP_DAY', 'MORE_EXPERIENCE', 'LOCAL_ANCHOR_ONLY', 'SOLVER_ENUMERATION'],
      baseScore: 70,
    });
  }

  if (diningList[1] && remaining >= 50) {
    drafts.push({
      templateId: 'IN_TRIP_ALT_DINING',
      character: 'BALANCED',
      title: `晚餐改去 ${diningList[1].name} 后休息`,
      schedule: buildInTripDinnerRest(problem, now, until, diningList[1]),
      reasonCodes: ['IN_TRIP_DAY', 'ALT_DINING', 'SOLVER_ENUMERATION'],
      baseScore: 64,
    });
  }

  return drafts;
}

function gateRank(gate: MicroPlanRecommendation['gate']): number {
  if (gate === 'ALLOW') return 3;
  if (gate === 'NEED_CONFIRM') return 2;
  return 1;
}

function scheduleFingerprint(schedule: MicroPlanScheduleSlot[]): string {
  return schedule
    .map((s) => `${s.type}:${s.startTime}-${s.endTime}:${s.placeId ?? s.title ?? ''}`)
    .join('|');
}

function buildObservation(problem: MergedSameDayProblem): ContextualRecommendationsObservation {
  const city = hotelLabel(problem);
  const facts: string[] = [];
  const phase = problem.canonical.tripPhase;

  if (phase === 'ARRIVAL_DAY') facts.push('今天是落地日');
  if (phase === 'DEPARTURE_DAY') facts.push('今天是返程日');
  if (phase === 'IN_TRIP') facts.push(`焦点日 Day ${problem.canonical.focusDayIndex}`);

  if (problem.canonical.hotel) {
    facts.push(
      problem.canonical.hotel.confirmed
        ? `酒店已确认（${city}）`
        : `当晚住宿在 ${city}`,
    );
    if (problem.canonical.hotel.anchorSource === 'PRIOR_OVERNIGHT') {
      facts.push(
        `住宿沿用 Day ${problem.canonical.hotel.anchorDayIndex ?? '?'} 入住项（多晚连住）`,
      );
    }
  } else {
    facts.push('尚未解析到当晚酒店锚点，方案仅供参考');
  }

  if (problem.energy === 'LOW') facts.push('团队当前体力偏低');
  if (problem.temporaryConstraints.length) {
    facts.push(`临时状态：${problem.temporaryConstraints.slice(0, 3).join('、')}`);
  }
  if (problem.canonical.tomorrow?.earlyDeparture) {
    facts.push(
      `明天需早出发（约 ${problem.canonical.tomorrow.firstActivityStart ?? '较早'}）`,
    );
  }
  if (problem.canonical.team.childrenPresent) facts.push('行程含儿童同行');
  if (isAdverseWeather(problem.canonical.weatherHint)) {
    facts.push(`今晚天气不利（${problem.canonical.weatherHint}）`);
  }
  if (problem.travelEta) {
    facts.push(
      `预计 ${problem.travelEta.totalMinutesUntilHotel} 分钟后到达酒店（驾驶约 ${problem.travelEta.driveMinutes} 分钟）`,
    );
  }

  const { remaining } = remainingWindow(problem);
  if (phase === 'IN_TRIP' || phase === 'DEPARTURE_DAY') {
    facts.push(`剩余可用约 ${remaining} 分钟`);
  }

  const summaryParts: string[] = [];
  if (phase === 'ARRIVAL_DAY') {
    summaryParts.push('团队刚抵达');
    summaryParts.push(
      problem.canonical.countryCode === 'IS' ? '冰岛' : problem.canonical.destination,
    );
  } else {
    summaryParts.push(`行程进行中，围绕 ${city}`);
  }
  if (problem.energy === 'LOW') summaryParts.push('整体体力偏低');
  if (problem.canonical.tomorrow?.earlyDeparture) summaryParts.push('明早需要早出发');
  if (isAdverseWeather(problem.canonical.weatherHint)) summaryParts.push('今晚有风雨');
  summaryParts.push('已从多组可执行组合中选出主方案');

  return {
    summary: `${summaryParts.filter(Boolean).join('，')}。`,
    facts,
  };
}

/**
 * Lightweight same-day combination solver:
 * enumerate template × local-candidate bindings → feasibility → rank → pick 1 + ≤2.
 * Not a content recommender; only judges executability of micro-plan combinations.
 */
export function solveSameDayCombinations(
  problem: MergedSameDayProblem,
): ContextualRecommendationsView | null {
  const phase = problem.canonical.tripPhase;
  const drafts =
    phase === 'ARRIVAL_DAY'
      ? enumerateArrivalDrafts(problem)
      : phase === 'IN_TRIP' || phase === 'DEPARTURE_DAY'
        ? enumerateInTripDrafts(problem)
        : enumerateArrivalDrafts(problem).length
          ? enumerateArrivalDrafts(problem)
          : enumerateInTripDrafts(problem);

  if (drafts.length === 0) return null;

  const evaluated = drafts.map((draft) => {
    const seed: MicroPlanRecommendation = {
      title: draft.title,
      reasonCodes: draft.reasonCodes,
      score: Math.max(
        0,
        Math.min(100, draft.baseScore + utilityBonus(problem, draft.character, draft.schedule)),
      ),
      schedule: draft.schedule,
      impact: estimateImpact(problem, draft.schedule, draft.character),
      gate: problem.canonical.hotel ? 'ALLOW' : 'NEED_CONFIRM',
    };
    const feasibility = evaluateAndRepairMicroPlan(problem, seed);
    const rec = {
      ...feasibility.recommendation,
      reasonCodes: [
        ...feasibility.recommendation.reasonCodes,
        'COMBINATION_SOLVER',
        `TEMPLATE_${draft.templateId}`,
      ].filter((c, i, arr) => arr.indexOf(c) === i),
      feasibility: {
        repaired: feasibility.repaired,
        violations: feasibility.violations,
      },
    };
    if (!problem.canonical.hotel && rec.gate === 'ALLOW') {
      rec.gate = 'NEED_CONFIRM';
      if (!rec.reasonCodes.includes('HOTEL_ANCHOR_MISSING')) {
        rec.reasonCodes = [...rec.reasonCodes, 'HOTEL_ANCHOR_MISSING'];
      }
    }
    return {
      draft,
      recommendation: rec,
      rankKey: gateRank(rec.gate) * 1000 + rec.score,
    };
  });

  evaluated.sort((a, b) => b.rankKey - a.rankKey);

  const primary = evaluated[0];
  if (!primary) return null;

  const alternatives: MicroPlanAlternative[] = [];
  const usedCharacters = new Set<AlternativeCharacter>([primary.draft.character]);
  const usedFingerprints = new Set([scheduleFingerprint(primary.recommendation.schedule)]);

  for (const row of evaluated.slice(1)) {
    if (alternatives.length >= 2) break;
    if (row.recommendation.gate === 'REJECT') continue;
    const fp = scheduleFingerprint(row.recommendation.schedule);
    if (usedFingerprints.has(fp)) continue;
    // Prefer distinct characters; allow second same character only if still under 2
    const charOk =
      !usedCharacters.has(row.draft.character) || alternatives.length === 0;
    if (!charOk && usedCharacters.size < 3) {
      // still skip duplicates of same character when we can fill diversity later
      const remainingDistinct = evaluated
        .slice(evaluated.indexOf(row) + 1)
        .some(
          (r) =>
            r.recommendation.gate !== 'REJECT' &&
            !usedCharacters.has(r.draft.character) &&
            !usedFingerprints.has(scheduleFingerprint(r.recommendation.schedule)),
        );
      if (remainingDistinct) continue;
    }
    usedCharacters.add(row.draft.character);
    usedFingerprints.add(fp);
    alternatives.push({
      title: row.recommendation.title,
      character: row.draft.character,
      reasonCodes: row.recommendation.reasonCodes,
      score: row.recommendation.score,
      schedule: row.recommendation.schedule,
      gate: row.recommendation.gate,
      impact: row.recommendation.impact,
    });
  }

  const observation = buildObservation(problem);
  if (primary.recommendation.feasibility?.repaired) {
    observation.facts = [...(observation.facts ?? []), '已按可行性约束收敛方案'];
  }
  if (primary.recommendation.gate === 'REJECT') {
    observation.facts = [
      ...(observation.facts ?? []),
      '当前约束下无可安全执行方案，请放宽返回时间或降低强度',
    ];
  }
  observation.facts = [
    ...(observation.facts ?? []),
    `组合求解评估 ${evaluated.length} 组候选`,
  ];

  return {
    scenario: 'SAME_DAY_ACTIVITY',
    observation,
    recommendation: primary.recommendation,
    alternatives,
    context: {
      tripPhase: problem.canonical.tripPhase,
      focusDayIndex: problem.canonical.focusDayIndex,
      hotelCity: problem.canonical.hotel?.cityName ?? null,
      energy: problem.energy,
      sources: problem.canonical.sources,
      solverMethod: 'enumeration_v1',
      candidatesEvaluated: evaluated.length,
    },
  };
}
