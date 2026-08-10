/**
 * Trip Day World State — 统一 DayN 解析（theme + items + 跨日活动匹配）。
 * 解决：UI dayThemes 与入库 ItineraryItem 分裂时，不同入口读到不同「事实」。
 */

export type TripDayWorldStateItem = {
  type: string | null;
  nameZh: string;
};

export type TripDayWorldStateDay = {
  /** 1-based */
  dayNumber: number;
  ymd: string;
  theme: string | null;
  items: TripDayWorldStateItem[];
};

export type TripDayWorldStateResolution = {
  requestedDay: number;
  resolvedDate: string;
  dayTheme: string | null;
  itemsOnDay: TripDayWorldStateItem[];
  /** 主题/用户活动名在全行程中的匹配（可跨日） */
  matchedActivityItems: Array<{
    dayNumber: number;
    ymd: string;
    nameZh: string;
  }>;
  conflict:
    | 'none'
    | 'theme_without_items'
    | 'activity_on_other_day'
    | 'day_out_of_range'
    | 'empty_day';
  promptBlockZh: string;
};

function toYmd(d: Date | string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function readTheme(
  dayThemes: Record<string, string> | null | undefined,
  dayNumber: number,
): string | null {
  if (!dayThemes) return null;
  const raw = dayThemes[String(dayNumber)] ?? dayThemes[dayNumber as unknown as string];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** 从主题/用户词抽取可用于匹配 Place 的关键词 */
export function activityMatchTokens(text: string | null | undefined): string[] {
  const t = String(text ?? '').trim();
  if (!t) return [];
  const tokens: string[] = [];
  if (/冰川|glacier/i.test(t)) tokens.push('冰川', 'glacier', '索尔黑马', 'Sólheim', '冰洞');
  if (/蓝湖|Blue\s*Lagoon/i.test(t)) tokens.push('蓝湖', 'Blue Lagoon');
  if (/冰河湖|J[oö]kuls/i.test(t)) tokens.push('冰河湖', '杰古沙龙');
  if (/黄金圈|Golden/i.test(t)) tokens.push('黄金', '间歇泉', '瀑布', '辛格维利尔');
  if (/徒步|hike|hiking/i.test(t) && !tokens.includes('冰川')) tokens.push('徒步', 'hike');
  // 原文整段也可作弱匹配
  tokens.push(t);
  return [...new Set(tokens.filter(Boolean))];
}

function itemMatchesTokens(nameZh: string, tokens: string[]): boolean {
  const n = nameZh.toLowerCase();
  return tokens.some((tok) => {
    if (!tok) return false;
    const t = tok.toLowerCase();
    // 「冰川」不得子串误匹配「冰河湖」观光点
    if (t === '冰川' || t === 'glacier') {
      if (/冰河湖|j[oö]kuls|jokuls/i.test(nameZh)) return false;
      return n.includes(t);
    }
    return n.includes(t);
  });
}

export function buildTripDayWorldStateDays(input: {
  startDate: Date | string;
  days: Array<{
    date: Date | string;
    ItineraryItem?: Array<{
      type?: string | null;
      note?: string | null;
      Place?: { nameCN?: string | null; nameEN?: string | null } | null;
    }>;
  }>;
  dayThemes?: Record<string, string> | null;
}): TripDayWorldStateDay[] {
  const startYmd = toYmd(input.startDate);
  const startMs = new Date(`${startYmd}T00:00:00.000Z`).getTime();
  const sorted = [...(input.days ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  return sorted.map((day) => {
    const ymd = toYmd(day.date);
    const dayNumber =
      Math.floor((new Date(`${ymd}T00:00:00.000Z`).getTime() - startMs) / 86_400_000) + 1;
    const items = (day.ItineraryItem ?? []).map((it) => {
      const place = it.Place?.nameCN?.trim() || it.Place?.nameEN?.trim() || '';
      const note = String(it.note ?? '').trim();
      const nameZh = place || note.split('\n')[0]?.trim() || String(it.type ?? 'item');
      return { type: it.type ?? null, nameZh };
    });
    return {
      dayNumber,
      ymd,
      theme: readTheme(input.dayThemes, dayNumber),
      items,
    };
  });
}

/**
 * 解析指定 DayN 的统一 World State（供咨询 prompt / regression）。
 */
export function resolveTripDayWorldState(input: {
  requestedDay: number;
  startDate: Date | string;
  days: Array<{
    date: Date | string;
    ItineraryItem?: Array<{
      type?: string | null;
      note?: string | null;
      Place?: { nameCN?: string | null; nameEN?: string | null } | null;
    }>;
  }>;
  dayThemes?: Record<string, string> | null;
  /** 用户话术中的活动名（可与 theme 合并匹配） */
  activityHint?: string | null;
}): TripDayWorldStateResolution {
  const world = buildTripDayWorldStateDays(input);
  const requestedDay = input.requestedDay;
  const focus = world.find((d) => d.dayNumber === requestedDay);

  if (!focus) {
    return {
      requestedDay,
      resolvedDate: '',
      dayTheme: readTheme(input.dayThemes, requestedDay),
      itemsOnDay: [],
      matchedActivityItems: [],
      conflict: 'day_out_of_range',
      promptBlockZh: [
        '【日焦点 World State】',
        `requestedDay=Day${requestedDay}`,
        `resolvedDate=(行程内无该日)`,
        `conflict=day_out_of_range`,
        '须明确该日不在行程跨度内；禁止改指其他日期假装有安排。',
      ].join('\n'),
    };
  }

  const theme = focus.theme;
  const hint = String(input.activityHint ?? '').trim();
  const tokens = activityMatchTokens([theme, hint].filter(Boolean).join(' '));
  const matchedActivityItems: TripDayWorldStateResolution['matchedActivityItems'] = [];
  for (const d of world) {
    for (const it of d.items) {
      if (tokens.length && itemMatchesTokens(it.nameZh, tokens)) {
        matchedActivityItems.push({
          dayNumber: d.dayNumber,
          ymd: d.ymd,
          nameZh: it.nameZh,
        });
      }
    }
  }

  let conflict: TripDayWorldStateResolution['conflict'] = 'none';
  if (theme && focus.items.length === 0) {
    conflict =
      matchedActivityItems.some((m) => m.dayNumber !== requestedDay)
        ? 'activity_on_other_day'
        : 'theme_without_items';
  } else if (!theme && focus.items.length === 0) {
    conflict = 'empty_day';
  } else if (
    tokens.length > 0 &&
    focus.items.every((it) => !itemMatchesTokens(it.nameZh, tokens)) &&
    matchedActivityItems.some((m) => m.dayNumber !== requestedDay)
  ) {
    conflict = 'activity_on_other_day';
  }

  const lines = [
    '【日焦点 World State】',
    `requestedDay=Day${requestedDay}`,
    `resolvedDate=${focus.ymd}`,
    `dayTheme=${theme ?? '(无)'}`,
    `itemsOnDay=${
      focus.items.length
        ? focus.items.map((i) => i.nameZh).join(' → ')
        : '(无已入库日程项)'
    }`,
  ];
  if (matchedActivityItems.length) {
    lines.push(
      `matchedActivityAcrossTrip=${matchedActivityItems
        .map((m) => `Day${m.dayNumber}(${m.ymd}) ${m.nameZh}`)
        .join('；')}`,
    );
  } else {
    lines.push('matchedActivityAcrossTrip=(无)');
  }
  lines.push(`conflict=${conflict}`);
  lines.push(
    '作答约束：必须以本块为 Day 事实 SSOT。有 dayTheme 时不得仅因 items 为空就断言「该日与主题活动无关/不存在该活动」；若 conflict=activity_on_other_day，须点名主题日与活动实际所在日，禁止无依据改指其他空日或相邻观光日。',
  );
  lines.push(
    '叙述禁令：禁止把未出现在 matchedActivityAcrossTrip 中的其他 Day（尤其下一观光日）写成推荐落点或「该区域在 DayN」；跨日信息仅可引用本块已列出的匹配项。',
  );

  return {
    requestedDay,
    resolvedDate: focus.ymd,
    dayTheme: theme,
    itemsOnDay: focus.items,
    matchedActivityItems,
    conflict,
    promptBlockZh: lines.join('\n'),
  };
}

export type ActivityFocusWorldState = {
  activityHint: string;
  themeDays: Array<{
    dayNumber: number;
    ymd: string;
    theme: string;
    items: TripDayWorldStateItem[];
  }>;
  matchedActivityItems: TripDayWorldStateResolution['matchedActivityItems'];
  promptBlockZh: string;
};

/**
 * 无 DayN 焦点、但话术含可解析活动名时：注入可引用证据（主题日 + 跨日入库匹配）。
 * 供叙述 grounding，禁止模型从骨架擅自旁带其他观光日。
 */
export function resolveActivityFocusWorldState(input: {
  startDate: Date | string;
  days: Array<{
    date: Date | string;
    ItineraryItem?: Array<{
      type?: string | null;
      note?: string | null;
      Place?: { nameCN?: string | null; nameEN?: string | null } | null;
    }>;
  }>;
  dayThemes?: Record<string, string> | null;
  activityHint?: string | null;
}): ActivityFocusWorldState | null {
  const hint = String(input.activityHint ?? '').trim();
  if (!hint) return null;
  // 需有活动类强信号，避免「这个要提前订吗」误注入
  if (!/冰川|徒步|蓝湖|冰河湖|黄金圈|冰洞|glacier|hike|hiking|lagoon/i.test(hint)) {
    return null;
  }

  const world = buildTripDayWorldStateDays(input);
  const tokens = activityMatchTokens(hint);
  const themeDays: ActivityFocusWorldState['themeDays'] = [];
  for (const d of world) {
    if (d.theme && itemMatchesTokens(d.theme, tokens)) {
      themeDays.push({
        dayNumber: d.dayNumber,
        ymd: d.ymd,
        theme: d.theme,
        items: d.items,
      });
    }
  }

  const matchedActivityItems: ActivityFocusWorldState['matchedActivityItems'] = [];
  for (const d of world) {
    for (const it of d.items) {
      if (tokens.length && itemMatchesTokens(it.nameZh, tokens)) {
        matchedActivityItems.push({
          dayNumber: d.dayNumber,
          ymd: d.ymd,
          nameZh: it.nameZh,
        });
      }
    }
  }

  if (!themeDays.length && !matchedActivityItems.length) return null;

  const hintShort = hint.replace(/\s+/g, ' ').slice(0, 40);
  const lines = [
    '【活动焦点 World State】',
    `activityHint=${hintShort}`,
    `themeDaysMatching=${
      themeDays.length
        ? themeDays
            .map(
              (t) =>
                `Day${t.dayNumber}(${t.ymd})「${t.theme}」items=${
                  t.items.length ? t.items.map((i) => i.nameZh).join('→') : '(无已入库日程项)'
                }`,
            )
            .join('；')
        : '(无)'
    }`,
    `matchedActivityAcrossTrip=${
      matchedActivityItems.length
        ? matchedActivityItems
            .map((m) => `Day${m.dayNumber}(${m.ymd}) ${m.nameZh}`)
            .join('；')
        : '(无)'
    }`,
    '作答约束：本轮用户未指定 DayN；可引用的行程日证据仅限本块 themeDaysMatching 与 matchedActivityAcrossTrip。',
    'dayTheme ≠ confirmed item：主题日不得写成已锁定场次；若谈实际入库活动，必须点名 matched 所在 Day/日期。',
    '禁止点名未列入本块的其他 Day（尤其相邻观光日）作为该活动备选、衔接或「也在那一带」。',
    '无库存证据时不得断言余位/有名额。',
  ];

  return {
    activityHint: hintShort,
    themeDays,
    matchedActivityItems,
    promptBlockZh: lines.join('\n'),
  };
}
