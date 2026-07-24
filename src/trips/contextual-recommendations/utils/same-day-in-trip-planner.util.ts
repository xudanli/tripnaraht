import {
  formatMinutesAsClock,
  parseClockToMinutes,
} from './same-day-context-merge.util';
import type {
  ContextualRecommendationsView,
  MergedSameDayProblem,
  MicroPlanAlternative,
  MicroPlanRecommendation,
  MicroPlanScheduleSlot,
} from '../types/contextual-recommendations.types';

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

function remainingMinutes(problem: MergedSameDayProblem): {
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

function buildShortRestSchedule(
  problem: MergedSameDayProblem,
  now: number,
  until: number,
): MicroPlanScheduleSlot[] {
  const dinnerStart = Math.min(now + 20, until - 50);
  const dinnerEnd = Math.min(dinnerStart + 50, until - 10);
  const dining = problem.localCandidates?.find((c) => c.kind === 'DINING');
  return [
    {
      type: 'DINING',
      startTime: formatMinutesAsClock(Math.max(now, dinnerStart)),
      endTime: formatMinutesAsClock(Math.max(dinnerEnd, dinnerStart + 30)),
      title: dining?.name ?? '附近轻松用餐',
      placeId: dining?.placeId,
      note: dining?.distanceKm != null
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

function buildLocalEveningSchedule(
  problem: MergedSameDayProblem,
  now: number,
  until: number,
  withWalk: boolean,
): MicroPlanScheduleSlot[] {
  const city = hotelLabel(problem);
  const dinnerStart = Math.max(now + 15, Math.min(now + 30, until - 90));
  const dinnerEnd = dinnerStart + 55;
  const slots: MicroPlanScheduleSlot[] = [
    {
      type: 'DINING',
      startTime: formatMinutesAsClock(dinnerStart),
      endTime: formatMinutesAsClock(dinnerEnd),
      title: `${city}附近晚餐`,
      note: '步行约 10 分钟范围内',
    },
  ];
  if (withWalk && until - dinnerEnd >= 35) {
    const walkStart = dinnerEnd + 10;
    const walkEnd = Math.min(walkStart + 25, until - 10);
    slots.push({
      type: 'LIGHT_ACTIVITY',
      startTime: formatMinutesAsClock(walkStart),
      endTime: formatMinutesAsClock(walkEnd),
      title: '住宿点附近短距散步',
      note: '不离开今晚活动区',
    });
  }
  slots.push({
    type: 'REST',
    startTime: formatMinutesAsClock(
      withWalk && until - dinnerEnd >= 35
        ? Math.min(dinnerEnd + 35, until - 5)
        : dinnerEnd,
    ),
    endTime: formatMinutesAsClock(until),
    title: '返回休息',
  });
  return slots;
}

function scoreInTrip(
  problem: MergedSameDayProblem,
  character: 'relaxed' | 'balanced',
): number {
  let score = 68;
  if (problem.energy === 'LOW') score += character === 'relaxed' ? 16 : 6;
  if (problem.desiredIntensity === 'LIGHT') score += character === 'relaxed' ? 10 : 2;
  if (isAdverseWeather(problem.canonical.weatherHint)) {
    score += character === 'relaxed' ? 12 : -8;
  }
  if (problem.canonical.tomorrow?.earlyDeparture) {
    score += character === 'relaxed' ? 8 : -4;
  }
  return Math.max(0, Math.min(100, score));
}

function buildRecommendation(problem: MergedSameDayProblem): MicroPlanRecommendation {
  const { now, until, remaining } = remainingMinutes(problem);
  const adverse = isAdverseWeather(problem.canonical.weatherHint);
  const low =
    problem.energy === 'LOW' ||
    problem.desiredIntensity === 'LIGHT' ||
    adverse ||
    remaining < 100;

  const wantWalk =
    !low &&
    remaining >= 120 &&
    problem.preferences.some((p) => /逛逛|散步|看看/i.test(p));

  const schedule = low
    ? buildShortRestSchedule(problem, now, until)
    : buildLocalEveningSchedule(problem, now, until, wantWalk || remaining >= 150);

  const character = low ? 'relaxed' : 'balanced';
  const reasonCodes = [
    problem.canonical.tripPhase === 'DEPARTURE_DAY' ? 'DEPARTURE_DAY' : 'IN_TRIP_DAY',
    'LOCAL_ANCHOR_ONLY',
    'LOW_DECISION_COST',
    remaining < 100 ? 'SHORT_REMAINING_WINDOW' : 'EVENING_WINDOW',
  ];
  if (problem.energy === 'LOW') reasonCodes.push('LOW_TEAM_ENERGY');
  if (adverse) reasonCodes.push('WEATHER_ADVERSE');
  if (problem.canonical.tomorrow?.earlyDeparture) {
    reasonCodes.push('EARLY_DEPARTURE_TOMORROW');
  }
  if (problem.canonical.hotel?.confirmed) reasonCodes.push('HOTEL_CONFIRMED');
  if (!problem.canonical.hotel) reasonCodes.push('HOTEL_ANCHOR_MISSING');

  return {
    title: low
      ? '利用剩余时间安排轻松晚餐后休息'
      : '在今晚住宿区安排晚餐与短距活动',
    reasonCodes: [...new Set(reasonCodes)],
    score: scoreInTrip(problem, character),
    schedule,
    impact: {
      additionalDrivingMinutes: 0,
      walkingMinutes: low ? 10 : wantWalk ? 30 : 15,
      estimatedCost: low ? 8000 : 11000,
      currency: 'ISK',
      tomorrowPlanImpact: 'NONE',
    },
    gate: problem.canonical.hotel ? 'ALLOW' : 'NEED_CONFIRM',
  };
}

function buildAlternatives(problem: MergedSameDayProblem): MicroPlanAlternative[] {
  return [
    {
      title: '直接休息，不做额外安排',
      character: 'MOST_RELAXED',
      reasonCodes: ['PROTECT_ENERGY'],
    },
    {
      title: '加一段住宿点附近散步',
      character: 'MORE_EXPERIENCE',
      reasonCodes: ['OPTIONAL_LOCAL_WALK'],
    },
  ];
}

function buildObservation(problem: MergedSameDayProblem): ContextualRecommendationsView['observation'] {
  const { remaining } = remainingMinutes(problem);
  const city = hotelLabel(problem);
  const hasHotel = Boolean(problem.canonical.hotel);
  const facts: string[] = [
    `焦点日 Day ${problem.canonical.focusDayIndex}`,
    hasHotel
      ? `今晚锚点：${city}`
      : '尚未解析到当晚酒店锚点，方案仅供参考',
    `剩余可用约 ${remaining} 分钟`,
  ];
  if (problem.canonical.hotel?.anchorSource === 'PRIOR_OVERNIGHT') {
    facts.push(
      `住宿沿用 Day ${problem.canonical.hotel.anchorDayIndex ?? '?'} 入住项（多晚连住）`,
    );
  }
  if (problem.energy === 'LOW') facts.push('团队体力偏低');
  if (isAdverseWeather(problem.canonical.weatherHint)) {
    facts.push(`天气不利（${problem.canonical.weatherHint}）`);
  }
  if (problem.canonical.tomorrow?.earlyDeparture) {
    facts.push(
      `明日早出发（约 ${problem.canonical.tomorrow.firstActivityStart ?? '较早'}）`,
    );
  }

  return {
    summary: hasHotel
      ? `行程进行中，围绕 ${city} 用接下来约 ${remaining} 分钟做低扰动安排。`
      : `行程进行中，剩余约 ${remaining} 分钟；因缺少酒店锚点，建议确认后再写入行程。`,
    facts,
  };
}

/**
 * Same-day micro-plan for IN_TRIP / DEPARTURE_DAY — stay local to tonight's anchor.
 */
export function planInTripDayMicroItinerary(
  problem: MergedSameDayProblem,
): ContextualRecommendationsView | null {
  const phase = problem.canonical.tripPhase;
  if (phase !== 'IN_TRIP' && phase !== 'DEPARTURE_DAY') return null;

  return {
    scenario: 'SAME_DAY_ACTIVITY',
    observation: buildObservation(problem),
    recommendation: buildRecommendation(problem),
    alternatives: buildAlternatives(problem),
    context: {
      tripPhase: phase,
      focusDayIndex: problem.canonical.focusDayIndex,
      hotelCity: problem.canonical.hotel?.cityName ?? null,
      energy: problem.energy,
      sources: problem.canonical.sources,
    },
  };
}
