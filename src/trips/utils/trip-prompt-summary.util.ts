/**
 * 根据出发月份与目的地代码给出「季节带」中文标签（供装备/路况叙述锚定，非气象预报）。
 */
export function inferSeasonBandZh(startDate: Date, destinationCode?: string | null): string {
  const m = startDate.getUTCMonth() + 1;
  const d = destinationCode?.trim().toUpperCase() ?? '';

  if (d === 'IS') {
    if (m >= 6 && m <= 8) return '夏季（冰岛：白昼长，高地窗口相对友好，仍需防风防水）';
    if (m === 12 || m <= 2) return '冬季（冰岛：日照短，冰雪与路况变量大）';
    if (m >= 3 && m <= 5) return '春季（冰岛：过渡季，路况与天气多变）';
    return '秋季（冰岛：转凉、风力与降水需留意）';
  }

  if (m >= 6 && m <= 8) return '夏季';
  if (m === 12 || m <= 2) return '冬季';
  if (m >= 3 && m <= 5) return '春季';
  return '秋季';
}

/**
 * 轻量行程摘要文本（咨询类 prompt 注入），与 RouteAndRunContextEnricher 的摘要粒度一致。
 *//** 轻量咨询：仅用 trip_id 拉取元数据时追加，明确不注入按日入库草案，避免陈旧 POI 锚死模型。 */
export const CONSULTATION_TRIP_METADATA_ONLY_FOOTER_ZH =
  '\n\n【说明】当前咨询上下文仅含行程元数据（ID、日期区间、目的地代码等）；**未**附加按日入库日程草案或具体 POI 列表。请勿编造未在元数据中出现过的景点/时段；若需对照或修改既有草案，请引导用户使用行程工作台或完整规划流程。';

/**
 * 在注入「按日类型骨架」时使用：明确无 Place 名称，防止模型把占位类型当地理位置，
 * 同时允许模型按「哪一天排了大概多少活动」对齐各类行程内咨询（接驳、松紧、哪天适合插活动等）。
 */
export const CONSULTATION_DAY_SKELETON_FOOTER_ZH =
  '\n\n【说明】上文「按日骨架」仅含各日已入库日程项的**类型与数量**（不含景点库注册名、不含坐标）；用于把建议对齐到用户已有排期的**日期与活动密度**。**禁止**把骨架中的类型缩写当作真实地理位置或具体景点事实。须结合用户问题与行程起止日期作答；若骨架与用户描述明显矛盾，请提示在工作台核对/重排草案，勿复述可能过时的占位数据。';

/** 紧随「草案地点速览」块：要求模型点名相关 POI，同时保留「陈旧草案」免责。 */
export const CONSULTATION_NAMED_DRAFT_APPENDIX_FOOTER_ZH =
  '\n\n【说明】上文「草案地点速览」来自用户当前入库行程（Place 登记名或备注）。回答接驳/改走法时**应点名**与问题相关的日期与地点，说明影响哪几天；若某点明显不在用户所述路段或常识上不合理，须提示草案可能陈旧并建议工作台核对，勿把无关点当主论据。';

export type ConsultationTripDaySkeletonInput = {
  date: Date;
  ItineraryItem: Array<{ type: string | null }>;
};

/**
 * 按日「类型×数量」骨架，不含 Place / note，避免咨询路径被错误景点名锚死。
 */
export function formatConsultationTripDaySkeletonLines(
  days: ConsultationTripDaySkeletonInput[] | null | undefined,
): string {
  const rows: string[] = [];
  const list = [...(days ?? [])].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (list.length === 0) {
    return '（当前库内暂无 TripDay 按日记录；仅可按行程起止日给出接驳原则性建议。）';
  }
  let totalItems = 0;
  for (const day of list) {
    const d = day.date.toISOString().slice(0, 10);
    const items = day.ItineraryItem ?? [];
    totalItems += items.length;
    if (items.length === 0) {
      rows.push(`- ${d}: (无已入库日程项)`);
      continue;
    }
    const counts = new Map<string, number>();
    for (const it of items) {
      const k = String(it.type ?? 'UNKNOWN');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const parts = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k}×${n}`);
    rows.push(`- ${d}: ${parts.join('，')}（共 ${items.length} 项）`);
  }
  rows.push(`日程项总数: ${totalItems}`);
  return rows.join('\n');
}

export function formatTripPromptSummaryForConsultation(
  trimmedId: string,
  trip: {
    name: string | null;
    destination: string;
    startDate: Date;
    endDate: Date;
    status: string | null;
  },
): string {
  const lines: string[] = [];
  lines.push(`行程 ID: ${trimmedId}`);
  if (trip.name) lines.push(`名称: ${trip.name}`);
  if (trip.status) lines.push(`状态: ${trip.status}`);
  if (trip.destination) lines.push(`目的地代码: ${trip.destination}`);
  if (trip.startDate) {
    lines.push(`开始日期: ${trip.startDate.toISOString().slice(0, 10)}`);
  }
  if (trip.endDate) {
    lines.push(`结束日期: ${trip.endDate.toISOString().slice(0, 10)}`);
  }
  if (trip.startDate && trip.endDate) {
    const dayMs = 86_400_000;
    const span =
      Math.floor((trip.endDate.getTime() - trip.startDate.getTime()) / dayMs) + 1;
    lines.push(`行程跨度约: ${Math.max(1, span)} 天（含起止日）`);
  }
  if (trip.startDate && trip.destination) {
    lines.push(`推断出行季节(装备/路况参考): ${inferSeasonBandZh(trip.startDate, trip.destination)}`);
  }
  if (trip.destination) {
    lines.push(
      `事实签名: trip_id=${trimmedId}; location_code=${trip.destination}（会话级锚点；用户未复述地名时仍须据此作答）`,
    );
  }
  return lines.join('\n');
}

/** 与 RouteAndRunContextEnricher / Prisma 查询形状对齐，用于咨询类 Prompt 注入 */
export type ConsultationItineraryDayInput = {
  date: Date | null;
  ItineraryItem: Array<{
    note: string | null;
    type: string | null;
    Place: { nameCN: string | null; nameEN: string | null } | null;
  }>;
};

/**
 * 按日落库的日程项简述（与 ContextEnricher 的 active_trip_summary 列表逻辑一致）。
 * 返回多行文本，末行含「日程项总数」。
 */
export function buildBriefItineraryLinesFromTripDays(
  days: ConsultationItineraryDayInput[] | null | undefined,
): string[] {
  const lines: string[] = [];
  let itemCount = 0;
  for (const day of days ?? []) {
    const d = day.date ? day.date.toISOString().slice(0, 10) : '?';
    const items = day.ItineraryItem ?? [];
    itemCount += items.length;
    if (items.length === 0) {
      lines.push(`- ${d}: (无日程项)`);
      continue;
    }
    const short = items
      .slice(0, 8)
      .map((it) => {
        const place = it.Place?.nameCN?.trim() || it.Place?.nameEN?.trim() || '';
        const t = place || it.note?.trim() || String(it.type ?? 'item');
        return t;
      })
      .join(' → ');
    const more = items.length > 8 ? ` …(+${items.length - 8})` : '';
    lines.push(`- ${d}: ${short}${more}`);
  }
  lines.push(`日程项总数: ${itemCount}`);
  return lines;
}

/**
 * 在基础行程摘要后附加「已入库日程草案」，供轻量咨询结合 trip_id 回答。
 */
export function appendConsultationItineraryDraftToSummary(
  baseSummary: string,
  tripDays: ConsultationItineraryDayInput[] | null | undefined,
): string {
  const dayRows = tripDays ?? [];
  if (dayRows.length === 0) {
    return `${baseSummary}\n\n【日程草案】当前库内暂无 TripDay 按日记录；请勿编造未在给定事实中出现的具体 POI；若仅有决策内核草稿，可提示用户以工作台/回放为准。`;
  }
  const brief = buildBriefItineraryLinesFromTripDays(dayRows).join('\n');
  return `${baseSummary}\n\n【当前已入库日程草案（回答须与此一致；勿编造未列条目）】\n${brief}\n\n（若用户问及问题、风险或改进：请给出**可直接采纳的推荐**——按优先级列出具体调整动作，避免空泛表述。）`;
}
