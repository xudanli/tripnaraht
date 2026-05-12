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
  if (/(?:查|搜|找|看).{0,6}(?:机票|航班|舱位)/.test(m)) return true;
  if (/(?:机票|航班).{0,8}(?:价格|组合|可订|库存|时刻)/.test(m)) return true;
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
export function resolveFlightInventoryLegs(
  message: string,
  opts: { tripStartYmd?: string; tripEndYmd?: string },
): FlightInventoryLeg[] | null {
  const msg = message.trim();
  if (!msg) return null;

  const tripStart = opts.tripStartYmd?.slice(0, 10);
  const tripEnd = opts.tripEndYmd?.slice(0, 10);
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

  return null;
}
