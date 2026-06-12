/**
 * Maps MCP `hotel.search` payloads (Airbnb / Google Places) into route_and_run-friendly
 * structures so the UI can render cards without parsing markdown.
 */

import { parseTripDayNumber } from './itinerary-item-add.util';

export type RouteAndRunAccommodationCard = {
  id: string;
  source: 'airbnb' | 'hotel';
  name: string;
  /** 行程第几晚（1-based），用于 night_groups 分组 */
  nightIndex?: number;
  /** 副标题/英文名：仅在与 `name` 不同时下发，避免 UI 主副标题重复一行 */
  name_en?: string;
  /** 中文行程锚点说明：第几晚、当日参照地点 */
  itineraryHintZh?: string;
  /** 入住窗口：通常为「住1晚（MM/DD—MM/DD）」 */
  stayLabelZh?: string;
  url?: string;
  photoUrl?: string;
  photos?: string[];
  address?: string;
  priceLabel?: string;
  rating?: number;
  placeId?: string;
  /** MCP 房源坐标（若有）：用于计算与当日行程锚点的直线距离 */
  listing_lat?: number;
  listing_lng?: number;
  /** 相对「入住当日最后一站 POI」锚点的球面距离（km），与 itineraryHintZh 中「周边」参照一致 */
  distance_to_anchor_km?: number;
  anchor_poi_name_zh?: string;
  /** 预格式化展示：距「xxx」约 y km */
  distance_label_zh?: string;
  /**
   * 住宿决策辅助说明：L1 规则模版 + 可选 L2 管家叙事（见 hotel-decision-support.signals / orchestrator enrich）。
   */
  decision_support_zh?: string;
  /** 入住/退房（YYYY-MM-DD），由 enrichHotelRouteRunUiForClientApply 从 night_groups 补齐 */
  checkIn?: string;
  checkOut?: string;
  /** 「查看 / 加入行程」操作，与 planning-assistant apply 接口对齐 */
  actions?: Array<{
    action: string;
    label: string;
    labelCN: string;
    params?: Record<string, unknown>;
  }>;
};

/** 按晚聚合：便于前端「每晚一块」与正文策略同屏整合 */
export type AccommodationNightGroup = {
  night_index: number;
  check_in: string;
  check_out: string;
  anchor_label_zh: string;
  stay_label_zh: string;
  /** 该晚是否有 MCP 采样结果（无则仅展示锚点 + 占位提示） */
  has_mcp_sample: boolean;
  /** 无采样时可直接展示在每晚区块内 */
  placeholder_zh?: string;
  cards: RouteAndRunAccommodationCard[];
};

/** route_and_run 住宿块完整载荷（含策略说明供前端展示） */
export type HotelRouteRunUiPayload = {
  accommodations: RouteAndRunAccommodationCard[];
  airbnbListings: unknown[];
  routing: { target: 'hotel' };
  hotel_search_meta?: {
    strategy: 'single_stay' | 'per_night_sample' | 'per_night_full_trip_replan';
    /** 本次 MCP 检索入住窗（解析后的 checkIn→checkOut）间夜数 */
    total_nights?: number;
    /** 绑定行程时可选：整段 Trip 间夜数；与卡片「第 M/N 晚」分母 N 对齐 */
    itinerary_total_nights?: number;
    sampled_nights?: number[];
    disclaimer_zh?: string;
    /** 用户话术限定仅某一晚/部分晚检索时为 true */
    user_limited_night_intent?: boolean;
    /** 建议界面：正文简短 + 下方按 night_groups 渲染，避免上下脱节 */
    ui_layout_hint_zh?: string;
    /** 本次住宿 MCP 快照组装完成时间（ISO8601）；与航班等快照一起做 freshness 对齐 */
    captured_at_iso?: string;
  };
  /** 按行程晚数展开；含未采样晚占位，与 accommodations 数据一致 */
  night_groups?: AccommodationNightGroup[];
};

const PER_NIGHT_DISCLAIMER_ZH =
  '多日行程按「每晚」独立检索示意（基于当日行程锚点）；实际环岛/多地游玩请每晚更换住宿，勿默认全程同一房源。以下为采样若干晚，非完整列表。';

/** 用户明确只问某一晚时：不暗示整段行程均适用 */
const SINGLE_NIGHT_USER_SCOPE_DISCLAIMER_ZH =
  '您指定了单晚/部分晚的住宿检索；以下仅覆盖所询间夜，非整段行程每晚推荐。价格与可订性以平台实时为准。';

/** 整段多日重规划：逐晚检索（非采样） */
const FULL_TRIP_REPLAN_PER_NIGHT_DISCLAIMER_ZH =
  '整段行程重规划：按每晚上一间独立检索示意（锚点为当日行程末站周边）；环岛/多地请分段预订不同城镇，勿默认全程同一房源。价格与可订性以平台实时为准。';

function clampYmdToTripWindow(
  checkIn: string,
  checkOut: string,
  tripStartYmd?: string,
  tripEndYmd?: string,
): { checkIn: string; checkOut: string } | null {
  let ci = checkIn.slice(0, 10);
  let co = checkOut.slice(0, 10);
  if (co <= ci) return null;
  if (tripStartYmd && ci < tripStartYmd.slice(0, 10)) ci = tripStartYmd.slice(0, 10);
  if (tripEndYmd && co > tripEndYmd.slice(0, 10)) co = tripEndYmd.slice(0, 10);
  if (co <= ci) return null;
  return { checkIn: ci, checkOut: co };
}

/**
 * 若用户在正文写出明确入住窗且严格窄于当前基准窗（Trip 表或结构化同步的全段日期），则用语义日期覆盖 MCP 检索窗。
 * 解决：前端每轮附带与 Trip 相同的 structured start/end 时，原先逻辑永不读取正文里的「6 月 5–7 日」→ 采样落在行程首日。
 */
export function narrowHotelStayWindowWithNlMessage(params: {
  baseCheckIn: string;
  baseCheckOut: string;
  message: string;
  tripStartYmd?: string;
  tripEndYmd?: string;
}): { checkIn: string; checkOut: string } {
  const baseCi = params.baseCheckIn.slice(0, 10);
  const baseCo = params.baseCheckOut.slice(0, 10);
  const fromNl = parseExplicitStayWindowFromUserMessage(params.message, {
    tripStartYmd: params.tripStartYmd,
    tripEndYmd: params.tripEndYmd,
  });

  if (fromNl) {
    const nlCi = fromNl.checkIn;
    const nlCo = fromNl.checkOut;
    const ts = params.tripStartYmd?.slice(0, 10);
    const te = params.tripEndYmd?.slice(0, 10);
    const insideTrip =
      !ts || !te || (nlCi >= ts && nlCo <= te);
    const narrowsWindow = nlCi >= baseCi && nlCo <= baseCo && (nlCi > baseCi || nlCo < baseCo);

    if (insideTrip && narrowsWindow) {
      return { checkIn: nlCi, checkOut: nlCo };
    }
  }

  if (params.tripStartYmd && params.tripEndYmd) {
    const totalNights = countStayNightsBetweenInclusive(params.tripStartYmd, params.tripEndYmd);
    const scope = parseExplicitHotelNightScopeIndices(params.message, totalNights);
    const fromScope = scope?.length
      ? deriveHotelStayWindowFromNightScope(params.tripStartYmd, scope)
      : null;
    if (fromScope) {
      const inside =
        fromScope.checkIn >= (params.tripStartYmd.slice(0, 10)) &&
        fromScope.checkOut <= (params.tripEndYmd.slice(0, 10));
      const narrows =
        fromScope.checkIn >= baseCi &&
        fromScope.checkOut <= baseCo &&
        (fromScope.checkIn > baseCi || fromScope.checkOut < baseCo);
      if (inside && narrows) return fromScope;
    }
  }

  return { checkIn: baseCi, checkOut: baseCo };
}

/** 从 0-based 间夜下标推导 MCP 入住/退房窗（每间夜 checkOut = 末晚 +1 日） */
export function deriveHotelStayWindowFromNightScope(
  tripStartYmd: string,
  scopeIndices0: number[],
): { checkIn: string; checkOut: string } | null {
  if (!scopeIndices0.length) return null;
  const sorted = [...scopeIndices0].sort((a, b) => a - b);
  const contiguous = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
  if (sorted.length > 1 && !contiguous) return null;
  const minN = sorted[0];
  const maxN = sorted[sorted.length - 1];
  const ci = addDaysYmd(tripStartYmd, minN);
  const co = addDaysYmd(tripStartYmd, maxN + 1);
  if (co > ci) return { checkIn: ci, checkOut: co };
  return null;
}

const HOTEL_RECOMMEND_RE =
  /(?:推荐|找|查|搜索|看看|有没有|帮我).{0,24}(?:酒店|住宿|民宿|宾馆|旅馆)|(?:酒店|住宿|民宿|宾馆|旅馆).{0,24}(?:推荐|找|查|搜索)/;

/** 用户是否在已有行程语境下直接请求住宿推荐（非整段规划类话术） */
export function messageExpressesBoundTripHotelRecommendIntent(message: string): boolean {
  const m = message.trim();
  if (!m || messageExpressesMultiNightStayPlanningIntent(m)) return false;
  return HOTEL_RECOMMEND_RE.test(m);
}

/**
 * 「离第 N 天行程近 / 靠近第三天」→ 用作距离排序锚点的行程日（1-based）。
 * 取消息中最后一个显式 proximity 表述，避免「第二天酒店 + 离第三天近」误用第二天。
 */
export function parseHotelProximityAnchorDayNumber(message: string): number | undefined {
  const m = message.trim();
  if (!m) return undefined;

  let lastDay: number | undefined;
  const patterns = [
    /(?:离|靠近|接近|挨着|距).{0,12}第\s*(\d+)\s*天(?:的)?(?:行程|活动|安排|计划)?/g,
    /(?:离|靠近|接近|挨着|距).{0,12}第\s*([一二三四五六七八九十]{1,2})\s*天(?:的)?(?:行程|活动|安排|计划)?/g,
    /第\s*(\d+)\s*天(?:的)?(?:行程|活动).{0,16}(?:近|方便|顺路)/g,
    /第\s*([一二三四五六七八九十]{1,2})\s*天(?:的)?(?:行程|活动).{0,16}(?:近|方便|顺路)/g,
  ];

  for (const re of patterns) {
    for (const match of m.matchAll(re)) {
      const raw = match[1];
      const n =
        /^\d+$/.test(raw) ? Number(raw) : parseTripDayNumber(`第${raw}天`);
      if (n != null && n >= 1) lastDay = n;
    }
  }
  return lastDay;
}

/**
 * 绑定行程语境下解析住宿 MCP 入住窗：用户话术「第 N 天/晚」优先于路由 extractedParams 里的整段日期。
 */
export function resolveHotelStayDatesForBoundTrip(params: {
  message: string;
  paramsCheckIn?: string;
  paramsCheckOut?: string;
  tripStartYmd?: string;
  tripEndYmd?: string;
}): { checkIn?: string; checkOut?: string } {
  const msg = params.message.trim();
  const tripStart = params.tripStartYmd?.slice(0, 10);
  const tripEnd = params.tripEndYmd?.slice(0, 10);

  const fromNl = parseExplicitStayWindowFromUserMessage(msg, {
    tripStartYmd: tripStart,
    tripEndYmd: tripEnd,
  });
  if (fromNl?.checkIn && fromNl?.checkOut) {
    return { checkIn: fromNl.checkIn, checkOut: fromNl.checkOut };
  }

  if (tripStart && tripEnd) {
    const totalNights = countStayNightsBetweenInclusive(tripStart, tripEnd);
    const scope = parseExplicitHotelNightScopeIndices(msg, totalNights);
    if (scope?.length) {
      const derived = deriveHotelStayWindowFromNightScope(tripStart, scope);
      if (derived) return derived;
    }
  }

  const paramCi = params.paramsCheckIn?.slice(0, 10);
  const paramCo = params.paramsCheckOut?.slice(0, 10);
  if (paramCi && paramCo) {
    const narrowed = narrowHotelStayWindowWithNlMessage({
      baseCheckIn: paramCi,
      baseCheckOut: paramCo,
      message: msg,
      tripStartYmd: tripStart,
      tripEndYmd: tripEnd,
    });
    return { checkIn: narrowed.checkIn, checkOut: narrowed.checkOut };
  }

  if (tripStart && tripEnd) {
    return { checkIn: tripStart, checkOut: tripEnd };
  }

  return {};
}

/** 绑定 Trip 且已解析到入住窗时，是否应跳过「是否用这几天查酒店」二次确认 */
export function shouldSkipHotelDateClarification(params: {
  message: string;
  tripId?: string | null;
  checkIn?: string;
  checkOut?: string;
  tripStartYmd?: string;
  tripEndYmd?: string;
  phaseAlreadyRecommended?: boolean;
}): boolean {
  if (params.phaseAlreadyRecommended && params.checkIn && params.checkOut) return true;
  if (!params.checkIn || !params.checkOut) return false;

  const tripStart = params.tripStartYmd?.slice(0, 10);
  const tripEnd = params.tripEndYmd?.slice(0, 10);
  const isNarrowerThanFullTrip =
    !!tripStart &&
    !!tripEnd &&
    (params.checkIn !== tripStart || params.checkOut !== tripEnd);

  if (isNarrowerThanFullTrip) return true;

  if (tripStart && tripEnd) {
    const totalNights = countStayNightsBetweenInclusive(tripStart, tripEnd);
    const scope = parseExplicitHotelNightScopeIndices(params.message, totalNights);
    if (scope?.length) return true;
  }

  if (params.tripId && tripStart && tripEnd) {
    if (messageExpressesBoundTripHotelRecommendIntent(params.message)) return true;
  }

  return false;
}

/**
 * 从自然语言中解析入住窗口，供住宿 MCP 与行程表比对；单日期按「住 1 晚」解释（checkOut = checkIn+1）。
 * 有 trip 起止日时做边界夹取，避免写出行程外日期。
 */
export function parseExplicitStayWindowFromUserMessage(
  message: string,
  opts?: { tripStartYmd?: string; tripEndYmd?: string },
): { checkIn: string; checkOut: string } | null {
  const s = message.trim();
  if (!s) return null;
  const tripStart = opts?.tripStartYmd?.slice(0, 10);
  const tripEnd = opts?.tripEndYmd?.slice(0, 10);
  const refY =
    (tripStart && parseInt(tripStart.slice(0, 4), 10)) ||
    (tripEnd && parseInt(tripEnd.slice(0, 4), 10)) ||
    new Date().getUTCFullYear();

  const isoRange = s.match(/(\d{4}-\d{2}-\d{2})\s*(?:到|至|-|~)\s*(\d{4}-\d{2}-\d{2})/);
  if (isoRange) {
    return clampYmdToTripWindow(isoRange[1], isoRange[2], tripStart, tripEnd);
  }
  const isoAll = s.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoAll && isoAll.length >= 2) {
    return clampYmdToTripWindow(isoAll[0], isoAll[1], tripStart, tripEnd);
  }
  if (isoAll && isoAll.length === 1) {
    const co = addDaysYmd(isoAll[0], 1);
    return clampYmdToTripWindow(isoAll[0], co, tripStart, tripEnd);
  }

  const cnFullRange = s.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(?:到|至|-|~)\s*(\d{4})年(\d{1,2})月(\d{1,2})日/,
  );
  if (cnFullRange) {
    const c1 = `${cnFullRange[1]}-${cnFullRange[2].padStart(2, '0')}-${cnFullRange[3].padStart(2, '0')}`;
    const c2 = `${cnFullRange[4]}-${cnFullRange[5].padStart(2, '0')}-${cnFullRange[6].padStart(2, '0')}`;
    return clampYmdToTripWindow(c1, c2, tripStart, tripEnd);
  }

  const cnYearCheckInOut = s.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*入住\D{0,60}?(\d{4})年(\d{1,2})月(\d{1,2})日\s*退房/,
  );
  if (cnYearCheckInOut) {
    const c1 = `${cnYearCheckInOut[1]}-${cnYearCheckInOut[2].padStart(2, '0')}-${cnYearCheckInOut[3].padStart(2, '0')}`;
    const c2 = `${cnYearCheckInOut[4]}-${cnYearCheckInOut[5].padStart(2, '0')}-${cnYearCheckInOut[6].padStart(2, '0')}`;
    const clamped = clampYmdToTripWindow(c1, c2, tripStart, tripEnd);
    if (clamped) return clamped;
  }

  const cnMonthCheckInOut = s.match(
    /(\d{1,2})月(\d{1,2})[日号]?\s*入住\D{0,40}?(\d{1,2})月(\d{1,2})[日号]?\s*退房/,
  );
  if (cnMonthCheckInOut) {
    const y = String(refY);
    const c1 = `${y}-${cnMonthCheckInOut[1].padStart(2, '0')}-${cnMonthCheckInOut[2].padStart(2, '0')}`;
    const c2 = `${y}-${cnMonthCheckInOut[3].padStart(2, '0')}-${cnMonthCheckInOut[4].padStart(2, '0')}`;
    const clamped = clampYmdToTripWindow(c1, c2, tripStart, tripEnd);
    if (clamped) return clamped;
  }

  /**
   * 同月简写：「6月5–7日」「6月5-7日」（含英文连字符、en/em dash）→ 与 `6月5日～6月7日` 相同入住窗口径。
   * 若不解析则住宿 MCP 拿不到日期 → `skipped_no_stay_dates`。
   */
  const cnSameMonthDaySpan = s.match(
    /(\d{1,2})\s*月\s*(\d{1,2})(?:日|号)?\s*[\u2013\u2014\-~～]\s*(\d{1,2})(?:日|号)?/,
  );
  if (cnSameMonthDaySpan) {
    const y = String(refY);
    const mo = cnSameMonthDaySpan[1].padStart(2, '0');
    const d1 = cnSameMonthDaySpan[2].padStart(2, '0');
    const d2 = cnSameMonthDaySpan[3].padStart(2, '0');
    const c1 = `${y}-${mo}-${d1}`;
    const c2 = `${y}-${mo}-${d2}`;
    const clamped = clampYmdToTripWindow(c1, c2, tripStart, tripEnd);
    if (clamped) return clamped;
  }

  const cnRange = s.match(/(\d{1,2})月(\d{1,2})[日号]?\s*(?:到|至|-|~)\s*(\d{1,2})月(\d{1,2})[日号]?/);
  if (cnRange) {
    const y = String(refY);
    const c1 = `${y}-${cnRange[1].padStart(2, '0')}-${cnRange[2].padStart(2, '0')}`;
    const c2 = `${y}-${cnRange[3].padStart(2, '0')}-${cnRange[4].padStart(2, '0')}`;
    return clampYmdToTripWindow(c1, c2, tripStart, tripEnd);
  }

  const cnSingleWithYear = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cnSingleWithYear) {
    const ci = `${cnSingleWithYear[1]}-${cnSingleWithYear[2].padStart(2, '0')}-${cnSingleWithYear[3].padStart(2, '0')}`;
    const co = addDaysYmd(ci, 1);
    return clampYmdToTripWindow(ci, co, tripStart, tripEnd);
  }

  const cnSingle = s.match(/(?:^|[^\d])(\d{1,2})月(\d{1,2})[日号](?:[^\d]|$)/);
  if (cnSingle) {
    const y = String(refY);
    const ci = `${y}-${cnSingle[1].padStart(2, '0')}-${cnSingle[2].padStart(2, '0')}`;
    const co = addDaysYmd(ci, 1);
    return clampYmdToTripWindow(ci, co, tripStart, tripEnd);
  }

  const slashRange = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:到|至|-|~)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (slashRange) {
    const y1 = slashRange[3] || String(refY);
    const y2 = slashRange[6] || y1;
    const c1 = `${y1}-${slashRange[1].padStart(2, '0')}-${slashRange[2].padStart(2, '0')}`;
    const c2 = `${y2}-${slashRange[4].padStart(2, '0')}-${slashRange[5].padStart(2, '0')}`;
    return clampYmdToTripWindow(c1, c2, tripStart, tripEnd);
  }

  const slashCheckInOut = s.match(
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:入住|check\s*-?\s*in)\D{0,40}?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:退房|check\s*-?\s*out)/i,
  );
  if (slashCheckInOut) {
    const y1 = slashCheckInOut[3] || String(refY);
    const y2 = slashCheckInOut[6] || y1;
    const c1 = `${y1}-${slashCheckInOut[1].padStart(2, '0')}-${slashCheckInOut[2].padStart(2, '0')}`;
    const c2 = `${y2}-${slashCheckInOut[4].padStart(2, '0')}-${slashCheckInOut[5].padStart(2, '0')}`;
    const clamped = clampYmdToTripWindow(c1, c2, tripStart, tripEnd);
    if (clamped) return clamped;
  }

  const isoCheckInOut = s.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:入住|check\s*-?\s*in)\D{0,40}?(\d{4}-\d{2}-\d{2})\s*(?:退房|check\s*-?\s*out)/i,
  );
  if (isoCheckInOut) {
    const clamped = clampYmdToTripWindow(isoCheckInOut[1], isoCheckInOut[2], tripStart, tripEnd);
    if (clamped) return clamped;
  }

  return null;
}

/**
 * 用户明确只要某一晚/若干晚的住宿推荐时，返回要采样的间夜下标（0-based）。
 * 未命中则返回 null，调用方继续用 pickSpreadNightIndices 等默认策略。
 */
export function parseExplicitHotelNightScopeIndices(message: string, totalNights: number): number[] | null {
  const msg = message.trim();
  if (!msg || totalNights < 1) return null;

  if (/全程|整段|整个行程|每一晚|每晚|所有晚|各晚|all\s+nights|whole\s+trip|every\s+night/i.test(msg)) {
    return null;
  }

  const indices = new Set<number>();

  if (/(?:第\s*1\s*晚|第一晚|首晚|第一夜)/.test(msg)) indices.add(0);
  if (/\b(?:first\s*night|night\s*1)\b/i.test(msg)) indices.add(0);

  for (const m of msg.matchAll(/第\s*(\d+)\s*晚/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= totalNights) indices.add(n - 1);
  }

  for (const m of msg.matchAll(/第\s*([一二三四五六七八九十]{1,2})\s*晚/g)) {
    const n = parseTripDayNumber(`第${m[1]}天`);
    if (n != null && n >= 1 && n <= totalNights) indices.add(n - 1);
  }

  const dayStayDigit = msg.match(/第\s*(\d+)\s*天(?:[^。！？\n]{0,40}住|晚上)/);
  if (dayStayDigit) {
    const d = parseInt(dayStayDigit[1], 10);
    if (d >= 1 && d <= totalNights) indices.add(d - 1);
  }

  const dayStayCn = msg.match(/第\s*([一二三四五六七八九十]{1,2})\s*天(?:[^。！？\n]{0,40}住|晚上)/);
  if (dayStayCn) {
    const d = parseTripDayNumber(`第${dayStayCn[1]}天`);
    if (d != null && d >= 1 && d <= totalNights) indices.add(d - 1);
  }

  if (
    indices.size === 0 &&
    HOTEL_RECOMMEND_RE.test(msg) &&
    /(?:酒店|住宿|民宿|宾馆|旅馆|住哪|住哪里)/.test(msg)
  ) {
    const dayNum = parseTripDayNumber(msg);
    if (dayNum != null && dayNum >= 1 && dayNum <= totalNights) {
      indices.add(dayNum - 1);
    }
  }

  if (indices.size === 0) return null;
  return [...indices].sort((a, b) => a - b);
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** Airbnb / Stays JSON often nests title under demandStayListing.description.name */
export function extractHotelListingDisplayName(o: unknown): string {
  const r = asRecord(o);
  if (!r) return 'Listing';
  const dsl = asRecord(r.demandStayListing);
  const desc = asRecord(dsl?.description ?? r.description);
  const nameObj = asRecord(desc?.name);
  const fromLocalized =
    (typeof nameObj?.localizedStringWithTranslationPreference === 'string' &&
      nameObj.localizedStringWithTranslationPreference.trim()) ||
    (typeof nameObj?.localizedString === 'string' && nameObj.localizedString.trim());
  if (fromLocalized) return fromLocalized;
  if (typeof r.title === 'string' && r.title.trim()) return r.title.trim();
  if (typeof r.name === 'string' && r.name.trim()) return r.name.trim();
  if (typeof r.hotelName === 'string' && r.hotelName.trim()) return r.hotelName.trim();
  const sc = asRecord(r.structuredContent);
  if (typeof sc?.primaryLine === 'string' && sc.primaryLine.trim()) return sc.primaryLine.trim();
  return 'Listing';
}

export function extractAirbnbPriceLabelForListing(o: Record<string, unknown>): string | undefined {
  const sdp = asRecord(o.structuredDisplayPrice);
  const pl = asRecord(sdp?.primaryLine);
  const a =
    (typeof pl?.accessibilityLabel === 'string' && pl.accessibilityLabel) ||
    (typeof pl?.discountedLabel === 'string' && pl.discountedLabel);
  if (a) return String(a);
  return undefined;
}

/** 用于系统 prompt 一行展示：Airbnb 结构化价签或简单 price/total */
export function extractHotelListingPriceHint(o: unknown): string | undefined {
  const r = asRecord(o);
  if (!r) return undefined;
  const air = extractAirbnbPriceLabelForListing(r);
  if (air) return air;
  if (r.price !== undefined && r.price !== null) return String(r.price);
  if (r.total !== undefined && r.total !== null) return String(r.total);
  return undefined;
}

function extractAirbnbPhotoUrl(o: Record<string, unknown>): string | undefined {
  if (Array.isArray(o.images)) {
    const first = o.images[0];
    if (typeof first === 'string') return first;
    const fr = asRecord(first);
    if (typeof fr?.url === 'string') return fr.url;
  }
  const pics = o.contextualPictures;
  if (Array.isArray(pics) && pics[0]) {
    const p = asRecord(pics[0]);
    const u = (typeof p?.url === 'string' && p.url) || (typeof p?.picture === 'string' && p.picture);
    if (u) return u;
  }
  const ph = o.photos;
  if (Array.isArray(ph) && ph[0]) {
    const p = asRecord(ph[0]);
    if (typeof p?.url === 'string') return p.url;
  }
  return undefined;
}

/** Haversine，单位 km（与规划助手住宿 enrich 一致） */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseLatLng(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | undefined {
  const la =
    typeof lat === 'number'
      ? lat
      : typeof lat === 'string'
        ? parseFloat(lat)
        : NaN;
  const ln =
    typeof lng === 'number'
      ? lng
      : typeof lng === 'string'
        ? parseFloat(lng)
        : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return undefined;
  return { lat: la, lng: ln };
}

/** Airbnb Search / geobio 常见嵌套：demandStayListing.location.coordinate */
function extractAirbnbLatLng(r: Record<string, unknown>): { lat: number; lng: number } | undefined {
  const dsl = asRecord(r.demandStayListing);
  const loc = asRecord(dsl?.location);
  const coord = asRecord(loc?.coordinate);
  const fromCoord = parseLatLng(coord?.latitude, coord?.longitude);
  if (fromCoord) return fromCoord;
  const topLoc = asRecord(r.location);
  return parseLatLng(topLoc?.lat, topLoc?.lng);
}

function extractGoogleHotelLatLng(r: Record<string, unknown>): { lat: number; lng: number } | undefined {
  const loc = asRecord(r.location);
  const fromLoc = parseLatLng(loc?.lat, loc?.lng);
  if (fromLoc) return fromLoc;
  const geom = asRecord(r.geometry);
  const gloc = asRecord(geom?.location);
  const fromGeom = parseLatLng(gloc?.lat, gloc?.lng);
  if (fromGeom) return fromGeom;
  return parseLatLng(r.lat, r.lng);
}

export type StayAnchorGeo = { lat: number; lng: number; nameZh: string };

export type { HotelPartyAndPreferenceContext } from './hotel-decision-support.signals';
export {
  buildAccommodationDecisionSupportZh,
  buildTemplateHotelDecisionSupportZh,
} from './hotel-decision-support.signals';

/** 「周边住宿」卡片：直线距锚点超过此值视为坐标/Listing 异常，不展示误导性距离 */
export const MAX_PLAUSIBLE_HOTEL_ANCHOR_KM = 250;

/** 冰岛行程 Listing 合理范围（过远则多为 MCP 错坐标或错国别） */
export function isPlausibleIcelandListingCoord(lat: number, lng: number): boolean {
  return lat >= 63 && lat <= 67.8 && lng >= -24.9 && lng <= -12.5;
}

/**
 * 为住宿卡片写入相对当日行程锚点（与 segment label /「xxx周边」一致：当日最后一项行程点）的直线距离。
 */
export function attachDistanceToAnchorForCards(
  cards: RouteAndRunAccommodationCard[],
  anchorByNightIndex: Map<number, StayAnchorGeo | null | undefined>,
): RouteAndRunAccommodationCard[] {
  return cards.map((card) => {
    const night = card.nightIndex ?? 1;
    const anchor = anchorByNightIndex.get(night);
    const lat = card.listing_lat;
    const lng = card.listing_lng;
    if (!anchor || lat == null || lng == null) return card;
    if (!isPlausibleIcelandListingCoord(lat, lng) && isPlausibleIcelandListingCoord(anchor.lat, anchor.lng)) {
      return card;
    }
    const km = haversineKm(lat, lng, anchor.lat, anchor.lng);
    if (km > MAX_PLAUSIBLE_HOTEL_ANCHOR_KM) return card;
    const rounded = Math.round(km * 10) / 10;
    return {
      ...card,
      distance_to_anchor_km: rounded,
      anchor_poi_name_zh: anchor.nameZh,
      distance_label_zh: `距「${anchor.nameZh}」约 ${rounded} km`,
    };
  });
}

function extractAirbnbRating(o: Record<string, unknown>): number | undefined {
  const raw = o.avgRating ?? o.rating;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const label = o.avgRatingA11yLabel;
  if (typeof label === 'string') {
    const m = label.match(/(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
  }
  return undefined;
}

function mapAirbnbRow(o: unknown, idx: number): RouteAndRunAccommodationCard {
  const r = asRecord(o) ?? {};
  const id = String(r.id ?? r.listingId ?? `airbnb-${idx}`);
  const url = typeof r.url === 'string' ? r.url : undefined;
  const photoUrl = extractAirbnbPhotoUrl(r);
  const photos =
    Array.isArray(r.images) && r.images.every((x) => typeof x === 'string')
      ? (r.images as string[])
      : photoUrl
        ? [photoUrl]
        : undefined;
  return {
    id,
    source: 'airbnb',
    name: extractHotelListingDisplayName(o),
    ...(url ? { url } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(photos ? { photos } : {}),
    ...(typeof r._enrichedAddress === 'string' ? { address: r._enrichedAddress } : {}),
    ...(() => {
      const p = extractAirbnbPriceLabelForListing(r);
      return p ? { priceLabel: p } : {};
    })(),
    ...(() => {
      const rt = extractAirbnbRating(r);
      return rt !== undefined ? { rating: rt } : {};
    })(),
    ...(() => {
      const ll = extractAirbnbLatLng(r);
      return ll ? { listing_lat: ll.lat, listing_lng: ll.lng } : {};
    })(),
  };
}

function mapHotelDirectRow(o: unknown, idx: number): RouteAndRunAccommodationCard {
  const r = asRecord(o) ?? {};
  const placeId = typeof r.placeId === 'string' ? r.placeId : `hotel-${idx}`;
  const name =
    typeof r.name === 'string' && r.name.trim()
      ? r.name.trim()
      : extractHotelListingDisplayName(o);
  const address = typeof r.address === 'string' ? r.address : undefined;
  const rating = typeof r.rating === 'number' ? r.rating : undefined;
  const photos = Array.isArray(r.photos)
    ? r.photos
        .map((p) => {
          const pr = asRecord(p);
          return typeof pr?.photoReference === 'string' ? pr.photoReference : undefined;
        })
        .filter(Boolean)
    : [];
  const ll = extractGoogleHotelLatLng(r);
  return {
    id: placeId,
    source: 'hotel',
    name,
    placeId: typeof r.placeId === 'string' ? r.placeId : undefined,
    ...(address ? { address } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(photos.length ? { photos: photos as string[] } : {}),
    ...(ll ? { listing_lat: ll.lat, listing_lng: ll.lng } : {}),
  };
}

export function getRawListingRowsFromMcpPayload(data: unknown): unknown[] | null {
  const d = asRecord(data);
  if (!d) return null;
  if (Array.isArray(d.results) && d.results.length) return d.results;
  if (Array.isArray(d.listings) && d.listings.length) return d.listings;
  if (Array.isArray(d.hotels) && d.hotels.length) return d.hotels;
  return null;
}

/** 入住窗口中文标签（单晚） */
export function formatStayLabelZh(checkInYmd: string, checkOutYmd: string): string {
  const a = `${checkInYmd.slice(5, 7)}/${checkInYmd.slice(8, 10)}`;
  const b = `${checkOutYmd.slice(5, 7)}/${checkOutYmd.slice(8, 10)}`;
  return `住1晚（${a}—${b}）`;
}

/** 行程总晚数：与 Airbnb 「checkIn→checkOut」间夜数一致（例 6/1→6/7 = 6 晚） */
export function countStayNightsBetweenInclusive(checkInYmd: string, checkOutYmd: string): number {
  const [ys, ms, ds] = checkInYmd.split('-').map(Number);
  const [ye, me, de] = checkOutYmd.split('-').map(Number);
  const s = Date.UTC(ys, ms - 1, ds);
  const e = Date.UTC(ye, me - 1, de);
  const diffDays = Math.round((e - s) / 86400000);
  return Math.max(1, diffDays);
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** 日历日差 from→to（可为负）；与 countStayNightsBetweenInclusive 共用 UTC 日期语义 */
export function diffCalendarDaysYmd(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = fromYmd.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = toYmd.slice(0, 10).split('-').map(Number);
  const s = Date.UTC(y1, m1 - 1, d1);
  const e = Date.UTC(y2, m2 - 1, d2);
  return Math.round((e - s) / 86400000);
}

/**
 * 用户意在多日行程里「逐日/每晚」落实住宿或更新过夜城镇（非仅检索某一间夜）。
 * 用于避免把正文中偶然出现的「单日入住窗」误判为 `inferNightIndex0FromExplicitStayInTripWindow`。
 */
export function messageExpressesMultiNightStayPlanningIntent(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (
    /每日(?:的)?住宿|每天(?:的)?住宿|各晚住宿|各日住宿|逐晚|每晚都要住|每晚安排|更新每日|每日的住宿|住宿城镇|过夜城镇|重新规划.{0,80}住宿|规划.{0,40}住宿城镇|改行程.{0,80}住宿|行程.{0,40}住宿/.test(
      m,
    )
  ) {
    return true;
  }
  if (/更新.{0,24}住宿|安排.{0,24}住宿/.test(m) && /重新规划|规划|改行程|环岛|行程/.test(m)) return true;
  return false;
}

/**
 * 从用户消息中解析「恰好一晚」的入住窗口，并映射为相对行程首晚的 0-based 间夜下标。
 * 用于：行程 MCP 仍用整段起止日，但用户在正文写了具体一晚（含被 structured 字段挡住 NL 覆盖时）。
 */
export function inferNightIndex0FromExplicitStayInTripWindow(
  message: string,
  tripFirstNightCheckInYmd: string,
  totalTripNights: number,
  tripLastMorningCheckOutYmd: string,
): number | null {
  if (totalTripNights < 1) return null;
  if (messageExpressesMultiNightStayPlanningIntent(message)) return null;
  const w = parseExplicitStayWindowFromUserMessage(message, {
    tripStartYmd: tripFirstNightCheckInYmd,
    tripEndYmd: tripLastMorningCheckOutYmd,
  });
  if (!w) return null;
  const nights = countStayNightsBetweenInclusive(w.checkIn, w.checkOut);
  if (nights !== 1) return null;
  const diff = diffCalendarDaysYmd(tripFirstNightCheckInYmd, w.checkIn);
  if (diff < 0 || diff >= totalTripNights) return null;
  return diff;
}

/** 多日行程采样若干晚做 MCP，避免请求爆炸（均匀覆盖首/中/尾） */
export function pickSpreadNightIndices(totalNights: number, cap: number): number[] {
  if (totalNights <= cap) return Array.from({ length: totalNights }, (_, i) => i);
  const picks = new Set<number>([0, totalNights - 1]);
  picks.add(Math.floor(totalNights / 3));
  picks.add(Math.floor((2 * totalNights) / 3));
  picks.add(Math.floor(totalNights / 2));
  for (let i = 1; picks.size < cap && i < totalNights - 1; i++) {
    if (!picks.has(i)) picks.add(i);
  }
  return [...picks].sort((a, b) => a - b).slice(0, cap);
}

/** 整段多日重规划：尽量覆盖每一晚（有上限防 MCP 爆炸） */
export function pickFullTripReplanNightIndices(totalNights: number, cap = 6): number[] {
  if (totalNights <= 0) return [];
  if (totalNights <= cap) return Array.from({ length: totalNights }, (_, i) => i);
  return pickSpreadNightIndices(totalNights, cap);
}

/**
 * 合并多段「每晚上一间」检索结果，并为卡片打上中文锚点。
 */
export function mergeSegmentHotelSearchResults(
  parts: Array<{
    data: unknown;
    segment: {
      labelZh: string;
      nightIndex: number;
      checkIn: string;
      checkOut: string;
    };
    maxListings?: number;
  }>,
  opts: {
    /** 本次检索入住窗间夜数 → `hotel_search_meta.total_nights` */
    stayWindowNightCount: number;
    /** 可选：整段 Trip 间夜数 → `hotel_search_meta.itinerary_total_nights` */
    itineraryTotalNights?: number;
    sampledNightIndices: number[];
    /** 来自 parseExplicitHotelNightScopeIndices：用户只要特定晚，免责文案缩短 */
    userLimitedNightIntent?: boolean;
    /** 整段多日重规划：逐晚检索（非采样免责） */
    fullTripReplan?: boolean;
  },
): HotelRouteRunUiPayload | null {
  const defaultCap = 3;
  const accommodations: RouteAndRunAccommodationCard[] = [];
  const airbnbRaw: unknown[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const mapped = mapHotelMcpDataForRouteAndRun(part.data);
    if (!mapped?.accommodations.length) continue;
    const cap = part.maxListings ?? defaultCap;
    const rawRows = getRawListingRowsFromMcpPayload(part.data);
    for (let j = 0; j < Math.min(mapped.accommodations.length, cap); j++) {
      const card = mapped.accommodations[j];
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      accommodations.push({
        ...card,
        nightIndex: part.segment.nightIndex,
        checkIn: part.segment.checkIn.slice(0, 10),
        checkOut: part.segment.checkOut.slice(0, 10),
        itineraryHintZh: part.segment.labelZh,
        stayLabelZh: formatStayLabelZh(part.segment.checkIn, part.segment.checkOut),
      });
      if (rawRows && rawRows[j]) airbnbRaw.push(rawRows[j]);
    }
  }

  if (accommodations.length === 0) return null;

  const disclaimer_zh = opts.fullTripReplan
    ? FULL_TRIP_REPLAN_PER_NIGHT_DISCLAIMER_ZH
    : opts.userLimitedNightIntent && opts.sampledNightIndices.length > 0
      ? SINGLE_NIGHT_USER_SCOPE_DISCLAIMER_ZH
      : PER_NIGHT_DISCLAIMER_ZH;

  return {
    accommodations,
    airbnbListings: airbnbRaw.slice(0, 36),
    routing: { target: 'hotel' },
    hotel_search_meta: {
      strategy: opts.fullTripReplan ? 'per_night_full_trip_replan' : 'per_night_sample',
      total_nights: opts.stayWindowNightCount,
      ...(opts.itineraryTotalNights != null ? { itinerary_total_nights: opts.itineraryTotalNights } : {}),
      sampled_nights: opts.sampledNightIndices,
      disclaimer_zh,
      ...(opts.userLimitedNightIntent ? { user_limited_night_intent: true } : {}),
    },
  };
}

/** 供 LLM 系统提示：分段列表更易遵循「勿建议全程同一酒店」 */
export function buildHotelSensorPromptBlockFromPayload(payload: HotelRouteRunUiPayload): string {
  const meta = payload.hotel_search_meta;
  const disc =
    meta?.strategy === 'per_night_sample'
      ? meta?.disclaimer_zh ?? PER_NIGHT_DISCLAIMER_ZH
      : undefined;
  const header =
    meta?.strategy === 'per_night_sample'
      ? `【实时住宿检索 MCP】按行程拆分为「每晚上一间」的采样检索（非同一房源连住多晚）。${disc}`
      : '【实时住宿检索 MCP】以下为供应商检索摘录（非生成文案；可订性与价格以供应商实时为准）：';

  const lines: string[] = [header];
  const groups = new Map<string, RouteAndRunAccommodationCard[]>();
  for (const acc of payload.accommodations) {
    const key = acc.itineraryHintZh ?? acc.stayLabelZh ?? '参考';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(acc);
  }

  let gi = 0;
  for (const [, cards] of groups) {
    gi += 1;
    lines.push(`— 分组 ${gi} —`);
    cards.forEach((c, i) => {
      const hint = c.stayLabelZh ? `${c.stayLabelZh} ` : '';
      const price = c.priceLabel ? ` · ${c.priceLabel}` : '';
      const dist = c.distance_label_zh ? ` · ${c.distance_label_zh}` : '';
      const dec = c.decision_support_zh ? ` · ${c.decision_support_zh}` : '';
      lines.push(`  [${i + 1}] ${hint}${c.name}${price}${dist}${dec}`);
    });
  }
  return lines.join('\n');
}

/** 单段检索包装（1 晚或旧逻辑） */
export function wrapSingleHotelPayload(
  data: unknown,
  opts?: {
    checkIn?: string;
    checkOut?: string;
    hintZh?: string;
    wideWindowWithoutTrip?: boolean;
    /** 整段 Trip 间夜数（绑定行程时与卡片「第 M/N 晚」分母一致） */
    itineraryTotalNights?: number;
  },
): HotelRouteRunUiPayload | null {
  const mapped = mapHotelMcpDataForRouteAndRun(data);
  if (!mapped) return null;
  const stay =
    opts?.checkIn && opts?.checkOut ? formatStayLabelZh(opts.checkIn, opts.checkOut) : undefined;
  const accommodations = mapped.accommodations.map((c) => ({
    ...c,
    nightIndex: 1,
    ...(opts?.checkIn ? { checkIn: opts.checkIn.slice(0, 10) } : {}),
    ...(opts?.checkOut ? { checkOut: opts.checkOut.slice(0, 10) } : {}),
    ...(opts?.hintZh ? { itineraryHintZh: opts.hintZh } : {}),
    ...(stay ? { stayLabelZh: stay } : {}),
  }));
  const disclaimer_zh = opts?.wideWindowWithoutTrip
    ? '当前请求未绑定行程 ID（或无法读取日程）：以下为「整段入住窗口」的单次检索，可能出现「连住多晚」总价。绑定行程后可按每晚拆分采样；环岛/多地行程建议分段预订不同城镇。'
    : '以下为单次检索窗口结果；多日行程请以分拆入住为准，勿默认同一房源覆盖全程。';
  const stayWindowNights =
    opts?.checkIn && opts?.checkOut
      ? countStayNightsBetweenInclusive(opts.checkIn.slice(0, 10), opts.checkOut.slice(0, 10))
      : undefined;
  return {
    accommodations,
    airbnbListings: mapped.airbnbListings,
    routing: mapped.routing,
    hotel_search_meta: {
      strategy: 'single_stay',
      ...(stayWindowNights != null ? { total_nights: stayWindowNights } : {}),
      ...(opts?.itineraryTotalNights != null ? { itinerary_total_nights: opts.itineraryTotalNights } : {}),
      disclaimer_zh,
    },
  };
}

/**
 * Returns UI payload for `result.payload` when hotel MCP returned usable rows.
 */
export function mapHotelMcpDataForRouteAndRun(data: unknown): {
  accommodations: RouteAndRunAccommodationCard[];
  airbnbListings: unknown[];
  routing: { target: 'hotel' };
} | null {
  const d = asRecord(data);
  if (!d) return null;
  const raw = getRawListingRowsFromMcpPayload(data);
  if (!raw?.length) return null;

  const src =
    d.source === 'airbnb' || d.source === 'hotel'
      ? (d.source as 'airbnb' | 'hotel')
      : Array.isArray(raw) && raw[0] && asRecord(raw[0])?.demandStayListing
        ? 'airbnb'
        : 'hotel';

  const cap = 12;
  const slice = raw.slice(0, cap);
  const accommodations =
    src === 'airbnb'
      ? slice.map((row, i) => mapAirbnbRow(row, i))
      : slice.map((row, i) => mapHotelDirectRow(row, i));

  return {
    accommodations,
    airbnbListings: slice,
    routing: { target: 'hotel' },
  };
}
