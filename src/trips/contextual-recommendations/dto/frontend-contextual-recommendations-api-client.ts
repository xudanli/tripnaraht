/**
 * Contextual Same-Day Recommendations — frontend TS client
 *
 * Mobile base: `/api/mobile/trips/:tripId/planning`
 * Canonical:   `/api/trips/:tripId/contextual-recommendations`
 *
 * @see FRONTEND_INTEGRATION.md
 */

export type TeamEnergy = 'LOW' | 'MEDIUM' | 'HIGH';
export type DesiredIntensity = 'LIGHT' | 'MODERATE' | 'FULL';
export type TripPhase = 'ARRIVAL_DAY' | 'IN_TRIP' | 'DEPARTURE_DAY' | 'UNKNOWN';
export type MicroPlanGate = 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
export type CommitVariant = 'PRIMARY' | 'MOST_RELAXED' | 'MORE_EXPERIENCE';

export type ContextDelta = {
  currentLocation?: { lat: number; lng: number; label?: string } | string;
  currentTime?: string;
  availableUntil?: string;
  desiredReturnTime?: string;
  tripPhase?: TripPhase;
  desiredIntensity?: DesiredIntensity;
  teamState?: {
    energy?: TeamEnergy;
    temporaryConstraints?: string[];
  };
  preference?: string[];
};

export type MicroPlanScheduleSlot = {
  type: 'HOTEL_CHECK_IN' | 'DINING' | 'LIGHT_ACTIVITY' | 'REST' | 'TRANSFER' | 'OTHER';
  startTime: string;
  endTime: string;
  title?: string;
  productId?: string;
  placeId?: number;
  note?: string;
};

export type ContextualRecommendationsView = {
  scenario: 'SAME_DAY_ACTIVITY';
  observation: { summary: string; facts?: string[] };
  recommendation: {
    title: string;
    reasonCodes: string[];
    score: number;
    schedule: MicroPlanScheduleSlot[];
    impact: {
      additionalDrivingMinutes: number;
      walkingMinutes: number;
      estimatedCost?: number | null;
      currency?: string;
      tomorrowPlanImpact: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    };
    gate: MicroPlanGate;
    feasibility?: {
      repaired: boolean;
      violations: Array<{ code: string; severity: 'HARD' | 'SOFT'; message: string }>;
    };
  };
  alternatives: Array<{
    title: string;
    character: 'MOST_RELAXED' | 'MORE_EXPERIENCE' | 'BALANCED';
    reasonCodes?: string[];
    /** 组合求解后备选也带完整时间表，切换时无需重请求 */
    score?: number;
    schedule?: MicroPlanScheduleSlot[];
    gate?: MicroPlanGate;
    impact?: ContextualRecommendationsView['recommendation']['impact'];
  }>;
  context: {
    tripPhase: TripPhase;
    focusDayIndex: number;
    hotelCity?: string | null;
    energy: TeamEnergy;
    intentCompileSource?: 'rules' | 'rules+llm' | 'none';
    intentMatchedPhrases?: string[];
    solverMethod?: 'enumeration_v1' | string;
    candidatesEvaluated?: number;
  };
  apiKind?: 'CONTEXTUAL_SAME_DAY';
};

export type ContextualCommitResult = {
  dayIndex: number;
  title: string;
  variant: CommitVariant;
  createdItemIds: string[];
  skippedSlotTypes: string[];
  itemCount: number;
  gate: MicroPlanGate;
  feasibilityRepaired: boolean;
  contextVersion?: number;
  planVersion?: number;
};

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
}

function mobileBase(tripId: string) {
  return `/api/mobile/trips/${tripId}/planning`;
}

async function request<T>(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || json.success === false) {
    const err = new Error(json.message ?? `HTTP ${res.status}`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  return json.data;
}

/** 正式：情境化当天微规划 */
export async function recommendTodayActivities(
  token: string,
  tripId: string,
  body: {
    intent?: string;
    dayIndex?: number;
    contextDelta?: ContextDelta;
    useLlmIntent?: boolean;
    useLiveRoutes?: boolean;
  },
): Promise<ContextualRecommendationsView> {
  return request(`${mobileBase(tripId)}/contextual-recommendations`, token, {
    method: 'POST',
    body: JSON.stringify({
      scenario: 'SAME_DAY_ACTIVITY',
      ...body,
    }),
  });
}

/** 引导 GET（迁移用）；正式请用 recommendTodayActivities */
export async function fetchTodayActivitiesBootstrap(
  token: string,
  tripId: string,
  query?: {
    dayIndex?: number;
    intent?: string;
    energy?: TeamEnergy;
    intensity?: DesiredIntensity;
    returnBy?: string;
    tripPhase?: TripPhase;
    lat?: number;
    lng?: number;
    locationLabel?: string;
  },
): Promise<ContextualRecommendationsView> {
  const params = new URLSearchParams();
  if (query?.dayIndex != null) params.set('dayIndex', String(query.dayIndex));
  if (query?.intent) params.set('intent', query.intent);
  if (query?.energy) params.set('energy', query.energy);
  if (query?.intensity) params.set('intensity', query.intensity);
  if (query?.returnBy) params.set('returnBy', query.returnBy);
  if (query?.tripPhase) params.set('tripPhase', query.tripPhase);
  if (query?.lat != null) params.set('lat', String(query.lat));
  if (query?.lng != null) params.set('lng', String(query.lng));
  if (query?.locationLabel) params.set('locationLabel', query.locationLabel);
  const qs = params.toString();
  return request(
    `${mobileBase(tripId)}/today-activities${qs ? `?${qs}` : ''}`,
    token,
  );
}

/** 加入今天行程 */
export async function commitTodayActivities(
  token: string,
  tripId: string,
  body: {
    variant?: CommitVariant;
    dayIndex?: number;
    title?: string;
    schedule?: MicroPlanScheduleSlot[];
    intent?: string;
    contextDelta?: ContextDelta;
    forceConfirm?: boolean;
  },
  opts: { contextVersion: number; idempotencyKey: string },
): Promise<ContextualCommitResult> {
  return request(`${mobileBase(tripId)}/contextual-recommendations/commit`, token, {
    method: 'POST',
    headers: {
      'If-Match': String(opts.contextVersion),
      'Idempotency-Key': opts.idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}
