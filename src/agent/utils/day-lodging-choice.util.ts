/**
 * 「Day2 住宿怎么选 / 第 N 天住哪」：先查当晚是否已有酒店，否则用当日末站 + 次日首站走廊再搜 Airbnb/hotel MCP。
 */

import { parseTripDayNumber } from './itinerary-item-add.util';

export type StayAnchorGeo = { lat: number; lng: number; nameZh: string };

export type ExistingOvernightStay = {
  itemId?: string;
  type: string;
  nameZh: string;
  placeId?: string;
};

export type DayLodgingCorridor = {
  /** 1-based 行程日（用户说的 Day N） */
  dayNumber: number;
  /** 该日日历 YYYY-MM-DD（入住日） */
  checkInYmd: string;
  checkOutYmd: string;
  /** 0-based 间夜下标（相对行程首晚） */
  nightIndex0: number;
  endOfDay: StayAnchorGeo | null;
  nextDayStart: StayAnchorGeo | null;
  /** 搜索锚点：优先走廊中点，否则当日末站，再否则次日首站 */
  searchAnchor: StayAnchorGeo | null;
  existingOvernight: ExistingOvernightStay | null;
};

const LODGING_TYPE_RE =
  /^(HOTEL|LODGING|ACCOMMODATION|STAY|OVERNIGHT|民宿|酒店)$/i;

const LODGING_NAME_RE = /酒店|旅馆|宾馆|民宿|青旅|客栈|住宿|过夜|hotel|hostel|airbnb|guesthouse|lodging/i;

/** Day2 / day 2 / 第2天 / D2 → 1-based */
export function parseLodgingChoiceDayNumber(message: string): number | undefined {
  const m = String(message ?? '').trim();
  if (!m) return undefined;

  const dayEn = m.match(/\bDay\s*[-_]?\s*(\d+)\b/i);
  if (dayEn) {
    const n = Number(dayEn[1]);
    if (n >= 1) return n;
  }

  const fromTrip = parseTripDayNumber(m);
  if (fromTrip != null) return fromTrip;

  const bare = m.match(/(?:^|[^\w])(?:第\s*)?(\d+)\s*天/);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 1) return n;
  }

  return undefined;
}

function diffCalendarDaysYmdLocal(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(
    Number(fromYmd.slice(0, 4)),
    Number(fromYmd.slice(5, 7)) - 1,
    Number(fromYmd.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toYmd.slice(0, 4)),
    Number(toYmd.slice(5, 7)) - 1,
    Number(toYmd.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * 从话术解析日历入住日：`8月19号` / `8月19日` / `2026-08-19`。
 * 无年份时用行程首日年份（或 UTC 当年）补全。
 */
export function parseLodgingChoiceCalendarYmd(
  message: string,
  opts?: { tripStartYmd?: string },
): string | undefined {
  const m = String(message ?? '').trim();
  if (!m) return undefined;
  const refY =
    (opts?.tripStartYmd && /^\d{4}/.test(opts.tripStartYmd)
      ? Number(opts.tripStartYmd.slice(0, 4))
      : undefined) || new Date().getUTCFullYear();

  const iso = m.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const cnYear = m.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (cnYear) {
    return `${cnYear[1]}-${cnYear[2].padStart(2, '0')}-${cnYear[3].padStart(2, '0')}`;
  }

  const cn = m.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (cn) {
    return `${refY}-${cn[1].padStart(2, '0')}-${cn[2].padStart(2, '0')}`;
  }

  /**
   * 「8.19」「8.19号」点号日历（口语常见）；要求日≥10 或带 号/日，或紧挨住宿/餐饮词，避免误吃「4.5」。
   */
  const dotted = m.match(
    /(?:^|[^\d])(\d{1,2})\s*[.．]\s*(\d{1,2})(\s*[日号])?(?=的?(?:酒店|住宿|旅馆|民宿|过夜|餐厅|饭店|吃|用餐)|[^\d.]|$)/,
  );
  if (dotted) {
    const mo = Number(dotted[1]);
    const d = Number(dotted[2]);
    const hasDaySuffix = Boolean(dotted[3]?.trim());
    const lodgingNear = /酒店|住宿|旅馆|民宿|过夜|餐厅|饭店|用餐|推荐餐厅/.test(m);
    if (
      mo >= 1 &&
      mo <= 12 &&
      d >= 1 &&
      d <= 31 &&
      (d >= 10 || hasDaySuffix || lodgingNear)
    ) {
      return `${refY}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 「8/19」斜杠单日
  const slash = m.match(/(?:^|[^\d])(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{4}))?(?=[^\d]|$)/);
  if (slash) {
    const mo = Number(slash[1]);
    const d = Number(slash[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const y = slash[3] || String(refY);
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 「给我推荐19号的酒店」：仅日号时用行程首日所在月补全（勿与「第N天」混淆）
  if (!/第\s*\d+\s*天|\bDay\s*[-_]?\s*\d+\b/i.test(m)) {
    const bareDay = m.match(/(?:^|[^\d月年])(\d{1,2})\s*[日号]/);
    if (bareDay && opts?.tripStartYmd && /^\d{4}-\d{2}-\d{2}/.test(opts.tripStartYmd)) {
      const mo = opts.tripStartYmd.slice(5, 7);
      return `${refY}-${mo}-${bareDay[1].padStart(2, '0')}`;
    }
  }

  return undefined;
}

/**
 * DayN 优先；否则用日历日相对行程首日换算 1-based 日序（8月19号 + start=8/15 → Day5）。
 */
export function resolveLodgingChoiceDayNumber(
  message: string,
  tripStartYmd?: string,
): number | undefined {
  const fromDay = parseLodgingChoiceDayNumber(message);
  if (fromDay != null) return fromDay;
  const start = tripStartYmd?.slice(0, 10);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return undefined;
  const ymd = parseLodgingChoiceCalendarYmd(message, { tripStartYmd: start });
  if (!ymd) return undefined;
  const diff = diffCalendarDaysYmdLocal(start, ymd);
  if (diff < 0) return undefined;
  return diff + 1;
}

/**
 * 用户在问「某一天怎么选住宿」（咨询/检索，非改稿）。
 * 例：Day2住宿怎么选？ / 第2天住哪 / 第二天推荐酒店 / 8月19号的酒店
 * 亦覆盖偏好换店：第二天换一个离第三天更近、性价比高的酒店（勿进 CGUS 全量规划）。
 * 以及日程编辑器跟进句：仅写标间/预算/厨房/景观 + `[日程] DayN`（无「酒店」字样）。
 */
export function isLodgingRoomPreferenceQuery(msg: string, msgLower?: string): boolean {
  const m = String(msg ?? '').trim();
  if (!m) return false;
  const lower = msgLower ?? m.toLowerCase();
  const roomOrStayConstraint =
    /标间|大床|双床|双人房|单人间|套房|含早|早餐|厨房|洗衣机|停车|景观|海景|山景|自然景色|预算|每晚|一晚|房价|性价比|可订|空房|入住人数|几晚/i.test(
      m,
    ) ||
    /\b(twin|double|king|suite|kitchenette|kitchen|budget|per\s*night|breakfast|parking|sea\s*view)\b/i.test(
      lower,
    );
  if (!roomOrStayConstraint) return false;
  const day =
    parseLodgingChoiceDayNumber(m) != null ||
    parseLodgingChoiceCalendarYmd(m) != null ||
    /\[日程\]\s*Day\s*[-_]?\s*\d+/i.test(m) ||
    /\bDay\s*[-_]?\s*\d+\b/i.test(m) ||
    /第\s*\d+\s*天|第\s*[一二三四五六七八九十]{1,2}\s*天|\bD\s*\d+\b/i.test(m);
  return day;
}

/**
 * 用户明确要换店 / 替换选项（非「当晚已有安排先确认是否沿用」）。
 * 例：我要替换酒店 / 换一个更近的酒店 / 酒店选择
 */
export function isLodgingReplaceOrSwapQuery(msg: string, msgLower?: string): boolean {
  const m = String(msg ?? '').trim();
  if (!m) return false;
  const lower = msgLower ?? m.toLowerCase();
  return (
    /(?:换一个|换成|换家|换间|改住|换住|要换|想换|我要换|替换|更换).{0,48}(?:酒店|住宿|民宿|旅馆|宾馆)|换酒店|换住宿|替换酒店|更换酒店|酒店选择|住宿选择|酒店候选|换酒店选择|替换上的酒店|酒店.{0,16}(?:换成|换掉|换一个|替换|选择)|(?:酒店|住宿).{0,24}(?:更近|靠近|性价比|不想早起|别早起|晚点起|睡晚|便宜)/i.test(
      m,
    ) ||
    /\b(?:change|swap|switch|replace).{0,24}(?:hotel|lodging|accommodation)\b/i.test(lower)
  );
}

/**
 * 当晚行程已有住宿时，仍应走 MCP 出候选卡（勿 reuse_existing_overnight）。
 * 覆盖：换店 + 「推荐/找/搜/怎么选」等明确要比选的问法。
 */
export function shouldSearchHotelCandidatesDespiteExisting(
  msg: string,
  msgLower?: string,
): boolean {
  if (isLodgingReplaceOrSwapQuery(msg, msgLower)) return true;
  const m = String(msg ?? '').trim();
  if (!m) return false;
  const lower = msgLower ?? m.toLowerCase();
  return (
    /推荐|找|搜|查|建议|有没有|哪里好|哪家|哪间|怎么选|如何选|选哪|候选|对比|比一比|帮我看|看看有哪些/i.test(
      m,
    ) ||
    /\b(recommend|suggest|find|search|look\s+up|options?|alternatives?|compare)\b/i.test(lower)
  );
}

export function isDayLodgingChoiceQuery(msg: string, msgLower?: string): boolean {
  const m = String(msg ?? '').trim();
  if (!m) return false;
  const lower = msgLower ?? m.toLowerCase();

  /** 标间/预算等跟进句：有日锚即可视为当日住宿检索 */
  if (isLodgingRoomPreferenceQuery(m, lower)) return true;

  const lodging =
    /住宿|酒店|旅馆|宾馆|民宿|青旅|客栈|过夜|住哪|住哪里|住哪儿|订房|入住/i.test(m) ||
    /\b(hotels?|hostel|airbnb|lodging|guesthouse|accommodation|where\s+to\s+stay)\b/i.test(lower);
  if (!lodging) return false;

  const day =
    parseLodgingChoiceDayNumber(m) != null ||
    parseLodgingChoiceCalendarYmd(m) != null ||
    /** 无行程首日时也能识别「19号的酒店」类日号（走廊换算仍需 tripStart） */
    (!/第\s*\d+\s*天|\bDay\s*[-_]?\s*\d+\b/i.test(m) &&
      /(?:^|[^\d月年])(\d{1,2})\s*[日号]/.test(m)) ||
    /\bDay\s*[-_]?\s*\d+\b/i.test(m) ||
    /第\s*\d+\s*天|第\s*[一二三四五六七八九十]{1,2}\s*天|\bD\s*\d+\b/i.test(m);
  if (!day) return false;

  const choiceCue =
    /怎么选|如何选|选哪|住哪|住哪里|住哪儿|推荐|找|搜|查|建议|帮我|有没有|哪里好|哪家|哪间|可以/i.test(
      m,
    ) ||
    /\b(recommend|suggest|choose|pick|where|which|find|search|look\s+up)\b/i.test(lower);

  /** 单日换店 / 偏好换住 → 住宿检索，非整段 SM */
  return choiceCue || isLodgingReplaceOrSwapQuery(m, lower);
}

export function isOvernightLodgingItineraryItem(input: {
  type?: string | null;
  title?: string | null;
  nameZh?: string | null;
  nameEn?: string | null;
  placeCategory?: string | null;
}): boolean {
  const cat = String(input.placeCategory ?? '').trim();
  if (cat && /^HOTEL$/i.test(cat)) return true;
  const type = String(input.type ?? '').trim();
  if (type && LODGING_TYPE_RE.test(type)) return true;
  const blob = [input.title, input.nameZh, input.nameEn].filter(Boolean).join(' ');
  return blob.length > 0 && LODGING_NAME_RE.test(blob);
}

export function pickSearchAnchorFromCorridor(
  endOfDay: StayAnchorGeo | null,
  nextDayStart: StayAnchorGeo | null,
): StayAnchorGeo | null {
  if (endOfDay && nextDayStart) {
    const lat = (endOfDay.lat + nextDayStart.lat) / 2;
    const lng = (endOfDay.lng + nextDayStart.lng) / 2;
    return {
      lat,
      lng,
      nameZh: `${endOfDay.nameZh}→${nextDayStart.nameZh}走廊`,
    };
  }
  return endOfDay ?? nextDayStart;
}

export function buildDayLodgingChoicePromptLines(
  corridor: DayLodgingCorridor,
  opts?: { seekingReplacement?: boolean; searchCandidatesDespiteExisting?: boolean },
): string[] {
  const day = corridor.dayNumber;
  const searchDespiteExisting =
    Boolean(opts?.searchCandidatesDespiteExisting) || Boolean(opts?.seekingReplacement);
  if (corridor.existingOvernight && searchDespiteExisting) {
    return [
      `【本轮主旨·Day${day}住宿】用户要看当晚住宿**候选**（行程已有「${corridor.existingOvernight.nameZh}」，类型 ${corridor.existingOvernight.type}）。`,
      '请结合下文「实时住宿 MCP」做比选与 overnight 方向；卡片已展示时勿逐条抄房名价目。可简要对比现有安排是否仍合适。',
      '【快答】先给 overnight 城镇/方向结论，再最多 3 条选店注意点。',
    ];
  }
  if (corridor.existingOvernight) {
    return [
      `【本轮主旨·Day${day}住宿】行程草案中**当晚已有住宿线索**：${corridor.existingOvernight.nameZh}（类型 ${corridor.existingOvernight.type}）。`,
      '请先说明已有安排，再问用户是沿用还是更换；**不要**假装未规划而另推一整晚新清单。若用户要换，可简要给更换方向。',
      '【快答】2～4 句即可；行动建议≤2 条。',
    ];
  }

  const endZh = corridor.endOfDay?.nameZh ?? '（当日末站未知）';
  const nextZh = corridor.nextDayStart?.nameZh ?? '（次日首站未知）';
  const searchZh = corridor.searchAnchor?.nameZh ?? '目的地级泛化';
  return [
    `【本轮主旨·Day${day}住宿】当晚尚无明确酒店项；请结合 **Day${day} 末站「${endZh}」** 与 **次日首站「${nextZh}」** 选过夜城镇。`,
    `检索锚点：${searchZh}（入住 ${corridor.checkInYmd} → 退房 ${corridor.checkOutYmd}）。`,
    '若下文有「实时住宿 MCP」摘录，正文只给短策略与取舍，勿逐条抄房名价目（卡片已展示）。',
    '【快答】先给 overnight 城镇结论，再最多 3 条选店注意点。',
  ];
}
