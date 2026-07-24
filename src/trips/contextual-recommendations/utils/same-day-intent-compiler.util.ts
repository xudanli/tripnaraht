import type {
  ContextualRecommendationsContextDelta,
  DesiredIntensity,
  TeamEnergyLevel,
  TripPhaseHint,
} from '../types/contextual-recommendations.types';

export type SameDayCompiledIntent = {
  contextDelta: ContextualRecommendationsContextDelta;
  matchedPhrases: string[];
  source: 'rules' | 'rules+llm';
};

/**
 * Rule-based NL → Context Delta for same-day micro-planning.
 * Does not invent hotel / team structure — only field state the user is expressing now.
 */
export function compileSameDayIntent(intent: string): SameDayCompiledIntent {
  const raw = intent.trim();
  const matchedPhrases: string[] = [];
  const delta: ContextualRecommendationsContextDelta = {};

  if (!raw) {
    return { contextDelta: delta, matchedPhrases, source: 'rules' };
  }

  const tripPhase = inferTripPhase(raw, matchedPhrases);
  if (tripPhase) delta.tripPhase = tripPhase;

  const energy = inferEnergy(raw, matchedPhrases);
  const intensity = inferIntensity(raw, energy, matchedPhrases);
  if (intensity) delta.desiredIntensity = intensity;
  if (energy) {
    delta.teamState = { ...(delta.teamState ?? {}), energy };
  }

  const constraints = inferTemporaryConstraints(raw, matchedPhrases);
  if (constraints.length) {
    delta.teamState = {
      ...(delta.teamState ?? {}),
      temporaryConstraints: constraints,
    };
  }

  const preferences = inferPreferences(raw, matchedPhrases);
  if (preferences.length) delta.preference = preferences;

  const returnBy = inferReturnTime(raw, matchedPhrases);
  if (returnBy) {
    delta.desiredReturnTime = returnBy;
    delta.availableUntil = returnBy;
  }

  return { contextDelta: delta, matchedPhrases, source: 'rules' };
}

/**
 * Explicit client contextDelta wins over compiled intent fields.
 */
export function mergeCompiledIntentWithDelta(
  compiled: ContextualRecommendationsContextDelta,
  explicit?: ContextualRecommendationsContextDelta | null,
): ContextualRecommendationsContextDelta {
  if (!explicit) return { ...compiled };
  return {
    ...compiled,
    ...explicit,
    teamState: {
      ...(compiled.teamState ?? {}),
      ...(explicit.teamState ?? {}),
      temporaryConstraints: [
        ...new Set([
          ...(compiled.teamState?.temporaryConstraints ?? []),
          ...(explicit.teamState?.temporaryConstraints ?? []),
        ]),
      ],
    },
    preference: explicit.preference?.length
      ? explicit.preference
      : compiled.preference,
  };
}

function inferTripPhase(raw: string, matched: string[]): TripPhaseHint | undefined {
  if (/落地|刚到|抵达|arrival|刚下飞机|凯夫拉维克|取车/i.test(raw)) {
    matched.push('落地日');
    return 'ARRIVAL_DAY';
  }
  if (/回国|离开|出发回国|departure|返程|去机场/i.test(raw)) {
    matched.push('离开日');
    return 'DEPARTURE_DAY';
  }
  return undefined;
}

function inferEnergy(raw: string, matched: string[]): TeamEnergyLevel | undefined {
  if (/累|疲劳|没劲|exhausted|tired|jet\s*lag|倒时差|不想动|休息/i.test(raw)) {
    matched.push('体力偏低');
    return 'LOW';
  }
  if (/精力充沛|状态很好|很有劲|high energy/i.test(raw)) {
    matched.push('体力较好');
    return 'HIGH';
  }
  return undefined;
}

function inferIntensity(
  raw: string,
  energy: TeamEnergyLevel | undefined,
  matched: string[],
): DesiredIntensity | undefined {
  if (/轻松|轻量|随便|简单|轻度|light|relaxed|轻松点/i.test(raw)) {
    matched.push('轻松强度');
    return 'LIGHT';
  }
  if (/多玩玩|多体验|充实|拉满|full day|多逛/i.test(raw)) {
    matched.push('高体验');
    return 'FULL';
  }
  if (energy === 'LOW') return 'LIGHT';
  if (energy === 'HIGH') return 'FULL';
  return undefined;
}

function inferTemporaryConstraints(raw: string, matched: string[]): string[] {
  const out: string[] = [];
  if (/晕车|晕机|motion\s*sick/i.test(raw)) {
    out.push('MOTION_SICKNESS');
    matched.push('晕车');
  }
  if (/长途飞行|刚飞完|长途|飞行后/i.test(raw)) {
    out.push('刚完成长途飞行');
    matched.push('长途飞行后');
  }
  if (/孩子睡着|小孩睡|baby asleep/i.test(raw)) {
    out.push('CHILD_ASLEEP');
    matched.push('孩子休息中');
  }
  if (/雨|下雨|大风|storm|windy/i.test(raw)) {
    out.push('WEATHER_USER_REPORTED');
    matched.push('用户提及天气');
  }
  return out;
}

function inferPreferences(raw: string, matched: string[]): string[] {
  const prefs: string[] = [];
  if (/吃饭|吃个饭|吃点|晚餐|觅食|diner|dinner|想吃/i.test(raw)) {
    prefs.push('吃饭');
    matched.push('吃饭');
  }
  if (/逛逛|散步|走走|海滨|看看|walk/i.test(raw)) {
    prefs.push('简单逛逛');
    matched.push('简单逛逛');
  }
  if (/早点回|早回|回酒店|休息|sleep early/i.test(raw)) {
    prefs.push('早点回酒店');
    matched.push('早点回酒店');
  }
  if (/温泉|泡汤|lagoon|spa/i.test(raw)) {
    prefs.push('温泉');
    matched.push('温泉意向');
  }
  if (/全家|家人|孩子|儿童|family/i.test(raw)) {
    prefs.push('全家友好');
    matched.push('全家');
  }
  return [...new Set(prefs)];
}

function inferReturnTime(raw: string, matched: string[]): string | undefined {
  const hm = raw.match(/(?:在|到)?\s*(\d{1,2})\s*[:：点]\s*(\d{2})?\s*(?:前|之前)?(?:回|到酒店|结束)?/);
  if (hm) {
    const hh = Number(hm[1]);
    const mm = hm[2] != null ? Number(hm[2]) : 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      matched.push('目标回程时间');
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }
  if (/九点前|9点前|21点前/i.test(raw)) {
    matched.push('21:00前');
    return '21:00';
  }
  if (/十点前|10点前|22点前/i.test(raw)) {
    matched.push('22:00前');
    return '22:00';
  }
  return undefined;
}
