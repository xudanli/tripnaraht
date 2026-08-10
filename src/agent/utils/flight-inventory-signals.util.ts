/**
 * 可执行航班库存意图（轻量路径 flight sensor）与 Amadeus 搜索腿解析。
 * 与 FlightPriceService（均价/趋势）解耦：此处只服务「实时舱位报价」类 inventory 入口。
 */

import { parseExplicitStayWindowFromUserMessage } from './hotel-mcp-route-run.mapper';

/** 显式要查实时航班/库存/开口程，而非仅旅行知识问答 */
export function isExecutableFlightInventoryQuery(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (/\benable_live_tools\b/.test(m)) return false;
  if (/(?:查|搜|找|看|订|买|购).{0,8}(?:机票|航班|舱位)/.test(m)) return true;
  if (/(?:机票|航班).{0,8}(?:价格|组合|可订|库存|时刻|预订|下单)/.test(m)) return true;
  /** 「杭州到成都机票 / 我要订杭州到成都机场的机票」等城际订票 */
  if (
    resolveChinaDomesticFlightCities(m) &&
    /(?:机票|航班|舱位|订票|买票)/.test(m)
  ) {
    return true;
  }
  if (/可订组合|实时航班|舱位|flight\s*offers?|search\s*flights?/i.test(m)) return true;
  if (/(?:开口|open[\s-]*jaw|多城|不同.*进出|进.*出)/i.test(m) && /(凯夫拉维克|雷克雅未克|KEF|赫尔辛基|HEL|机票|航班)/i.test(m)) {
    return true;
  }
  if (
    /(凯夫拉维克|雷克雅未克|KEF).{0,80}(赫尔辛基|HEL)/i.test(m) ||
    /(赫尔辛基|HEL).{0,80}(凯夫拉维克|雷克雅未克|KEF)/i.test(m)
  ) {
    if (/(进|出|去程|回程|入境|离境)/.test(m) && /(一周|窗口|日期|月)/.test(m)) return true;
  }
  return false;
}

function pickDefaultOriginIataFromMessage(message: string): string {
  if (/上海|浦东|虹桥|PVG|SHA/i.test(message)) return 'PVG';
  if (/北京|首都|大兴|PEK|PKX/i.test(message)) return 'PEK';
  if (/广州|CAN/i.test(message)) return 'CAN';
  if (/深圳|SZX/i.test(message)) return 'SZX';
  if (/成都|CTU|TFU/i.test(message)) return 'CTU';
  if (/香港|HKG/i.test(message)) return 'HKG';
  return 'PEK';
}

/** 飞猪 search-flight 用中文城市名 */
const CN_FLIGHT_CITY_RE =
  /(北京|上海|广州|深圳|成都|重庆|西安|杭州|南京|昆明|拉萨|林芝|康定|芒康|乌鲁木齐|哈尔滨|厦门|三亚|武汉|长沙|贵阳|南宁|青岛|大连|天津|郑州|合肥|福州|南昌|海口|西宁|银川|呼和浩特|石家庄|太原|兰州|丽江|大理|九寨沟|香港|澳门)/;

const IATA_TO_CN: Record<string, string> = {
  PEK: '北京',
  PKX: '北京',
  PVG: '上海',
  SHA: '上海',
  CAN: '广州',
  SZX: '深圳',
  CTU: '成都',
  TFU: '成都',
  XIY: '西安',
  HGH: '杭州',
  KMG: '昆明',
  LXA: '拉萨',
  HKG: '香港',
};

export function iataOrCodeToFliggyCity(code: string): string {
  const c = String(code ?? '').trim().toUpperCase();
  if (IATA_TO_CN[c]) return IATA_TO_CN[c];
  if (CN_FLIGHT_CITY_RE.test(code)) return code.match(CN_FLIGHT_CITY_RE)![1]!;
  return code;
}

/** 话术中的国内城际航段（成都到拉萨 / 北京飞上海） */
export function resolveChinaDomesticFlightCities(
  message: string,
): { originZh: string; destinationZh: string } | null {
  const m = String(message ?? '').trim();
  if (!m) return null;
  const pair = m.match(
    new RegExp(
      `${CN_FLIGHT_CITY_RE.source}\\s*[到至飞\\-—~～]+\\s*${CN_FLIGHT_CITY_RE.source}`,
    ),
  );
  if (pair?.[1] && pair?.[2] && pair[1] !== pair[2]) {
    return { originZh: pair[1], destinationZh: pair[2] };
  }
  const cities = [...m.matchAll(new RegExp(CN_FLIGHT_CITY_RE.source, 'g'))].map(
    (x) => x[1]!,
  );
  const uniq = [...new Set(cities)];
  if (uniq.length >= 2 && /机票|航班|舱位|飞/.test(m)) {
    return { originZh: uniq[0]!, destinationZh: uniq[1]! };
  }
  return null;
}

export function isChinaFlightInventoryScope(input: {
  message?: string | null;
  countryCode?: string | null;
  destination?: string | null;
}): boolean {
  const code = String(input.countryCode ?? '').toUpperCase();
  if (code === 'CN' || code === 'CHN' || code === 'HK' || code === 'MO') return true;
  const dest = String(input.destination ?? '');
  if (/^(CN|CHN|China|中国)$/i.test(dest) || /中国|国内/.test(dest)) return true;
  if (resolveChinaDomesticFlightCities(String(input.message ?? ''))) return true;
  return false;
}

export type FlightInventoryLeg = {
  origin: string;
  destination: string;
  departureDate: string;
  /** 供 prompt 说明 */
  leg_label_zh: string;
};

/**
 * 从用户话与行程起止日解析 1～2 条 Amadeus 航段（开放程：抵冰岛 + 从欧洲枢纽离境）。
 * 无法解析时返回 null（sensor 跳过）。
 */
function defaultFlightWindowYmd(offsetDays = 14): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
  return d.toISOString().slice(0, 10);
}

export function resolveFlightInventoryLegs(
  message: string,
  opts: { tripStartYmd?: string; tripEndYmd?: string },
): FlightInventoryLeg[] | null {
  const msg = message.trim();
  if (!msg) return null;

  const tripStart = opts.tripStartYmd?.slice(0, 10);
  const tripEnd = opts.tripEndYmd?.slice(0, 10);

  /** 国内城际可在无 Trip 日期时用默认窗口（与租车 live fallback 同思路） */
  const cnPairEarly = resolveChinaDomesticFlightCities(msg);
  if ((!tripStart || !tripEnd) && cnPairEarly && /(?:机票|航班|舱位|查飞|飞)/.test(msg)) {
    const fromNl = parseExplicitStayWindowFromUserMessage(msg, {
      tripStartYmd: tripStart ?? defaultFlightWindowYmd(14),
      tripEndYmd: tripEnd ?? defaultFlightWindowYmd(21),
    });
    const depStart = fromNl?.checkIn ?? tripStart ?? defaultFlightWindowYmd(14);
    return [
      {
        origin: cnPairEarly.originZh,
        destination: cnPairEarly.destinationZh,
        departureDate: depStart,
        leg_label_zh: `国内：${cnPairEarly.originZh}→${cnPairEarly.destinationZh}`,
      },
    ];
  }

  if (!tripStart || !tripEnd) return null;

  const fromNl = parseExplicitStayWindowFromUserMessage(msg, {
    tripStartYmd: tripStart,
    tripEndYmd: tripEnd,
  });
  const depStart = fromNl?.checkIn ?? tripStart;

  const hasKef = /凯夫拉维克|雷克雅未克|\bKEF\b/i.test(msg);
  const hasHel = /赫尔辛基|\bHEL\b/i.test(msg);
  const openJaw = isExecutableFlightInventoryQuery(msg) && hasKef && hasHel;

  if (openJaw) {
    const home = pickDefaultOriginIataFromMessage(msg);
    return [
      {
        origin: home,
        destination: 'KEF',
        departureDate: depStart,
        leg_label_zh: `进岛：${home}→KEF（出发地未写时默认 ${home}，请正文说明可改）`,
      },
      {
        origin: 'HEL',
        destination: home,
        departureDate: tripEnd,
        leg_label_zh: `离境：HEL→${home}（离境日暂与行程结束日对齐；开放程）`,
      },
    ];
  }

  if (/(?:机票|航班|查飞|search\s*flight)/i.test(msg) && /\bKEF\b|凯夫拉维克|雷克雅未克/i.test(msg)) {
    const home = pickDefaultOriginIataFromMessage(msg);
    return [
      {
        origin: home,
        destination: 'KEF',
        departureDate: depStart,
        leg_label_zh: `单程/进岛：${home}→KEF`,
      },
    ];
  }

  const cnPair = resolveChinaDomesticFlightCities(msg);
  if (cnPair && /(?:机票|航班|舱位|查飞|飞)/.test(msg)) {
    return [
      {
        origin: cnPair.originZh,
        destination: cnPair.destinationZh,
        departureDate: depStart,
        leg_label_zh: `国内：${cnPair.originZh}→${cnPair.destinationZh}`,
      },
    ];
  }

  return null;
}
