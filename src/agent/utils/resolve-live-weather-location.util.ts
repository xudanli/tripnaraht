/**
 * 轻量路径天气 MCP：从用户话术或绑定行程解析 Open-Meteo 地理编码查询串。
 */

import type { PrismaService } from '../../prisma/prisma.service';

export type LiveWeatherLocationResolve = {
  location: string;
  countryCode?: string;
  /** 行程锚点展示名（如 Place 名），供传感器块引用 */
  anchorLabel?: string;
};

export const LIVE_WEATHER_LOCATION_HINTS: Array<{
  re: RegExp;
  location: string;
  countryCode?: string;
}> = [
  { re: /斯奈山|斯奈费尔|Snæfellsnes|Snaefellsnes/i, location: 'Snæfellsnes Peninsula, Iceland', countryCode: 'IS' },
  { re: /维克|Vík\b|Vik\b/i, location: 'Vík í Mýrdal, Iceland', countryCode: 'IS' },
  { re: /赫本|霍芬|Höfn|Hofn/i, location: 'Höfn, Iceland', countryCode: 'IS' },
  { re: /雷克雅未克|Reykjavik|Reykjavík/i, location: 'Reykjavik, Iceland', countryCode: 'IS' },
  { re: /塞里雅兰|Seljalandsfoss/i, location: 'Seljalandsfoss, Iceland', countryCode: 'IS' },
  { re: /斯科加|Skógafoss|Skogafoss/i, location: 'Skógar, Iceland', countryCode: 'IS' },
  { re: /杰古|冰河湖|Jökulsárlón|Jokulsarlon/i, location: 'Jökulsárlón, Iceland', countryCode: 'IS' },
  { re: /米湖|Mývatn|Myvatn/i, location: 'Mývatn, Iceland', countryCode: 'IS' },
  { re: /阿克雷里|Akureyri/i, location: 'Akureyri, Iceland', countryCode: 'IS' },
];

export function resolveLiveWeatherLocationFromMessage(message: string): LiveWeatherLocationResolve | null {
  const msg = message ?? '';
  for (const h of LIVE_WEATHER_LOCATION_HINTS) {
    if (h.re.test(msg)) {
      return { location: h.location, countryCode: h.countryCode };
    }
  }
  if (/冰岛|\bIceland\b/i.test(msg)) {
    return { location: 'Iceland', countryCode: 'IS' };
  }
  return null;
}

export function formatPlaceForWeatherGeocode(
  place: { nameEN?: string | null; nameCN?: string | null },
  destinationCode?: string | null,
): string | null {
  const name = (place.nameEN || place.nameCN || '').trim();
  if (!name) return null;
  const code = destinationCode?.trim().toUpperCase();
  if (code === 'IS' && !/iceland|冰岛/i.test(name)) {
    return `${name}, Iceland`;
  }
  return name;
}

function pickTripDayYmd(
  dayYmds: string[],
  tripStartYmd: string,
  tripEndYmd: string,
  now: Date,
): string | undefined {
  if (!dayYmds.length) return undefined;
  const todayYmd = now.toISOString().slice(0, 10);
  if (dayYmds.includes(todayYmd)) return todayYmd;
  if (todayYmd < tripStartYmd) return dayYmds[0];
  if (todayYmd > tripEndYmd) return dayYmds[dayYmds.length - 1];
  // 行程区间内但 TripDay 未对齐 UTC 日历时，取最近一天
  let best = dayYmds[0];
  let bestAbs = Math.abs(Date.parse(`${best}T12:00:00.000Z`) - now.getTime());
  for (const ymd of dayYmds) {
    const abs = Math.abs(Date.parse(`${ymd}T12:00:00.000Z`) - now.getTime());
    if (abs < bestAbs) {
      best = ymd;
      bestAbs = abs;
    }
  }
  return best;
}

/**
 * 绑定行程：优先取「今日」TripDay 首个带 Place 的日程项；否则首/末日锚点。
 */
export async function resolveLiveWeatherLocationFromAnchoredTrip(
  prisma: PrismaService,
  tripId: string,
  now: Date = new Date(),
): Promise<LiveWeatherLocationResolve | null> {
  const tid = tripId.trim();
  if (!tid) return null;

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tid },
      select: {
        destination: true,
        startDate: true,
        endDate: true,
        TripDay: {
          orderBy: { date: 'asc' },
          select: {
            date: true,
            ItineraryItem: {
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
              select: {
                placeId: true,
                Place: { select: { id: true, nameEN: true, nameCN: true, metadata: true } },
              },
            },
          },
        },
      },
    });
    if (!trip?.TripDay?.length) return null;

    const destCode = trip.destination?.trim().toUpperCase();
    const tripStartYmd = trip.startDate?.toISOString().slice(0, 10) ?? '';
    const tripEndYmd = trip.endDate?.toISOString().slice(0, 10) ?? tripStartYmd;

    const dayRows = trip.TripDay.map((d) => ({
      ymd: d.date ? d.date.toISOString().slice(0, 10) : '',
      items: d.ItineraryItem,
    })).filter((d) => d.ymd);

    const targetYmd = pickTripDayYmd(
      dayRows.map((d) => d.ymd),
      tripStartYmd,
      tripEndYmd,
      now,
    );
    const targetDay = dayRows.find((d) => d.ymd === targetYmd) ?? dayRows[0];

    for (const it of targetDay.items) {
      if (!it.Place) continue;
      const location = formatPlaceForWeatherGeocode(it.Place, destCode);
      if (!location) continue;
      const label = (it.Place.nameCN || it.Place.nameEN || location).trim();
      return {
        location,
        countryCode: destCode && /^[A-Z]{2}$/.test(destCode) ? destCode : undefined,
        anchorLabel: label || undefined,
      };
    }

    // 无 Place 名时仍按国家/目的地降级
    if (destCode === 'IS') {
      return { location: 'Iceland', countryCode: 'IS' };
    }
    if (destCode && /^[A-Z]{2}$/.test(destCode)) {
      return { location: destCode, countryCode: destCode };
    }
    return null;
  } catch {
    return null;
  }
}
