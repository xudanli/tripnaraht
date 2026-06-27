/**
 * 合并基础规则与官方公告动态覆盖
 */

import { DateTime } from 'luxon';
import type {
  PoiAccessRule,
  PoiAccessStatusOverride,
} from '../interfaces/poi-access-capacity.interface';

function overrideToRule(override: PoiAccessStatusOverride): PoiAccessRule {
  return {
    id: override.id,
    poiId: override.poiId,
    placeId: override.placeId,
    ruleType: override.ruleType,
    targetResource: override.targetResource,
    validFrom: override.effectiveFrom.slice(0, 10),
    validTo: override.effectiveTo?.slice(0, 10),
    status: 'ACTIVE',
    enforcement: override.enforcement ?? 'HARD',
    sourceAuthority: override.sourceAuthority,
    sourceUrl: override.sourceUrl,
    lastVerifiedAt: override.lastVerifiedAt,
    confidence: override.confidence,
    notes: override.notes,
  };
}

function overrideKey(o: {
  poiId: string;
  targetResource: string;
  ruleType: string;
}): string {
  return `${o.poiId}:${o.targetResource}:${o.ruleType}`;
}

function isOverrideInDateRange(
  override: PoiAccessStatusOverride,
  dateISO: string,
): boolean {
  const d = dateISO.slice(0, 10);
  const from = override.effectiveFrom.slice(0, 10);
  if (d < from) return false;
  if (override.effectiveTo && d > override.effectiveTo.slice(0, 10)) return false;
  return true;
}

/**
 * 将动态覆盖合并进规则集：
 * - ACTIVE 覆盖 → 替换同 key 基础规则并作为 ACTIVE 规则生效
 * - INACTIVE 覆盖 → 抑制同 key 基础规则（表示官方确认无此限制）
 */
export function mergeAccessRulesWithOverrides(
  baseRules: PoiAccessRule[],
  overrides: PoiAccessStatusOverride[] | undefined,
  dateISO: string,
): PoiAccessRule[] {
  if (!overrides?.length) return baseRules;

  const inRange = overrides.filter((o) => isOverrideInDateRange(o, dateISO));
  if (!inRange.length) return baseRules;

  const suppressedKeys = new Set<string>();
  const activeOverrideRules: PoiAccessRule[] = [];

  for (const override of inRange) {
    const key = overrideKey(override);
    if (override.status === 'INACTIVE') {
      suppressedKeys.add(key);
      continue;
    }
    suppressedKeys.add(key);
    activeOverrideRules.push(overrideToRule(override));
  }

  const filteredBase = baseRules.filter(
    (rule) => !suppressedKeys.has(overrideKey(rule)),
  );

  return [...filteredBase, ...activeOverrideRules];
}

/** 某条规则是否已超过核验有效期 */
export function isAccessRuleStale(
  rule: PoiAccessRule,
  staleDays: number,
  now = DateTime.utc(),
): boolean {
  const verified = DateTime.fromISO(rule.lastVerifiedAt, { zone: 'utc' });
  if (!verified.isValid) return true;
  return now.diff(verified, 'days').days > staleDays;
}
