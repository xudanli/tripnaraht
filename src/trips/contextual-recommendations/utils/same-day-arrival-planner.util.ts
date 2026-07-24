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

/** Hard rejects for Iceland arrival-day micro-plans (product ids / name keys). */
const ARRIVAL_DAY_REJECT_KEYS = [
  'kirkjufell',
  '教会山',
  'blue_lagoon',
  '蓝湖',
  'sky_lagoon',
  'long_hike',
  'glacier_hike',
  'northern_lights_chase',
];

function hotelCityLabel(problem: MergedSameDayProblem): string {
  return (
    problem.canonical.hotel?.cityName?.trim() ||
    problem.canonical.hotel?.name?.trim() ||
    '酒店'
  );
}

function isReykjavikStay(problem: MergedSameDayProblem): boolean {
  const hay = [
    problem.canonical.hotel?.cityName,
    problem.canonical.hotel?.name,
    problem.currentLocation?.label,
  ]
    .filter(Boolean)
    .join(' ');
  return /reykjavik|雷克雅未克|rek\b/i.test(hay) || problem.canonical.countryCode === 'IS';
}

function estimateArrivalAtHotelMinutes(problem: MergedSameDayProblem): number {
  const now = parseClockToMinutes(problem.currentTimeIso) ?? 16 * 60 + 20;
  if (problem.travelEta?.totalMinutesUntilHotel != null) {
    return now + problem.travelEta.totalMinutesUntilHotel;
  }
  const loc = problem.currentLocation;
  const atKef =
    loc &&
    (Math.abs(loc.lat - 63.985) < 0.15 || /keflavik|凯夫拉维克|kef\b/i.test(loc.label ?? ''));
  // Legacy fallback when enrichment missing
  if (atKef) return now + 110;
  return now + 40;
}

function pickDiningCandidate(problem: MergedSameDayProblem): {
  title: string;
  placeId?: number;
  note?: string;
} {
  const hit = problem.localCandidates?.find((c) => c.kind === 'DINING');
  if (hit) {
    return {
      title: hit.name,
      placeId: hit.placeId,
      note:
        hit.distanceKm != null
          ? `距酒店约 ${hit.distanceKm} km`
          : '酒店附近晚餐',
    };
  }
  return {
    title: '酒店附近轻松晚餐',
    note: '步行约 10 分钟范围内',
  };
}

function pickLightActivityCandidate(
  problem: MergedSameDayProblem,
  preferHarpa: boolean,
): { title: string; placeId?: number; productId?: string; note?: string } {
  const activities = problem.localCandidates?.filter((c) => c.kind === 'LIGHT_ACTIVITY') ?? [];
  const byHarpa = activities.find((c) =>
    /harpa|哈帕/i.test(`${c.name} ${c.productId ?? ''}`),
  );
  const bySun = activities.find((c) =>
    /sun|航海|sólfar|solfar|poi_sun/i.test(`${c.name} ${c.productId ?? ''}`),
  );
  const hit = preferHarpa ? byHarpa ?? bySun ?? activities[0] : bySun ?? byHarpa ?? activities[0];
  if (hit) {
    return {
      title: hit.name,
      placeId: hit.placeId,
      productId: hit.productId,
      note:
        hit.distanceKm != null
          ? `距酒店约 ${hit.distanceKm} km · 视体力可缩短`
          : '视体力可缩短或取消',
    };
  }
  return {
    title: preferHarpa ? '哈帕与海滨短暂散步' : '太阳航海者 / 海滨短暂停留',
    productId: preferHarpa ? 'poi_harpa_waterfront' : 'poi_sun_voyager',
    note: '视体力可缩短或取消',
  };
}

function resolveReturnDeadlineMinutes(problem: MergedSameDayProblem): number {
  return (
    parseClockToMinutes(problem.desiredReturnTime) ??
    parseClockToMinutes(problem.availableUntil) ??
    21 * 60
  );
}

function buildRelaxedSchedule(
  problem: MergedSameDayProblem,
  checkInStart: number,
  returnBy: number,
): MicroPlanScheduleSlot[] {
  const checkInEnd = checkInStart + 30;
  const dinnerStart = Math.max(checkInEnd + 15, checkInStart + 45);
  const dinnerEnd = Math.min(dinnerStart + 60, returnBy - 15);
  const dining = pickDiningCandidate(problem);
  return [
    {
      type: 'HOTEL_CHECK_IN',
      startTime: formatMinutesAsClock(checkInStart),
      endTime: formatMinutesAsClock(checkInEnd),
      title: '办理入住、放置行李',
    },
    {
      type: 'DINING',
      startTime: formatMinutesAsClock(dinnerStart),
      endTime: formatMinutesAsClock(Math.max(dinnerEnd, dinnerStart + 45)),
      title: dining.title,
      placeId: dining.placeId,
      note: dining.note,
    },
    {
      type: 'REST',
      startTime: formatMinutesAsClock(Math.max(dinnerEnd, dinnerStart + 45)),
      endTime: formatMinutesAsClock(returnBy),
      title: '返回酒店休息',
    },
  ];
}

function buildBalancedSchedule(
  problem: MergedSameDayProblem,
  checkInStart: number,
  returnBy: number,
  includeHarpa: boolean,
): MicroPlanScheduleSlot[] {
  const checkInEnd = checkInStart + 30;
  const dinnerStart = Math.max(checkInEnd + 15, checkInStart + 45);
  const dinnerEnd = dinnerStart + 60;
  const dining = pickDiningCandidate(problem);
  const activity = pickLightActivityCandidate(problem, includeHarpa);
  const walkStart = dinnerEnd + 10;
  const walkEnd = Math.min(walkStart + (includeHarpa ? 40 : 20), returnBy - 15);
  const slots: MicroPlanScheduleSlot[] = [
    {
      type: 'HOTEL_CHECK_IN',
      startTime: formatMinutesAsClock(checkInStart),
      endTime: formatMinutesAsClock(checkInEnd),
      title: '办理入住、放置行李',
    },
    {
      type: 'DINING',
      startTime: formatMinutesAsClock(dinnerStart),
      endTime: formatMinutesAsClock(dinnerEnd),
      title: dining.title,
      placeId: dining.placeId,
      note: dining.note ?? '步行约 10 分钟范围内',
    },
  ];
  if (walkEnd > walkStart + 10) {
    slots.push({
      type: 'LIGHT_ACTIVITY',
      startTime: formatMinutesAsClock(walkStart),
      endTime: formatMinutesAsClock(walkEnd),
      title: activity.title,
      placeId: activity.placeId,
      productId: activity.productId,
      note: activity.note,
    });
  }
  slots.push({
    type: 'TRANSFER',
    startTime: formatMinutesAsClock(Math.max(walkEnd, dinnerEnd)),
    endTime: formatMinutesAsClock(returnBy),
    title: '返回酒店',
  });
  return slots;
}

function isAdverseWeather(hint?: string | null): boolean {
  return !!hint && /rain|wind|storm|雨|风|风暴|大风/i.test(hint);
}

function scoreArrivalPlan(problem: MergedSameDayProblem, character: 'balanced' | 'relaxed' | 'experience'): number {
  let score = 70;
  if (problem.energy === 'LOW') score += character === 'relaxed' ? 18 : character === 'balanced' ? 12 : -8;
  if (problem.energy === 'MEDIUM') score += character === 'balanced' ? 16 : 8;
  if (problem.energy === 'HIGH') score += character === 'experience' ? 14 : 6;
  if (problem.desiredIntensity === 'LIGHT') score += character === 'experience' ? -10 : 8;
  if (problem.canonical.tomorrow?.earlyDeparture) score += character === 'experience' ? -6 : 6;
  if (problem.canonical.team.childrenPresent) score += character === 'experience' ? -4 : 4;
  if (problem.temporaryConstraints.some((c) => /motion|晕车|疲劳|飞行|jet\s*lag/i.test(c))) {
    score += character === 'relaxed' ? 10 : character === 'experience' ? -12 : 4;
  }
  if (isAdverseWeather(problem.canonical.weatherHint)) {
    score += character === 'relaxed' ? 10 : character === 'experience' ? -14 : -4;
  }
  return Math.max(0, Math.min(100, score));
}

export type ArrivalPlanVariant = 'PRIMARY' | 'MOST_RELAXED' | 'MORE_EXPERIENCE';

/** Build schedule for a named variant (commit path / alternative confirm). */
export function buildArrivalScheduleForVariant(
  problem: MergedSameDayProblem,
  variant: ArrivalPlanVariant,
): { title: string; schedule: MicroPlanScheduleSlot[]; reasonCodes: string[] } {
  const checkInStart = estimateArrivalAtHotelMinutes(problem);
  const returnBy = resolveReturnDeadlineMinutes(problem);
  const adverse = isAdverseWeather(problem.canonical.weatherHint);

  if (variant === 'MOST_RELAXED') {
    return {
      title: '先入住，晚餐后直接休息',
      schedule: buildRelaxedSchedule(problem, checkInStart, returnBy),
      reasonCodes: ['ARRIVAL_DAY', 'MOST_RELAXED', ...(adverse ? ['WEATHER_ADVERSE'] : [])],
    };
  }
  if (variant === 'MORE_EXPERIENCE') {
    return {
      title: adverse
        ? '先入住，晚餐后短距室内友好散步（视天气缩短）'
        : '先入住，再安排哈帕与海滨散步',
      schedule: buildBalancedSchedule(problem, checkInStart, returnBy, !adverse),
      reasonCodes: [
        'ARRIVAL_DAY',
        'MORE_EXPERIENCE',
        ...(adverse ? ['WEATHER_ADVERSE', 'SHORTENED_OUTDOOR'] : ['CITY_WATERFRONT']),
      ],
    };
  }

  // PRIMARY — same policy as buildPrimaryRecommendation
  const lowEnergy =
    problem.energy === 'LOW' ||
    problem.desiredIntensity === 'LIGHT' ||
    adverse;
  const wantExperience =
    !adverse &&
    (problem.desiredIntensity === 'FULL' ||
      problem.preferences.some((p) => /体验|逛逛|散步|看看/i.test(p)));
  const useBalanced = !lowEnergy || wantExperience;
  const includeHarpa = wantExperience && problem.energy !== 'LOW' && !adverse;
  return {
    title: useBalanced
      ? '先入住，再安排轻松晚餐和海滨散步'
      : '先入住，再安排一顿轻松晚餐后休息',
    schedule: useBalanced
      ? buildBalancedSchedule(problem, checkInStart, returnBy, includeHarpa)
      : buildRelaxedSchedule(problem, checkInStart, returnBy),
    reasonCodes: ['ARRIVAL_DAY', useBalanced ? 'BALANCED' : 'MOST_RELAXED'],
  };
}

function buildPrimaryRecommendation(problem: MergedSameDayProblem): MicroPlanRecommendation {
  const adverse = isAdverseWeather(problem.canonical.weatherHint);
  const lowEnergy =
    problem.energy === 'LOW' || problem.desiredIntensity === 'LIGHT' || adverse;
  const wantExperience =
    !adverse &&
    (problem.desiredIntensity === 'FULL' ||
      problem.preferences.some((p) => /体验|逛逛|散步|看看/i.test(p)));

  const useBalanced = !lowEnergy || wantExperience;
  const variant: ArrivalPlanVariant = useBalanced ? 'PRIMARY' : 'MOST_RELAXED';
  const built = buildArrivalScheduleForVariant(
    problem,
    useBalanced ? 'PRIMARY' : 'MOST_RELAXED',
  );
  // Re-derive character for scoring from primary policy
  const character = useBalanced ? 'balanced' : 'relaxed';
  const reasonCodes = [
    ...built.reasonCodes.filter((c) => c !== 'BALANCED' && c !== 'MOST_RELAXED'),
    problem.energy === 'LOW' ? 'LOW_TEAM_ENERGY' : 'MODERATE_TEAM_ENERGY',
    'NO_RESERVATION_REQUIRED',
    'LOW_DETOUR',
  ];
  if (problem.canonical.tomorrow?.earlyDeparture) {
    reasonCodes.push('EARLY_DEPARTURE_TOMORROW');
  }
  if (problem.canonical.team.childrenPresent) {
    reasonCodes.push('FAMILY_WITH_CHILDREN');
  }
  if (problem.canonical.hotel?.confirmed) {
    reasonCodes.push('HOTEL_CONFIRMED');
  }
  if (!problem.canonical.hotel) {
    reasonCodes.push('HOTEL_ANCHOR_MISSING');
  }
  if (adverse) {
    reasonCodes.push('WEATHER_ADVERSE');
  }
  if (problem.travelEta) {
    reasonCodes.push('TRAVEL_ETA_ENRICHED');
  }
  if (problem.localCandidates?.some((c) => c.kind === 'DINING')) {
    reasonCodes.push('LOCAL_DINING_CANDIDATE');
  }
  reasonCodes.push('REJECTED_HIGH_LOAD_OPTIONS');

  void variant;
  const driveToHotel = problem.travelEta?.driveMinutes ?? 0;
  return {
    title: built.title,
    reasonCodes: [...new Set(reasonCodes)],
    score: scoreArrivalPlan(problem, character),
    schedule: built.schedule,
    impact: {
      additionalDrivingMinutes: useBalanced ? Math.max(4, Math.round(driveToHotel * 0.05)) : 0,
      walkingMinutes: useBalanced ? 25 : 12,
      estimatedCost: useBalanced ? 12000 : 8000,
      currency: 'ISK',
      tomorrowPlanImpact: 'NONE',
    },
    gate: problem.canonical.hotel ? 'ALLOW' : 'NEED_CONFIRM',
  };
}

function buildAlternatives(problem: MergedSameDayProblem): MicroPlanAlternative[] {
  const low = problem.energy === 'LOW' || problem.desiredIntensity === 'LIGHT';
  if (low) {
    return [
      {
        title: '晚餐后直接休息',
        character: 'MOST_RELAXED',
        reasonCodes: ['LOW_TEAM_ENERGY', 'PROTECT_TOMORROW'],
      },
      {
        title: '状态良好时增加哈帕与海滨散步',
        character: 'MORE_EXPERIENCE',
        reasonCodes: ['OPTIONAL_IF_ENERGY_ALLOWS'],
      },
    ];
  }
  return [
    {
      title: '晚餐后直接休息',
      character: 'MOST_RELAXED',
      reasonCodes: ['LOWER_DECISION_COST'],
    },
    {
      title: '加入哈帕音乐厅和城市散步',
      character: 'MORE_EXPERIENCE',
      reasonCodes: ['CITY_WATERFRONT'],
    },
  ];
}

function buildObservation(problem: MergedSameDayProblem): ContextualRecommendationsView['observation'] {
  const city = hotelCityLabel(problem);
  const facts: string[] = [];
  if (problem.canonical.tripPhase === 'ARRIVAL_DAY') {
    facts.push('今天是落地日');
  }
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
  if (problem.energy === 'LOW') {
    facts.push('团队当前体力偏低');
  }
  if (problem.temporaryConstraints.length) {
    facts.push(`临时状态：${problem.temporaryConstraints.slice(0, 3).join('、')}`);
  }
  if (problem.canonical.tomorrow?.earlyDeparture) {
    const t = problem.canonical.tomorrow.firstActivityStart ?? '较早';
    facts.push(`明天需早出发（约 ${t}）`);
  }
  if (problem.canonical.team.childrenPresent) {
    facts.push('行程含儿童同行');
  }
  if (isAdverseWeather(problem.canonical.weatherHint)) {
    facts.push(`今晚天气不利（${problem.canonical.weatherHint}）`);
  }
  if (problem.travelEta) {
    facts.push(
      `预计 ${problem.travelEta.totalMinutesUntilHotel} 分钟后到达酒店（驾驶约 ${problem.travelEta.driveMinutes} 分钟）`,
    );
  }

  const summaryParts = [
    '团队刚抵达',
    problem.canonical.countryCode === 'IS' ? '冰岛' : problem.canonical.destination,
  ];
  if (problem.energy === 'LOW') summaryParts.push('整体体力偏低');
  if (problem.canonical.tomorrow?.earlyDeparture) summaryParts.push('明早需要早出发');
  if (isAdverseWeather(problem.canonical.weatherHint)) summaryParts.push('今晚有风雨');

  return {
    summary: `${summaryParts.filter(Boolean).join('，')}。`,
    facts,
  };
}

/**
 * Rule-based Iceland (and Reykjavik-stay) arrival-day micro-planner.
 * Returns null when the problem is not an arrival-day scenario this MVP handles.
 */
export function planArrivalDayMicroItinerary(
  problem: MergedSameDayProblem,
): ContextualRecommendationsView | null {
  if (problem.canonical.tripPhase !== 'ARRIVAL_DAY') return null;
  if (problem.canonical.countryCode !== 'IS' && !isReykjavikStay(problem)) {
    // Soft allow IS destination via countryCode; non-IS arrival still gets hotel-centric template if hotel known
    if (!problem.canonical.hotel) return null;
  }

  const recommendation = buildPrimaryRecommendation(problem);
  return {
    scenario: 'SAME_DAY_ACTIVITY',
    observation: buildObservation(problem),
    recommendation,
    alternatives: buildAlternatives(problem),
    context: {
      tripPhase: problem.canonical.tripPhase,
      focusDayIndex: problem.canonical.focusDayIndex,
      hotelCity: problem.canonical.hotel?.cityName ?? null,
      energy: problem.energy,
      sources: problem.canonical.sources,
    },
  };
}

export function isRejectedArrivalActivityKey(key: string): boolean {
  const n = key.toLowerCase();
  return ARRIVAL_DAY_REJECT_KEYS.some((k) => n.includes(k.toLowerCase()));
}
