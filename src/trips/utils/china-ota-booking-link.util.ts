/**
 * 中国行程 OTA 搜索深链（携程 / 飞猪 / 去哪儿）。
 * 用于酒店、活动「跳转预订」CTA；非实时库存 MCP，下单前以平台页为准。
 * 飞猪：统一 https H5（唤端不稳定，不再附带 App Scheme）。
 */

export type ChinaOtaProvider = 'ctrip' | 'fliggy' | 'qunar';

export type ChinaOtaBookingChannel = {
  provider: ChinaOtaProvider;
  /** 主跳转 https */
  url: string;
  webUrl?: string;
  labelZh: string;
};

export type ChinaOtaBookingLinkSet = {
  bookingUrl: string;
  bookingProvider: ChinaOtaProvider;
  bookingCtaLabelZh: string;
  bookingLinks: ChinaOtaBookingChannel[];
};

const CHANNEL_LABEL: Record<ChinaOtaProvider, string> = {
  ctrip: '携程',
  fliggy: '飞猪',
  qunar: '去哪儿',
};

const CHINA_COUNTRY_RE =
  /^(?:CN|CHN|CHINA|中国|中华人民共和国|HK|MO|TW)$/i;

/** 目的地/国家是否应按国内 OTA 跳转 */
export function isChinaOtaMarket(input: {
  countryCode?: string | null;
  countryName?: string | null;
  destination?: string | null;
}): boolean {
  const code = String(input.countryCode ?? '').trim();
  if (code && CHINA_COUNTRY_RE.test(code)) return true;
  const name = String(input.countryName ?? '').trim();
  if (name && CHINA_COUNTRY_RE.test(name)) return true;
  if (/中国|国内/.test(name)) return true;
  const dest = String(input.destination ?? '').trim();
  if (dest && CHINA_COUNTRY_RE.test(dest)) return true;
  return /中国|国内|北京|上海|广州|深圳|杭州|成都|重庆|西安|南京|苏州|三亚|厦门|青岛|香港|澳门|台湾/.test(
    dest,
  );
}

export function resolveChinaHotelOtaLinks(input: {
  nameZh?: string | null;
  nameEn?: string | null;
  cityHint?: string | null;
}): ChinaOtaBookingLinkSet | null {
  const query = buildChinaSearchQuery(input);
  if (!query) return null;
  return buildLinkSet('hotel', query);
}

export function resolveChinaActivityOtaLinks(input: {
  nameZh?: string | null;
  nameEn?: string | null;
  cityHint?: string | null;
}): ChinaOtaBookingLinkSet | null {
  const query = buildChinaSearchQuery(input);
  if (!query) return null;
  return buildLinkSet('activity', query);
}

function buildLinkSet(
  kind: 'hotel' | 'activity',
  query: string,
): ChinaOtaBookingLinkSet {
  const bookingLinks: ChinaOtaBookingChannel[] = (
    ['ctrip', 'fliggy', 'qunar'] as const
  ).map((provider) => {
    const httpsUrl =
      kind === 'hotel'
        ? buildChinaHotelSearchUrl(provider, query)
        : buildChinaActivitySearchUrl(provider, query);
    if (provider === 'fliggy') {
      return {
        provider,
        url: httpsUrl,
        webUrl: httpsUrl,
        labelZh: CHANNEL_LABEL[provider],
      };
    }
    return {
      provider,
      url: httpsUrl,
      labelZh: CHANNEL_LABEL[provider],
    };
  });
  const primary = bookingLinks[0]!;
  return {
    bookingUrl: primary.url,
    bookingProvider: primary.provider,
    bookingCtaLabelZh: `在${CHANNEL_LABEL[primary.provider]}查看`,
    bookingLinks,
  };
}

function buildChinaSearchQuery(input: {
  nameZh?: string | null;
  nameEn?: string | null;
  cityHint?: string | null;
}): string | null {
  const name = (input.nameZh?.trim() || input.nameEn?.trim() || '').trim();
  if (!name) return null;
  const city = input.cityHint?.trim();
  if (city && !name.includes(city)) return `${city} ${name}`;
  return name;
}

export function buildChinaHotelSearchUrl(
  provider: ChinaOtaProvider,
  query: string,
): string {
  const q = encodeURIComponent(query);
  switch (provider) {
    case 'ctrip':
      // H5 关键词搜：无 cityId 时仍可落地到酒店列表/搜索态
      return `https://m.ctrip.com/webapp/hotels/list?searchword=${q}`;
    case 'fliggy':
      return `https://hotel.fliggy.com/hotel_list2.htm?keyWords=${q}`;
    case 'qunar':
      return `https://touch.qunar.com/hotel/hotellist?keyword=${q}`;
  }
}

export function buildChinaActivitySearchUrl(
  provider: ChinaOtaProvider,
  query: string,
): string {
  const ticketQ = /门票|票务|体验|一日游/.test(query) ? query : `${query} 门票`;
  const q = encodeURIComponent(ticketQ);
  switch (provider) {
    case 'ctrip':
      return `https://m.ctrip.com/webapp/ticket/list?keyword=${q}`;
    case 'fliggy':
      return `https://s.fliggy.com/?q=${q}`;
    case 'qunar':
      return `https://piao.qunar.com/ticket/list.htm?keyword=${q}`;
  }
}
