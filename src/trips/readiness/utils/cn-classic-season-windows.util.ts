/**
 * 中国经典自驾季节窗（静态示意，非实时通告）。
 */
import * as fs from 'fs';
import * as path from 'path';

export type CnSeasonWindowKind = 'risk_window' | 'open_window';

export type CnClassicSeasonWindow = {
  routeId: string;
  id: string;
  kind: CnSeasonWindowKind;
  severity: 'low' | 'medium' | 'high';
  months: number[];
  summaryCN: string;
  summaryEN: string;
  outsideWindowSeverity?: 'low' | 'medium' | 'high';
  outsideWindowSummaryCN?: string;
  outsideWindowSummaryEN?: string;
  tags?: string[];
};

export type CnSeasonWindowHit = {
  windowId: string;
  kind: CnSeasonWindowKind;
  severity: 'low' | 'medium' | 'high';
  summaryCN: string;
  summaryEN: string;
  months: number[];
  overlappingMonths: number[];
  /** open_window 且行程落在开放月之外 */
  outsideOpenWindow: boolean;
  tags: string[];
};

type FileShape = {
  metadata?: { disclaimer?: string };
  windows: CnClassicSeasonWindow[];
};

let cached: FileShape | null = null;

function loadFile(): FileShape {
  if (cached) return cached;
  const filePath = path.join(
    process.cwd(),
    'data/country-packs/CN/classic-self-drive-season-windows.v1.json',
  );
  if (!fs.existsSync(filePath)) {
    cached = { windows: [] };
    return cached;
  }
  cached = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FileShape;
  return cached;
}

export function cnClassicSeasonWindowsDisclaimer(): string {
  return (
    loadFile().metadata?.disclaimer ||
    '季节窗为规划示意，非实时交警/气象通告。'
  );
}

export function listCnClassicSeasonWindows(
  routeId?: string | null,
): CnClassicSeasonWindow[] {
  const all = loadFile().windows ?? [];
  const id = (routeId ?? '').trim();
  if (!id) return all.slice();
  return all.filter((w) => w.routeId === id);
}

/** 从 ISO 日期区间提取覆盖的月份（1–12），含跨年 */
export function monthsCoveredByDateRange(
  startDate?: string | null,
  endDate?: string | null,
): number[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate) ?? start;
  if (!start) return [];
  const from = start;
  const to = end && end.getTime() >= from.getTime() ? end : from;
  const months: number[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const limit = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  // 防护：最多扫 24 个月；按行程时间顺序（跨年不按 1–12 重排）
  for (let i = 0; i < 24; i++) {
    months.push(cursor.getUTCMonth() + 1);
    if (cursor.getTime() >= limit.getTime()) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function parseIsoDate(value?: string | null): Date | null {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 相对行程日期评估季节窗命中。
 * - risk_window：行程月与风险月重叠 → hit
 * - open_window：行程月与开放月无交集 → outsideOpenWindow hit
 * 无日期时返回全部窗口（overlappingMonths 为空，供 catalog 展示）
 */
export function evaluateCnClassicSeasonWindows(input: {
  routeId: string;
  startDate?: string | null;
  endDate?: string | null;
}): CnSeasonWindowHit[] {
  const tripMonths = monthsCoveredByDateRange(input.startDate, input.endDate);
  const windows = listCnClassicSeasonWindows(input.routeId);
  const hits: CnSeasonWindowHit[] = [];

  for (const w of windows) {
    const monthSet = new Set(w.months);
    const overlapping = tripMonths.filter((m) => monthSet.has(m));

    if (!tripMonths.length) {
      hits.push({
        windowId: w.id,
        kind: w.kind,
        severity: w.severity,
        summaryCN: w.summaryCN,
        summaryEN: w.summaryEN,
        months: w.months.slice(),
        overlappingMonths: [],
        outsideOpenWindow: false,
        tags: w.tags?.slice() ?? [],
      });
      continue;
    }

    if (w.kind === 'risk_window') {
      if (!overlapping.length) continue;
      hits.push({
        windowId: w.id,
        kind: w.kind,
        severity: w.severity,
        summaryCN: w.summaryCN,
        summaryEN: w.summaryEN,
        months: w.months.slice(),
        overlappingMonths: overlapping,
        outsideOpenWindow: false,
        tags: w.tags?.slice() ?? [],
      });
      continue;
    }

    // open_window
    if (overlapping.length > 0) {
      hits.push({
        windowId: w.id,
        kind: w.kind,
        severity: 'low',
        summaryCN: w.summaryCN,
        summaryEN: w.summaryEN,
        months: w.months.slice(),
        overlappingMonths: overlapping,
        outsideOpenWindow: false,
        tags: w.tags?.slice() ?? [],
      });
    } else {
      hits.push({
        windowId: w.id,
        kind: w.kind,
        severity: w.outsideWindowSeverity ?? w.severity,
        summaryCN: w.outsideWindowSummaryCN ?? w.summaryCN,
        summaryEN: w.outsideWindowSummaryEN ?? w.summaryEN,
        months: w.months.slice(),
        overlappingMonths: [],
        outsideOpenWindow: true,
        tags: w.tags?.slice() ?? [],
      });
    }
  }

  return hits;
}
