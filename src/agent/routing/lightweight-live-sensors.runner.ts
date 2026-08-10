/**
 * Lightweight 实时传感器簇（天气/航班/酒店/租车/活动）（从 ClaudeOrchestrator 迁出）。
 */

import type { LightweightLiveSensorsHost } from './lightweight-live-sensors.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';
import {
  classifyOrchestratorFailure,
  type OrchestratorRobustnessMetadata,
} from '../utils/orchestrator-failure-taxonomy.util';
import {
  shouldEnableLiveWeatherMcpForLightweightRoute,
  shouldInjectIcelandRentalGuidanceForLightweight,
  isHotelInventorySearchQuery,
} from '../utils/orchestration-signals.util';
import {
  buildDayLodgingChoicePromptLines,
  isDayLodgingChoiceQuery,
  isLodgingReplaceOrSwapQuery,
  shouldSearchHotelCandidatesDespiteExisting,
  isOvernightLodgingItineraryItem,
  pickSearchAnchorFromCorridor,
  resolveLodgingChoiceDayNumber,
  type DayLodgingCorridor,
  type ExistingOvernightStay,
  type StayAnchorGeo,
} from '../utils/day-lodging-choice.util';
import {
  extractHotelListingDisplayName,
  extractHotelListingPriceHint,
  addDaysYmd,
  buildHotelSensorPromptBlockFromPayload,
  countStayNightsBetweenInclusive,
  formatStayLabelZh,
  mergeSegmentHotelSearchResults,
  attachDistanceToAnchorForCards,
  parseExplicitHotelNightScopeIndices,
  parseExplicitStayWindowFromUserMessage,
  parseHotelProximityAnchorDayNumber,
  inferNightIndex0FromExplicitStayInTripWindow,
  messageExpressesMultiNightStayPlanningIntent,
  narrowHotelStayWindowWithNlMessage,
  pickFullTripReplanNightIndices,
  pickSpreadNightIndices,
  wrapSingleHotelPayload,
  diffCalendarDaysYmd,
  getRawListingRowsFromMcpPayload,
  type AccommodationNightGroup,
  type HotelPartyAndPreferenceContext,
  type HotelRouteRunUiPayload,
  type RouteAndRunAccommodationCard,
} from '../utils/hotel-mcp-route-run.mapper';
import {
  enrichHotelRouteRunUiForClientApply,
  mapHotelRouteRunUiToAccommodationItems,
} from '../utils/route-run-accommodation-apply.util';
import {
  buildTemplateHotelDecisionSupportZh,
  extractHotelDecisionLayers,
  inferPersonaDnaZh,
  shouldInvokeStewardNarrator,
} from '../utils/hotel-decision-support.signals';
import { extractTripnaraStructuredSlicesFromPreferences } from '../utils/tripnara-structured-preferences-context.util';
import { resolveRouteRunPartyProfileSnapshot } from '../utils/route-and-run-party-profile.util';
import { isValidUuidForUserProfile } from '../services/user-standing-preference.service';
import type { AmadeusDirectFlightOffer } from '../../mcp/amadeus-direct.service';
import { isFlightMcpToolResultFailure } from '../../mcp/flight-mcp.service';
import {
  enrichSampleOffersFromLines,
  mapAmadeusOffersToSampleCards,
  parseFlightMcpToolResultToSampleOffers,
  sanitizeFlightInventoryLinesForUi,
} from '../../mcp/flight-inventory-snapshot.mapper';
import {
  iataOrCodeToFliggyCity,
  isChinaFlightInventoryScope,
  isExecutableFlightInventoryQuery,
  resolveFlightInventoryLegs,
} from '../utils/flight-inventory-signals.util';
import {
  hasChinaFliggyHubHint,
  isChinaOtaMarketLoose,
  resolveFliggyDestName,
} from '../../mcp/fliggy-dest.util';
import type { IcelandRentalGuidanceOutput } from '../../skills/world/iceland-rental-guidance.skill';
import {
  buildCarRentalGuidanceFootnotesZh,
  buildIcelandRentalGuidancePromptLines,
} from '../utils/iceland-rental-lightweight.util';
import { normalizeLiveTools } from '../utils/live-tools.util';
import { isActivityAdvanceBookingConsultQuery } from '../chat/build-activity-booking-chat-cards.util';
import { buildCnG318HotspotBookingMeta } from '../../trips/readiness/utils/cn-g318-hotspot-booking.util';
import {
  buildXhsSearchKeywordFromMessage,
  isXhsCommunityEvidenceConsultQuery,
  mapXhsExperienceBundleToNoteCards,
  buildXhsNoteSearchMeta,
  projectXhsNoteCardsFromUnknown,
} from '../chat/build-xhs-note-chat-cards.util';
import type { XhsExperienceBundle } from '../../mcp/xiaohongshu-evidence.mapper';
import { isDiningRecommendationQuery } from '../utils/trip-dining-consultation.util';
import {
  matchDiningCatalogEntries,
  inferDiningRegionsFromText,
} from '../../mcp/iceland-dining-catalog';
import { parseLodgingChoiceCalendarYmd } from '../utils/day-lodging-choice.util';
import {
  resolveLiveWeatherLocationFromAnchoredTrip,
  resolveLiveWeatherLocationFromMessage,
  type LiveWeatherLocationResolve,
} from '../utils/resolve-live-weather-location.util';
import type { DecisionDnaDto } from '../services/user-profile-learning.service';
import { Prisma } from '@prisma/client';

type LiveSensorAuditRow = {
  tool_id: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
  orchestrator_robustness?: OrchestratorRobustnessMetadata;
};

const LIVE_TOOL_WEATHER_MS = 2500;
/** Amadeus Flight Offers：网络 + token；略宽裕避免轻量路径裁掉 inventory */
const LIVE_TOOL_FLIGHT_MS = 22000;
/** Airbnb Direct 常 8–20s；页探默认关闭，检索超时放宽，外层再留余量 */
const LIVE_TOOL_HOTEL_MS = (() => {
  const raw = parseInt(process.env.LIVE_TOOL_HOTEL_MS ?? '', 10);
  return Number.isFinite(raw) && raw >= 15_000 ? Math.min(raw, 60_000) : 42_000;
})();
/** Booking.com 租车：地点解析 + 上游检索常需数秒 */
/** 客户端常见 ~10s 断连；国内飞猪约 2s，留余量且避免卡死在海外回落 */
const LIVE_TOOL_CAR_RENTAL_MS = 8000;
/** 多日行程按「每晚上一间」采样检索时的最大分段次数（并行 MCP） */
const MAX_HOTEL_NIGHT_SAMPLE_SEGMENTS = 5;
/** 整段多日重规划：逐晚住宿 MCP 上限（6 天行程约 5 间夜） */
const MAX_FULL_TRIP_REPLAN_HOTEL_NIGHTS = 6;
/** 仅检索一间夜时展示更多候选；多段并行时略少以免卡片过多 */
const HOTEL_MCP_MAX_LISTINGS_SINGLE_NIGHT_SEGMENT = 6;
const HOTEL_MCP_MAX_LISTINGS_PER_MULTI_SEGMENT = 2;

const HOTEL_UI_LAYOUT_HINT_ZH =
  '建议界面：顶部用 1～2 段简短策略文字；紧接着按 accommodation_night_groups（每晚一块）渲染卡片与占位，勿与正文大块清单重复。免责说明放在列表末尾。';

/** 将扁平 accommodations 按 nightIndex 展开为每晚一组（含未采样晚），供前端与正文同屏整合 */
export async function buildAccommodationNightGroupsForPayload(
  host: LightweightLiveSensorsHost,
  accommodations: RouteAndRunAccommodationCard[],
  tripId: string,
  tripFirstCheckInYmd: string,
  totalNights: number,
  opts?: { includeOnlyNightIndices?: number[] },
): Promise<AccommodationNightGroup[]> {
  const out: AccommodationNightGroup[] = [];
  const nightsToIterate =
    opts?.includeOnlyNightIndices && opts.includeOnlyNightIndices.length > 0
      ? [...new Set(opts.includeOnlyNightIndices)].filter((n) => n >= 1 && n <= totalNights).sort((a, b) => a - b)
      : Array.from({ length: totalNights }, (_, i) => i + 1);
  for (const night of nightsToIterate) {
    const checkIn = addDaysYmd(tripFirstCheckInYmd, night - 1);
    const checkOut = addDaysYmd(tripFirstCheckInYmd, night);
    const cards = accommodations.filter((c) => c.nightIndex === night);
    const hasMcpSample = cards.length > 0;
    const anchorLabelZh = hasMcpSample
      ? (cards[0].itineraryHintZh ??
        (await buildStaySegmentLabelZh(host, tripId, checkIn, night, totalNights)))
      : await buildStaySegmentLabelZh(host, tripId, checkIn, night, totalNights);
    out.push({
      night_index: night,
      check_in: checkIn,
      check_out: checkOut,
      anchor_label_zh: anchorLabelZh,
      stay_label_zh: formatStayLabelZh(checkIn, checkOut),
      has_mcp_sample: hasMcpSample,
      ...(!hasMcpSample
        ? {
            placeholder_zh: '该晚暂无采样房源，可稍后针对当日锚点再次检索或手动浏览预订平台。',
          }
        : {}),
      cards,
    });
  }
  return out;
}

/** Phase1：只读天气 MCP；需 options.enable_live_tools 含 weather，或 intent_flags.live_facts + 天气类用语，或「天气+路况/目的地近期」话术 */
export function shouldAttemptLiveWeatherSensor(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto, context: AgentContext,
): boolean {
  if (!host.mcpToolDispatcher) return false;
  return shouldEnableLiveWeatherMcpForLightweightRoute(
    context.routingTaskType,
    request.message,
    request.options,
  );
}

/**
 * Phase1：只读酒店检索 MCP。
 * - 显式开启：`enable_live_tools` 含 `hotel`。
 * - 自动开启：轻量路由（DATA_LOOKUP / GENERIC_QA / RAG_QA）且消息含住宿检索意图（无需 live_facts）。
 * 仍需 Trip 起止日或 structured_travel_input 日期，否则 resolveHotelSearchParamsForMcp 返回 null 并跳过调用。
 */
export function shouldAttemptHotelSensor(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto, context: AgentContext,
): boolean {
  if (!host.mcpToolDispatcher) return false;
  const rt = context.routingTaskType;
  if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
  const tools = normalizeLiveTools(request.options?.enable_live_tools);
  const msg = request.message ?? '';
  if (tools.includes('hotel')) return true;
  /** 可执行航班库存 intent：勿自动旁路到住宿（除非用户显式 enable_live_tools hotel） */
  if (
    !tools.includes('hotel') &&
    (host.amadeusDirect?.isAvailable ||
      host.flightMcp?.isAvailable ||
      !!host.mcpToolDispatcher) &&
    isExecutableFlightInventoryQuery(msg)
  ) {
    return false;
  }
  if (isDayLodgingChoiceQuery(msg) || isHotelInventorySearchQuery(msg)) return true;
  if (
    /酒店|旅馆|宾馆|旅店|住宿|民宿|青旅|空房|房源|含早|可订房源|可订酒店|可订房|可订住宿|预订住宿|订房|找.*房|推荐.*酒店|换.*酒店|标间|大床|双床|双人房|套房|厨房|自然景色|海景|景观房|\bhotel\b|\bairbnb\b|\bhostel\b|\blodging\b/i.test(
      msg,
    )
  )
    return true;
  return false;
}

/** Phase1：Amadeus / Flight MCP / 飞猪；显式 `flight` 或开放程/实时航班组合话术 */
export function shouldAttemptFlightSensor(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto, context: AgentContext,
): boolean {
  if (
    !host.amadeusDirect?.isAvailable &&
    !host.flightMcp?.isAvailable &&
    !host.mcpToolDispatcher
  ) {
    return false;
  }
  const rt = context.routingTaskType;
  if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
  const tools = normalizeLiveTools(request.options?.enable_live_tools);
  const msg = request.message ?? '';
  if (tools.includes('flight')) return true;
  return isExecutableFlightInventoryQuery(msg);
}

/**
 * Booking.com 租车 MCP（轻量路径）。
 * - 显式：`enable_live_tools` 含 `car_rental`。
 * - 自动：话术含租车/推荐租车等（与咨询路由「交通」语义对齐）。
 * 需能解析取还日期（绑定行程起止日或 structured 日期），否则跳过。
 */
export function shouldAttemptCarRentalSensor(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto, context: AgentContext,
): boolean {
  if (!host.mcpToolDispatcher) return false;
  const rt = context.routingTaskType;
  if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
  const tools = normalizeLiveTools(request.options?.enable_live_tools);
  const msg = request.message ?? '';
  if (tools.includes('car_rental')) return true;
  if (
    /我要租车|想租车|需要租车|租车|推荐租车|租一辆车|租一辆|租辆|租台|租越野|查询租车|车型|报价|取车|还车|车行|SUV|四驱|越野车|包车|自驾租车|\bcar\s+rental\b|\brent\s+a\s+car\b/i.test(
      msg,
    ) ||
    /(?:在|从)\s*[\u4e00-\u9fff]{2,8}\s*租/.test(msg)
  ) {
    return true;
  }
  return false;
}

/** 从话术/行程解析取车城市（国内优先飞猪城镇锚点，避免默认雷克雅未克） */
function resolveCarPickupQueryFromContext(
  message: string,
  destination?: string | null,
): { pickupQuery: string; countryCode?: string } {
  const dest = String(destination ?? '').trim();
  const du = dest.toUpperCase();
  if (du === 'IS' || /冰岛|冰島/i.test(dest) || /^iceland$/i.test(dest)) {
    return { pickupQuery: 'Reykjavik Iceland' };
  }
  if (
    isChinaOtaMarketLoose({ destination: dest, countryCode: du === 'CN' ? 'CN' : undefined }) ||
    hasChinaFliggyHubHint(message, dest)
  ) {
    // 租车优先话术里的「取车城」（首个城市锚点）；勿把国家码 CN 当取车点
    const pickupMatch = message.match(
      /([\u4e00-\u9fff]{2,8})\s*租车|(?:在|从)\s*([\u4e00-\u9fff]{2,8})\s*(?:取车|租)/,
    );
    const pickupFromMsg =
      pickupMatch?.[1] || pickupMatch?.[2] || CITY_HINT_FALLBACK(message);
    const hub =
      pickupFromMsg ||
      resolveFliggyDestName({
        destination: /^(CN|CHN|China|中国)$/i.test(dest) ? null : dest,
        placeHint: message,
        query: message,
      }) ||
      undefined;
    return {
      pickupQuery: hub || '租车',
      countryCode: 'CN',
    };
  }
  if (dest.length === 2 && /^[A-Z]{2}$/i.test(dest)) {
    // 国家码不能当 Booking/飞猪取车城市名
    if (du === 'CN' || du === 'HK' || du === 'MO') {
      return { pickupQuery: '租车', countryCode: du === 'MO' ? 'CN' : du };
    }
    return { pickupQuery: dest };
  }
  if (dest.length > 1) return { pickupQuery: dest };
  return { pickupQuery: 'Reykjavik' };
}

function CITY_HINT_FALLBACK(text: string): string | null {
  const m = String(text ?? '').match(
    /(北京|上海|广州|深圳|杭州|成都|重庆|西安|南京|拉萨|林芝|康定|芒康|丽江|大理|三亚|厦门)/,
  );
  return m?.[1] ?? null;
}

/** 从绑定行程解析 Booking.com 租车检索参数；无日期则 null */
export async function resolveCarRentalSearchParamsForMcp(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  effectiveTripId?: string,
): Promise<Record<string, unknown> | null> {
  const st = request.structured_travel_input;
  let pickUpDate: string | undefined;
  let dropOffDate: string | undefined;
  let tripDest: string | undefined;

  if (st?.start_date && st?.end_date) {
    pickUpDate = st.start_date.slice(0, 10);
    dropOffDate = st.end_date.slice(0, 10);
  }
  if (st?.destination?.trim()) tripDest = st.destination.trim();

  if (effectiveTripId) {
    try {
      const trip = await host.prisma.trip.findUnique({
        where: { id: effectiveTripId },
        select: { destination: true, startDate: true, endDate: true },
      });
      if (!pickUpDate && trip?.startDate && trip?.endDate) {
        pickUpDate = trip.startDate.toISOString().slice(0, 10);
        dropOffDate = trip.endDate.toISOString().slice(0, 10);
      }
      if (!tripDest) tripDest = trip?.destination?.trim() || undefined;
    } catch {
      return null;
    }
  }

  if (!pickUpDate || !dropOffDate) return null;

  const msg = request.message ?? '';
  const resolved = resolveCarPickupQueryFromContext(msg, tripDest);
  return {
    pickupQuery: resolved.pickupQuery,
    query: msg,
    ...(resolved.countryCode ? { countryCode: resolved.countryCode } : {}),
    ...(tripDest ? { destination: tripDest } : {}),
    pick_up_date: pickUpDate,
    drop_off_date: dropOffDate,
    pick_up_time: '10:00',
    drop_off_time: '10:00',
    driver_age: 30,
    currency_code: resolved.countryCode === 'CN' ? 'CNY' : 'USD',
    location: resolved.countryCode === 'CN' ? 'CN' : 'US',
  };
}

/**
 * 用户明确要问租车但 Trip / structured 尚无起止日时：用「今日起 +14 天取车、+21 天还车」的示例窗口触达 Booking.com，
 * 以便仍返回 MCP 列表与前端卡片（正文须提示价格为示意、用户可在工作台补日期后再查）。
 */
export async function buildFallbackCarRentalSearchParams(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  effectiveTripId?: string,
): Promise<Record<string, unknown> | null> {
  let tripDest =
    request.structured_travel_input?.destination?.trim() || undefined;
  if (effectiveTripId) {
    try {
      const trip = await host.prisma.trip.findUnique({
        where: { id: effectiveTripId },
        select: { destination: true },
      });
      if (!tripDest) tripDest = trip?.destination?.trim() || undefined;
    } catch {
      return null;
    }
  }
  const msg = request.message ?? '';
  const resolved = resolveCarPickupQueryFromContext(msg, tripDest);
  const now = new Date();
  const pickUp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
  const dropOff = new Date(Date.UTC(pickUp.getUTCFullYear(), pickUp.getUTCMonth(), pickUp.getUTCDate() + 7));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return {
    pickupQuery: resolved.pickupQuery,
    query: msg,
    ...(resolved.countryCode ? { countryCode: resolved.countryCode } : {}),
    ...(tripDest ? { destination: tripDest } : {}),
    pick_up_date: ymd(pickUp),
    drop_off_date: ymd(dropOff),
    pick_up_time: '10:00',
    drop_off_time: '10:00',
    driver_age: 30,
    currency_code: resolved.countryCode === 'CN' ? 'CNY' : 'USD',
    location: resolved.countryCode === 'CN' ? 'CN' : 'US',
  };
}

export function formatLiveCarRentalSensorBlock(
  host: LightweightLiveSensorsHost,
  data: unknown,
  opts?: { fallbackDatesUsed?: boolean },
): string {
  const d = data as {
    data?: unknown[];
    car_rentals?: unknown[];
    carRentals?: unknown[];
    meta?: { mode?: string; source?: string; browserbase_available?: boolean };
  };
  const rows = Array.isArray(d?.car_rentals)
    ? d.car_rentals
    : Array.isArray(d?.carRentals)
      ? d.carRentals
      : Array.isArray(d?.data)
        ? d.data
        : [];
  if (rows.length === 0) {
    return `【实时租车检索 MCP】供应商返回列表为空（可能无库存或日期无报价）。`;
  }
  const fromFliggy =
    d?.meta?.source === 'fliggy' ||
    rows.some(
      (x) =>
        x &&
        typeof x === 'object' &&
        (x as Record<string, unknown>).source === 'fliggy',
    );
  const isDirect =
    !fromFliggy &&
    (d?.meta?.mode === 'catalog_only' ||
      d?.meta?.mode === 'browserbase' ||
      d?.meta?.mode === 'mixed' ||
      rows.some(
        (x) =>
          x &&
          typeof x === 'object' &&
          ((x as Record<string, unknown>).source === 'catalog_fallback' ||
            (x as Record<string, unknown>).source === 'browserbase'),
      ));
  const prefix =
    opts?.fallbackDatesUsed === true
      ? '【说明】当前行程未携带可取用的起止日，已使用系统示例取还日期窗口检索；报价仅供示意，请以预订页实时为准。\n'
      : '';
  const lines = rows.slice(0, 6).map((x, i) => {
    const row = x as Record<string, unknown>;
    const company = String(row.company ?? row.supplier ?? row.nameZh ?? row.name ?? '供应商');
    const vehicle = String(row.vehicle_type ?? row.vehicleType ?? row.car_class ?? '');
    const priceObj = row.price as Record<string, unknown> | undefined;
    const priceFromObj =
      priceObj && typeof priceObj === 'object'
        ? `${priceObj.currency ?? ''} ${priceObj.amount ?? ''}`.trim()
        : '';
    const price = priceFromObj || String(row.priceLabel ?? '').trim();
    const src =
      row.source === 'fliggy'
        ? '飞猪'
        : row.source === 'browserbase'
          ? '页探'
          : row.source === 'catalog_fallback'
            ? '目录'
            : '';
    const url = String(row.url ?? '').trim();
    return `[${i + 1}] ${company}${vehicle ? ` · ${vehicle}` : ''}${price ? ` · ${price}` : ''}${
      src ? ` · ${src}` : ''
    }${url ? ` → ${url}` : ''}`;
  });
  const head = fromFliggy
    ? '【实时租车 飞猪】以下为飞猪摘录（可订性与价格以飞猪页为准）：'
    : isDirect
      ? '【租车检索】以下为本地车行/比价入口（Browserbase 探页或目录；非 Booking 实时价，可订性以官网为准）：'
      : '【实时租车检索 MCP】以下为 Booking.com 摘录（可订性与价格以平台实时为准）：';
  return [prefix + head, ...lines].join('\n');
}

export async function runLiveCarRentalSensorBranch(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  effectiveTripId?: string,
): Promise<{
  audits: LiveSensorAuditRow[];
  block: string | null;
  carRentals?: unknown[];
  carRentalSearchMeta?: {
    fallback_dates_used?: boolean;
    pick_up_date?: string;
    drop_off_date?: string;
    pickup_query?: string;
    captured_at_iso?: string;
  };
}> {
  const audits: LiveSensorAuditRow[] = [];
  if (!shouldAttemptCarRentalSensor(host, request, context)) {
    return { audits, block: null };
  }
  const rentalSearchAvailable =
    typeof host.mcpToolDispatcher?.isCarRentalSearchAvailable === 'function'
      ? host.mcpToolDispatcher.isCarRentalSearchAvailable()
      : typeof host.mcpToolDispatcher?.isBookingComCarRentalAvailable === 'function'
        ? host.mcpToolDispatcher.isBookingComCarRentalAvailable()
        : Boolean(String(process.env.RAPIDAPI_BOOKING_COM_API_KEY ?? '').trim()) ||
          !!host.mcpToolDispatcher;
  if (!rentalSearchAvailable) {
    host.logger.debug(
      `[LiveTool] car_rental skipped_unavailable request_id=${request.request_id}`,
    );
    audits.push({
      tool_id: 'live_tool.mcp.car_rental',
      ok: false,
      latency_ms: 0,
      error: 'CAR_RENTAL_SEARCH_UNAVAILABLE',
    });
    return {
      audits,
      block:
        '【租车数据】租车检索暂不可用。请结合本地车行目录卡片推荐，勿声称已查到实时报价。',
      carRentals: [],
      carRentalSearchMeta: {
        fallback_dates_used: true,
        captured_at_iso: new Date().toISOString(),
      },
    };
  }
  let params = await resolveCarRentalSearchParamsForMcp(host, request, effectiveTripId);
  let fallbackDatesUsed = false;
  if (!params) {
    params = await buildFallbackCarRentalSearchParams(host, request, effectiveTripId);
    fallbackDatesUsed = Boolean(params);
    if (!params) {
      host.logger.debug(
        `[LiveTool] car_rental skipped_no_dates request_id=${request.request_id}（无 Trip 起止日且无法构造默认窗口）`,
      );
      return { audits, block: null, carRentals: [] };
    }
    host.logger.debug(
      `[LiveTool] car_rental using_fallback_dates request_id=${request.request_id} pick=${params.pick_up_date} drop=${params.drop_off_date}`,
    );
  }
  const pickUpYmd = typeof params.pick_up_date === 'string' ? params.pick_up_date : undefined;
  const dropYmd = typeof params.drop_off_date === 'string' ? params.drop_off_date : undefined;
  const pickupQ = typeof params.pickupQuery === 'string' ? params.pickupQuery : undefined;
  // 透传行程国家，国内租车走飞猪
  if (effectiveTripId) {
    try {
      const trip = await host.prisma.trip.findUnique({
        where: { id: effectiveTripId },
        select: { destination: true },
      });
      const td = trip?.destination?.trim();
      if (td === 'CN' || td === 'CHN' || td === '中国' || td === 'China') {
        params.countryCode = 'CN';
        params.destination = td;
      } else if (td) {
        params.destination = td;
      }
    } catch {
      /* ignore */
    }
  }
  const stCarDest = request.structured_travel_input?.destination?.trim();
  if (stCarDest && !params.destination) params.destination = stCarDest;
  if (stCarDest === 'CN' || stCarDest === '中国') params.countryCode = 'CN';

  const started = Date.now();
  try {
    const data = await runLiveToolWithTimeout(
      () => host.mcpToolDispatcher!.executeTool('car_rental', 'car_rental.search', params),
      LIVE_TOOL_CAR_RENTAL_MS,
    );
    const latency_ms = Date.now() - started;
    audits.push({ tool_id: 'live_tool.mcp.car_rental', ok: true, latency_ms });
    host.logger.log({
      tag: 'live_tool.mcp.car_rental',
      request_id: request.request_id,
      ok: true,
      latency_ms,
    });
    const pack = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const rows = Array.isArray(pack.car_rentals)
      ? (pack.car_rentals as unknown[])
      : Array.isArray(pack.carRentals)
        ? (pack.carRentals as unknown[])
        : Array.isArray(pack.data)
          ? (pack.data as unknown[])
          : [];
    const capturedIso = new Date().toISOString();
    const carRentalSearchMeta = fallbackDatesUsed
      ? {
          fallback_dates_used: true as const,
          pick_up_date: pickUpYmd,
          drop_off_date: dropYmd,
          pickup_query: pickupQ,
          captured_at_iso: capturedIso,
        }
      : pickUpYmd || dropYmd || pickupQ
        ? {
            fallback_dates_used: false as const,
            pick_up_date: pickUpYmd,
            drop_off_date: dropYmd,
            pickup_query: pickupQ,
            captured_at_iso: capturedIso,
          }
        : { captured_at_iso: capturedIso };
    return {
      audits,
      block: formatLiveCarRentalSensorBlock(host, data, { fallbackDatesUsed }),
      carRentals: rows,
      carRentalSearchMeta,
    };
  } catch (e: any) {
    const latency_ms = Date.now() - started;
    const err = e?.message ? String(e.message) : String(e);
    audits.push({
      tool_id: 'live_tool.mcp.car_rental',
      ok: false,
      latency_ms,
      error: err,
      orchestrator_robustness: classifyOrchestratorFailure(e, {
        orchestrator_step: 'INTAKE',
        tool_id: 'live_tool.mcp.car_rental',
      }),
    });
    host.logger.warn({
      tag: 'live_tool.mcp.car_rental',
      request_id: request.request_id,
      ok: false,
      latency_ms,
      error: err,
    });
    return {
      audits,
      block:
        '【租车数据】实时检索失败。国内请稍后重试飞猪；海外可结合 Booking / 本地车行目录，勿声称已查到实时报价。',
      carRentals: [],
      carRentalSearchMeta: {
        fallback_dates_used: fallbackDatesUsed,
        pick_up_date: pickUpYmd,
        drop_off_date: dropYmd,
        pickup_query: pickupQ,
        captured_at_iso: new Date().toISOString(),
      },
    };
  }
}

export async function runIcelandRentalGuidanceLightweightBranch(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  tripCtxJoined: string,
): Promise<{
  audits: LiveSensorAuditRow[];
  guidance: IcelandRentalGuidanceOutput | null;
  promptLines: string[];
  footnotesZh: string[];
}> {
  const audits: LiveSensorAuditRow[] = [];
  if (!host.icelandRentalGuidanceSkill) {
    return { audits, guidance: null, promptLines: [], footnotesZh: [] };
  }
  if (!shouldInjectIcelandRentalGuidanceForLightweight(request.message ?? '', tripCtxJoined)) {
    return { audits, guidance: null, promptLines: [], footnotesZh: [] };
  }
  const t0 = Date.now();
  try {
    const guidance = await host.icelandRentalGuidanceSkill.execute({
      user_query: request.message ?? '',
    });
    const latency_ms = Date.now() - t0;
    audits.push({ tool_id: 'skill.iceland.rentalGuidance', ok: true, latency_ms });
    return {
      audits,
      guidance,
      promptLines: buildIcelandRentalGuidancePromptLines(guidance),
      footnotesZh: buildCarRentalGuidanceFootnotesZh(guidance),
    };
  } catch (e: any) {
    const latency_ms = Date.now() - t0;
    const err = e?.message ? String(e.message) : String(e);
    audits.push({
      tool_id: 'skill.iceland.rentalGuidance',
      ok: false,
      latency_ms,
      error: err,
      orchestrator_robustness: classifyOrchestratorFailure(e, {
        orchestrator_step: 'INTAKE',
        tool_id: 'skill.iceland.rentalGuidance',
      }),
    });
    host.logger.warn({
      tag: 'skill.iceland.rentalGuidance',
      request_id: request.request_id,
      ok: false,
      latency_ms,
      error: err,
    });
    return { audits, guidance: null, promptLines: [], footnotesZh: [] };
  }
}

export function stampHotelInventoryCapturedAt(
  host: LightweightLiveSensorsHost,
  payload: HotelRouteRunUiPayload,
): void {
  const iso = new Date().toISOString();
  const prev = payload.hotel_search_meta;
  if (!prev) {
    payload.hotel_search_meta = { strategy: 'single_stay', captured_at_iso: iso };
    return;
  }
  payload.hotel_search_meta = { ...prev, captured_at_iso: iso };
}

export function formatFlightOfferLineForSensorBlock(
  host: LightweightLiveSensorsHost,
  offer: AmadeusDirectFlightOffer, idx: number,
): string {
  const price = offer.price;
  const total = price?.grandTotal ?? price?.total;
  const cur = price?.currency ?? '';
  const it0 = offer.itineraries?.[0];
  const dur = it0?.duration ?? '';
  const segs = it0?.segments ?? [];
  const flightNums = segs
    .map((s) => [s.carrierCode, s.number].filter(Boolean).join(''))
    .filter(Boolean)
    .slice(0, 4)
    .join('/');
  return `[${idx}] ${cur} ${total ?? '?'} · ${dur || '?'} · ${flightNums || '—'}`;
}

/**
 * 选择航班库存数据源：默认优先 Amadeus；仅 Amadeus 未配置时可仅用 Flight MCP。
 * FLIGHT_INVENTORY_PROVIDER=mcp|amadeus|auto（默认 auto）
 * FLIGHT_INVENTORY_PREFER=mcp|amadeus（二者皆可用时，默认 amadeus）
 */
export function shouldUseFlightMcpProvider(host: LightweightLiveSensorsHost): boolean {
  const mcpOk = !!host.flightMcp?.isAvailable;
  const amadeusOk = !!host.amadeusDirect?.isAvailable;
  const mode = (process.env.FLIGHT_INVENTORY_PROVIDER || 'auto').toLowerCase();
  if (mode === 'mcp') return mcpOk;
  if (mode === 'amadeus') return false;
  const prefer = (process.env.FLIGHT_INVENTORY_PREFER || 'amadeus').toLowerCase();
  if (!mcpOk && !amadeusOk) return false;
  if (!amadeusOk && mcpOk) return true;
  if (!mcpOk && amadeusOk) return false;
  return prefer === 'mcp';
}

export async function runLiveFlightSensorBranch(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  effectiveTripId?: string,
): Promise<{
  audits: LiveSensorAuditRow[];
  block: string | null;
  flight_inventory_snapshot?: {
    legs: Array<Record<string, unknown>>;
    disclaimer_zh?: string;
    captured_at_iso?: string;
    provider?: string;
  };
}> {
  const audits: LiveSensorAuditRow[] = [];
  if (!shouldAttemptFlightSensor(host, request, context)) {
    return { audits, block: null };
  }
  let tripStart: string | undefined;
  let tripEnd: string | undefined;
  if (effectiveTripId) {
    try {
      const trip = await host.prisma.trip.findUnique({
        where: { id: effectiveTripId },
        select: { startDate: true, endDate: true },
      });
      if (trip?.startDate && trip?.endDate) {
        tripStart = trip.startDate.toISOString().slice(0, 10);
        tripEnd = trip.endDate.toISOString().slice(0, 10);
      }
    } catch {
      /* ignore */
    }
  }
  let tripDest: string | undefined;
  if (effectiveTripId) {
    try {
      const t = await host.prisma.trip.findUnique({
        where: { id: effectiveTripId },
        select: { destination: true },
      });
      tripDest = t?.destination?.trim() || undefined;
    } catch {
      /* ignore */
    }
  }
  const stDest = request.structured_travel_input?.destination?.trim();
  const chinaFlight = isChinaFlightInventoryScope({
    message: request.message,
    destination: stDest || tripDest,
    countryCode:
      stDest === 'CN' || tripDest === 'CN' || stDest === '中国' || tripDest === '中国'
        ? 'CN'
        : undefined,
  });

  const legs = resolveFlightInventoryLegs(request.message ?? '', {
    tripStartYmd: tripStart,
    tripEndYmd: tripEnd,
  });
  if (!legs?.length) {
    host.logger.debug(`[LiveTool] flight skipped_no_legs request_id=${request.request_id}`);
    return { audits, block: null };
  }

  /** 国内：优先飞猪 search-flight */
  if (chinaFlight && host.mcpToolDispatcher) {
    const fliggyStarted = Date.now();
    try {
      const snapshotLegsFliggy: Array<Record<string, unknown>> = [];
      const blockLinesFliggy: string[] = [
        '【实时机票 飞猪 FlyAI】以下为报价摘录（非生成文案；舱位与价格以飞猪下单页为准）：',
      ];
      for (const leg of legs) {
        const originZh = iataOrCodeToFliggyCity(leg.origin);
        const destZh = iataOrCodeToFliggyCity(leg.destination);
        const raw = await runLiveToolWithTimeout(
          () =>
            host.mcpToolDispatcher!.executeTool('fliggy', 'fliggy.search_flight', {
              origin: originZh,
              destination: destZh,
              dep_date: leg.departureDate,
              limit: 6,
            }),
          LIVE_TOOL_FLIGHT_MS,
        );
        const pack = (raw && typeof raw === 'object' ? raw : {}) as {
          flights?: Array<Record<string, unknown>>;
          success?: boolean;
        };
        const flights = Array.isArray(pack.flights) ? pack.flights : [];
        const lines = flights.slice(0, 6).map((f, i) => {
          const line = String(
            (f as { summaryLineZh?: string }).summaryLineZh ??
              (f as { titleZh?: string }).titleZh ??
              `航班${i + 1}`,
          );
          const url = String((f as { url?: string }).url ?? '');
          return url ? `- ${line} → ${url}` : `- ${line}`;
        });
        blockLinesFliggy.push(`### ${leg.leg_label_zh}`);
        blockLinesFliggy.push(...(lines.length ? lines : ['（无报价或未返回数据）']));
        snapshotLegsFliggy.push({
          ...leg,
          origin: originZh,
          destination: destZh,
          provider: 'fliggy',
          sample_offers: flights,
          lines,
        });
      }
      const anyOffer = snapshotLegsFliggy.some(
        (l) => Array.isArray(l.sample_offers) && (l.sample_offers as unknown[]).length > 0,
      );
      const latency_ms = Date.now() - fliggyStarted;
      audits.push({
        tool_id: 'live_tool.mcp.fliggy.flight',
        ok: anyOffer,
        latency_ms,
        ...(!anyOffer ? { error: 'NO_FLIGGY_FLIGHT_RESULTS' } : {}),
      });
      host.logger.log({
        tag: 'live_tool.mcp.fliggy.flight',
        request_id: request.request_id,
        ok: anyOffer,
        latency_ms,
        legs: snapshotLegsFliggy.length,
      });
      if (anyOffer) {
        return {
          audits,
          block: [
            ...blockLinesFliggy,
            '【说明】飞猪实时机票；与其它库存冲突时以飞猪下单页为准。',
          ].join('\n'),
          flight_inventory_snapshot: {
            legs: snapshotLegsFliggy,
            disclaimer_zh: '报价来自飞猪 FlyAI；舱位与价格以下单页实时为准。',
            captured_at_iso: new Date().toISOString(),
            provider: 'fliggy',
          },
        };
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      audits.push({
        tool_id: 'live_tool.mcp.fliggy.flight',
        ok: false,
        latency_ms: Date.now() - fliggyStarted,
        error: err,
        orchestrator_robustness: classifyOrchestratorFailure(e, {
          orchestrator_step: 'INTAKE',
          tool_id: 'live_tool.mcp.fliggy.flight',
        }),
      });
      host.logger.warn({
        tag: 'live_tool.mcp.fliggy.flight',
        request_id: request.request_id,
        ok: false,
        error: err,
      });
      // 国内失败不再回落 Amadeus（海外库存）；直接返回失败说明
      if (isChinaOtaMarketLoose({ destination: stDest || tripDest, countryCode: 'CN' }) || chinaFlight) {
        return {
          audits,
          block: `【飞猪机票】检索失败（${err.slice(0, 100)}）；请稍后重试或改用城市对「成都到拉萨机票」。`,
        };
      }
    }
  }

  const useMcp = shouldUseFlightMcpProvider(host, );
  if (useMcp && !host.flightMcp?.isAvailable) {
    host.logger.debug(`[LiveTool] flight skipped_mcp_unavailable request_id=${request.request_id}`);
    return { audits, block: null };
  }
  if (!useMcp && !host.amadeusDirect?.isAvailable) {
    host.logger.debug(`[LiveTool] flight skipped_amadeus_unavailable request_id=${request.request_id}`);
    return { audits, block: null };
  }
  const flightProviderMode = (process.env.FLIGHT_INVENTORY_PROVIDER || 'auto').toLowerCase();
  if (flightProviderMode === 'mcp' && !useMcp) {
    host.logger.debug(`[LiveTool] flight skipped_mcp_required request_id=${request.request_id}`);
    return { audits, block: null };
  }

  const started = Date.now();
  const snapshotLegs: Array<Record<string, unknown>> = [];
  const headerZh = useMcp
    ? '【实时航班检索 Flight MCP】以下为报价摘录（非生成文案；聚合数据源，以预订时为准）：'
    : '【实时航班库存 Amadeus Flight Offers】以下为报价摘录（非生成文案；舱位与价格以预订时为准）：';
  const disclaimerZh = useMcp
    ? '报价来自 Flight MCP（Smithery/Kiwi 等）；出发枢纽未写明时使用默认城市（见各腿 label）；以预订页实时为准。'
    : '报价来自 Amadeus Flight Offers；出发枢纽未写明时使用默认城市（见各腿 label）；以预订页实时为准。';
  const okToolId = useMcp ? 'live_tool.flight_mcp.search_flights' : 'live_tool.amadeus.flight_offers';
  const blockLines: string[] = [headerZh];

  try {
    for (const leg of legs) {
      const legStarted = Date.now();
      if (useMcp && host.flightMcp) {
        const out = await runLiveToolWithTimeout<{
          raw: unknown;
          lines: string[];
        }>(
          () =>
            host.flightMcp!.searchFlightsOneWay({
              origin: leg.origin,
              destination: leg.destination,
              departDate: leg.departureDate,
            }),
          LIVE_TOOL_FLIGHT_MS,
        );
        const { lines, raw } = out;
        const displayLinesMcp = lines.length ? lines : ['（无报价或未返回数据）'];
        const mcpFailed = isFlightMcpToolResultFailure(raw, displayLinesMcp);
        const mcpLinesForUi = mcpFailed ? sanitizeFlightInventoryLinesForUi(displayLinesMcp) : displayLinesMcp;
        const latencyMcp = Date.now() - legStarted;
        if (mcpFailed) {
          host.flightMcp.invalidateConnectionCacheFromRaw(raw);
        }
        audits.push({
          tool_id: okToolId,
          ok: !mcpFailed,
          latency_ms: latencyMcp,
          ...(mcpFailed ? { error: 'mcp_tool_error' } : {}),
        });

        const allowAmadeusFallback =
          mcpFailed &&
          host.amadeusDirect?.isAvailable &&
          process.env.FLIGHT_MCP_FALLBACK_AMADEUS !== 'false';

        if (allowAmadeusFallback) {
          host.logger.warn({
            tag: 'live_tool.flight_mcp.fallback_amadeus',
            request_id: request.request_id,
            leg: `${leg.origin}->${leg.destination}`,
            date: leg.departureDate,
          });
          const legStartedAmadeus = Date.now();
          try {
            const result = await runLiveToolWithTimeout(
              () =>
                host.amadeusDirect!.searchFlightOffers({
                  originLocationCode: leg.origin,
                  destinationLocationCode: leg.destination,
                  departureDate: leg.departureDate,
                  adults: 1,
                  max: 5,
                  currencyCode: 'EUR',
                }),
              LIVE_TOOL_FLIGHT_MS,
            );
            const latencyAmadeus = Date.now() - legStartedAmadeus;
            audits.push({ tool_id: 'live_tool.amadeus.flight_offers', ok: true, latency_ms: latencyAmadeus });
            const offers = Array.isArray(result?.data) ? result.data : [];
            const sample = offers
              .slice(0, 3)
              .map((o, i) => formatFlightOfferLineForSensorBlock(host, o, i + 1));
            const displayLines = sample.length ? sample : ['（Amadeus 本轮亦无报价）'];
            const structuredAmadeus = mapAmadeusOffersToSampleCards(offers, 5);
            const sample_offers = enrichSampleOffersFromLines(structuredAmadeus, displayLines, 5);
            blockLines.push(`— ${leg.leg_label_zh} (${leg.origin}→${leg.destination} ${leg.departureDate}) —`);
            blockLines.push(...displayLines);
            snapshotLegs.push({
              provider: 'amadeus',
              fallback_from: 'flight_mcp',
              origin_iata: leg.origin,
              destination_iata: leg.destination,
              departure_date: leg.departureDate,
              label_zh: leg.leg_label_zh,
              raw_offer_count: offers.length,
              sample_lines: displayLines,
              sample_offers,
            });
          } catch (fallbackErr: any) {
            const msg = fallbackErr?.message ? String(fallbackErr.message) : String(fallbackErr);
            host.logger.warn({
              tag: 'live_tool.flight_mcp.fallback_amadeus_failed',
              request_id: request.request_id,
              error: msg,
            });
            blockLines.push(`— ${leg.leg_label_zh} (${leg.origin}→${leg.destination} ${leg.departureDate}) —`);
            blockLines.push(...mcpLinesForUi);
            const structuredMcp = parseFlightMcpToolResultToSampleOffers(raw, 5);
            const sample_offers = enrichSampleOffersFromLines(structuredMcp, mcpLinesForUi, 5);
            snapshotLegs.push({
              provider: 'flight_mcp',
              origin_iata: leg.origin,
              destination_iata: leg.destination,
              departure_date: leg.departureDate,
              label_zh: leg.leg_label_zh,
              sample_lines: mcpLinesForUi,
              sample_offers,
            });
          }
        } else {
          blockLines.push(`— ${leg.leg_label_zh} (${leg.origin}→${leg.destination} ${leg.departureDate}) —`);
          blockLines.push(...mcpLinesForUi);
          const structuredMcp = parseFlightMcpToolResultToSampleOffers(raw, 5);
          const sample_offers = enrichSampleOffersFromLines(structuredMcp, mcpLinesForUi, 5);
          snapshotLegs.push({
            provider: 'flight_mcp',
            origin_iata: leg.origin,
            destination_iata: leg.destination,
            departure_date: leg.departureDate,
            label_zh: leg.leg_label_zh,
            sample_lines: mcpLinesForUi,
            sample_offers,
          });
        }
      } else {
        const result = await runLiveToolWithTimeout(
          () =>
            host.amadeusDirect!.searchFlightOffers({
              originLocationCode: leg.origin,
              destinationLocationCode: leg.destination,
              departureDate: leg.departureDate,
              adults: 1,
              max: 5,
              currencyCode: 'EUR',
            }),
          LIVE_TOOL_FLIGHT_MS,
        );
        const latency_ms = Date.now() - legStarted;
        audits.push({ tool_id: okToolId, ok: true, latency_ms });
        const offers = Array.isArray(result?.data) ? result.data : [];
        const sample = offers
          .slice(0, 3)
          .map((o, i) => formatFlightOfferLineForSensorBlock(host, o, i + 1));
        const displayLines = sample.length ? sample : ['（无报价或未返回数据）'];
        const structuredAmadeus = mapAmadeusOffersToSampleCards(offers, 5);
        const sample_offers = enrichSampleOffersFromLines(structuredAmadeus, displayLines, 5);
        blockLines.push(`— ${leg.leg_label_zh} (${leg.origin}→${leg.destination} ${leg.departureDate}) —`);
        blockLines.push(...displayLines);
        snapshotLegs.push({
          provider: 'amadeus',
          origin_iata: leg.origin,
          destination_iata: leg.destination,
          departure_date: leg.departureDate,
          label_zh: leg.leg_label_zh,
          raw_offer_count: offers.length,
          sample_lines: displayLines,
          sample_offers,
        });
      }
    }
    const auditAllOk = audits.every((a) => a.ok === true);
    host.logger.log({
      tag: useMcp ? 'live_tool.flight_mcp.flight' : 'live_tool.amadeus.flight',
      request_id: request.request_id,
      ok: auditAllOk,
      latency_ms: Date.now() - started,
      leg_count: legs.length,
    });
    const capturedIso = new Date().toISOString();
    return {
      audits,
      block: blockLines.join('\n'),
      flight_inventory_snapshot: {
        legs: snapshotLegs,
        disclaimer_zh: disclaimerZh,
        captured_at_iso: capturedIso,
      },
    };
  } catch (e: any) {
    const latency_ms = Date.now() - started;
    const err = e?.message ? String(e.message) : String(e);
    audits.push({
      tool_id: okToolId,
      ok: false,
      latency_ms,
      error: err,
      orchestrator_robustness: classifyOrchestratorFailure(e, {
        orchestrator_step: 'INTAKE',
        tool_id: okToolId,
      }),
    });
    host.logger.warn({
      tag: useMcp ? 'live_tool.flight_mcp.flight' : 'live_tool.amadeus.flight',
      request_id: request.request_id,
      ok: false,
      latency_ms,
      error: err,
    });
    return { audits, block: null };
  }
}

export async function resolveLiveWeatherLocationForMcp(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  effectiveTripId?: string,
): Promise<LiveWeatherLocationResolve | null> {
  const msg = request.message ?? '';
  const fromMsg = resolveLiveWeatherLocationFromMessage(msg);
  if (fromMsg) return fromMsg;

  if (effectiveTripId) {
    const fromTrip = await resolveLiveWeatherLocationFromAnchoredTrip(host.prisma, effectiveTripId);
    if (fromTrip) return fromTrip;

    try {
      const trip = await host.prisma.trip.findUnique({
        where: { id: effectiveTripId },
        select: { destination: true },
      });
      const code = trip?.destination?.trim().toUpperCase();
      if (code === 'IS') return { location: 'Iceland', countryCode: 'IS' };
      if (code && /^[A-Z]{2}$/.test(code)) return { location: code, countryCode: code };
    } catch {
      /* ignore */
    }
  }

  return resolveLiveWeatherLocationFromMessage(msg);
}

export function formatLiveWeatherSensorBlock(
  host: LightweightLiveSensorsHost,
  data: Record<string, unknown>,
  opts?: { anchorLabel?: string },
): string {
  const cur = data?.current as Record<string, unknown> | undefined;
  if (!cur) {
    return `【实时天气传感器 MCP】原始响应（截断）：${JSON.stringify(data).slice(0, 1200)}`;
  }
  const city = data.city ?? '?';
  const country = data.country ?? '';
  return [
    '【实时天气传感器 MCP】以下为 Open-Meteo 当前观测读数（非生成文案）：',
    `- 查询地: ${city} (${country})`,
    ...(opts?.anchorLabel ? [`- 行程锚点: ${opts.anchorLabel}`] : []),
    `- 观测时间: ${cur.time}`,
    `- 气温: ${cur.temperature}°C（体感 ${cur.apparent_temperature}°C）`,
    `- 状况: ${cur.weather_description}`,
    `- 风速: ${cur.wind_speed} m/s`,
    '以上事实须与用户问题中的地点/行程摘要一致引用；若地名不一致，以行程摘要或用户明确提到的地名为准。',
  ].join('\n');
}

export async function runLiveToolWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, rej) => {
        timer = setTimeout(() => rej(new Error('LIVE_TOOL_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function formatLiveHotelSensorBlock(
  host: LightweightLiveSensorsHost,
  data: unknown,
): string {
  const d = data as Record<string, unknown>;
  const listings =
    (Array.isArray(d?.listings) && d.listings) ||
    (Array.isArray(d?.results) && d.results) ||
    (Array.isArray(d?.hotels) && d.hotels) ||
    (Array.isArray(d) ? d : null);
  if (listings && Array.isArray(listings)) {
    const lines = listings.slice(0, 5).map((x: unknown, i: number) => {
      const name = extractHotelListingDisplayName(x);
      const priceHint = extractHotelListingPriceHint(x);
      return `[${i + 1}] ${name}${priceHint ? ` · ${priceHint}` : ''}`;
    });
    return [
      '【实时住宿检索 MCP】以下为供应商检索摘录（非生成文案；可订性与价格以供应商实时为准）：',
      ...lines,
    ].join('\n');
  }
  return `【实时住宿检索 MCP】响应摘录（截断）：${JSON.stringify(data).slice(0, 2200)}`;
}

/**
 * 住宿 MCP 参数：默认从 Trip 表读目的地与整段行程日期；若用户在结构化字段里提交了入住窗口（日期选择器），则优先用该窗口。
 * 无 trip_id 时：仅当 structured_travel_input 同时给出 start_date、end_date（及可选 destination）才可检索。
 */
export async function resolveHotelSearchParamsForMcp(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  effectiveTripId?: string,
): Promise<Record<string, unknown> | null> {
  const st = request.structured_travel_input;
  let trip: { destination: string; startDate: Date; endDate: Date } | null = null;
  if (effectiveTripId) {
    try {
      trip = await host.prisma.trip.findUnique({
        where: { id: effectiveTripId },
        select: { destination: true, startDate: true, endDate: true },
      });
    } catch {
      trip = null;
    }
  }

  let checkIn: string | undefined;
  let checkOut: string | undefined;
  const tripStartYmd = trip?.startDate ? trip.startDate.toISOString().slice(0, 10) : undefined;
  const tripEndYmd = trip?.endDate ? trip.endDate.toISOString().slice(0, 10) : undefined;
  if (st?.start_date && st?.end_date) {
    checkIn = st.start_date;
    checkOut = st.end_date;
  } else if (trip?.startDate && trip?.endDate) {
    checkIn = tripStartYmd;
    checkOut = tripEndYmd;
  } else {
    const msgOnly = parseExplicitStayWindowFromUserMessage(request.message ?? '', {});
    if (msgOnly) {
      checkIn = msgOnly.checkIn;
      checkOut = msgOnly.checkOut;
    } else {
      return null;
    }
  }

  /** 正文明确日历窗时收窄 MCP 检索窗（含：结构化日期与 Trip 表一致时仍读取正文「6 月 5–7 日」）。 */
  const narrowed = narrowHotelStayWindowWithNlMessage({
    baseCheckIn: checkIn!,
    baseCheckOut: checkOut!,
    message: request.message ?? '',
    tripStartYmd,
    tripEndYmd,
  });
  checkIn = narrowed.checkIn;
  checkOut = narrowed.checkOut;

  const destFromStructured = st?.destination?.trim();
  const destFromTrip = trip?.destination?.trim() ?? '';
  const code = (destFromStructured || destFromTrip).toUpperCase();
  const destination =
    code === 'IS'
      ? 'Iceland'
      : code === 'CN' || code === 'CHN' || destFromStructured === '中国' || destFromTrip === '中国'
        ? 'China'
        : destFromStructured || destFromTrip || 'Iceland';
  const countryCode =
    code === 'CN' || code === 'CHN' || destFromStructured === '中国' || destFromTrip === '中国'
      ? 'CN'
      : code.length === 2 && /^[A-Z]{2}$/.test(code)
        ? code
        : destFromTrip.length === 2 && /^[A-Z]{2}$/i.test(destFromTrip)
          ? destFromTrip.toUpperCase()
          : undefined;

  const params: Record<string, unknown> = {
    checkIn,
    checkOut,
    destination,
    language: 'zh',
    ...(countryCode ? { countryCode } : {}),
  };
  if (effectiveTripId) params.tripId = effectiveTripId;
  if (tripStartYmd) params._resolvedTripStartYmd = tripStartYmd;
  if (tripEndYmd) params._resolvedTripEndYmd = tripEndYmd;
  return params;
}

/** 轻量住宿检索：根据入住日当天最后一项行程锚点生成中文标签（第几晚 / 地点） */
export async function buildStaySegmentLabelZh(
  host: LightweightLiveSensorsHost,
  tripId: string,
  checkInYmd: string,
  nightOneBased: number,
  totalNights: number,
): Promise<string> {
  try {
    const row = await host.prisma.$queryRaw<Array<{ nameCN: string; nameEN: string | null }>>`
      SELECT p."nameCN", p."nameEN"
      FROM "ItineraryItem" ii
      JOIN "TripDay" td ON ii."tripDayId" = td.id
      JOIN "Place" p ON ii."placeId" = p.id
      WHERE td."tripId" = ${tripId}
        AND td.date::date = ${checkInYmd}::date
      ORDER BY ii."order" DESC NULLS LAST, ii."startTime" DESC NULLS LAST
      LIMIT 1
    `;
    const place = row?.[0];
    const anchor = (place?.nameCN?.trim() || place?.nameEN?.trim() || '').trim();
    if (anchor) return `第${nightOneBased}/${totalNights}晚 · ${anchor}周边`;
  } catch {
    /* ignore */
  }
  const md = `${checkInYmd.slice(5, 7)}/${checkInYmd.slice(8, 10)}`;
  return `第${nightOneBased}/${totalNights}晚 · ${md} 入住`;
}

/** 与 buildStaySegmentLabelZh 同一锚点：指定日行程 POI（需含 geometry） */
export async function getStayAnchorGeoForTripDay(
  host: LightweightLiveSensorsHost,
  tripId: string,
  dayYmd: string,
  prefer: 'first' | 'last' = 'last',
): Promise<{ lat: number; lng: number; nameZh: string } | null> {
  if (!host.prisma) return null;
  const orderDir = prefer === 'first' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const timeDir = prefer === 'first' ? Prisma.sql`ASC NULLS LAST` : Prisma.sql`DESC NULLS LAST`;
  try {
    const row = await host.prisma.$queryRaw<
      Array<{ nameCN: string; nameEN: string | null; lat: unknown; lng: unknown }>
    >`
      SELECT p."nameCN", p."nameEN",
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "ItineraryItem" ii
      JOIN "TripDay" td ON ii."tripDayId" = td.id
      JOIN "Place" p ON ii."placeId" = p.id
      WHERE td."tripId" = ${tripId}
        AND td.date::date = ${dayYmd}::date
        AND p.location IS NOT NULL
      ORDER BY ii."order" ${orderDir} NULLS LAST, ii."startTime" ${timeDir}
      LIMIT 1
    `;
    const place = row?.[0];
    const nameZh = (place?.nameCN?.trim() || place?.nameEN?.trim() || '').trim();
    const lat = place?.lat != null ? Number(place.lat) : NaN;
    const lng = place?.lng != null ? Number(place.lng) : NaN;
    if (!nameZh || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, nameZh };
  } catch {
    return null;
  }
}

/** 入住当日最后一项行程 POI（需含 geometry） */
export async function getStayAnchorGeoForNight(
  host: LightweightLiveSensorsHost,
  tripId: string,
  checkInYmd: string,
): Promise<{ lat: number; lng: number; nameZh: string } | null> {
  return getStayAnchorGeoForTripDay(host, tripId, checkInYmd, 'last');
}

/** DayN 住宿选择：查当晚是否已有酒店；否则取当日末站 + 次日首站走廊。 */
export async function resolveDayLodgingCorridorForTrip(
  host: LightweightLiveSensorsHost,
  tripId: string,
  tripStartYmd: string,
  dayNumber: number,
  totalNights: number,
): Promise<DayLodgingCorridor | null> {
  if (!host.prisma || dayNumber < 1 || dayNumber > Math.max(1, totalNights)) return null;
  const checkInYmd = addDaysYmd(tripStartYmd, dayNumber - 1);
  const checkOutYmd = addDaysYmd(checkInYmd, 1);
  const nextDayYmd = checkOutYmd;

  let existingOvernight: ExistingOvernightStay | null = null;
  try {
    const rows = await host.prisma.$queryRaw<
      Array<{
        id: string;
        type: string | null;
        note: string | null;
        nameCN: string | null;
        nameEN: string | null;
        placeCategory: string | null;
        placeId: number | null;
      }>
    >`
      SELECT ii.id, ii.type::text as type, ii.note, p."nameCN", p."nameEN",
        p.category::text as "placeCategory", ii."placeId"
      FROM "ItineraryItem" ii
      JOIN "TripDay" td ON ii."tripDayId" = td.id
      LEFT JOIN "Place" p ON ii."placeId" = p.id
      WHERE td."tripId" = ${tripId}
        AND td.date::date = ${checkInYmd}::date
      ORDER BY ii."order" ASC NULLS LAST, ii."startTime" ASC NULLS LAST
    `;
    for (const row of rows ?? []) {
      if (
        isOvernightLodgingItineraryItem({
          type: row.type,
          title: row.note,
          nameZh: row.nameCN,
          nameEn: row.nameEN,
          placeCategory: row.placeCategory,
        })
      ) {
        existingOvernight = {
          itemId: row.id,
          type: String(row.placeCategory || row.type || 'HOTEL'),
          nameZh: (row.nameCN?.trim() || row.nameEN?.trim() || row.note?.trim() || '已规划住宿').trim(),
          placeId: row.placeId != null ? String(row.placeId) : undefined,
        };
        break;
      }
    }
  } catch {
    /* ignore */
  }

  const endOfDay = (await getStayAnchorGeoForTripDay(host, tripId, checkInYmd, 'last')) as StayAnchorGeo | null;
  const nextDayStart = (await getStayAnchorGeoForTripDay(host, 
    tripId,
    nextDayYmd,
    'first',
  )) as StayAnchorGeo | null;
  const searchAnchor = pickSearchAnchorFromCorridor(endOfDay, nextDayStart);

  return {
    dayNumber,
    checkInYmd,
    checkOutYmd,
    nightIndex0: dayNumber - 1,
    endOfDay,
    nextDayStart,
    searchAnchor,
    existingOvernight,
  };
}

/** 为 MCP 住宿卡片写入相对当日锚点的直线距离（km），供前端与传感器摘要展示 */
export async function enrichHotelRouteRunUiPayloadWithAnchorDistances(
  host: LightweightLiveSensorsHost,
  payload: HotelRouteRunUiPayload,
  tripId: string,
  tripFirstCheckInYmd: string,
  userMessage?: string,
): Promise<void> {
  if (!payload.accommodations?.length) return;
  const proximityDay = userMessage ? parseHotelProximityAnchorDayNumber(userMessage) : undefined;
  const proximityYmd =
    proximityDay != null && proximityDay >= 1
      ? addDaysYmd(tripFirstCheckInYmd, proximityDay - 1)
      : undefined;
  const proximityAnchor =
    proximityYmd != null
      ? await getStayAnchorGeoForTripDay(host, tripId, proximityYmd, 'first')
      : null;

  const nights = new Set(payload.accommodations.map((c) => c.nightIndex ?? 1));
  const anchorByNight = new Map<number, { lat: number; lng: number; nameZh: string } | null>();
  for (const n of nights) {
    if (proximityAnchor) {
      anchorByNight.set(n, proximityAnchor);
      continue;
    }
    const checkInYmd = addDaysYmd(tripFirstCheckInYmd, n - 1);
    anchorByNight.set(n, await getStayAnchorGeoForNight(host, tripId, checkInYmd));
  }
  payload.accommodations = attachDistanceToAnchorForCards(payload.accommodations, anchorByNight);
}

/** preference_profile + Trip.budgetConfig.travelers + UserProfile 结构化偏好 → 决策文案上下文 */
export async function resolveHotelDecisionContext(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  tripId?: string | null,
): Promise<HotelPartyAndPreferenceContext> {
  const pp = request.preference_profile;
  const ctx: HotelPartyAndPreferenceContext = {
    cost_sensitivity: pp?.cost_sensitivity,
    effort_sensitivity: pp?.effort_sensitivity,
    time_sensitivity: pp?.time_sensitivity,
  };

  const mergeRoutePartyOverlay = (base: HotelPartyAndPreferenceContext): HotelPartyAndPreferenceContext => {
    const routeSnap = resolveRouteRunPartyProfileSnapshot(request);
    if (!routeSnap) return base;
    const next = { ...base };
    if (routeSnap.has_children === true) next.has_children = true;
    if (routeSnap.has_elderly === true) next.has_elderly = true;
    if (routeSnap.party_total != null && routeSnap.party_total >= 1) {
      if (next.party_total == null || next.party_total <= 0) {
        next.party_total = routeSnap.party_total;
      }
    }
    return next;
  };

  const uid = request.user_id?.trim();
  if (host.prisma && uid && isValidUuidForUserProfile(uid)) {
    try {
      const prof = await host.prisma.userProfile.findUnique({
        where: { userId: uid },
        select: { preferences: true },
      });
      const slices = extractTripnaraStructuredSlicesFromPreferences(
        prof?.preferences as Record<string, unknown> | null,
      );
      if (slices.standing_hotel_avoid_terms_lower?.length) {
        ctx.standing_hotel_avoid_terms_lower = slices.standing_hotel_avoid_terms_lower;
      }
      if (slices.standing_hotel_style_digest_zh) {
        ctx.standing_hotel_style_digest_zh = slices.standing_hotel_style_digest_zh;
      }
    } catch {
      // 保持仅 preference_profile
    }
  }

  if (!tripId || !host.prisma) return mergeRoutePartyOverlay(ctx);
  try {
    const trip = await host.prisma.trip.findUnique({
      where: { id: tripId },
      select: { budgetConfig: true },
    });
    const bc = trip?.budgetConfig as Record<string, unknown> | null | undefined;
    const travelers = bc?.travelers;
    if (!Array.isArray(travelers) || travelers.length === 0) return mergeRoutePartyOverlay(ctx);
    let adults = 0;
    let children = 0;
    let elderly = 0;
    for (const t of travelers) {
      const tr = t as Record<string, unknown>;
      const ty = String(tr?.type ?? '').toUpperCase();
      if (ty === 'CHILD') children += 1;
      else if (ty === 'ELDERLY') elderly += 1;
      else adults += 1;
    }
    const total = adults + children + elderly;
    const bits: string[] = [];
    if (adults) bits.push(`${adults} 位成人`);
    if (children) bits.push(`${children} 位儿童`);
    if (elderly) bits.push(`${elderly} 位长者`);
    return mergeRoutePartyOverlay({
      ...ctx,
      party_total: total > 0 ? total : undefined,
      has_children: children > 0,
      has_elderly: elderly > 0,
      party_summary_zh: bits.length ? bits.join('、') : undefined,
    });
  } catch {
    return mergeRoutePartyOverlay(ctx);
  }
}

/**
 * 住宿管家 L2 可选「环境/行程语境」——仅陈述库内事实（目的地字段等），禁止推测实时天气。
 */
export async function resolveHotelDecisionWorldHintZh(
  host: LightweightLiveSensorsHost,
  tripId?: string | null,
): Promise<string | undefined> {
  const tid = typeof tripId === 'string' ? tripId.trim() : '';
  if (!tid || !host.prisma) return undefined;
  if (
    process.env.DISABLE_HOTEL_DECISION_WORLD_HINT === '1' ||
    process.env.DISABLE_HOTEL_DECISION_WORLD_HINT === 'true'
  ) {
    return undefined;
  }
  try {
    const trip = await host.prisma.trip.findUnique({
      where: { id: tid },
      select: { destination: true, name: true, metadata: true },
    });
    if (!trip?.destination) return undefined;
    const parts: string[] = [`目的地字段：${trip.destination}`];
    if (trip.name?.trim()) parts.push(`行程名称：${trip.name.trim()}`);
    const md = trip.metadata as Record<string, unknown> | null | undefined;
    const regionZh =
      typeof md?.region_label_zh === 'string' ? md.region_label_zh.trim() : '';
    if (regionZh) parts.push(`区域说明：${regionZh}`);
    return parts.join('；').slice(0, 220);
  } catch {
    return undefined;
  }
}

/**
 * 从 UserProfile.preferences.decision_dna 提取短句（事实性，非实时行为预测），供管家 L2 与 Persona 拼接。
 * 与 PreferenceEvolutionService 写入端同源；未同步或匿名用户则跳过。
 */
export async function resolveHotelDecisionDnaHintZh(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
): Promise<string | undefined> {
  const uid = request.user_id?.trim();
  if (!uid || uid === 'anonymous' || !host.prisma) return undefined;
  if (
    process.env.DISABLE_HOTEL_DECISION_DNA_HINT === '1' ||
    process.env.DISABLE_HOTEL_DECISION_DNA_HINT === 'true'
  ) {
    return undefined;
  }
  try {
    const row = await host.prisma.userProfile.findUnique({
      where: { userId: uid },
      select: { preferences: true },
    });
    const prefs = row?.preferences as Record<string, unknown> | null | undefined;
    const dna = prefs?.decision_dna as Partial<DecisionDnaDto> | undefined;
    if (!dna || dna.version !== 1) return undefined;
    const conf = typeof dna.confidence_score === 'number' && Number.isFinite(dna.confidence_score) ? dna.confidence_score : 0;
    if (conf < 0.35) return undefined;
    const lines: string[] = [];
    if (dna.traits?.time_sensitivity === 'HIGH') {
      lines.push('协商历史倾向：对延误/改期类备选较敏感');
    }
    if (dna.traits?.cost_sensitivity === 'HIGH') {
      lines.push('协商历史倾向：对加价升级类备选较敏感');
    }
    const dom = dna.dominant_alternative != null ? String(dna.dominant_alternative).trim() : '';
    if (dom === 'POSTPONE_SCHEDULE' && conf >= 0.45) {
      lines.push('近期多次拒绝「延期日程」方向');
    }
    if (lines.length === 0 && dom && conf >= 0.5) {
      lines.push(`近期协商中高频备选代号：${dom}（仅作偏好线索）`);
    }
    return lines.length ? lines.slice(0, 2).join('；').slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

export async function enrichHotelRouteRunUiPayloadWithDecisionSupport(
  host: LightweightLiveSensorsHost,
  payload: HotelRouteRunUiPayload,
  request: RouteAndRunRequestDto,
  tripId?: string | null,
): Promise<void> {
  if (!payload.accommodations?.length) return;
  const ctx = await resolveHotelDecisionContext(host, request, tripId);
  const worldHintZh = await resolveHotelDecisionWorldHintZh(host, tripId);
  const rawList = Array.isArray(payload.airbnbListings) ? payload.airbnbListings : [];

  const disableLlm =
    process.env.DISABLE_HOTEL_DECISION_LLM === '1' || process.env.DISABLE_HOTEL_DECISION_LLM === 'true';
  const forceLlm =
    process.env.HOTEL_DECISION_LLM === 'always' || process.env.HOTEL_DECISION_LLM === '1';
  /** 默认 false：列表内卡片尽量都走管家 LLM（仍受 HOTEL_DECISION_LLM_MAX_CARDS 截断）；设为 1 则退回窄触发 shouldInvokeStewardNarrator */
  const strictStewardNarrator =
    process.env.HOTEL_DECISION_LLM_STRICT === '1' || process.env.HOTEL_DECISION_LLM_STRICT === 'true';

  const prep = payload.accommodations.map((card, i) => {
    const raw = card.source === 'airbnb' && i < rawList.length ? rawList[i] : undefined;
    const layers = extractHotelDecisionLayers(card, raw, ctx);
    const templateZh = buildTemplateHotelDecisionSupportZh(card, raw, ctx);
    return { raw, layers, templateZh };
  });

  const narratorCandidates: Array<{
    index: number;
    listing_id: string;
    facts: (typeof prep)[0]['layers']['facts'];
    signals: (typeof prep)[0]['layers']['signals'];
    conflicts: (typeof prep)[0]['layers']['conflicts'];
  }> = [];

  for (let i = 0; i < prep.length; i++) {
    const { layers } = prep[i];
    const wantNarrator =
      !disableLlm &&
      !!host.hotelDecisionNarrator &&
      (forceLlm ||
        !strictStewardNarrator ||
        shouldInvokeStewardNarrator(layers.conflicts, layers.signals, layers.facts));
    if (!wantNarrator) continue;
    narratorCandidates.push({
      index: i,
      listing_id: layers.facts.listing_id,
      facts: layers.facts,
      signals: layers.signals,
      conflicts: layers.conflicts,
    });
  }

  const BATCH = 5;
  const maxCardsRaw = parseInt(process.env.HOTEL_DECISION_LLM_MAX_CARDS ?? '', 10);
  const capped =
    Number.isFinite(maxCardsRaw) && maxCardsRaw > 0
      ? narratorCandidates.slice(0, maxCardsRaw)
      : narratorCandidates;

  const narrated = new Map<string, string>();
  if (capped.length && host.hotelDecisionNarrator) {
    const dnaHint = await resolveHotelDecisionDnaHintZh(host, request);
    const personaCombined = [inferPersonaDnaZh(ctx), dnaHint].filter(Boolean).join(' ');
    for (let off = 0; off < capped.length; off += BATCH) {
      const chunk = capped.slice(off, off + BATCH);
      const batchMap = await host.hotelDecisionNarrator.narrateBatch({
        request_id: request.request_id ?? 'route-run-hotel',
        items: chunk.map(({ listing_id, facts, signals, conflicts }) => ({
          listing_id,
          facts,
          signals,
          conflicts,
        })),
        persona_dna_zh: personaCombined,
        ...(worldHintZh ? { optional_world_hint_zh: worldHintZh } : {}),
      });
      for (const [k, v] of batchMap) narrated.set(k, v);
    }
  }

  payload.accommodations = payload.accommodations.map((card, i) => {
    const p = prep[i];
    const usedNarrator = capped.some((n) => n.index === i);
    let decision_support_zh: string | undefined;
    if (usedNarrator) {
      decision_support_zh = narrated.get(card.id) ?? p.templateZh;
    } else {
      decision_support_zh = p.templateZh;
    }
    return decision_support_zh ? { ...card, decision_support_zh } : card;
  });
}

export async function runLiveWeatherSensorBranch(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  effectiveTripId?: string,
): Promise<{
  audits: LiveSensorAuditRow[];
  block: string | null;
  /** 天气 MCP 快照完成时间（与 inventory_snapshots_meta 对齐） */
  snapshotCapturedAtIso?: string;
}> {
  const audits: LiveSensorAuditRow[] = [];
  if (!shouldAttemptLiveWeatherSensor(host, request, context)) {
    return { audits, block: null };
  }
  const loc = await resolveLiveWeatherLocationForMcp(host, request, effectiveTripId);
  if (!loc) {
    host.logger.debug(`[LiveTool] weather skipped_no_location request_id=${request.request_id}`);
    return { audits, block: null };
  }
  const wmStarted = Date.now();
  try {
    const data = (await runLiveToolWithTimeout(
      () =>
        host.mcpToolDispatcher!.executeTool('weather', 'weather.getCurrentWeather', {
          location: loc.location,
          countryCode: loc.countryCode,
        }),
      LIVE_TOOL_WEATHER_MS,
    )) as Record<string, unknown>;
    const latency_ms = Date.now() - wmStarted;
    audits.push({ tool_id: 'live_tool.mcp.weather', ok: true, latency_ms });
    host.logger.log({
      tag: 'live_tool.mcp.weather',
      request_id: request.request_id,
      ok: true,
      latency_ms,
      location: loc.location,
    });
    return {
      audits,
      block: formatLiveWeatherSensorBlock(host, data, { anchorLabel: loc.anchorLabel }),
      snapshotCapturedAtIso: new Date().toISOString(),
    };
  } catch (e: any) {
    const latency_ms = Date.now() - wmStarted;
    const err = e?.message ? String(e.message) : String(e);
    audits.push({
      tool_id: 'live_tool.mcp.weather',
      ok: false,
      latency_ms,
      error: err,
      orchestrator_robustness: classifyOrchestratorFailure(e, {
        orchestrator_step: 'INTAKE',
        tool_id: 'live_tool.mcp.weather',
      }),
    });
    host.logger.warn({
      tag: 'live_tool.mcp.weather',
      request_id: request.request_id,
      ok: false,
      latency_ms,
      error: err,
    });
    return { audits, block: null };
  }
}

export async function runLiveHotelSensorBranch(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  effectiveTripId?: string,
  opts?: { fullTripReplan?: boolean },
): Promise<{
  audits: LiveSensorAuditRow[];
  block: string | null;
  /** 供前端渲染住宿卡片（与 Planning Assistant routing.target=hotel 对齐） */
  hotelRouteRunUi?: HotelRouteRunUiPayload;
}> {
  const audits: LiveSensorAuditRow[] = [];
  if (!opts?.fullTripReplan && !shouldAttemptHotelSensor(host, request, context)) {
    return { audits, block: null };
  }
  if (opts?.fullTripReplan && !host.mcpToolDispatcher) {
    return { audits, block: null };
  }
  const baseParams = await resolveHotelSearchParamsForMcp(host, request, effectiveTripId);
  if (!baseParams) {
    host.logger.debug(
      `[LiveTool] hotel skipped_no_stay_dates request_id=${request.request_id}（需要 Trip 起止日或 structured_travel_input.start_date/end_date）`,
    );
    return { audits, block: null };
  }

  const {
    _resolvedTripStartYmd,
    _resolvedTripEndYmd,
    ...hotelSearchParams
  } = baseParams as Record<string, unknown>;
  const tripWinStart =
    typeof _resolvedTripStartYmd === 'string' ? _resolvedTripStartYmd.slice(0, 10) : undefined;
  const tripWinEnd =
    typeof _resolvedTripEndYmd === 'string' ? _resolvedTripEndYmd.slice(0, 10) : undefined;
  const tripSpanNightsWhole =
    tripWinStart && tripWinEnd ? countStayNightsBetweenInclusive(tripWinStart, tripWinEnd) : undefined;

  const ci = String(hotelSearchParams.checkIn);
  const co = String(hotelSearchParams.checkOut);
  const tripId =
    typeof hotelSearchParams.tripId === 'string' ? hotelSearchParams.tripId : effectiveTripId;
  const totalNights = countStayNightsBetweenInclusive(ci, co);
  const msgForHotel = request.message ?? '';
  const dayLodgingChoice =
    Boolean(tripId && tripWinStart) && isDayLodgingChoiceQuery(msgForHotel);
  const lodgingDayNumber = dayLodgingChoice
    ? resolveLodgingChoiceDayNumber(msgForHotel, tripWinStart)
    : undefined;
  let dayLodgingCorridor: DayLodgingCorridor | null = null;
  if (
    dayLodgingChoice &&
    tripId &&
    tripWinStart &&
    lodgingDayNumber != null &&
    lodgingDayNumber >= 1
  ) {
    dayLodgingCorridor = await resolveDayLodgingCorridorForTrip(host, 
      tripId,
      tripWinStart,
      lodgingDayNumber,
      tripSpanNightsWhole ?? totalNights,
    );
  }

  /** 已有当晚酒店：默认跳过 Airbnb MCP，只把既有安排注入 prompt。
   * 「替换/换酒店」或「推荐/找/搜/怎么选」仍须检索候选，否则无酒店卡。 */
  if (
    dayLodgingCorridor?.existingOvernight &&
    !shouldSearchHotelCandidatesDespiteExisting(msgForHotel)
  ) {
    const lines = buildDayLodgingChoicePromptLines(dayLodgingCorridor);
    const existing = dayLodgingCorridor.existingOvernight;
    audits.push({
      tool_id: 'live_tool.mcp.hotel',
      ok: true,
      latency_ms: 0,
    });
    host.logger.log({
      tag: 'live_tool.mcp.hotel',
      request_id: request.request_id,
      ok: true,
      mode: 'reuse_existing_overnight',
      day: dayLodgingCorridor.dayNumber,
      name: existing.nameZh,
    });
    return {
      audits,
      block: [
        '【实时住宿检索 MCP】已跳过供应商检索（当晚行程已有住宿项）：',
        `- ${existing.nameZh}（${existing.type}）· Day${dayLodgingCorridor.dayNumber} · ${dayLodgingCorridor.checkInYmd}`,
        ...lines,
      ].join('\n'),
    };
  }

  if (
    dayLodgingCorridor?.existingOvernight &&
    shouldSearchHotelCandidatesDespiteExisting(msgForHotel)
  ) {
    const existing = dayLodgingCorridor.existingOvernight;
    host.logger.log({
      tag: 'live_tool.mcp.hotel',
      request_id: request.request_id,
      ok: true,
      mode: isLodgingReplaceOrSwapQuery(msgForHotel)
        ? 'search_replacement_despite_existing'
        : 'search_candidates_despite_existing',
      day: dayLodgingCorridor.dayNumber,
      name: existing.nameZh,
    });
  }

  if (dayLodgingCorridor) {
    hotelSearchParams.checkIn = dayLodgingCorridor.checkInYmd;
    hotelSearchParams.checkOut = dayLodgingCorridor.checkOutYmd;
    if (dayLodgingCorridor.searchAnchor) {
      const a = dayLodgingCorridor.searchAnchor;
      hotelSearchParams.location = { lat: a.lat, lng: a.lng };
      hotelSearchParams.naturalLanguage = a.nameZh;
      hotelSearchParams.query = `${a.nameZh} lodging`;
    }
    hotelSearchParams._dayLodgingCorridor = {
      day: dayLodgingCorridor.dayNumber,
      end: dayLodgingCorridor.endOfDay?.nameZh,
      next: dayLodgingCorridor.nextDayStart?.nameZh,
      search: dayLodgingCorridor.searchAnchor?.nameZh,
    };
  }

  const explicitNightScope =
    dayLodgingCorridor != null
      ? [dayLodgingCorridor.nightIndex0]
      : parseExplicitHotelNightScopeIndices(msgForHotel, totalNights);
  const inferredNightIndex0 =
    explicitNightScope === null
      ? inferNightIndex0FromExplicitStayInTripWindow(msgForHotel, ci, totalNights, co)
      : null;
  const userLimitedNightIntent = explicitNightScope !== null || inferredNightIndex0 !== null;

  const hmStarted = Date.now();

  /** 仅 1 晚、无行程、或 DayN 单晚咨询：一次检索 */
  const useSingleWindow = !tripId || totalNights <= 1 || dayLodgingCorridor != null;

  try {
    if (useSingleWindow) {
      const effectiveCi = String(hotelSearchParams.checkIn ?? ci).slice(0, 10);
      const effectiveCo = String(hotelSearchParams.checkOut ?? co).slice(0, 10);
      host.logger.log(
        `[live_tool.mcp.hotel] single_window checkIn=${effectiveCi} checkOut=${effectiveCo}` +
          (dayLodgingCorridor ? ` day=${dayLodgingCorridor.dayNumber}` : '') +
          ` budget_ms=${LIVE_TOOL_HOTEL_MS}`,
      );
      const data = await runLiveToolWithTimeout(
        () => host.mcpToolDispatcher!.executeTool('hotel', 'hotel.search', hotelSearchParams),
        LIVE_TOOL_HOTEL_MS,
      );
      const latency_ms = Date.now() - hmStarted;
      const hotelSoftFail =
        data &&
        typeof data === 'object' &&
        (data as { success?: boolean }).success === false &&
        !getRawListingRowsFromMcpPayload(data)?.length;
      if (hotelSoftFail) {
        const err = String((data as { error?: string }).error || 'NO_HOTEL_RESULTS');
        audits.push({
          tool_id: 'live_tool.mcp.hotel',
          ok: false,
          latency_ms,
          error: err,
          orchestrator_robustness: classifyOrchestratorFailure(new Error(err), {
            orchestrator_step: 'INTAKE',
            tool_id: 'live_tool.mcp.hotel',
          }),
        });
        host.logger.warn({
          tag: 'live_tool.mcp.hotel',
          request_id: request.request_id,
          ok: false,
          latency_ms,
          error: err,
          mode: dayLodgingCorridor ? 'day_lodging_corridor' : 'single_window',
        });
        return { audits, block: null };
      }
      audits.push({ tool_id: 'live_tool.mcp.hotel', ok: true, latency_ms });
      const tripNightDisp =
        tripWinStart && tripSpanNightsWhole
          ? diffCalendarDaysYmd(tripWinStart, effectiveCi) + 1
          : 1;
      const wrapped = wrapSingleHotelPayload(data, {
        checkIn: effectiveCi,
        checkOut: effectiveCo,
        nightIndex: tripNightDisp,
        ...(tripSpanNightsWhole != null ? { itineraryTotalNights: tripSpanNightsWhole } : {}),
        ...(tripId
          ? {
              hintZh: await buildStaySegmentLabelZh(host, 
                tripId,
                effectiveCi,
                tripNightDisp,
                tripSpanNightsWhole ?? Math.max(1, totalNights),
              ),
            }
          : {}),
        ...(!tripId && totalNights > 1 ? { wideWindowWithoutTrip: true } : {}),
      });
      const hotelRouteRunUi = wrapped ?? undefined;
      if (hotelRouteRunUi) {
        if (tripId) {
          /** 用入住日末站算距离；勿拼「离第 N+1 天」以免空日/首站锚点漂到雷克雅未克 */
          await enrichHotelRouteRunUiPayloadWithAnchorDistances(
            host,
            hotelRouteRunUi,
            tripId,
            tripWinStart ?? effectiveCi,
            request.message,
          );
        }
        await enrichHotelRouteRunUiPayloadWithDecisionSupport(host, hotelRouteRunUi, request, tripId);
        if (tripId) {
          hotelRouteRunUi.night_groups = await buildAccommodationNightGroupsForPayload(host, 
            hotelRouteRunUi.accommodations,
            tripId,
            tripWinStart ?? effectiveCi,
            Math.max(1, tripSpanNightsWhole ?? totalNights),
            userLimitedNightIntent &&
              (explicitNightScope?.length || inferredNightIndex0 !== null)
              ? {
                  includeOnlyNightIndices:
                    explicitNightScope?.length
                      ? explicitNightScope.map((i) => i + 1)
                      : [inferredNightIndex0! + 1],
                }
              : undefined,
          );
          if (hotelRouteRunUi.night_groups?.length && hotelRouteRunUi.hotel_search_meta) {
            hotelRouteRunUi.hotel_search_meta.ui_layout_hint_zh =
              HOTEL_UI_LAYOUT_HINT_ZH;
          }
        }
        if (hotelRouteRunUi) {
          stampHotelInventoryCapturedAt(host, hotelRouteRunUi);
        }
      }
      host.logger.log({
        tag: 'live_tool.mcp.hotel',
        request_id: request.request_id,
        ok: true,
        latency_ms,
        tripId: hotelSearchParams.tripId,
        mode: dayLodgingCorridor ? 'day_lodging_corridor' : 'single_window',
        corridor: hotelSearchParams._dayLodgingCorridor,
        card_count: hotelRouteRunUi?.accommodations?.length ?? 0,
      });
      const corridorLines = dayLodgingCorridor
        ? buildDayLodgingChoicePromptLines(dayLodgingCorridor, {
            searchCandidatesDespiteExisting: shouldSearchHotelCandidatesDespiteExisting(
              msgForHotel,
            ),
            seekingReplacement: isLodgingReplaceOrSwapQuery(msgForHotel),
          })
        : [];
      const baseBlock = hotelRouteRunUi
        ? buildHotelSensorPromptBlockFromPayload(hotelRouteRunUi)
        : formatLiveHotelSensorBlock(host, data);
      const enrichedUi = hotelRouteRunUi
        ? enrichHotelRouteRunUiForClientApply(hotelRouteRunUi)
        : undefined;
      return {
        audits,
        block:
          corridorLines.length > 0 ? `${corridorLines.join('\n')}\n${baseBlock}` : baseBlock,
        ...(enrichedUi ? { hotelRouteRunUi: enrichedUi } : {}),
      };
    }

    /** 多晚：按「每晚上一间」拆分检索；用户明确「第 N 晚」或正文写出具体单晚入住窗时只检索对应间夜，否则均匀采样（采样会跳过部分晚） */
    let indices: number[];
    if (explicitNightScope?.length) {
      indices = explicitNightScope;
    } else if (inferredNightIndex0 !== null) {
      indices = [inferredNightIndex0];
    } else if (opts?.fullTripReplan) {
      indices = pickFullTripReplanNightIndices(
        totalNights,
        MAX_FULL_TRIP_REPLAN_HOTEL_NIGHTS,
      );
    } else {
      indices = pickSpreadNightIndices(totalNights, MAX_HOTEL_NIGHT_SAMPLE_SEGMENTS);
    }
    if (indices.length > MAX_HOTEL_NIGHT_SAMPLE_SEGMENTS) {
      indices = indices.slice(0, MAX_HOTEL_NIGHT_SAMPLE_SEGMENTS);
    }
    const segments = await Promise.all(
      indices.map(async (nightIdx0) => {
        const segCheckIn = addDaysYmd(ci, nightIdx0);
        const segCheckOut = addDaysYmd(ci, nightIdx0 + 1);
        const windowNightOneBased = nightIdx0 + 1;
        const tripNightOneBased =
          tripWinStart && tripSpanNightsWhole
            ? diffCalendarDaysYmd(tripWinStart, segCheckIn) + 1
            : windowNightOneBased;
        const labelZh = await buildStaySegmentLabelZh(host, 
          tripId!,
          segCheckIn,
          tripNightOneBased,
          tripSpanNightsWhole ?? totalNights,
        );
        return {
          checkIn: segCheckIn,
          checkOut: segCheckOut,
          nightIndex: windowNightOneBased,
          labelZh,
        };
      }),
    );

    // 多晚串行检索：避免国内飞猪等 OTA 并发打爆配额（此前 Promise.allSettled 并发 5 段易 429）
    const parts: Array<{
      data: unknown;
      segment: (typeof segments)[0];
      maxListings?: number;
    }> = [];
    const maxListingsPerSegment =
      segments.length === 1
        ? HOTEL_MCP_MAX_LISTINGS_SINGLE_NIGHT_SEGMENT
        : HOTEL_MCP_MAX_LISTINGS_PER_MULTI_SEGMENT;
    for (const seg of segments) {
      try {
        const data = await runLiveToolWithTimeout(
          () =>
            host.mcpToolDispatcher!.executeTool('hotel', 'hotel.search', {
              ...hotelSearchParams,
              checkIn: seg.checkIn,
              checkOut: seg.checkOut,
            }),
          LIVE_TOOL_HOTEL_MS,
        );
        parts.push({ data, segment: seg, maxListings: maxListingsPerSegment });
      } catch (segErr: unknown) {
        host.logger.warn({
          tag: 'live_tool.mcp.hotel.segment',
          request_id: request.request_id,
          checkIn: seg.checkIn,
          error: segErr instanceof Error ? segErr.message : String(segErr),
        });
      }
    }

    const latency_ms = Date.now() - hmStarted;
    const merged =
      parts.length > 0
        ? mergeSegmentHotelSearchResults(parts, {
            stayWindowNightCount: totalNights,
            itineraryTotalNights: tripSpanNightsWhole,
            sampledNightIndices: segments.map((s) => s.nightIndex),
            userLimitedNightIntent,
            fullTripReplan: opts?.fullTripReplan === true,
          })
        : null;

    audits.push({
      tool_id: 'live_tool.mcp.hotel',
      ok: !!merged?.accommodations?.length,
      latency_ms,
      ...(!merged?.accommodations?.length
        ? {
            error: 'NO_HOTEL_RESULTS',
            orchestrator_robustness: classifyOrchestratorFailure(new Error('NO_HOTEL_RESULTS'), {
              orchestrator_step: 'INTAKE',
              tool_id: 'live_tool.mcp.hotel',
            }),
          }
        : {}),
    });

    host.logger.log({
      tag: 'live_tool.mcp.hotel',
      request_id: request.request_id,
      ok: !!merged?.accommodations?.length,
      latency_ms,
      tripId: hotelSearchParams.tripId,
      mode: opts?.fullTripReplan ? 'per_night_full_trip_replan' : 'per_night_sample',
      segments: segments.length,
      merged_cards: merged?.accommodations?.length ?? 0,
    });

    if (!merged) {
      return { audits, block: null };
    }

    await enrichHotelRouteRunUiPayloadWithAnchorDistances(host, 
      merged,
      tripId!,
      ci,
      request.message,
    );

    await enrichHotelRouteRunUiPayloadWithDecisionSupport(host, merged, request, tripId);

    merged.night_groups = await buildAccommodationNightGroupsForPayload(host, 
      merged.accommodations,
      tripId!,
      ci,
      totalNights,
      userLimitedNightIntent &&
        (explicitNightScope?.length || inferredNightIndex0 !== null)
        ? {
            includeOnlyNightIndices:
              explicitNightScope?.length ? explicitNightScope.map((i) => i + 1) : [inferredNightIndex0! + 1],
          }
        : undefined,
    );
    if (merged.hotel_search_meta) {
      merged.hotel_search_meta.ui_layout_hint_zh = HOTEL_UI_LAYOUT_HINT_ZH;
    }
    stampHotelInventoryCapturedAt(host, merged);

    const enrichedUi = enrichHotelRouteRunUiForClientApply(merged);
    return {
      audits,
      block: buildHotelSensorPromptBlockFromPayload(enrichedUi),
      hotelRouteRunUi: enrichedUi,
    };
  } catch (e: any) {
    const latency_ms = Date.now() - hmStarted;
    const err = e?.message ? String(e.message) : String(e);
    audits.push({
      tool_id: 'live_tool.mcp.hotel',
      ok: false,
      latency_ms,
      error: err,
      orchestrator_robustness: classifyOrchestratorFailure(e, {
        orchestrator_step: 'INTAKE',
        tool_id: 'live_tool.mcp.hotel',
      }),
    });
    host.logger.warn({
      tag: 'live_tool.mcp.hotel',
      request_id: request.request_id,
      ok: false,
      latency_ms,
      error: err,
    });
    return { audits, block: null };
  }
}

/**
 * Phase1：活动/门票预订检索（Browserbase 探页 + 目录回落）。
 * - 显式：`enable_live_tools` 含 `activity`
 * - 自动：与 slimLoad 例外共用 `isActivityAdvanceBookingConsultQuery`（P1 predicate convergence）
 */
export function shouldAttemptActivitySensor(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
): boolean {
  if (!host.mcpToolDispatcher) return false;
  const rt = context.routingTaskType;
  if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
  const tools = normalizeLiveTools(request.options?.enable_live_tools);
  if (tools.includes('activity')) return true;
  return isActivityAdvanceBookingConsultQuery(request.message ?? '');
}

export async function runLiveActivitySensorBranch(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  _effectiveTripId?: string,
  teamFitnessMeta?: Record<string, unknown> | null,
): Promise<{
  audits: LiveSensorAuditRow[];
  block: string | null;
  activityRouteRunUi?: {
    activities: Array<Record<string, unknown>>;
    activity_search_meta: Record<string, unknown>;
  };
}> {
  const audits: LiveSensorAuditRow[] = [];
  if (!shouldAttemptActivitySensor(host, request, context)) {
    return { audits, block: null };
  }
  if (!host.mcpToolDispatcher) {
    return { audits, block: null };
  }

  const started = Date.now();
  const budgetMs = Math.max(
    8000,
    Number(process.env.LIVE_TOOL_ACTIVITY_MS ?? 32000) || 32000,
  );
  try {
    // 透传行程国家/目的地，国内活动走飞猪 search-poi（不仅靠消息里的城市名）
    let destination: string | undefined;
    let countryCode: string | undefined;
    const stDest = request.structured_travel_input?.destination?.trim();
    if (stDest) destination = stDest;
    if (_effectiveTripId) {
      try {
        const trip = await host.prisma.trip.findUnique({
          where: { id: _effectiveTripId },
          select: { destination: true },
        });
        const td = trip?.destination?.trim();
        if (td && !destination) destination = td;
      } catch {
        /* ignore */
      }
    }
    const code = String(destination ?? '').toUpperCase();
    if (code === 'CN' || code === 'CHN' || destination === '中国') {
      countryCode = 'CN';
      destination = destination === '中国' ? 'China' : destination;
    } else if (/^[A-Z]{2}$/.test(code)) {
      countryCode = code;
    }

    const raw = await Promise.race([
      host.mcpToolDispatcher.executeTool('activity', 'activity.search', {
        query: request.message ?? '',
        limit: 4,
        ...(destination ? { destination } : {}),
        ...(countryCode ? { countryCode } : {}),
      }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`LIVE_TOOL_ACTIVITY timeout ${budgetMs}ms`)),
          budgetMs,
        );
      }),
    ]);
    const latency_ms = Date.now() - started;
    const pack = (raw && typeof raw === 'object' ? raw : {}) as {
      activities?: Array<Record<string, unknown>>;
      meta?: Record<string, unknown>;
    };
    let activities = Array.isArray(pack.activities) ? pack.activities : [];
    const meta = (pack.meta && typeof pack.meta === 'object' ? pack.meta : {}) as Record<
      string,
      unknown
    >;

    const teamFit =
      teamFitnessMeta && typeof teamFitnessMeta === 'object'
        ? (teamFitnessMeta as {
            fit?: string;
            fit_zh?: string;
            floor_display_zh?: string | null;
          })
        : null;
    if (teamFit?.fit_zh && activities.length) {
      activities = activities.map((a) => {
        const baseReason = String(a.reasonZh ?? '').trim();
        const fitNote = String(teamFit.fit_zh);
        return {
          ...a,
          reasonZh: baseReason ? `${baseReason}；${fitNote}` : fitNote,
          teamFitnessFit: teamFit.fit ?? 'unknown',
          teamFitnessFloorZh: teamFit.floor_display_zh ?? undefined,
        };
      });
    }

    audits.push({
      tool_id: 'live_tool.mcp.activity',
      ok: activities.length > 0,
      latency_ms,
      ...(!activities.length
        ? {
            error: 'NO_ACTIVITY_RESULTS',
            orchestrator_robustness: classifyOrchestratorFailure(
              new Error('NO_ACTIVITY_RESULTS'),
              {
                orchestrator_step: 'INTAKE',
                tool_id: 'live_tool.mcp.activity',
              },
            ),
          }
        : {}),
    });

    host.logger.log({
      tag: 'live_tool.mcp.activity',
      request_id: request.request_id,
      ok: activities.length > 0,
      latency_ms,
      count: activities.length,
      mode: meta.mode,
      probed: meta.probed,
      fallback: meta.fallback,
      team_fitness_fit: teamFit?.fit ?? null,
    });

    if (!activities.length) {
      return { audits, block: null };
    }

    const lines = activities.slice(0, 6).map((a, i) => {
      const name = String(a.nameZh ?? a.name ?? `活动${i + 1}`);
      const price = a.priceLabel ? ` · ${String(a.priceLabel)}` : '';
      const url = String(a.url ?? '');
      const src = a.source === 'browserbase' ? '页探' : '目录';
      return `- ${name}${price}（${src}）${url ? ` → ${url}` : ''}`;
    });
    const teamFitLine =
      teamFit?.fit_zh != null
        ? `【团队体能】${teamFit.fit_zh}`
        : null;
    const cnHotspotMeta = buildCnG318HotspotBookingMeta(request.message ?? '');
    const cnHotspotLine =
      typeof cnHotspotMeta?.consult_blurb_cn === 'string'
        ? `【中国经典线热门点规则】${cnHotspotMeta.consult_blurb_cn}`
        : null;

    return {
      audits,
      block: [
        '【实时活动预订 MCP】Browserbase/目录检索摘录（只读；可订性以官网实时为准，未自动下单）：',
        ...lines,
        ...(teamFitLine ? [teamFitLine] : []),
        ...(cnHotspotLine ? [cnHotspotLine] : []),
        '【界面与正文分工】结果载荷已含 activity_booking 结构化卡片；正文概括须提前订的项目、团队体能适配与原因，勿长篇抄链接。',
      ].join('\n'),
      activityRouteRunUi: {
        activities,
        activity_search_meta: {
          ...meta,
          ui_layout_hint_zh: '上方策略正文，下方活动预订跳转卡',
          ...(teamFitnessMeta ? { team_fitness: teamFitnessMeta } : {}),
          ...(cnHotspotMeta ? { cn_hotspot_booking: cnHotspotMeta } : {}),
        },
      },
    };
  } catch (e: unknown) {
    const latency_ms = Date.now() - started;
    const err = e instanceof Error ? e.message : String(e);
    audits.push({
      tool_id: 'live_tool.mcp.activity',
      ok: false,
      latency_ms,
      error: err,
      orchestrator_robustness: classifyOrchestratorFailure(e, {
        orchestrator_step: 'INTAKE',
        tool_id: 'live_tool.mcp.activity',
      }),
    });
    host.logger.warn({
      tag: 'live_tool.mcp.activity',
      request_id: request.request_id,
      ok: false,
      latency_ms,
      error: err,
    });
    return { audits, block: null };
  }
}

const DINING_REGION_COORDS: Record<string, { lat: number; lng: number; query: string }> = {
  golden_circle: { lat: 64.3103, lng: -20.3021, query: 'restaurant near Geysir Iceland' },
  selfoss: { lat: 63.9329, lng: -20.987, query: 'restaurant Selfoss Iceland' },
  vik: { lat: 63.4186, lng: -19.006, query: 'restaurant Vik Iceland' },
  glacier_lagoon: { lat: 64.2539, lng: -15.2082, query: 'restaurant Hofn Iceland' },
  reykjavik: { lat: 64.1466, lng: -21.9426, query: 'restaurant Reykjavik Iceland' },
  south_coast: { lat: 63.53, lng: -19.5, query: 'restaurant South Coast Iceland' },
};

/**
 * 餐厅推荐 live：Google Places；失败则由 chat 层目录卡兜底。
 */
export function shouldAttemptRestaurantSensor(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
): boolean {
  if (!host.mcpToolDispatcher) return false;
  const rt = context.routingTaskType;
  if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
  const tools = normalizeLiveTools(request.options?.enable_live_tools);
  if (tools.includes('restaurant')) return true;
  return isDiningRecommendationQuery(request.message ?? '');
}

export async function runLiveRestaurantSensorBranch(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  _effectiveTripId?: string,
): Promise<{
  audits: LiveSensorAuditRow[];
  block: string | null;
  restaurantRouteRunUi?: {
    restaurants: Array<Record<string, unknown>>;
    restaurant_search_meta: Record<string, unknown>;
  };
}> {
  const audits: LiveSensorAuditRow[] = [];
  if (!shouldAttemptRestaurantSensor(host, request, context)) {
    return { audits, block: null };
  }
  if (!host.mcpToolDispatcher) return { audits, block: null };

  const started = Date.now();
  const msg = request.message ?? '';

  /** 国内：优先飞猪 keyword-search 美食 */
  let tripDestRest: string | undefined;
  if (_effectiveTripId) {
    try {
      const trip = await host.prisma.trip.findUnique({
        where: { id: _effectiveTripId },
        select: { destination: true },
      });
      tripDestRest = trip?.destination?.trim() || undefined;
    } catch {
      /* ignore */
    }
  }
  const stRest = request.structured_travel_input?.destination?.trim();
  const chinaDining =
    isChinaOtaMarketLoose({
      destination: stRest || tripDestRest,
      countryCode:
        stRest === 'CN' ||
        tripDestRest === 'CN' ||
        stRest === '中国' ||
        tripDestRest === '中国'
          ? 'CN'
          : undefined,
    }) ||
    hasChinaFliggyHubHint(msg, stRest, tripDestRest);
  if (chinaDining) {
    try {
      const raw = await Promise.race([
        host.mcpToolDispatcher.executeTool('restaurant', 'restaurant.search', {
          query: msg,
          destination: stRest || tripDestRest || 'China',
          countryCode: 'CN',
          limit: 6,
          language: 'zh',
        }),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('LIVE_TOOL_RESTAURANT timeout')),
            Math.max(6000, Number(process.env.LIVE_TOOL_RESTAURANT_MS ?? 18000) || 18000),
          );
        }),
      ]);
      const latency_ms = Date.now() - started;
      const pack = (raw && typeof raw === 'object' ? raw : {}) as {
        restaurants?: Array<Record<string, unknown>>;
        results?: Array<Record<string, unknown>>;
        meta?: { source?: string };
      };
      const restaurants = (
        Array.isArray(pack.restaurants)
          ? pack.restaurants
          : Array.isArray(pack.results)
            ? pack.results
            : []
      ).slice(0, 6);
      const fromFliggy =
        pack.meta?.source === 'fliggy' ||
        restaurants.some((r) => String(r.source ?? '') === 'fliggy');
      audits.push({
        tool_id: fromFliggy
          ? 'live_tool.mcp.fliggy.restaurant'
          : 'live_tool.mcp.restaurant',
        ok: restaurants.length > 0,
        latency_ms,
      });
      if (restaurants.length) {
        const lines = restaurants.map((r, i) => {
          const name = String(r.nameZh ?? r.name ?? `餐厅${i + 1}`);
          const price = r.priceLabel ? ` · ${String(r.priceLabel)}` : '';
          const url = String(r.url ?? '');
          return url ? `- ${name}${price} → ${url}` : `- ${name}${price}`;
        });
        return {
          audits,
          block: [
            fromFliggy
              ? '【实时餐厅 飞猪】摘录（口味与订位以飞猪/门店为准）：'
              : '【实时餐厅检索】摘录：',
            ...lines,
            '【界面与正文分工】载荷含 restaurant 结构化卡片；正文给区域用餐策略。',
          ].join('\n'),
          restaurantRouteRunUi: {
            restaurants,
            restaurant_search_meta: {
              source: fromFliggy ? 'fliggy' : 'google_places',
              latency_ms,
            },
          },
        };
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      audits.push({
        tool_id: 'live_tool.mcp.fliggy.restaurant',
        ok: false,
        latency_ms: Date.now() - started,
        error: err,
      });
      host.logger.warn({
        tag: 'live_tool.mcp.fliggy.restaurant',
        request_id: request.request_id,
        ok: false,
        error: err,
      });
    }
  }

  const regions = inferDiningRegionsFromText(msg);
  if (!regions.length && /8\s*[.．/]\s*16|8\s*月\s*16/.test(msg)) {
    regions.push('golden_circle', 'selfoss');
  }
  const region = regions[0] ?? 'golden_circle';
  const anchor = DINING_REGION_COORDS[region] ?? DINING_REGION_COORDS.golden_circle;
  const dayYmd = parseLodgingChoiceCalendarYmd(msg);
  const catalogHint = matchDiningCatalogEntries(msg, regions.length ? regions : undefined, 3)
    .map((e) => e.nameZh)
    .join('、');

  try {
    const budgetMs = Math.max(6000, Number(process.env.LIVE_TOOL_RESTAURANT_MS ?? 18000) || 18000);
    const raw = await Promise.race([
      host.mcpToolDispatcher.executeTool('restaurant', 'restaurant.search', {
        query: anchor.query,
        location: { lat: anchor.lat, lng: anchor.lng },
        radius: 15000,
        minRating: 4,
        language: 'en',
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`LIVE_TOOL_RESTAURANT timeout ${budgetMs}ms`)), budgetMs);
      }),
    ]);
    const latency_ms = Date.now() - started;
    const pack = (raw && typeof raw === 'object' ? raw : {}) as {
      results?: Array<Record<string, unknown>>;
      success?: boolean;
    };
    const restaurants = Array.isArray(pack.results) ? pack.results.slice(0, 6) : [];
    audits.push({
      tool_id: 'live_tool.mcp.restaurant',
      ok: restaurants.length > 0,
      latency_ms,
      ...(!restaurants.length
        ? {
            error: 'NO_RESTAURANT_RESULTS',
            orchestrator_robustness: classifyOrchestratorFailure(
              new Error('NO_RESTAURANT_RESULTS'),
              { orchestrator_step: 'INTAKE', tool_id: 'live_tool.mcp.restaurant' },
            ),
          }
        : {}),
    });
    host.logger.log({
      tag: 'live_tool.mcp.restaurant',
      request_id: request.request_id,
      ok: restaurants.length > 0,
      latency_ms,
      count: restaurants.length,
      region,
      dayYmd,
    });

    if (!restaurants.length) {
      return {
        audits,
        block: catalogHint
          ? `【餐厅检索】Places 无结果；可参考目录：${catalogHint}（卡片由目录回落）。`
          : null,
      };
    }

    const lines = restaurants.slice(0, 5).map((r, i) => {
      const name = String(r.name ?? `餐厅${i + 1}`);
      const rating = r.rating != null ? ` · ★${r.rating}` : '';
      const addr = r.address ? ` · ${String(r.address).slice(0, 40)}` : '';
      return `- ${name}${rating}${addr}`;
    });
    return {
      audits,
      block: [
        '【实时餐厅检索 MCP】Google Places 摘录（营业与订位以现场为准）：',
        ...lines,
        '【界面与正文分工】载荷含 restaurant 结构化卡片；正文给区域用餐策略，勿长列表抄英文名。',
      ].join('\n'),
      restaurantRouteRunUi: {
        restaurants,
        restaurant_search_meta: {
          region,
          dayYmd: dayYmd ?? null,
          source: 'google_places',
          latency_ms,
        },
      },
    };
  } catch (e: unknown) {
    const latency_ms = Date.now() - started;
    const err = e instanceof Error ? e.message : String(e);
    audits.push({
      tool_id: 'live_tool.mcp.restaurant',
      ok: false,
      latency_ms,
      error: err,
      orchestrator_robustness: classifyOrchestratorFailure(e, {
        orchestrator_step: 'INTAKE',
        tool_id: 'live_tool.mcp.restaurant',
      }),
    });
    host.logger.warn({
      tag: 'live_tool.mcp.restaurant',
      request_id: request.request_id,
      ok: false,
      latency_ms,
      error: err,
    });
    return {
      audits,
      block: catalogHint
        ? `【餐厅检索】实时检索未成功（${err.slice(0, 80)}）；正文可结合行程区域，卡片将用本地餐饮目录回落（如 ${catalogHint}）。`
        : `【餐厅检索】实时检索未成功（${err.slice(0, 80)}）；将用区域餐饮目录回落。`,
    };
  }
}

/**
 * Phase1：小红书社区体验检索（只读）。
 * - 显式：`enable_live_tools` 含 `xiaohongshu` / `xhs`
 * - 自动：与 slimLoad 例外共用 `isXhsCommunityEvidenceConsultQuery`
 */
export function shouldAttemptXhsSensor(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
): boolean {
  if (!host.mcpToolDispatcher) return false;
  const rt = context.routingTaskType;
  if (rt !== 'DATA_LOOKUP' && rt !== 'GENERIC_QA' && rt !== 'RAG_QA') return false;
  const tools = normalizeLiveTools(request.options?.enable_live_tools);
  if (tools.includes('xiaohongshu') || tools.includes('xhs')) return true;
  return isXhsCommunityEvidenceConsultQuery(request.message ?? '');
}

export async function runLiveXhsSensorBranch(
  host: LightweightLiveSensorsHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  effectiveTripId?: string,
): Promise<{
  audits: LiveSensorAuditRow[];
  block: string | null;
  xhsRouteRunUi?: {
    xhs_note_cards: Array<Record<string, unknown>>;
    xhs_search_meta: Record<string, unknown>;
  };
}> {
  const audits: LiveSensorAuditRow[] = [];
  if (!shouldAttemptXhsSensor(host, request, context)) {
    return { audits, block: null };
  }
  if (!host.mcpToolDispatcher) {
    return { audits, block: null };
  }

  let destinationHint: string | undefined;
  const stDest = request.structured_travel_input?.destination?.trim();
  if (stDest && !/^(CN|CHN|China|IS|Iceland|中国)$/i.test(stDest)) {
    destinationHint = stDest;
  }
  if (effectiveTripId) {
    try {
      const trip = await host.prisma.trip.findUnique({
        where: { id: effectiveTripId },
        select: { destination: true, name: true },
      });
      const td = trip?.destination?.trim();
      if (td && !destinationHint && !/^(CN|CHN|China|IS|Iceland|中国)$/i.test(td)) {
        destinationHint = td;
      }
      // 国家码行程：用名称里的中文主题（如 G318/川藏）增强检索
      const tripName = String(trip?.name ?? '').trim();
      const titleTopic = tripName.match(
        /(G\s*318|川藏|滇藏|青藏|新疆|西藏|九寨|环岛|冰岛|自驾[^，,]{0,8})/i,
      )?.[1];
      if (!destinationHint && titleTopic) {
        destinationHint = titleTopic.replace(/\s+/g, '');
      }
    } catch {
      /* ignore */
    }
  }

  const keyword = buildXhsSearchKeywordFromMessage(
    request.message ?? '',
    destinationHint,
  );
  const budgetMs = Math.max(
    6000,
    Number(process.env.LIVE_TOOL_XHS_MS ?? 28000) || 28000,
  );
  const started = Date.now();
  try {
    const raw = await Promise.race([
      host.mcpToolDispatcher.executeTool(
        'xiaohongshu',
        'xiaohongshu.search_feeds',
        {
          keyword,
          limit: 12,
          ...(destinationHint ? { destination: destinationHint } : {}),
        },
      ),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`LIVE_TOOL_XHS timeout ${budgetMs}ms`)),
          budgetMs,
        );
      }),
    ]);
    const latency_ms = Date.now() - started;
    const pack = (raw && typeof raw === 'object' ? raw : {}) as {
      success?: boolean;
      experience_bundle?: XhsExperienceBundle;
      disclaimer_zh?: string;
      narrator_hint_zh?: string;
      error?: string;
    };
    let cards = mapXhsExperienceBundleToNoteCards(pack.experience_bundle, {
      limit: 6,
    }) as unknown as Array<Record<string, unknown>>;
    if (!cards.length) {
      cards = projectXhsNoteCardsFromUnknown(raw).xhs_note_cards as unknown as Array<
        Record<string, unknown>
      >;
    }
    const meta = {
      ...buildXhsNoteSearchMeta(pack.experience_bundle),
      keyword,
      latency_ms,
      mode: 'xiaohongshu_search_feeds',
      ui_layout_hint_zh: '上方策略正文，下方小红书社区笔记卡（非官方事实）',
    };

    audits.push({
      tool_id: 'live_tool.mcp.xiaohongshu',
      ok: cards.length > 0,
      latency_ms,
      ...(!cards.length
        ? {
            error: pack.error || 'NO_XHS_NOTE_RESULTS',
            orchestrator_robustness: classifyOrchestratorFailure(
              new Error(pack.error || 'NO_XHS_NOTE_RESULTS'),
              {
                orchestrator_step: 'INTAKE',
                tool_id: 'live_tool.mcp.xiaohongshu',
              },
            ),
          }
        : {}),
    });

    host.logger.log({
      tag: 'live_tool.mcp.xiaohongshu',
      request_id: request.request_id,
      ok: cards.length > 0,
      latency_ms,
      count: cards.length,
      keyword,
    });

    if (!cards.length) {
      return {
        audits,
        block:
          '【小红书社区体验】未能取得可打开的笔记链接（sidecar 未登录/无样本时会如此）；正文可基于行程事实回答，勿编造笔记标题或链接。',
      };
    }

    const lines = cards.slice(0, 6).map((c, i) => {
      const title = String(c.titleZh ?? c.title ?? `笔记${i + 1}`);
      const url = String(c.url ?? '');
      return `- ${title}${url ? ` → ${url}` : ''}`;
    });
    const disclaimer =
      String(meta.disclaimer_zh ?? '').trim() ||
      '基于小红书社区体验抽样，非官方事实；与天气/道路/库存冲突时以官方传感器为准。';

    return {
      audits,
      block: [
        '【小红书社区体验 MCP】只读抽样（非官方事实；与天气/道路/库存冲突时以官方为准）：',
        `检索词：${keyword}`,
        ...lines,
        `【说明】${disclaimer}`,
        '【界面与正文分工】结果载荷已含 xhs_note_cards；正文概括立场与风险，勿长篇抄链接；须标明社区体验。',
      ].join('\n'),
      xhsRouteRunUi: {
        xhs_note_cards: cards,
        xhs_search_meta: meta as unknown as Record<string, unknown>,
      },
    };
  } catch (e: unknown) {
    const latency_ms = Date.now() - started;
    const err = e instanceof Error ? e.message : String(e);
    audits.push({
      tool_id: 'live_tool.mcp.xiaohongshu',
      ok: false,
      latency_ms,
      error: err,
      orchestrator_robustness: classifyOrchestratorFailure(e, {
        orchestrator_step: 'INTAKE',
        tool_id: 'live_tool.mcp.xiaohongshu',
      }),
    });
    host.logger.warn({
      tag: 'live_tool.mcp.xiaohongshu',
      request_id: request.request_id,
      ok: false,
      latency_ms,
      error: err,
    });
    return {
      audits,
      block: `【小红书社区体验】检索失败（${err.slice(0, 100)}）；请确认 xiaohongshu-mcp 已启动并登录。正文勿编造笔记链接。`,
    };
  }
}
