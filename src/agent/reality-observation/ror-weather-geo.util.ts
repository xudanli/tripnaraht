/**
 * ROR 天气城市 / 纬度：从目的地、地点名、消息或坐标解析（冰岛优先）。
 */

export type RorWeatherGeo = {
  city: string;
  latitudeDeg: number;
  longitudeDeg: number;
  source: 'DESTINATION' | 'PLACE' | 'MESSAGE' | 'COORD_NEAREST' | 'DEFAULT';
};

type CityEntry = {
  city: string;
  lat: number;
  lng: number;
  aliases: RegExp[];
};

/** 冰岛常用天气查询点（Open-Meteo 城市名） */
export const ROR_IS_WEATHER_CITIES: readonly CityEntry[] = [
  {
    city: 'Reykjavik',
    lat: 64.1466,
    lng: -21.9426,
    aliases: [/雷克雅未克|雷克雅|Reykjav[ií]k/i],
  },
  {
    city: 'Akureyri',
    lat: 65.6835,
    lng: -18.0878,
    aliases: [/阿克雷里|Akureyr/i],
  },
  {
    city: 'Vik',
    lat: 63.4186,
    lng: -19.006,
    aliases: [/\bV[ií]k\b|维克(?!多)/i],
  },
  {
    city: 'Hofn',
    lat: 64.2539,
    lng: -15.2082,
    aliases: [/赫本|H[oö]fn|霍芬/i],
  },
  {
    city: 'Egilsstadir',
    lat: 65.2609,
    lng: -14.3948,
    aliases: [/埃吉尔|Egilssta/i],
  },
  {
    city: 'Selfoss',
    lat: 63.9291,
    lng: -20.9885,
    aliases: [/塞尔福斯|Selfoss/i],
  },
  {
    city: 'Keflavik',
    lat: 63.9951,
    lng: -22.5618,
    aliases: [/凯夫拉维克|Keflav/i],
  },
] as const;

const DEFAULT_GEO: RorWeatherGeo = {
  city: 'Reykjavik',
  latitudeDeg: 64.1466,
  longitudeDeg: -21.9426,
  source: 'DEFAULT',
};

function matchCityInText(text: string): CityEntry | null {
  const t = text?.trim() ?? '';
  if (!t) return null;
  for (const c of ROR_IS_WEATHER_CITIES) {
    if (c.aliases.some((re) => re.test(t))) return c;
  }
  return null;
}

function nearestCity(lat: number, lng: number): CityEntry {
  let best = ROR_IS_WEATHER_CITIES[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of ROR_IS_WEATHER_CITIES) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * 解析天气查询城市与日照用纬度。
 */
export function resolveWeatherGeoForRor(input: {
  message?: string | null;
  destination?: string | null;
  placeNames?: readonly string[] | null;
  latitudeDeg?: number | null;
  longitudeDeg?: number | null;
}): RorWeatherGeo {
  const fromDest = matchCityInText(input.destination ?? '');
  if (fromDest) {
    return {
      city: fromDest.city,
      latitudeDeg: fromDest.lat,
      longitudeDeg: fromDest.lng,
      source: 'DESTINATION',
    };
  }

  for (const name of input.placeNames ?? []) {
    const hit = matchCityInText(name);
    if (hit) {
      return {
        city: hit.city,
        latitudeDeg: hit.lat,
        longitudeDeg: hit.lng,
        source: 'PLACE',
      };
    }
  }

  const fromMsg = matchCityInText(input.message ?? '');
  if (fromMsg) {
    return {
      city: fromMsg.city,
      latitudeDeg: fromMsg.lat,
      longitudeDeg: fromMsg.lng,
      source: 'MESSAGE',
    };
  }

  const lat = input.latitudeDeg;
  const lng = input.longitudeDeg;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    const near = nearestCity(lat, lng);
    return {
      city: near.city,
      latitudeDeg: lat,
      longitudeDeg: lng,
      source: 'COORD_NEAREST',
    };
  }

  if (/冰岛|Iceland|\bIS\b/i.test(input.message ?? '') || /冰岛|Iceland/i.test(input.destination ?? '')) {
    return { ...DEFAULT_GEO };
  }

  return { ...DEFAULT_GEO };
}
