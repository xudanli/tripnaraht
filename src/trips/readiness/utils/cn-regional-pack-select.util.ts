/**
 * 中国 ReadinessPack 区域选择：避免 destination=CN 时把西藏/四川规则叠到所有行程上。
 */
import type { ReadinessPack } from '../types/readiness-pack.types';
import type { ReadinessFindingItem } from '../types/readiness-findings.types';
import {
  cnCityDrivingLimitDisclaimer,
  lookupCnCityDrivingLimit,
} from './cn-city-driving-limits.util';
import {
  classicRoutesWantSichuan,
  classicRoutesWantXizang,
  matchCnClassicRoutes,
} from './cn-classic-routes.util';

export const CN_PACK_CHINA = 'pack.cn.china';
export const CN_PACK_XIZANG = 'pack.cn.xizang';
export const CN_PACK_SICHUAN = 'pack.cn.sichuan';

const XIZANG_HINTS =
  /西藏|拉萨|日喀则|林芝|那曲|昌都|阿里|青藏|川藏|新藏|滇藏|xizang|tibet|lhasa|shigatse|nyingchi|nagqu|chamdo|ngari|g\s*318|g\s*317|g\s*219/i;

const SICHUAN_HINTS =
  /四川|成都|川西|康定|稻城|亚丁|四姑娘|色达|理塘|甘孜|阿坝|川藏|sichuan|chengdu|kangding|daochen|yading|garze|aba|g\s*318|g\s*317/i;

export type CnRegionSelectInput = {
  destinationId?: string | null;
  /** 城市名、POI 名、用户消息等 */
  hints?: Array<string | null | undefined> | null;
};

export function buildCnRegionHintBlob(input: CnRegionSelectInput): string {
  const parts = [
    input.destinationId,
    ...(input.hints ?? []).map((h) => String(h || '')),
  ].filter(Boolean);
  return parts.join(' ');
}

export function detectCnWantsXizang(blob: string): boolean {
  return XIZANG_HINTS.test(blob);
}

export function detectCnWantsSichuan(blob: string): boolean {
  return SICHUAN_HINTS.test(blob);
}

/**
 * 从候选 CN packs 中选出应评估的子集。
 * - 始终保留 pack.cn.china（若存在）
 * - 命中西藏/川西提示时再叠加对应子 pack
 * - destinationId 精确为 CN-XIZANG / CN-SICHUAN 时强制叠加
 */
export function selectCnReadinessPacks(
  packs: ReadinessPack[],
  input: CnRegionSelectInput,
): ReadinessPack[] {
  if (!packs.length) return packs;

  const byId = new Map(packs.map((p) => [p.packId, p]));
  const blob = buildCnRegionHintBlob(input);
  const dest = String(input.destinationId || '').toUpperCase();

  const classicRoutes = matchCnClassicRoutes([blob]);
  const wantsXizang =
    detectCnWantsXizang(blob) ||
    classicRoutesWantXizang(classicRoutes) ||
    dest === 'CN-XIZANG' ||
    dest.includes('XIZANG') ||
    dest.includes('TIBET');
  const wantsSichuan =
    detectCnWantsSichuan(blob) ||
    classicRoutesWantSichuan(classicRoutes) ||
    dest === 'CN-SICHUAN' ||
    dest.includes('SICHUAN');

  const selectedIds: string[] = [];
  if (byId.has(CN_PACK_CHINA)) selectedIds.push(CN_PACK_CHINA);
  if (wantsXizang && byId.has(CN_PACK_XIZANG)) selectedIds.push(CN_PACK_XIZANG);
  if (wantsSichuan && byId.has(CN_PACK_SICHUAN)) selectedIds.push(CN_PACK_SICHUAN);

  // 若国家级缺失但命中区域，至少返回区域 pack；再否则原样返回
  if (!selectedIds.length) {
    if (wantsXizang && byId.has(CN_PACK_XIZANG)) return [byId.get(CN_PACK_XIZANG)!];
    if (wantsSichuan && byId.has(CN_PACK_SICHUAN)) return [byId.get(CN_PACK_SICHUAN)!];
    return packs;
  }

  return selectedIds.map((id) => byId.get(id)!).filter(Boolean);
}

/** 从 hints 中找第一条能命中限行表的城市 */
export function resolveCnDrivingLimitCity(
  hints: Array<string | null | undefined> | null | undefined,
): string | null {
  for (const h of hints ?? []) {
    const t = String(h || '').trim();
    if (!t) continue;
    if (lookupCnCityDrivingLimit(t)) return t;
    // 「北京五日」等短句：取前 2–3 字城市名尝试
    const m = t.match(
      /^(北京|上海|广州|深圳|杭州|成都|天津|西安|重庆|武汉|[A-Za-z]{3,20})/,
    );
    if (m?.[1] && lookupCnCityDrivingLimit(m[1])) return m[1];
  }
  return null;
}

export function buildCnDrivingLimitFindingItem(
  cityHint: string,
  lang: 'en' | 'zh' = 'zh',
): ReadinessFindingItem | null {
  const hit = lookupCnCityDrivingLimit(cityHint);
  if (!hit) return null;
  const disclaimer = cnCityDrivingLimitDisclaimer();
  const message =
    lang === 'zh'
      ? `${hit.cityCN}自驾限行提示：${hit.summaryCN}（${disclaimer}）`
      : `${hit.cityEN} driving limit hint: ${hit.summaryEN} (${disclaimer})`;

  return {
    id: `rule.cn.driving_limit.${hit.cityCN}`,
    category: 'logistics',
    severity: hit.severity,
    level: 'should',
    message,
    evidence: hit.officialHintUrl
      ? [{ sourceId: 'src.cn.city_driving_limits', quote: hit.officialHintUrl }]
      : undefined,
  };
}

export function collectCnContextHints(input: {
  destinationId?: string | null;
  activities?: string[] | null;
  placeNames?: string[] | null;
  userMessage?: string | null;
}): string[] {
  const out: string[] = [];
  if (input.destinationId) out.push(input.destinationId);
  for (const a of input.activities ?? []) if (a) out.push(a);
  for (const p of input.placeNames ?? []) if (p) out.push(p);
  if (input.userMessage) out.push(input.userMessage);
  // CN-Beijing / CN-上海
  const dest = String(input.destinationId || '');
  const rest = dest.includes('-') ? dest.split('-').slice(1).join('-') : '';
  if (rest) out.push(rest);
  return out;
}
