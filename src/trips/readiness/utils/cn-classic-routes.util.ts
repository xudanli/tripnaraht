/**
 * 中国经典/小众自驾线识别与 readiness finding。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ReadinessFindingItem } from '../types/readiness-findings.types';

export type CnClassicRouteTier = 'classic' | 'niche' | 'seasonal_classic';

export type CnClassicRoute = {
  id: string;
  aliases: string[];
  nameCN: string;
  nameEN: string;
  tier: CnClassicRouteTier;
  regions: string[];
  typicalDays?: number[];
  distanceKmHint?: number;
  severity: 'low' | 'medium' | 'high';
  summaryCN: string;
  summaryEN: string;
  mustHintsCN?: string[];
  anchorPlaces?: string[];
  /** 与 Match Square destinationSubScopeId 对齐 */
  taxonomySubScopeId?: string;
};

type FileShape = {
  metadata?: { disclaimer?: string };
  routes: CnClassicRoute[];
};

let cached: FileShape | null = null;

function loadFile(): FileShape {
  if (cached) return cached;
  const filePath = path.join(
    process.cwd(),
    'data/country-packs/CN/classic-self-drive-routes.v1.json',
  );
  if (!fs.existsSync(filePath)) {
    cached = { routes: [] };
    return cached;
  }
  cached = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FileShape;
  return cached;
}

export function listCnClassicRoutes(): CnClassicRoute[] {
  return loadFile().routes.slice();
}

export function getCnClassicRouteById(
  routeId: string | null | undefined,
): CnClassicRoute | null {
  const id = (routeId ?? '').trim();
  if (!id) return null;
  return listCnClassicRoutes().find((r) => r.id === id) ?? null;
}

export function cnClassicRoutesDisclaimer(): string {
  return (
    loadFile().metadata?.disclaimer ||
    '静态骨架，非实时路况；以当地交警与气象通告为准。'
  );
}

/** 别名按长度降序，避免「3」误伤「318」以外的数字；匹配时要求词界或中文邻接 */
function aliasPattern(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 纯数字别名：要求前后为非数字（G318 / 走318 / 318川藏）
  if (/^\d+$/.test(alias)) {
    return new RegExp(`(?<!\\d)${escaped}(?!\\d)`, 'i');
  }
  return new RegExp(escaped, 'i');
}

export function matchCnClassicRoutes(
  hints: Array<string | null | undefined> | null | undefined,
): CnClassicRoute[] {
  const blob = (hints ?? []).map((h) => String(h || '')).filter(Boolean).join(' ');
  if (!blob.trim()) return [];

  const hits: CnClassicRoute[] = [];
  for (const route of listCnClassicRoutes()) {
    const matched = route.aliases.some((a) => aliasPattern(a).test(blob));
    const anchorHit =
      !matched &&
      (route.anchorPlaces ?? []).filter((p) => p && blob.includes(p)).length >= 2;
    if (matched || anchorHit) hits.push(route);
  }
  return hits;
}

export function classicRoutesWantXizang(routes: CnClassicRoute[]): boolean {
  return routes.some((r) => r.regions.includes('xizang'));
}

export function classicRoutesWantSichuan(routes: CnClassicRoute[]): boolean {
  return routes.some((r) => r.regions.includes('sichuan'));
}

export function buildCnClassicRouteFindingItems(
  routes: CnClassicRoute[],
  lang: 'en' | 'zh' = 'zh',
): ReadinessFindingItem[] {
  const disclaimer = cnClassicRoutesDisclaimer();
  return routes.map((route) => {
    const hints =
      lang === 'zh'
        ? (route.mustHintsCN ?? []).slice(0, 3).join('；')
        : route.summaryEN;
    const message =
      lang === 'zh'
        ? `经典自驾线「${route.nameCN}」：${route.summaryCN}${hints ? ` 要点：${hints}。` : ' '}（${disclaimer}）`
        : `Classic self-drive «${route.nameEN}»: ${route.summaryEN} (${disclaimer})`;

    return {
      id: `rule.${route.id}`,
      category: 'logistics',
      severity: route.severity,
      level: route.severity === 'high' ? 'must' : 'should',
      message,
      evidence: [
        {
          sourceId: 'src.cn.classic_self_drive_routes',
          quote: route.id,
        },
      ],
    };
  });
}

export type CnClassicDayStop = {
  day: number;
  from: string;
  to: string;
  driveKmHint?: number;
  overnight?: string;
  highlights?: string[];
  notesCN?: string;
};

export type CnClassicDaySkeletonVariant = {
  id: string;
  days: number;
  labelCN: string;
  labelEN?: string;
  stops: CnClassicDayStop[];
};

type SkeletonFileShape = {
  metadata?: { disclaimer?: string };
  skeletons: Record<
    string,
    { defaultVariantId?: string; variants: CnClassicDaySkeletonVariant[] }
  >;
};

let skeletonCached: SkeletonFileShape | null = null;

function loadSkeletonFile(): SkeletonFileShape {
  if (skeletonCached) return skeletonCached;
  const filePath = path.join(
    process.cwd(),
    'data/country-packs/CN/classic-self-drive-day-skeletons.v1.json',
  );
  if (!fs.existsSync(filePath)) {
    skeletonCached = { skeletons: {} };
    return skeletonCached;
  }
  skeletonCached = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SkeletonFileShape;
  return skeletonCached;
}

/** 从用户话术里粗提天数（如「8日」「10天」） */
export function extractRequestedTripDays(blob: string): number | null {
  const m = blob.match(/(\d{1,2})\s*(?:日|天)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 2 && n <= 40 ? n : null;
}

export function listCnClassicDaySkeletonVariants(
  routeId: string,
): CnClassicDaySkeletonVariant[] {
  const entry = loadSkeletonFile().skeletons[routeId];
  return entry?.variants?.length ? entry.variants.slice() : [];
}

export function pickCnClassicDaySkeletonVariant(
  routeId: string,
  preferredDays?: number | null,
): CnClassicDaySkeletonVariant | null {
  const variants = listCnClassicDaySkeletonVariants(routeId);
  if (!variants.length) return null;
  if (preferredDays != null) {
    let best = variants[0];
    let bestDiff = Math.abs(best.days - preferredDays);
    for (const v of variants) {
      const d = Math.abs(v.days - preferredDays);
      if (d < bestDiff) {
        best = v;
        bestDiff = d;
      }
    }
    return best;
  }
  const entry = loadSkeletonFile().skeletons[routeId];
  const def = entry?.defaultVariantId
    ? variants.find((v) => v.id === entry.defaultVariantId)
    : null;
  return def ?? variants[0];
}

export function formatCnClassicDaySkeletonLines(
  route: CnClassicRoute,
  variant: CnClassicDaySkeletonVariant,
): string[] {
  const lines = [
    `【经典自驾参考骨架 · ${route.nameCN} · ${variant.labelCN}】`,
    loadSkeletonFile().metadata?.disclaimer ||
      '参考骨架，非强制行程；须按季节与路况裁剪。',
  ];
  for (const s of variant.stops) {
    const hi = (s.highlights ?? []).join('、');
    const km = s.driveKmHint != null ? `${s.driveKmHint}km` : '';
    const note = s.notesCN ? `；${s.notesCN}` : '';
    lines.push(
      `D${s.day} ${s.from}→${s.to}${km ? `（${km}）` : ''}` +
        `${hi ? `｜${hi}` : ''}` +
        `${s.overnight && s.overnight !== '—' ? `｜宿${s.overnight}` : ''}` +
        note,
    );
  }
  return lines;
}

/**
 * 命中经典线时生成咨询用摘录（可无 tripId）。
 * 多线命中时只展开第一条有骨架的路线，避免 prompt 过长。
 */
export function formatCnClassicRoutePromptSupplement(
  hints: Array<string | null | undefined> | null | undefined,
): string | null {
  const routes = matchCnClassicRoutes(hints);
  if (!routes.length) return null;
  const blob = (hints ?? []).map((h) => String(h || '')).join(' ');
  const days = extractRequestedTripDays(blob);
  for (const route of routes) {
    const variant = pickCnClassicDaySkeletonVariant(route.id, days);
    if (!variant) continue;
    return formatCnClassicDaySkeletonLines(route, variant).join('\n');
  }
  // 无骨架时仍给路线摘要
  const r = routes[0];
  return `【经典自驾线 · ${r.nameCN}】${r.summaryCN}`;
}
