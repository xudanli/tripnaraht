/**
 * Task Context Slice — DAY_LIST / TIMELINE / PENDING（Fast Query 共用）。
 */

export type TripTimelineItemFact = {
  id?: string;
  order?: number | null;
  type: string;
  nameZh: string;
  bookingStatus?: string | null;
  /** 未订 / 待确认 / 无 bookingStatus */
  isUnconfirmed: boolean;
};

export type TripDayTimelineDayFact = {
  dayNumber: number;
  ymd: string;
  items: TripTimelineItemFact[];
};

export type TripDayTimelineFactSlice = {
  tripId: string;
  destination?: string;
  asOfYmd: string;
  dayCount: number;
  /** 相对 asOf：落在行程内的「今天」；规划期落在范围外则默认 Day1 */
  currentDayNumber: number;
  /** current+1，若无则 undefined */
  tomorrowDayNumber?: number;
  days: TripDayTimelineDayFact[];
  unconfirmed: Array<{ dayNumber: number; nameZh: string; type: string; reasonZh: string }>;
};

type PrismaTimelineClient = {
  trip: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<{
      id: string;
      destination?: string | null;
      destinationCode?: string | null;
      startDate?: Date | string | null;
      TripDay?: Array<{
        id: string;
        date: Date | string;
        ItineraryItem?: Array<{
          id: string;
          type: string;
          note?: string | null;
          order?: number | null;
          bookingStatus?: string | null;
          Place?: { nameCN?: string | null; nameEN?: string | null } | null;
        }>;
      }>;
    } | null>;
  };
};

function toYmd(d: Date | string | null | undefined): string {
  if (d == null) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isUnconfirmedBooking(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toUpperCase();
  if (!s) return true;
  return /PENDING|UNCONFIRMED|DRAFT|TODO|NONE|UNKNOWN|取消|CANCEL/.test(s);
}

export function buildTripDayTimelineFromDays(input: {
  tripId: string;
  destination?: string | null;
  asOfYmd?: string;
  days: Array<{
    date: Date | string;
    items: Array<{
      id?: string;
      type?: string | null;
      note?: string | null;
      order?: number | null;
      bookingStatus?: string | null;
      nameZh?: string | null;
      nameEn?: string | null;
    }>;
  }>;
}): TripDayTimelineFactSlice {
  const asOfYmd = input.asOfYmd?.trim() || todayYmdUtc();
  const sorted = [...input.days].sort((a, b) => toYmd(a.date).localeCompare(toYmd(b.date)));
  const days: TripDayTimelineDayFact[] = sorted.map((day, idx) => {
    const dayNumber = idx + 1;
    const items = [...(day.items ?? [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((it) => {
        const nameZh =
          String(it.nameZh ?? it.note ?? it.nameEn ?? it.type ?? '未命名').trim() || '未命名';
        const bookingStatus = it.bookingStatus ?? null;
        return {
          id: it.id,
          order: it.order,
          type: String(it.type ?? 'ACTIVITY'),
          nameZh,
          bookingStatus,
          isUnconfirmed: isUnconfirmedBooking(bookingStatus),
        };
      });
    return { dayNumber, ymd: toYmd(day.date), items };
  });

  let currentDayNumber = 1;
  const hit = days.find((d) => d.ymd === asOfYmd);
  if (hit) {
    currentDayNumber = hit.dayNumber;
  } else if (days.length > 0) {
    const first = days[0].ymd;
    const last = days[days.length - 1].ymd;
    if (asOfYmd < first) currentDayNumber = 1;
    else if (asOfYmd > last) currentDayNumber = days.length;
    else {
      const next = days.find((d) => d.ymd >= asOfYmd);
      currentDayNumber = next?.dayNumber ?? 1;
    }
  }

  const tomorrowDayNumber =
    currentDayNumber < days.length ? currentDayNumber + 1 : undefined;

  const unconfirmed: TripDayTimelineFactSlice['unconfirmed'] = [];
  for (const d of days) {
    for (const it of d.items) {
      if (!it.isUnconfirmed) continue;
      unconfirmed.push({
        dayNumber: d.dayNumber,
        nameZh: it.nameZh,
        type: it.type,
        reasonZh: it.bookingStatus
          ? `bookingStatus=${it.bookingStatus}`
          : '无预订状态（视为待确认）',
      });
    }
  }

  return {
    tripId: input.tripId,
    destination: input.destination?.trim() || undefined,
    asOfYmd,
    dayCount: days.length,
    currentDayNumber,
    tomorrowDayNumber,
    days,
    unconfirmed,
  };
}

export async function loadTripDayTimelineFactSlice(
  prisma: PrismaTimelineClient,
  tripId: string,
  asOfYmd?: string,
): Promise<TripDayTimelineFactSlice | null> {
  const tid = String(tripId ?? '').trim();
  if (!tid) return null;
  const trip = await prisma.trip.findUnique({
    where: { id: tid },
    select: {
      id: true,
      destination: true,
      destinationCode: true,
      startDate: true,
      TripDay: {
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          ItineraryItem: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              type: true,
              note: true,
              order: true,
              bookingStatus: true,
              Place: { select: { nameCN: true, nameEN: true } },
            },
          },
        },
      },
    },
  });
  if (!trip) return null;
  return buildTripDayTimelineFromDays({
    tripId: trip.id,
    destination: trip.destination || trip.destinationCode,
    asOfYmd,
    days: (trip.TripDay ?? []).map((d) => ({
      date: d.date,
      items: (d.ItineraryItem ?? []).map((it) => ({
        id: it.id,
        type: it.type,
        note: it.note,
        order: it.order,
        bookingStatus: it.bookingStatus,
        nameZh: it.Place?.nameCN,
        nameEn: it.Place?.nameEN,
      })),
    })),
  });
}

function dayLine(d: TripDayTimelineDayFact): string {
  if (d.items.length === 0) return `- Day${d.dayNumber} (${d.ymd || '—'})：暂无节点`;
  const names = d.items.map((i) => i.nameZh).join(' → ');
  return `- Day${d.dayNumber} (${d.ymd || '—'})：${names}`;
}

export function formatTodayTimelinePromptLines(slice: TripDayTimelineFactSlice): string[] {
  const day = slice.days.find((d) => d.dayNumber === slice.currentDayNumber);
  const lines = [
    '【TaskContext·TRIP_QUERY_TODAY】最小日切片；禁止进入规划/重排。',
    `asOf=${slice.asOfYmd} → Day${slice.currentDayNumber}`,
  ];
  if (day) lines.push(dayLine(day));
  else lines.push('当日无日程。');
  return lines;
}

export function formatNextActivityPromptLines(slice: TripDayTimelineFactSlice): string[] {
  const day = slice.days.find((d) => d.dayNumber === slice.currentDayNumber);
  const nextDay = slice.days.find((d) => d.dayNumber === (slice.currentDayNumber ?? 0) + 1);
  const lines = [
    '【TaskContext·TRIP_QUERY_NEXT】下一站切片；禁止规划整段。',
    `当前日=Day${slice.currentDayNumber}`,
  ];
  if (day && day.items.length > 0) {
    lines.push(`当日时间线: ${day.items.map((i) => i.nameZh).join(' → ')}`);
    lines.push(`下一站候选（当日首个之后或次日首站）: ${day.items[1]?.nameZh ?? nextDay?.items[0]?.nameZh ?? '无'}`);
  } else if (nextDay?.items[0]) {
    lines.push(`下一站候选: Day${nextDay.dayNumber}「${nextDay.items[0].nameZh}」`);
  } else {
    lines.push('未找到下一站节点。');
  }
  return lines;
}

export function formatPendingPromptLines(slice: TripDayTimelineFactSlice): string[] {
  const lines = [
    '【TaskContext·TRIP_QUERY_PENDING】只罗列待确认项；禁止替用户做 Decision Commit / APPLY。',
  ];
  if (slice.unconfirmed.length === 0) {
    lines.push('结论候选: 日程节点暂无「待确认预订」标记（不等于准备度已齐）。');
  } else {
    lines.push(`待确认 ${slice.unconfirmed.length} 项:`);
    for (const u of slice.unconfirmed.slice(0, 20)) {
      lines.push(`- Day${u.dayNumber}「${u.nameZh}」(${u.type})：${u.reasonZh}`);
    }
  }
  return lines;
}

export function formatRiskPromptLines(slice: TripDayTimelineFactSlice): string[] {
  return [
    '【TaskContext·TRIP_QUERY_RISK】本切片仅提供日程骨架；LIVE 天气/路况需传感器，禁止因风险问法进入 Full Planning。',
    `行程天数=${slice.dayCount}；当前日=Day${slice.currentDayNumber}`,
    ...slice.days.slice(0, 8).map(dayLine),
  ];
}

export function formatReadinessPromptLines(
  slice: TripDayTimelineFactSlice,
  lodgingMissingDays?: number[],
): string[] {
  const lines = [
    '【TaskContext·TRIP_QUERY_READINESS】准备度最小切片（缺口清单）；禁止因「全面分析」进入 CGUS/Full Planning。',
    `待确认节点=${slice.unconfirmed.length}`,
  ];
  if (lodgingMissingDays && lodgingMissingDays.length > 0) {
    lines.push(`缺住宿日: ${lodgingMissingDays.map((d) => `Day${d}`).join('、')}`);
  } else {
    lines.push('住宿缺口: 无（或未扫描到缺住）');
  }
  if (slice.unconfirmed.length > 0) {
    lines.push('待确认摘录:');
    for (const u of slice.unconfirmed.slice(0, 10)) {
      lines.push(`- Day${u.dayNumber}「${u.nameZh}」`);
    }
  }
  return lines;
}

export function buildTodayPlanAnswerZh(slice: TripDayTimelineFactSlice): string {
  const day = slice.days.find((d) => d.dayNumber === slice.currentDayNumber);
  if (!day) return '当前行程没有可对齐的「今天」日程。';
  if (day.items.length === 0) {
    return `Day${day.dayNumber}（${day.ymd || '—'}）目前还没有安排节点。如需排程，请说「安排第${day.dayNumber}天」。`;
  }
  const seq = day.items.map((i, idx) => `${idx + 1}. ${i.nameZh}`).join('；');
  return `Day${day.dayNumber}（${day.ymd || '—'}）安排：${seq}。`;
}

export function buildNextActivityAnswerZh(slice: TripDayTimelineFactSlice): string {
  const day = slice.days.find((d) => d.dayNumber === slice.currentDayNumber);
  const nextOnDay = day?.items[1];
  if (nextOnDay) {
    return `下一站是「${nextOnDay.nameZh}」（Day${day!.dayNumber}）。`;
  }
  const nextDay = slice.days.find((d) => d.dayNumber === (slice.currentDayNumber ?? 0) + 1);
  if (nextDay?.items[0]) {
    return `当日已无后续节点；下一站是 Day${nextDay.dayNumber} 的「${nextDay.items[0].nameZh}」。`;
  }
  if (day?.items[0]) {
    return `当前日仅有「${day.items[0].nameZh}」，其后暂无下一站。`;
  }
  return '目前找不到明确的下一站节点。';
}

export function buildPendingAnswerZh(slice: TripDayTimelineFactSlice): string {
  if (slice.unconfirmed.length === 0) {
    return '按预订状态字段看，日程节点暂无待确认项（这不等于机票/租车等行程外事项已齐）。';
  }
  const list = slice.unconfirmed
    .slice(0, 12)
    .map((u) => `Day${u.dayNumber}「${u.nameZh}」`)
    .join('、');
  return `还有这些待确认：${list}。我只罗列，不会替你选定或写入行程。`;
}

export function buildReadinessAnswerZh(
  slice: TripDayTimelineFactSlice,
  lodgingMissingDays?: number[],
): string {
  const parts: string[] = [];
  if (lodgingMissingDays && lodgingMissingDays.length > 0) {
    parts.push(`缺住宿：${lodgingMissingDays.map((d) => `Day${d}`).join('、')}`);
  } else {
    parts.push('住宿节点缺口：未见');
  }
  parts.push(`待确认日程节点：${slice.unconfirmed.length} 项`);
  return `准备度速览（最小切片，非完整评分）：${parts.join('；')}。如需完整准备度分数，请打开工作台准备度面板。`;
}

export function isTodayPlanDirectAnswerQuery(message: string): boolean {
  return /今天怎么安排|今日行程|今天行程|今天做什么|今天去哪/.test(String(message ?? '').trim());
}

export function isNextActivityDirectAnswerQuery(message: string): boolean {
  return /下一站|下一个景点|接下来去哪|下一程/.test(String(message ?? '').trim());
}

export function isPendingDirectAnswerQuery(message: string): boolean {
  return /还有哪些没确认|哪些没确认|待确认|未确认/.test(String(message ?? '').trim());
}

export function isReadinessDirectAnswerQuery(message: string): boolean {
  return /准备度|合理不合理|是否合理|行程体检/.test(String(message ?? '').trim());
}
