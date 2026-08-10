/**
 * Resolve jumpable lodging booking URLs for hotel POIs.
 * - International: official + Booking / Airbnb / Trip.com
 * - China (CN): official + 携程 / 飞猪 / 去哪儿
 */

import {
  isChinaOtaMarket,
  resolveChinaHotelOtaLinks,
  type ChinaOtaProvider,
} from './china-ota-booking-link.util';

export type LodgingBookingProvider =
  | 'official'
  | 'booking_com'
  | 'airbnb'
  | 'trip_com'
  | ChinaOtaProvider;

export type LodgingBookingChannel = {
  provider: LodgingBookingProvider;
  url: string;
  /** 飞猪等同 webUrl（H5）；不再附带 App Scheme */
  webUrl?: string;
  labelZh: string;
};

export type LodgingBookingLinkSet = {
  /** Primary CTA (official if known, else market-primary OTA). Kept for backward compat. */
  bookingUrl: string;
  bookingProvider: LodgingBookingProvider;
  bookingCtaLabelZh: string;
  /** All channels: optional official + market OTAs */
  bookingLinks: LodgingBookingChannel[];
};

const OFFICIAL_URL_KEYS = [
  'bookingUrl',
  'officialUrl',
  'website',
  'websiteUrl',
  'homepage',
  'url',
  'externalUrl',
] as const;

const INTL_PROVIDER_META_KEYS: Record<
  'booking_com' | 'airbnb' | 'trip_com',
  readonly string[]
> = {
  booking_com: ['bookingComUrl', 'booking_com', 'bookingCom'],
  airbnb: ['airbnbUrl', 'airbnb', 'airbnbCom'],
  trip_com: ['tripComUrl', 'trip_com', 'ctripUrl', 'tripUrl'],
};

const CN_PROVIDER_META_KEYS: Record<ChinaOtaProvider, readonly string[]> = {
  ctrip: ['ctripUrl', 'ctrip', 'tripComUrl', 'trip_com'],
  fliggy: ['fliggyUrl', 'fliggy', 'feizhuUrl'],
  qunar: ['qunarUrl', 'qunar', 'qunaerUrl'],
};

const CHANNEL_LABEL: Record<LodgingBookingProvider, string> = {
  official: '去官网预订',
  booking_com: 'Booking.com',
  airbnb: 'Airbnb',
  trip_com: 'Trip.com',
  ctrip: '携程',
  fliggy: '飞猪',
  qunar: '去哪儿',
};

export function resolveLodgingBookingLink(input: {
  nameZh?: string | null;
  nameEn?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Destination country for search fallback (default Iceland). */
  countryName?: string | null;
  countryCode?: string | null;
  cityHint?: string | null;
}): LodgingBookingLinkSet | null {
  const metadata = input.metadata ?? null;
  const official = pickOfficialBookingUrl(metadata);
  const china = isChinaOtaMarket({
    countryCode: input.countryCode,
    countryName: input.countryName,
  });

  if (china) {
    return resolveChinaLodgingLinks({
      official,
      metadata,
      nameZh: input.nameZh,
      nameEn: input.nameEn,
      cityHint: input.cityHint,
    });
  }

  return resolveIntlLodgingLinks({
    official,
    metadata,
    nameZh: input.nameZh,
    nameEn: input.nameEn,
    countryName: input.countryName,
  });
}

function resolveChinaLodgingLinks(input: {
  official: string | null;
  metadata: Record<string, unknown> | null;
  nameZh?: string | null;
  nameEn?: string | null;
  cityHint?: string | null;
}): LodgingBookingLinkSet | null {
  const bookingLinks: LodgingBookingChannel[] = [];

  if (input.official) {
    bookingLinks.push({
      provider: 'official',
      url: input.official,
      labelZh: CHANNEL_LABEL.official,
    });
  }

  const otaFallback = resolveChinaHotelOtaLinks({
    nameZh: input.nameZh,
    nameEn: input.nameEn,
    cityHint: input.cityHint,
  });

  for (const provider of ['ctrip', 'fliggy', 'qunar'] as const) {
    const fromMeta = pickProviderUrlFromMetadata(
      input.metadata,
      provider,
      CN_PROVIDER_META_KEYS[provider],
      provider === 'ctrip'
        ? ['ctrip', 'trip', 'tripCom']
        : provider === 'fliggy'
          ? ['fliggy', 'feizhu']
          : ['qunar', 'qunaer'],
    );
    const otaCh = otaFallback?.bookingLinks.find((c) => c.provider === provider);
    const url = fromMeta ?? otaCh?.url ?? null;
    if (!url) continue;
    if (provider === 'fliggy') {
      const web = otaCh?.webUrl ?? url;
      bookingLinks.push({
        provider,
        url: web,
        webUrl: web,
        labelZh: CHANNEL_LABEL[provider],
      });
      continue;
    }
    bookingLinks.push({
      provider,
      url,
      labelZh: CHANNEL_LABEL[provider],
    });
  }

  if (bookingLinks.length === 0) return null;

  const primary =
    bookingLinks.find((c) => c.provider === 'official') ??
    bookingLinks.find((c) => c.provider === 'ctrip') ??
    bookingLinks[0]!;

  return {
    bookingUrl: primary.url,
    bookingProvider: primary.provider,
    bookingCtaLabelZh:
      primary.provider === 'official'
        ? CHANNEL_LABEL.official
        : `在 ${CHANNEL_LABEL[primary.provider]} 查看`,
    bookingLinks,
  };
}

function resolveIntlLodgingLinks(input: {
  official: string | null;
  metadata: Record<string, unknown> | null;
  nameZh?: string | null;
  nameEn?: string | null;
  countryName?: string | null;
}): LodgingBookingLinkSet | null {
  const searchName = pickSearchName(input.nameEn, input.nameZh);
  const country = (input.countryName ?? 'Iceland').trim() || 'Iceland';
  const query = buildSearchQuery(searchName, country);

  const bookingLinks: LodgingBookingChannel[] = [];

  if (input.official) {
    bookingLinks.push({
      provider: 'official',
      url: input.official,
      labelZh: CHANNEL_LABEL.official,
    });
  }

  for (const provider of ['booking_com', 'airbnb', 'trip_com'] as const) {
    const fromMeta = pickProviderUrlFromMetadata(
      input.metadata,
      provider,
      INTL_PROVIDER_META_KEYS[provider],
      provider === 'booking_com'
        ? ['booking', 'bookingUrl']
        : provider === 'airbnb'
          ? ['airbnb']
          : ['trip', 'ctrip', 'tripCom'],
    );
    const url =
      fromMeta ?? (query ? buildProviderSearchUrl(provider, query) : null);
    if (!url) continue;
    bookingLinks.push({
      provider,
      url,
      labelZh: CHANNEL_LABEL[provider],
    });
  }

  if (bookingLinks.length === 0) return null;

  const primary =
    bookingLinks.find((c) => c.provider === 'official') ??
    bookingLinks.find((c) => c.provider === 'booking_com') ??
    bookingLinks[0]!;

  return {
    bookingUrl: primary.url,
    bookingProvider: primary.provider,
    bookingCtaLabelZh:
      primary.provider === 'official'
        ? CHANNEL_LABEL.official
        : `在 ${CHANNEL_LABEL[primary.provider]} 查看`,
    bookingLinks,
  };
}

function buildSearchQuery(
  searchName: string | null,
  country: string,
): string | null {
  if (!searchName) return null;
  if (/iceland|ísland|island/i.test(searchName)) return searchName;
  return `${searchName}, ${country}`;
}

function buildProviderSearchUrl(
  provider: 'booking_com' | 'airbnb' | 'trip_com',
  query: string,
): string {
  const q = encodeURIComponent(query);
  switch (provider) {
    case 'booking_com':
      return `https://www.booking.com/searchresults.html?ss=${q}&lang=zh-cn`;
    case 'airbnb':
      return `https://www.airbnb.com/s/homes?query=${q}&locale=zh`;
    case 'trip_com':
      return `https://www.trip.com/hotels/list?keyword=${q}&locale=zh-CN`;
  }
}

function pickSearchName(
  nameEn?: string | null,
  nameZh?: string | null,
): string | null {
  const en = nameEn?.trim();
  if (en) return en;
  const zh = nameZh?.trim();
  if (zh) return zh;
  return null;
}

function pickProviderUrlFromMetadata(
  metadata: Record<string, unknown> | null,
  _provider: string,
  keys: readonly string[],
  linkAliases: readonly string[],
): string | null {
  if (!metadata) return null;

  for (const key of keys) {
    const hit = asHttpUrl(metadata[key]);
    if (hit) return hit;
  }

  const links = metadata.links;
  if (links && typeof links === 'object' && !Array.isArray(links)) {
    const obj = links as Record<string, unknown>;
    for (const key of keys) {
      const hit = asHttpUrl(obj[key]);
      if (hit) return hit;
    }
    for (const key of linkAliases) {
      const hit = asHttpUrl(obj[key]);
      if (hit) return hit;
    }
  }

  return null;
}

function pickOfficialBookingUrl(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) return null;

  for (const key of OFFICIAL_URL_KEYS) {
    const hit = asHttpUrl(metadata[key]);
    if (hit) return hit;
  }

  const links = metadata.links;
  if (links && typeof links === 'object' && !Array.isArray(links)) {
    const obj = links as Record<string, unknown>;
    for (const key of ['official', 'website', 'url']) {
      const hit = asHttpUrl(obj[key]);
      if (hit) return hit;
    }
  }

  const booking = metadata.booking;
  if (booking && typeof booking === 'object' && !Array.isArray(booking)) {
    const hit = asHttpUrl((booking as Record<string, unknown>).url);
    if (hit) return hit;
  }

  return null;
}

function asHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}
