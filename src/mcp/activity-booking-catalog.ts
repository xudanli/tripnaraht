/**
 * 冰岛常见硬预约活动目录（活动 MCP / 聊天卡片共用）。
 * Browserbase 探页以这些 URL 为入口；失败时回落为本目录静态链接。
 */

export type ActivityBookingCategory =
  | 'ATTRACTION_TICKET'
  | 'SPECIAL_EXPERIENCE'
  | 'TRANSPORT';

export type IcelandActivityBookingCatalogEntry = {
  id: string;
  match: RegExp;
  nameZh: string;
  nameEn: string;
  category: ActivityBookingCategory;
  url: string;
  urgencyZh: string;
  reasonZh: string;
  /** Stagehand extract 提示：页面上关注什么 */
  extractHint: string;
};

export const ICELAND_ACTIVITY_BOOKING_CATALOG: IcelandActivityBookingCatalogEntry[] = [
  {
    id: 'blue_lagoon',
    match: /蓝湖|蓝潟湖|Blue\s*Lagoon/i,
    nameZh: '蓝湖温泉门票',
    nameEn: 'Blue Lagoon',
    category: 'ATTRACTION_TICKET',
    /** 官网日访订票入口（旧 /tickets 已失效；机房 IP 可能 403） */
    url: 'https://www.bluelagoon.com/day-visit/the-blue-lagoon',
    urgencyZh: 'CRITICAL',
    reasonZh: '时段票，旺季易售罄；须官网锁场次',
    extractHint: 'Blue Lagoon ticket booking: page title, any price or from-price, primary book/buy URL',
  },
  {
    id: 'glacier_hike',
    match: /索尔黑马|S[oó]lheimaj[oö]kull|冰川徒步|glacier\s*hike|冰洞|ice\s*cave/i,
    nameZh: '冰川徒步 / 冰洞体验',
    nameEn: 'Glacier hike / ice cave',
    category: 'SPECIAL_EXPERIENCE',
    /** Glacier Guides · Sólheimajökull（旧 adventures.is/glacier-hikes 已 404） */
    url: 'https://www.glacierguides.is/tours-from-solheimajokull/glacier-experience',
    urgencyZh: 'CRITICAL',
    reasonZh: '向导团容量有限，8 月建议尽早订',
    extractHint: 'Glacier hike tour listing near Solheimajokull: title, price range, book now / product URL',
  },
  {
    id: 'jokulsarlon_boat',
    match: /冰河湖|杰古沙龙|J[oö]kuls[aá]rl[oó]n|Zodiac|水陆两栖|船游|amphibious/i,
    nameZh: '冰河湖船游',
    nameEn: 'Jökulsárlón boat tour',
    category: 'SPECIAL_EXPERIENCE',
    /** Ice Lagoon 官方预订页（比首页更直接） */
    url: 'https://icelagoon.is/booking/',
    urgencyZh: 'HIGH',
    reasonZh: '水陆两栖 / Zodiac 均需提前购票，现场常无当日票',
    extractHint: 'Jokulsarlon boat tour booking: title, price, book/tickets URL',
  },
  {
    id: 'thorsmork_superjeep',
    match: /Þórsmörk|Thorsmork|索尔莫克|超级吉普|super\s*jeep/i,
    nameZh: '索尔莫克超级吉普',
    nameEn: 'Þórsmörk super jeep',
    category: 'SPECIAL_EXPERIENCE',
    /** Southcoast Adventure Þórsmörk（旧 adventures.is/super-jeep-tours 已 404） */
    url: 'https://www.southadventure.is/tours/thorsmork/',
    urgencyZh: 'HIGH',
    reasonZh: '高地体验须向导车队，需预订核验',
    extractHint: 'Thorsmork super jeep tour: title, price, book URL',
  },
];

export function matchActivityCatalogEntries(
  query: string,
  limit = 4,
): IcelandActivityBookingCatalogEntry[] {
  const q = String(query ?? '').trim();
  if (!q) return ICELAND_ACTIVITY_BOOKING_CATALOG.slice(0, limit);
  const hit = ICELAND_ACTIVITY_BOOKING_CATALOG.filter((e) => e.match.test(q));
  if (hit.length) return hit.slice(0, limit);
  /** 泛问「哪些要提前订」：返回全目录（截断） */
  if (/提前|预订|预定|预约|门票|活动|景点|订票/i.test(q)) {
    return ICELAND_ACTIVITY_BOOKING_CATALOG.slice(0, limit);
  }
  return [];
}
