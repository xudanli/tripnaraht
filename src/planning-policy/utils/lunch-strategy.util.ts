/**
 * 午餐时间窗策略：分型、推断、配置与触点文案。
 *
 * staggered  — 主动错峰（热门景区）
 * rigid      — 刚性卡点（老人/小孩/定时进食）
 * route_driven — 路性驱动（自驾/无人区/公路旅行）
 * balanced   — 均衡默认
 */

export type LunchStrategy = 'staggered' | 'rigid' | 'route_driven' | 'balanced';

export interface LunchStrategySignals {
  lunch_strategy?: LunchStrategy | string | null;
  hasElderly?: boolean;
  hasChildren?: boolean;
  needsTimedMeals?: boolean;
  travelMode?: string | null;
  isRoadTrip?: boolean;
  isRemoteRoute?: boolean;
  isUrbanHotspot?: boolean;
  destination?: string | null;
  routeDirectionId?: string | null;
}

export interface LunchBreakSpec {
  enabled: boolean;
  duration_min: number;
  window: [string, string];
  /** 静止休息（分钟），含在 duration 语义内 */
  rest_min: number;
  meal_anchor: 'MEAL_FLOATING' | 'MEAL_ANCHOR';
}

export const LUNCH_STRATEGY_LABELS: Record<LunchStrategy, string> = {
  staggered: '主动错峰',
  rigid: '刚性卡点',
  route_driven: '路性驱动',
  balanced: '均衡默认',
};

const REMOTE_DESTINATION_RE =
  /冰岛|IS\b|西藏|新疆|青海|川西|独库|西北|高原|荒漠|冰岛|iceland|tibet|xinjiang|qinghai|desert|highland/i;

const URBAN_HOTSPOT_RE =
  /京都|东京|大阪|巴黎|罗马|成都|重庆|西安|丽江|大理|川西.*镇|热门|景区/i;

const ROAD_TRIP_ROUTE_RE = /ring|环岛|公路|road|drive|自驾|独库|一号公路/i;

export function normalizeLunchStrategy(raw?: string | null): LunchStrategy | null {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'staggered' || v === '错峰' || v === '主动错峰') return 'staggered';
  if (v === 'rigid' || v === '卡点' || v === '刚性卡点') return 'rigid';
  if (v === 'route_driven' || v === '路性' || v === '路性驱动' || v === 'route-driven') {
    return 'route_driven';
  }
  if (v === 'balanced' || v === '均衡' || v === '均衡默认') return 'balanced';
  return null;
}

export function resolveLunchStrategy(signals: LunchStrategySignals = {}): LunchStrategy {
  const explicit = normalizeLunchStrategy(signals.lunch_strategy as string);
  if (explicit) return explicit;

  if (signals.needsTimedMeals || signals.hasElderly) return 'rigid';
  if (
    signals.isRoadTrip ||
    signals.isRemoteRoute ||
    signals.travelMode === 'DRIVING' ||
    signals.travelMode === 'SELF_DRIVE'
  ) {
    return 'route_driven';
  }
  if (signals.isUrbanHotspot) return 'staggered';
  return 'balanced';
}

export function buildLunchBreakSpec(strategy: LunchStrategy): LunchBreakSpec {
  switch (strategy) {
    case 'staggered':
      return {
        enabled: true,
        duration_min: 75,
        window: ['11:15', '14:00'],
        rest_min: 20,
        meal_anchor: 'MEAL_FLOATING',
      };
    case 'rigid':
      return {
        enabled: true,
        duration_min: 90,
        window: ['12:00', '13:00'],
        rest_min: 20,
        meal_anchor: 'MEAL_ANCHOR',
      };
    case 'route_driven':
      return {
        enabled: true,
        duration_min: 60,
        window: ['11:30', '14:00'],
        rest_min: 20,
        meal_anchor: 'MEAL_FLOATING',
      };
    case 'balanced':
    default:
      return {
        enabled: true,
        duration_min: 60,
        window: ['11:30', '13:30'],
        rest_min: 20,
        meal_anchor: 'MEAL_FLOATING',
      };
  }
}

/** 午餐窗内要求的最长连续空档（分钟） */
export function getMinLunchGapMinutes(strategy: LunchStrategy): number {
  switch (strategy) {
    case 'rigid':
      return 60;
    case 'route_driven':
      return 45;
    case 'staggered':
      return 45;
    default:
      return 45;
  }
}

export function getLunchWindowForDetection(strategy: LunchStrategy): { start: string; end: string } {
  const spec = buildLunchBreakSpec(strategy);
  return { start: spec.window[0], end: spec.window[1] };
}

export function buildMealBlockWindows(
  dateIso: string,
  strategy: LunchStrategy,
): { start_window: string; end_window: string; meal_anchor: LunchBreakSpec['meal_anchor']; label: string } {
  const spec = buildLunchBreakSpec(strategy);
  const midStart = spec.window[0];
  const startHm =
    strategy === 'staggered'
      ? '11:45'
      : strategy === 'rigid'
        ? '12:00'
        : strategy === 'route_driven'
          ? '12:00'
          : '12:30';
  const duration = spec.duration_min;
  const [sh, sm] = startHm.split(':').map(Number);
  const endTotal = sh * 60 + sm + duration;
  const endHm = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;

  const labels: Record<LunchStrategy, string> = {
    staggered: '午餐留白（错峰）',
    rigid: '午餐留白（卡点）',
    route_driven: '午餐补给窗（沿路）',
    balanced: '午餐留白',
  };

  return {
    start_window: `${dateIso}T${startHm}`,
    end_window: `${dateIso}T${endHm}`,
    meal_anchor: spec.meal_anchor,
    label: labels[strategy],
  };
}

export function lunchStrategyInsightZh(strategy: LunchStrategy): string {
  switch (strategy) {
    case 'staggered':
      return '热门景区午餐集中在 12:00–13:30，建议 11:30 早鸟或 13:45 晚鸟错峰。';
    case 'rigid':
      return '同行有需要定时进食的成员，午餐建议锁定 12:00–13:00 并提前预订。';
    case 'route_driven':
      return '公路/无人区路线以集镇或服务区为补给节点，11:30–14:00 路过即停，勿等到饿再找。';
    default:
      return '中午保留 60 分钟用餐与静止休息，是下午体验的隐形安全线。';
  }
}

export function buildLunchWindowConflictCopy(params: {
  strategy: LunchStrategy;
  durationMinutes: number;
  minRequired: number;
}): { title: string; description: string; suggestions: Array<{ action: string; description: string; impact: string }> } {
  const label = LUNCH_STRATEGY_LABELS[params.strategy];
  const baseWhy =
    '中午是体力回血与情绪复位窗口；若仍在赶路或排长队，下午体验易崩盘。';

  let description = `午餐时间窗仅 ${params.durationMinutes} 分钟（${label}策略建议至少 ${params.minRequired} 分钟）。${baseWhy}`;
  const suggestions: Array<{ action: string; description: string; impact: string }> = [];

  switch (params.strategy) {
    case 'staggered':
      suggestions.push({
        action: '错峰用餐',
        description: '将上午最后一站提前至 11:15 结束，或改 13:45 后用餐以避开景区高峰',
        impact: '减少排队，保住午后情绪',
      });
      break;
    case 'rigid':
      suggestions.push({
        action: '锁定午餐并留冗余',
        description: '预订 12:00 餐厅，上午景点减 1 个并预留 20% 交通缓冲',
        impact: '满足定时进食，避免全员焦虑',
      });
      break;
    case 'route_driven':
      suggestions.push({
        action: '沿路补给',
        description: '在下一集镇/服务区插入 MEAL_FLOATING，无论饿否先停；地图上标记 Plan B 便利店',
        impact: '避免错过补给点后数十公里无餐饮',
      });
      break;
    default:
      suggestions.push({
        action: '延长午餐时间',
        description: '调整前后活动时间，为午餐留出至少 60 分钟（含 20 分钟静止休息）',
        impact: '确保有足够时间用餐与恢复',
      });
  }

  return {
    title: '午餐时间窗过短',
    description,
    suggestions,
  };
}

export function buildMealsAssessmentCopy(params: {
  strategy: LunchStrategy;
  lunchGapMinutes: number;
  minRequired: number;
}): { issue: string; suggestion: string } {
  const label = LUNCH_STRATEGY_LABELS[params.strategy];
  return {
    issue: `午餐时段空档不足，仅 ${params.lunchGapMinutes} 分钟（${label}策略建议 ≥${params.minRequired} 分钟）`,
    suggestion:
      params.strategy === 'route_driven'
        ? '在路线上的集镇/服务区预留补给停，并准备路餐 Plan B'
        : params.strategy === 'rigid'
          ? '锁定 12:00 用餐并减少上午景点，预留交通冗余'
          : params.strategy === 'staggered'
            ? '考虑 11:30 早午餐或 14:00 后正餐以错峰'
            : '在活动间预留至少 60 分钟午餐与静止休息',
  };
}

/** Agent 行程概览「餐饮」段落的策略提示（2–3 句） */
export function buildAgentMealBriefing(strategy: LunchStrategy): string {
  const label = LUNCH_STRATEGY_LABELS[strategy];
  const insight = lunchStrategyInsightZh(strategy);
  const planB =
    strategy === 'route_driven'
      ? '同时标注 Plan B 补给点（便利店/加油站），车上保留一顿热量冗余。'
      : '无心仪餐厅时，标记沿途便利店作为 Plan B。';
  return `午餐策略：${label}。${insight} ${planB}`;
}

export function extractLunchStrategySignalsFromTrip(trip: {
  metadata?: unknown;
  pacingConfig?: unknown;
  destination?: string | null;
}): LunchStrategySignals {
  const metadata = (trip.metadata ?? {}) as Record<string, unknown>;
  const pacing = (trip.pacingConfig ?? {}) as Record<string, unknown>;
  const tripParams = (metadata.tripParams ?? metadata.parsedParams ?? metadata.params ?? {}) as Record<
    string,
    unknown
  >;

  const destination = String(trip.destination ?? tripParams.destination ?? '').trim() || null;
  const routeDirectionId = String(metadata.routeDirectionId ?? '').trim() || null;
  const travelMode = String(pacing.travelMode ?? tripParams.travelMode ?? '').trim() || null;

  const destBlob = `${destination ?? ''} ${routeDirectionId ?? ''}`;
  const isRemoteRoute = REMOTE_DESTINATION_RE.test(destBlob);
  const isUrbanHotspot = URBAN_HOTSPOT_RE.test(destBlob);
  const isRoadTrip =
    travelMode === 'DRIVING' ||
    ROAD_TRIP_ROUTE_RE.test(destBlob) ||
    Boolean(metadata.createdFromNaturalLanguage && isRemoteRoute);

  return {
    lunch_strategy: (metadata.lunch_strategy as string) ?? (tripParams.lunch_strategy as string) ?? null,
    hasElderly: Boolean(tripParams.hasElderly ?? tripParams.has_elderly),
    hasChildren: Boolean(tripParams.hasChildren ?? tripParams.has_children),
    needsTimedMeals: Boolean(tripParams.needsTimedMeals ?? tripParams.needs_timed_meals),
    travelMode,
    isRoadTrip,
    isRemoteRoute,
    isUrbanHotspot,
    destination,
    routeDirectionId,
  };
}

export function resolveLunchStrategyFromTrip(trip: {
  metadata?: unknown;
  pacingConfig?: unknown;
  destination?: string | null;
}): LunchStrategy {
  return resolveLunchStrategy(extractLunchStrategySignalsFromTrip(trip));
}

export function toAgentLunchBreak(
  strategy: LunchStrategy,
): { enabled: boolean; duration_min: number; window: [string, string] } {
  const spec = buildLunchBreakSpec(strategy);
  return {
    enabled: spec.enabled,
    duration_min: spec.duration_min,
    window: spec.window,
  };
}

/** 从 NL 澄清 / 创建参数提取午餐策略信号 */
export function extractLunchStrategySignalsFromParams(
  params: Record<string, unknown>,
  destinationCode?: string | null,
): LunchStrategySignals {
  const pacing = (params.pacingConfig ?? {}) as Record<string, unknown>;
  const prefs = (params.preferences ?? {}) as Record<string, unknown>;
  const dest = String(params.destination ?? destinationCode ?? '').trim() || null;
  const destBlob = `${dest ?? ''} ${destinationCode ?? ''}`;

  const travelMode =
    String(params.travelMode ?? pacing.travelMode ?? prefs.travelMode ?? '').trim() || null;

  return {
    lunch_strategy: (params.lunch_strategy as string) ?? null,
    hasElderly: Boolean(params.hasElderly ?? params.has_elderly),
    hasChildren: Boolean(params.hasChildren ?? params.has_children),
    needsTimedMeals: Boolean(params.needsTimedMeals ?? params.needs_timed_meals),
    travelMode,
    isRoadTrip:
      Boolean(params.needsCarRental) ||
      travelMode === 'DRIVING' ||
      /自驾|租车|road\s*trip|self.?drive/i.test(String(params.travelStyle ?? prefs.style ?? '')),
    isRemoteRoute: REMOTE_DESTINATION_RE.test(destBlob),
    isUrbanHotspot: URBAN_HOTSPOT_RE.test(destBlob),
    destination: dest,
    routeDirectionId: String(params.routeDirectionId ?? '').trim() || null,
  };
}

/** 是否应在澄清流程中追问午餐策略（未显式指定且存在触发条件） */
export function shouldPromptLunchStrategyQuestion(signals: LunchStrategySignals): boolean {
  if (normalizeLunchStrategy(signals.lunch_strategy as string)) return false;
  return Boolean(
    signals.hasElderly ||
      signals.hasChildren ||
      signals.needsTimedMeals ||
      signals.travelMode === 'DRIVING' ||
      signals.isRoadTrip ||
      signals.isRemoteRoute,
  );
}

/** Phase 3 条件单选：午餐时间窗策略 */
export function buildLunchStrategyClarificationQuestion(): {
  id: string;
  question: string;
  type: string;
  options: Array<{ value: string; label: string }>;
  required: boolean;
  group: string;
  hint: string;
  metadata: Record<string, unknown>;
} {
  return {
    id: 'lunch_strategy',
    question: '午餐时间你更倾向哪种安排？',
    type: 'single_choice',
    options: [
      { value: 'staggered', label: '灵活错峰（热门景区优先 11:30 早鸟或 14:00 后）' },
      { value: 'rigid', label: '固定 12 点左右（老人小孩 / 需定时进食）' },
      { value: 'route_driven', label: '沿路补给（自驾/公路，有镇就停）' },
      { value: 'balanced', label: '均衡默认（11:30–13:30 用餐窗）' },
    ],
    required: false,
    group: 'optional',
    hint: '午餐时间窗影响体力恢复与下午体验；选一项后系统会按策略检测冲突与留白。',
    metadata: {
      category: 'preferences',
      priority: 'medium',
      fieldName: 'lunch_strategy',
      phase: 3,
    },
  };
}

/** 创建行程时写入 metadata 的午餐相关字段 */
export function buildTripLunchMetadataFromParams(
  params: Record<string, unknown>,
  destinationCode?: string | null,
): { lunch_strategy: LunchStrategy; tripParams: Record<string, unknown> } {
  const signals = extractLunchStrategySignalsFromParams(params, destinationCode);
  const lunch_strategy = resolveLunchStrategy(signals);
  return {
    lunch_strategy,
    tripParams: {
      hasChildren: signals.hasChildren ?? false,
      hasElderly: signals.hasElderly ?? false,
      needsTimedMeals: signals.needsTimedMeals ?? false,
      travelMode: signals.travelMode ?? null,
      lunch_strategy: normalizeLunchStrategy(signals.lunch_strategy as string) ?? lunch_strategy,
    },
  };
}
