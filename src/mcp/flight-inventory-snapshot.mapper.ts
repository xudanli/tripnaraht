/**
 * 航班库存快照：结构化样本报价（供前端「实时航班摘录」卡片字段）。
 * Amadeus Flight Offers + Flight MCP（Kiwi 风格）尽力解析。
 */

import type { AmadeusDirectFlightOffer } from './amadeus-direct.service';

/** 与 route_and_run payload.flight_inventory_snapshot.legs[].sample_offers 对齐 */
export type FlightInventorySampleOffer = {
  rank: number;
  price_total?: string;
  currency?: string;
  duration?: string;
  one_way?: boolean;
  /** 人类可读一行（MCP 结构多变时的兜底） */
  summary_line?: string;
  segments?: Array<{
    departure_airport?: string;
    arrival_airport?: string;
    departure_at?: string;
    arrival_at?: string;
    carrier_code?: string;
    flight_number?: string;
    cabin?: string;
  }>;
};

export function mapAmadeusOffersToSampleCards(
  offers: AmadeusDirectFlightOffer[],
  max = 3,
): FlightInventorySampleOffer[] {
  return offers.slice(0, max).map((o, i) => mapOneAmadeusOffer(o, i + 1));
}

function mapOneAmadeusOffer(o: AmadeusDirectFlightOffer, rank: number): FlightInventorySampleOffer {
  const it0 = o.itineraries?.[0];
  const segs = it0?.segments ?? [];
  const fareDetails = o.travelerPricings?.[0]?.fareDetailsBySegment ?? [];
  const segments = segs.map((s, idx) => ({
    departure_airport: s.departure?.iataCode,
    arrival_airport: s.arrival?.iataCode,
    departure_at: s.departure?.at,
    arrival_at: s.arrival?.at,
    carrier_code: s.carrierCode,
    flight_number:
      s.carrierCode && s.number ? `${s.carrierCode}${String(s.number)}` : s.number ? String(s.number) : undefined,
    cabin: fareDetails[idx]?.cabin,
  }));
  return {
    rank,
    price_total: o.price?.grandTotal ?? o.price?.total,
    currency: o.price?.currency,
    duration: it0?.duration,
    one_way: o.oneWay,
    segments: segments.length ? segments : undefined,
  };
}

/** MCP callTool 原始结果 → 文本 → JSON 数组（与 flight-mcp.service 解析路径一致） */
function extractMcpToolText(result: unknown): string | null {
  if (result == null) return null;
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  const parts = r.content;
  if (!Array.isArray(parts)) return typeof result === 'string' ? result : JSON.stringify(result);
  const texts = parts.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text!);
  return texts.length ? texts.join('\n') : JSON.stringify(result);
}

function extractFlightArrayFromJson(j: Record<string, unknown>): unknown[] {
  for (const key of ['flights', 'results', 'searchResults', 'data'] as const) {
    const v = j[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray((v as { data?: unknown[] }).data)) {
      return (v as { data: unknown[] }).data;
    }
  }
  return [];
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && typeof v[0] === 'string') return (v as string[]).join('/');
  }
  return undefined;
}

function pickNum(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^[\d.]+$/.test(v)) return Number(v);
  }
  return undefined;
}

function summarizeKiwiRow(row: Record<string, unknown>, rank: number): string {
  const price =
    pickNum(row, ['price', 'total_price', 'fare', 'amount']) ??
    (row.conversion && typeof row.conversion === 'object'
      ? pickNum(row.conversion as Record<string, unknown>, ['EUR', 'USD'])
      : undefined);
  const cur = pickStr(row, ['currency', 'curr']) ?? '';
  const dur = pickStr(row, ['duration', 'fly_duration']) ?? '';
  const from = pickStr(row, ['flyFrom', 'cityFrom', 'origin']);
  const to = pickStr(row, ['flyTo', 'cityTo', 'destination']);
  const route = from || to ? `${from ?? '?'}→${to ?? '?'}` : '';
  const bits = [
    cur && price != null ? `${cur} ${price}` : price != null ? String(price) : '',
    dur,
    route,
  ]
    .filter(Boolean)
    .join(' · ');
  return bits ? `[${rank}] ${bits}` : `[${rank}] ·`;
}

function mapKiwiLikeRow(row: unknown, rank: number): FlightInventorySampleOffer {
  if (row == null || typeof row !== 'object') {
    return { rank, summary_line: `[${rank}] ${String(row)}` };
  }
  const o = row as Record<string, unknown>;
  const conv = o.conversion && typeof o.conversion === 'object' ? (o.conversion as Record<string, unknown>) : null;
  const eur = conv ? pickNum(conv, ['EUR']) : undefined;
  const usd = conv ? pickNum(conv, ['USD']) : undefined;
  const priceNum = pickNum(o, ['price', 'total_price']) ?? eur ?? usd;
  const currency =
    pickStr(o, ['currency', 'curr']) ?? (eur != null ? 'EUR' : usd != null ? 'USD' : undefined);
  const dur =
    pickStr(o, ['duration', 'fly_duration']) ??
    (typeof o.duration === 'object' && o.duration !== null
      ? pickStr(o.duration as Record<string, unknown>, ['total_seconds'])
      : undefined);

  const flyFrom = pickStr(o, ['flyFrom', 'origin']);
  const flyTo = pickStr(o, ['flyTo', 'destination']);
  const depLocal = pickStr(o, ['local_departure', 'utc_departure', 'departure_time']);
  const arrLocal = pickStr(o, ['local_arrival', 'utc_arrival', 'arrival_time']);

  const segments: NonNullable<FlightInventorySampleOffer['segments']> = [];
  if (flyFrom || flyTo || depLocal || arrLocal) {
    segments.push({
      departure_airport: flyFrom,
      arrival_airport: flyTo,
      departure_at: depLocal,
      arrival_at: arrLocal,
    });
  }

  const routes = o.routes;
  if (Array.isArray(routes) && routes.length && segments.length === 0) {
    for (const leg of routes) {
      if (Array.isArray(leg) && leg.length >= 2) {
        const a = leg[0];
        const b = leg[leg.length - 1];
        if (typeof a === 'string' && typeof b === 'string') {
          segments.push({ departure_airport: a, arrival_airport: b });
        }
      }
    }
  }

  const airlines = o.airlines;
  if (Array.isArray(airlines) && airlines.length && segments[0]) {
    const ac = typeof airlines[0] === 'string' ? airlines[0] : String(airlines[0]);
    segments[0].carrier_code = ac;
  }

  return {
    rank,
    price_total: priceNum != null ? String(priceNum) : undefined,
    currency,
    duration: dur,
    segments: segments.length ? segments : undefined,
    summary_line: summarizeKiwiRow(o, rank),
  };
}

function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith('```')) return t;
  const withoutOpen = t.replace(/^```(?:json)?\s*\n?/i, '');
  const endFence = withoutOpen.lastIndexOf('```');
  return (endFence >= 0 ? withoutOpen.slice(0, endFence) : withoutOpen).trim();
}

export function parseFlightMcpToolResultToSampleOffers(result: unknown, max = 5): FlightInventorySampleOffer[] {
  const text = extractMcpToolText(result);
  if (!text?.trim()) return [];
  const rawText = stripMarkdownJsonFence(text);
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, max).map((row, i) => mapKiwiLikeRow(row, i + 1));
    }
    if (parsed && typeof parsed === 'object') {
      const arr = extractFlightArrayFromJson(parsed as Record<string, unknown>);
      return arr.slice(0, max).map((row, i) => mapKiwiLikeRow(row, i + 1));
    }
  } catch {
    /* fall through */
  }
  return [];
}

/**
 * 结构化解析为空或不全时，用 `sample_lines`（与传感器块一致的文本行）补齐卡片，
 * 保证 `sample_offers` 始终可供前端渲染（至少含 summary_line）。
 */
export function enrichSampleOffersFromLines(
  structured: FlightInventorySampleOffer[],
  sampleLines: string[],
  max = 5,
): FlightInventorySampleOffer[] {
  if (structured.length > 0) return structured.slice(0, max);
  const lines = sampleLines
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .slice(0, max);
  return lines.map((summary_line, i) => ({
    rank: i + 1,
    summary_line,
  }));
}

/** 识别 MCP/上游连接类噪音，避免把英文栈堆进 prompt 与前端 excerpt */
function looksLikeFlightUpstreamNoise(line: string): boolean {
  const t = line.trim();
  if (t.length > 360) return true;
  return (
    /\bHTTP\s*(404|403|502|503)\b/i.test(t) ||
    /POSTing\s+to\s+endpoint/i.test(t) ||
    /\bECONNREFUSED\b|\bENOTFOUND\b|\bETIMEDOUT\b|\bfetch failed\b/i.test(t) ||
    /\bSmithery\b.*\b(error|fail)/i.test(t) ||
    (/^\s*at\s+/m.test(t) && /\bError\b/.test(t))
  );
}

/**
 * MCP 失败分支写入传感器块 / snapshot 前调用：将 404、连接失败栈等替换为简短中文。
 * 正常报价行原样保留。
 */
export function sanitizeFlightInventoryLinesForUi(lines: string[]): string[] {
  if (!lines.length) return lines;
  const noisy = lines.some((line) => typeof line === 'string' && looksLikeFlightUpstreamNoise(line));
  if (!noisy) return lines;
  return [
    '航班检索上游暂时不可用（常见于 MCP 地址错误或 HTTP 404）。请核对 FLIGHT_MCP_URL、SMITHERY_API_KEY，或配置 Amadeus 作为回退。',
  ];
}
