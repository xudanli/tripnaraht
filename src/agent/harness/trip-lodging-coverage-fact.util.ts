/**
 * Task Context Slice — TRIP_QUERY_LODGING
 * 按需加载 DAY_LIST + ACCOMMODATION_ANCHORS，扫描缺住日（末日前夜需过夜）。
 */

import { isOvernightLodgingItineraryItem } from '../utils/day-lodging-choice.util';

export type TripLodgingNightStatus = {
  dayNumber: number;
  ymd: string;
  /** 该日是否需要过夜（非末日） */
  overnightExpected: boolean;
  hasLodging: boolean;
  lodgingNameZh?: string;
  lodgingType?: string;
};

export type TripLodgingCoverageFactSlice = {
  tripId: string;
  destination?: string;
  dayCount: number;
  nightsExpected: number;
  nightsCovered: number;
  nights: TripLodgingNightStatus[];
  missingDayNumbers: number[];
  coveredDayNumbers: number[];
};

type PrismaLodgingSliceClient = {
  trip: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<{
      id: string;
      destination?: string | null;
      destinationCode?: string | null;
      TripDay?: Array<{
        id: string;
        date: Date | string;
        ItineraryItem?: Array<{
          id: string;
          type: string;
          note?: string | null;
          Place?: {
            nameCN?: string | null;
            nameEN?: string | null;
            category?: string | null;
          } | null;
        }>;
      }>;
    } | null>;
  };
};

function toYmd(d: Date | string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

export function buildTripLodgingCoverageFromDays(input: {
  tripId: string;
  destination?: string | null;
  days: Array<{
    date: Date | string;
    items: Array<{
      type?: string | null;
      note?: string | null;
      title?: string | null;
      placeCategory?: string | null;
      nameZh?: string | null;
      nameEn?: string | null;
    }>;
  }>;
}): TripLodgingCoverageFactSlice {
  const sorted = [...input.days].sort((a, b) => toYmd(a.date).localeCompare(toYmd(b.date)));
  const dayCount = sorted.length;
  const nights: TripLodgingNightStatus[] = sorted.map((day, idx) => {
    const dayNumber = idx + 1;
    const ymd = toYmd(day.date);
    const overnightExpected = dayCount <= 1 ? true : dayNumber < dayCount;
    let lodgingNameZh: string | undefined;
    let lodgingType: string | undefined;
    let hasLodging = false;
    for (const it of day.items ?? []) {
      if (
        isOvernightLodgingItineraryItem({
          type: it.type,
          title: it.title ?? it.note,
          nameZh: it.nameZh,
          nameEn: it.nameEn,
          placeCategory: it.placeCategory,
        })
      ) {
        hasLodging = true;
        lodgingNameZh =
          String(it.nameZh ?? it.title ?? it.note ?? it.nameEn ?? '住宿').trim() || '住宿';
        lodgingType = String(it.type ?? it.placeCategory ?? 'LODGING');
        break;
      }
    }
    return {
      dayNumber,
      ymd,
      overnightExpected,
      hasLodging: overnightExpected ? hasLodging : hasLodging,
      lodgingNameZh,
      lodgingType,
    };
  });

  const expectedNights = nights.filter((n) => n.overnightExpected);
  const missingDayNumbers = expectedNights.filter((n) => !n.hasLodging).map((n) => n.dayNumber);
  const coveredDayNumbers = expectedNights.filter((n) => n.hasLodging).map((n) => n.dayNumber);

  return {
    tripId: input.tripId,
    destination: input.destination?.trim() || undefined,
    dayCount,
    nightsExpected: expectedNights.length,
    nightsCovered: coveredDayNumbers.length,
    nights,
    missingDayNumbers,
    coveredDayNumbers,
  };
}

export async function loadTripLodgingCoverageFactSlice(
  prisma: PrismaLodgingSliceClient,
  tripId: string,
): Promise<TripLodgingCoverageFactSlice | null> {
  const tid = String(tripId ?? '').trim();
  if (!tid) return null;
  const trip = await prisma.trip.findUnique({
    where: { id: tid },
    select: {
      id: true,
      destination: true,
      destinationCode: true,
      TripDay: {
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          ItineraryItem: {
            select: {
              id: true,
              type: true,
              note: true,
              Place: { select: { nameCN: true, nameEN: true, category: true } },
            },
          },
        },
      },
    },
  });
  if (!trip) return null;
  const days = (trip.TripDay ?? []).map((d) => ({
    date: d.date,
    items: (d.ItineraryItem ?? []).map((it) => ({
      type: it.type,
      note: it.note,
      title: it.note,
      placeCategory: it.Place?.category,
      nameZh: it.Place?.nameCN,
      nameEn: it.Place?.nameEN,
    })),
  }));
  return buildTripLodgingCoverageFromDays({
    tripId: trip.id,
    destination: trip.destination || trip.destinationCode,
    days,
  });
}

/** 注入 LLM 的结构化事实块（Least Context） */
export function formatTripLodgingCoveragePromptLines(slice: TripLodgingCoverageFactSlice): string[] {
  const lines: string[] = [
    '【TaskContext·TRIP_QUERY_LODGING·结构化事实】以下为系统扫描结果，请直接据此回答「哪一天没住宿」；禁止进入规划/重排；勿编造未列出的酒店。',
  ];
  if (slice.destination) {
    lines.push(`目的地: ${slice.destination}`);
  }
  lines.push(`行程天数: ${slice.dayCount}；需过夜晚数: ${slice.nightsExpected}；已有住宿: ${slice.nightsCovered}`);
  lines.push('按日清单:');
  for (const n of slice.nights) {
    if (!n.overnightExpected) {
      lines.push(
        `- Day${n.dayNumber} (${n.ymd || '—'})：末日/离境日，默认不要求过夜` +
          (n.hasLodging ? `（仍有住宿节点：${n.lodgingNameZh}）` : ''),
      );
      continue;
    }
    lines.push(
      n.hasLodging
        ? `- Day${n.dayNumber} (${n.ymd || '—'})：已有过夜「${n.lodgingNameZh}」(${n.lodgingType})`
        : `- Day${n.dayNumber} (${n.ymd || '—'})：【缺住宿】`,
    );
  }
  if (slice.missingDayNumbers.length === 0) {
    lines.push('结论候选: 需过夜的日子均已有住宿节点（不等于已订房确认）。');
  } else {
    lines.push(
      `结论候选: 缺住宿日 = ${slice.missingDayNumbers.map((d) => `Day${d}`).join('、')}`,
    );
  }
  return lines;
}

/** 确定性短答（CASE-Q01）：不依赖 LLM */
export function buildTripLodgingCoverageAnswerZh(slice: TripLodgingCoverageFactSlice): string {
  if (slice.dayCount <= 0) {
    return '当前行程还没有日程天，无法判断哪一天缺住宿。请先确认行程日期。';
  }
  if (slice.nightsExpected <= 0) {
    return '当前行程没有需要过夜的日子，暂无住宿缺口可报。';
  }
  if (slice.missingDayNumbers.length === 0) {
    const covered = slice.coveredDayNumbers.map((d) => `Day${d}`).join('、');
    return (
      `按当前行程草案，需要过夜的 ${slice.nightsExpected} 晚都已有住宿节点` +
      (covered ? `（${covered}）` : '') +
      '。这只表示时间轴上有过夜安排，不等于预订已确认。'
    );
  }
  const missing = slice.missingDayNumbers
    .map((d) => {
      const night = slice.nights.find((n) => n.dayNumber === d);
      return night?.ymd ? `Day${d}（${night.ymd}）` : `Day${d}`;
    })
    .join('、');
  const coveredHint =
    slice.coveredDayNumbers.length > 0
      ? `已有过夜的日子：${slice.coveredDayNumbers.map((d) => `Day${d}`).join('、')}。`
      : '目前还没有任何过夜住宿节点。';
  return (
    `目前缺住宿的日子是：${missing}。${coveredHint}` +
    '如需我帮你安排这些晚上的住宿，请说「安排住宿」或指定某一天。'
  );
}

export function isLodgingGapDirectAnswerQuery(message: string): boolean {
  const m = String(message ?? '').trim();
  return /哪一天没住宿|哪天没住宿|哪一天没有住宿|哪天没有住宿|还缺住宿|缺哪些.?住宿|哪些天没住宿|有没有没安排住宿/.test(
    m,
  );
}
