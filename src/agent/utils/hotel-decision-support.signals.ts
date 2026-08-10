/**
 * Agentic Decision Support — L1 信号层：Fact Base + 启发式标签 + 冲突检测。
 * L2 叙事由 HotelDecisionSupportNarratorService 批量 LLM 完成（见同目录服务）。
 */

/** 与 RouteAndRunAccommodationCard 对齐的最小形状，避免与 mapper 循环依赖 */
export type HotelDecisionCardLike = {
  id: string;
  source: 'airbnb' | 'hotel' | 'fliggy';
  name: string;
  rating?: number;
  priceLabel?: string;
  distance_to_anchor_km?: number;
  anchor_poi_name_zh?: string;
};

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** 与 route_and_run.preference_profile + 行程团队对齐 */
export type HotelPartyAndPreferenceContext = {
  party_summary_zh?: string;
  party_total?: number;
  has_children?: boolean;
  has_elderly?: boolean;
  cost_sensitivity?: number;
  effort_sensitivity?: number;
  time_sensitivity?: number;
  /** UserProfile.tripnara_structured_preferences：住宿避免词（小写），用于 L1 子串命中 */
  standing_hotel_avoid_terms_lower?: string[];
  /** 结构化偏好摘要（中文），注入管家 persona */
  standing_hotel_style_digest_zh?: string;
};

export type DistanceStatus = 'close' | 'medium' | 'far' | 'unknown';
export type BudgetMatch = 'over_budget_risk' | 'value_ok' | 'premium_ok' | 'unknown';
export type CapacityRisk = 'high' | 'medium' | 'low' | 'unknown';

/** LLM 的「事实底座」— 只放可核实字段，禁止脑补 */
export type HotelDecisionFactBase = {
  listing_id: string;
  name: string;
  source: string;
  rating?: number;
  distance_km?: number;
  anchor_name_zh?: string;
  price_label?: string;
  rough_price_num?: number | null;
  room_line?: string;
  max_guests?: number;
};

/** 规则引擎对事实的离散化结论，供管家叙事引用 */
export type HotelDecisionSignals = {
  distance_status: DistanceStatus;
  budget_match: BudgetMatch;
  capacity_risk: CapacityRisk;
  labels_zh: string[];
};

export type HotelDecisionConflict =
  | 'high_rating_far_anchor'
  | 'cheap_tight_capacity'
  | 'budget_tension_high_price'
  | 'family_studio_layout'
  | 'elderly_long_walk'
  | 'low_rating'
  /** listing 名称命中用户持久化「避免」子串（如连锁品牌名） */
  | 'standing_preference_avoid_match';

function extractAirbnbListingDecisionHints(raw: unknown): { roomLine?: string; maxGuests?: number } {
  const r = asRecord(raw);
  if (!r) return {};
  const sc = asRecord(r.structuredContent);
  const roomLine = typeof sc?.primaryLine === 'string' ? sc.primaryLine : undefined;
  const dsl = asRecord(r.demandStayListing);
  let maxGuests: number | undefined;
  for (const key of ['personCapacity', 'maxGuestCapacity'] as const) {
    const v = r[key];
    const v2 = dsl?.[key];
    const n = typeof v === 'number' ? v : typeof v2 === 'number' ? v2 : NaN;
    if (Number.isFinite(n) && n > 0) {
      maxGuests = n;
      break;
    }
  }
  return { roomLine, maxGuests };
}

export function extractRoughPriceNumber(priceLabel: string): number | null {
  const m = priceLabel.match(/\$\s*([\d,]+)/);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  const m2 = priceLabel.match(/([\d,]+)\s*(?:USD|EUR|GBP)/i);
  if (m2) return parseInt(m2[1].replace(/,/g, ''), 10);
  return null;
}

function distanceStatus(d: number | undefined): DistanceStatus {
  if (d == null || !Number.isFinite(d)) return 'unknown';
  if (d <= 1.5) return 'close';
  if (d > 5) return 'far';
  return 'medium';
}

function budgetMatch(
  cs: number | undefined,
  priceNum: number | null,
  rating: number | undefined,
): BudgetMatch {
  if (cs == null || priceNum == null) return 'unknown';
  if (cs >= 0.62 && priceNum >= 180) return 'over_budget_risk';
  if (cs <= 0.38 && rating != null && rating >= 4.5 && priceNum <= 250) return 'premium_ok';
  if (cs >= 0.5 && priceNum < 150) return 'value_ok';
  return 'unknown';
}

function capacityRisk(pt: number | undefined, mg: number | undefined): CapacityRisk {
  if (pt == null || mg == null) return 'unknown';
  if (pt > mg) return 'high';
  if (pt >= mg - 1) return 'medium';
  return 'low';
}

/** 从卡片 + 原始行 + 上下文构建 Fact / Signals / Conflicts */
export function extractHotelDecisionLayers(
  card: HotelDecisionCardLike,
  rawListing: unknown | undefined,
  ctx: HotelPartyAndPreferenceContext,
): { facts: HotelDecisionFactBase; signals: HotelDecisionSignals; conflicts: HotelDecisionConflict[] } {
  const hints = card.source === 'airbnb' ? extractAirbnbListingDecisionHints(rawListing) : {};
  const rough =
    card.priceLabel && card.priceLabel.length > 0 ? extractRoughPriceNumber(card.priceLabel) : null;
  const d = card.distance_to_anchor_km;
  const rating = card.rating;

  const facts: HotelDecisionFactBase = {
    listing_id: card.id,
    name: card.name,
    source: card.source,
    ...(rating != null ? { rating } : {}),
    ...(d != null ? { distance_km: d } : {}),
    ...(card.anchor_poi_name_zh ? { anchor_name_zh: card.anchor_poi_name_zh } : {}),
    ...(card.priceLabel ? { price_label: card.priceLabel } : {}),
    rough_price_num: rough,
    ...(hints.roomLine ? { room_line: hints.roomLine } : {}),
    ...(hints.maxGuests != null ? { max_guests: hints.maxGuests } : {}),
  };

  const ds = distanceStatus(d);
  const bm = budgetMatch(ctx.cost_sensitivity, rough, rating);
  const cr = capacityRisk(ctx.party_total, hints.maxGuests);

  const labels_zh: string[] = [];
  labels_zh.push(`distance_status:${ds}`);
  labels_zh.push(`budget_match:${bm}`);
  labels_zh.push(`capacity_risk:${cr}`);

  const signals: HotelDecisionSignals = {
    distance_status: ds,
    budget_match: bm,
    capacity_risk: cr,
    labels_zh,
  };

  const conflicts: HotelDecisionConflict[] = [];
  if (rating != null && rating >= 4.8 && ds === 'far') conflicts.push('high_rating_far_anchor');
  if (rating != null && rating < 4.2) conflicts.push('low_rating');
  if (rough != null && rough < 140 && cr === 'high') conflicts.push('cheap_tight_capacity');
  if (bm === 'over_budget_risk') conflicts.push('budget_tension_high_price');
  if (ctx.has_children && hints.roomLine && /\bstudio\b|单间|开间|Studio/i.test(hints.roomLine)) {
    conflicts.push('family_studio_layout');
  }
  if (ctx.has_elderly && d != null && d > 4) conflicts.push('elderly_long_walk');

  const avoids = ctx.standing_hotel_avoid_terms_lower;
  if (avoids?.length && card.name?.trim()) {
    const nm = card.name.toLowerCase();
    for (const term of avoids) {
      if (term.length >= 2 && nm.includes(term)) {
        conflicts.push('standing_preference_avoid_match');
        signals.labels_zh.push(`standing_avoid_hit:${term}`);
        break;
      }
    }
  }

  return { facts, signals, conflicts };
}

function hashListingId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 卡片级事实快照（每条文案唯一前缀，避免多条共用同一套套话） */
export function compactCardSnapshotZh(card: HotelDecisionCardLike): string {
  const nm = card.name.trim();
  const title = nm.length > 22 ? `${nm.slice(0, 22)}…` : nm;
  const segs: string[] = [`「${title}」`];
  if (card.rating != null && Number.isFinite(card.rating)) {
    segs.push(`${Number(card.rating).toFixed(1)} 分`);
  }
  if (card.distance_to_anchor_km != null && card.anchor_poi_name_zh) {
    const an =
      card.anchor_poi_name_zh.length > 14
        ? `${card.anchor_poi_name_zh.slice(0, 14)}…`
        : card.anchor_poi_name_zh;
    segs.push(`距「${an}」${card.distance_to_anchor_km} km`);
  }
  if (card.priceLabel) {
    const rough = extractRoughPriceNumber(card.priceLabel);
    if (rough != null) segs.push(`价档约 ${rough}`);
    else {
      const pl =
        card.priceLabel.length > 28 ? `${card.priceLabel.slice(0, 25)}…` : card.priceLabel;
      segs.push(pl);
    }
  }
  return segs.join(' · ');
}

/**
 * L2 是否「值得」单独调用管家（**窄触发**）。
 * 编排层默认会尽量让所有卡片走管家，仅当 `HOTEL_DECISION_LLM_STRICT=1` 时才用本函数筛哪些走 LLM。
 */
export function shouldInvokeStewardNarrator(
  conflicts: HotelDecisionConflict[],
  signals: HotelDecisionSignals,
  facts?: Pick<HotelDecisionFactBase, 'rating'>,
): boolean {
  if (conflicts.length > 0) return true;
  /** 中等距离 + 明显预算张力也算「值得解说」 */
  if (signals.budget_match === 'over_budget_risk' && signals.distance_status !== 'unknown') return true;
  if (signals.capacity_risk === 'high' || signals.capacity_risk === 'medium') return true;
  const r = facts?.rating;
  if (r != null && Number.isFinite(r) && (r >= 4.85 || r < 4.2)) return true;
  /** 预算信号与距离同时有结论时，更适合管家区分措辞 */
  if (
    signals.distance_status !== 'unknown' &&
    signals.budget_match !== 'unknown' &&
    (signals.budget_match === 'value_ok' || signals.budget_match === 'premium_ok')
  ) {
    return true;
  }
  return false;
}

/** Persona DNA：短句注入 Prompt，非画像建模本体 */
export function inferPersonaDnaZh(ctx: HotelPartyAndPreferenceContext): string {
  const cs = ctx.cost_sensitivity ?? 0.5;
  const ef = ctx.effort_sensitivity ?? 0.5;
  const bits: string[] = [];
  if (cs >= 0.6) bits.push('偏节俭');
  else if (cs <= 0.38) bits.push('愿为体验付费');
  if (ef >= 0.55) bits.push('重视省力少折腾');
  if (ctx.has_children) bits.push('带娃');
  if (ctx.has_elderly) bits.push('有长者同行');
  const digest = ctx.standing_hotel_style_digest_zh?.trim();
  if (digest) bits.push(digest.slice(0, 120));
  return bits.length ? `画像：${bits.join('、')}。` : '画像：均衡型旅行者。';
}

const V_CLOSE = [
  '落在锚点步行圈内，当日往返景点相对省心。',
  '离锚点不远，适合想把体力留给玩法而非通勤。',
  '与锚点同一片区，搬运行李与临时折返都更轻松。',
];
const V_MED = [
  '与锚点保持中等距离，可按当日强度在「省事」与「安静」间取舍。',
  '不算贴脸也不算远，适合愿意稍微让步换价位或户型的人。',
  '通勤要一阵子，但未必吃亏——可看价位与房型是否换来你想要的体验。',
];
const V_FAR_BASE = ['更适合自驾或分段打车', '若介意路上的时间，可把这天日程排松一点'];
const V_HIGH_R = [
  '口碑分亮眼，口碑风险相对可控。',
  '高分listing，通常要在「热门」与「价位」之间接受一点取舍。',
  '评分抢眼，适合作为「稳妥选项」再对照地图确认动线。',
];
const V_LOW_R = [
  '评分平平，建议重点扫一眼差评里是否在意的点。',
  '口碑一般，适合愿意花时间读评价再决定的人。',
];
const V_NEAR_CAP = [
  '人数贴着可住上限，大件行李或加床要提前想清楚。',
  '床位可能刚好够用，留意是否有沙发床/加床选项。',
];
const V_CHILD_STUDIO = [
  '大开间户型带娃可留意隔音与加床。',
  '开间格局亲子入住时，夜间作息可能要互相迁就。',
];
const V_FALLBACK = [
  '可先收藏，再对照当日最后一站锚点微调。',
  '建议打开地图看一眼与锚点的相对方位再拍板。',
  '若几款相近，可按「评分×价位×动线」做一次快速并列。',
];

/** 同一语义多套措辞，按 listing_id hash 轮换，减少列表里连成片的重复句 */
function pickRotatedTemplateInsights(
  card: HotelDecisionCardLike,
  rawListing: unknown | undefined,
  ctx: HotelPartyAndPreferenceContext,
): string[] {
  const hints = card.source === 'airbnb' ? extractAirbnbListingDecisionHints(rawListing) : {};
  const h = hashListingId(card.id);
  const picked: string[] = [];
  const rating = card.rating;
  const d = card.distance_to_anchor_km;
  const anchor = card.anchor_poi_name_zh;
  const effort = ctx.effort_sensitivity;
  const pt = ctx.party_total;
  const mg = hints.maxGuests;

  if (pt != null && mg != null && pt > mg) {
    picked.push(`团队 ${pt} 人高于可住上限 ${mg}，需核对加床或拆分预订`);
  } else if (pt != null && mg != null && pt >= mg - 1 && pt <= mg) {
    picked.push(V_NEAR_CAP[h % V_NEAR_CAP.length]);
  }

  if (d != null && anchor) {
    if (d <= 1.5) picked.push(V_CLOSE[h % V_CLOSE.length]);
    else if (d > 5) {
      const far =
        effort != null && effort >= 0.55
          ? `距「${anchor}」较远；若有老人幼儿，建议重点看接驳与步行段`
          : `距「${anchor}」较远，${V_FAR_BASE[h % V_FAR_BASE.length]}`;
      picked.push(far);
    } else picked.push(V_MED[(h >> 3) % V_MED.length]);
  }

  if (rating != null && rating >= 4.85) picked.push(V_HIGH_R[h % V_HIGH_R.length]);
  else if (rating != null && rating < 4.2) picked.push(V_LOW_R[h % V_LOW_R.length]);

  const cs = ctx.cost_sensitivity;
  const priceNum = card.priceLabel ? extractRoughPriceNumber(card.priceLabel) : null;
  if (cs != null && priceNum != null) {
    if (cs >= 0.62 && priceNum >= 180) {
      picked.push(
        h % 2 === 0
          ? '结合你偏节俭的偏好，这档价位建议顺手横向对比同区备选'
          : '价位不算温柔；若坚持这间，看看能否用「少折腾」换来你愿意付的溢价',
      );
    } else if (cs <= 0.38 && rating != null && rating >= 4.5 && priceNum <= 250) {
      picked.push(
        h % 2 === 0
          ? '愿意为体验付费时，这档评分与价位组合还算说得过去'
          : '偏体验导向的话，可以把这间当作「省心备选」再对照地图',
      );
    }
  }

  if (ctx.has_children && hints.roomLine && /\bstudio\b|单间|开间|Studio/i.test(hints.roomLine)) {
    picked.push(V_CHILD_STUDIO[h % V_CHILD_STUDIO.length]);
  }
  if (ctx.has_elderly && d != null && d > 4) {
    picked.push('有长者同行且离锚点远时，可把这天日程排松或预留接驳缓冲');
  }

  if (hints.roomLine && picked.length < 2) {
    const short =
      hints.roomLine.length > 56 ? `${hints.roomLine.slice(0, 53)}…` : hints.roomLine;
    picked.push(`房型：${short}`);
  }

  while (picked.length < 2) {
    picked.push(V_FALLBACK[(h + picked.length * 7) % V_FALLBACK.length]);
  }

  const uniq: string[] = [];
  for (const p of picked) {
    if (!uniq.includes(p)) uniq.push(p);
    if (uniq.length >= 2) break;
  }
  return uniq.slice(0, 2);
}

/**
 * L1 兜底：规则模版（卡片平庸且无冲突、或 LLM 失败时使用）。
 * 每条以事实快照开头 + 轮换措辞，避免列表内文案雷同。
 */
export function buildTemplateHotelDecisionSupportZh(
  card: HotelDecisionCardLike,
  rawListing: unknown | undefined,
  ctx: HotelPartyAndPreferenceContext,
): string | undefined {
  const snap = compactCardSnapshotZh(card);
  const insights = pickRotatedTemplateInsights(card, rawListing, ctx);
  if (!insights.length) return `${snap}。`;
  return `${snap} — ${insights.join('；')}。`;
}

/** @deprecated 使用 buildTemplateHotelDecisionSupportZh；保留别名兼容测试 */
export function buildAccommodationDecisionSupportZh(
  card: HotelDecisionCardLike,
  rawListing: unknown | undefined,
  ctx: HotelPartyAndPreferenceContext,
): string | undefined {
  return buildTemplateHotelDecisionSupportZh(card, rawListing, ctx);
}
