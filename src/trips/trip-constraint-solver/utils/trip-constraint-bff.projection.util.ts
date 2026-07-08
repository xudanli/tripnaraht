/**
 * TripConstraint BFF 投影 — 判定规则 / 违反结果 / scope 标签 SSOT
 */

import {
  getConstraintTemplate,
  projectCatalogTemplateForBff,
} from './constraint-template-registry.util';
import type {
  TripConstraint,
  TripConstraintContractMeta,
  ViolationResultCode,
  DestinationRuleTier,
} from '../types/trip-constraint.types';
import { TRIP_CONSTRAINT_LEGACY_IDS as LEGACY_IDS } from '../types/trip-constraint.types';
import { projectDestinationRuleForBff } from './destination-rule-bff.projection.util';
import {
  formatConstraintScopeSummary,
  readScopeBindingFromValue,
} from './constraint-scope-binding.util';
import { softConstraintDescription } from './soft-constraint-evaluation.util';

const VIOLATION_LABELS: Record<ViolationResultCode, string> = {
  BLOCK: '阻断执行',
  CONFIRM: '需确认后调整',
};

function violationLabel(code: ViolationResultCode): string {
  return VIOLATION_LABELS[code];
}

function resolveViolation(c: TripConstraint): ViolationResultCode {
  if (c.source.type === 'OFFICIAL_RULE') {
    const raw = c.value as { destinationRuleTier?: DestinationRuleTier; severity?: string } | undefined;
    if (raw?.destinationRuleTier) {
      return raw.destinationRuleTier === 'BLOCK' ? 'BLOCK' : 'CONFIRM';
    }
    const sev = raw?.severity;
    return sev === 'WARNING' ? 'CONFIRM' : 'BLOCK';
  }
  if (c.type === 'HARD' && !c.allowRelaxation) return 'BLOCK';
  if (c.type === 'HARD' && c.allowRelaxation) return 'CONFIRM';
  if (c.type === 'SOFT') return 'CONFIRM';
  return 'BLOCK';
}

export function buildScopeLabel(scope: TripConstraint['scope']): string {
  switch (scope.type) {
    case 'TRIP':
      return '整趟行程';
    case 'DAY':
      return scope.ids?.length ? `第 ${scope.ids.join('、')} 天` : '指定天数';
    case 'MEMBER':
      return scope.ids?.length ? '指定成员' : '团队成员';
    case 'MEMBER_GROUP':
      return '成员组';
    case 'ROUTE_SEGMENT':
      return '路线分段';
    case 'ITEM':
      return '指定行程项';
    case 'DOMAIN':
      return '目的地规则';
    case 'PLAN':
      return '规划阶段';
    default:
      return '行程范围';
  }
}

function mergeValue(
  base: Record<string, unknown>,
  judgmentRule: string,
  violationResult: ViolationResultCode,
): Record<string, unknown> {
  const scopeBinding = base.scopeBinding;
  const merged: Record<string, unknown> = {
    ...base,
    judgmentRule,
    violationResult: violationLabel(violationResult),
    rule: judgmentRule,
    violation: violationLabel(violationResult),
  };
  if (scopeBinding !== undefined) merged.scopeBinding = scopeBinding;
  return merged;
}

function templateIdFor(c: TripConstraint): string | undefined {
  if (c.source.templateId) return c.source.templateId;
  if (c.id.startsWith('c_official_')) {
    return (c.value as { ruleId?: string })?.ruleId ?? c.id.replace(/^c_official_/, '');
  }
  if (c.id.startsWith('c_tpl_')) {
    return c.id.replace(/^c_tpl_/, '');
  }
  const legacyMap: Record<string, string> = {
    [LEGACY_IDS.NO_NIGHT_DRIVE]: 'no_night_drive',
    [LEGACY_IDS.MAX_DAILY_DRIVE]: 'max_daily_drive',
    [LEGACY_IDS.BUDGET_TOTAL]: 'budget_total',
    [LEGACY_IDS.MAX_SEGMENT_DISTANCE]: 'max_segment_distance',
    [LEGACY_IDS.TIME_RANGE]: 'time_range',
    [LEGACY_IDS.TRAVELERS]: 'travelers',
    [LEGACY_IDS.TRANSPORT_MODE]: 'transport_mode',
    [LEGACY_IDS.DAILY_WALK_LIMIT]: 'daily_walk_limit',
    [LEGACY_IDS.MUST_PLACES]: 'must_places',
    [LEGACY_IDS.AVOID_PLACES]: 'avoid_places',
    [LEGACY_IDS.WORLD_FEASIBILITY]: 'world_feasibility',
  };
  return legacyMap[c.id] ?? (c.id.startsWith('c_custom_') ? 'custom' : undefined);
}

interface TemplateProjection {
  judgmentRule: string;
  displayValue?: string;
  value?: Record<string, unknown>;
}

function projectByTemplate(c: TripConstraint, templateId: string): TemplateProjection | undefined {
  const catalogDef = getConstraintTemplate(templateId);
  if (catalogDef) {
    const projected = projectCatalogTemplateForBff(c, catalogDef);
    return {
      judgmentRule: projected.judgmentRule,
      displayValue: projected.displayValue,
      value: projected.value,
    };
  }

  const violation = resolveViolation(c);
  const raw = c.value;

  switch (templateId) {
    case 'no_night_drive': {
      const cfg =
        raw && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : { maxMinutesAfterSunset: 30 };
      const mins = Number(cfg.maxMinutesAfterSunset ?? 30);
      const rule = `日落后 ${mins} 分钟不得继续驾驶`;
      return {
        judgmentRule: rule,
        displayValue: rule,
        value: mergeValue({ maxMinutesAfterSunset: mins }, rule, violation),
      };
    }
    case 'max_daily_drive': {
      const hours =
        typeof raw === 'number'
          ? raw
          : Number((raw as Record<string, unknown>)?.maxHours ?? raw);
      const rule = `单日驾驶时长不超过 ${hours} 小时`;
      return {
        judgmentRule: rule,
        displayValue: `${hours} 小时/天`,
        value: mergeValue({ maxHours: hours }, rule, violation),
      };
    }
    case 'budget_total': {
      const total = typeof raw === 'number' ? raw : Number((raw as Record<string, unknown>)?.total);
      const currency = c.unit ?? (raw as Record<string, unknown>)?.currency ?? 'CNY';
      const tolerance = Number((raw as Record<string, unknown>)?.overrunTolerancePct ?? 0);
      const rule =
        tolerance > 0
          ? `总预算不超过 ${total} ${currency}（允许临时超支 ${tolerance}%）`
          : `总预算不超过 ${total} ${currency}`;
      return {
        judgmentRule: rule,
        displayValue: `${total} ${currency}`,
        value: mergeValue(
          { total, currency, overrunTolerancePct: tolerance || undefined },
          rule,
          violation,
        ),
      };
    }
    case 'max_segment_distance': {
      const km = typeof raw === 'number' ? raw : Number((raw as Record<string, unknown>)?.maxKm);
      const rule = `相邻活动间单次驾驶距离不超过 ${km} km`;
      return {
        judgmentRule: rule,
        displayValue: `${km} km`,
        value: mergeValue({ maxSegmentDistanceKm: km }, rule, violation),
      };
    }
    case 'time_range': {
      const v = raw as Record<string, unknown>;
      const rule = `行程日期 ${v.startDate ?? ''} 至 ${v.endDate ?? ''}（${v.dayCount ?? '?'} 天）`;
      return { judgmentRule: rule, displayValue: `${v.dayCount ?? '?'} 天`, value: mergeValue(v, rule, violation) };
    }
    case 'daily_walk_limit': {
      const km = typeof raw === 'number' ? raw : Number(raw);
      const rule = `每日步行不超过 ${km} km`;
      return {
        judgmentRule: rule,
        displayValue: `${km} km/天`,
        value: mergeValue({ maxKm: km }, rule, violation),
      };
    }
    case 'must_places': {
      const places = Array.isArray(raw) ? raw : [];
      const rule = places.length ? `必去 ${places.length} 个地点必须覆盖` : '必去地点待确认';
      return { judgmentRule: rule, value: mergeValue({ places }, rule, violation) };
    }
    default:
      if (c.description) {
        return {
          judgmentRule: c.description,
          value: mergeValue(
            raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : { raw },
            c.description,
            violation,
          ),
        };
      }
      return undefined;
  }
}

export function projectTripConstraintForBff(c: TripConstraint): TripConstraint {
  if (c.source.type === 'OFFICIAL_RULE' || c.id.startsWith('c_official_')) {
    return projectDestinationRuleForBff(c);
  }

  const enabled = c.status !== 'DISABLED';
  const templateId = templateIdFor(c);
  const scopeBinding = readScopeBindingFromValue(c.value);
  const scopeLabel = scopeBinding
    ? formatConstraintScopeSummary(scopeBinding)
    : buildScopeLabel(c.scope);
  const violationResult = resolveViolation(c);

  const templated = templateId ? projectByTemplate(c, templateId) : undefined;
  const judgmentRule =
    templated?.judgmentRule ??
    (typeof c.value === 'object' &&
    c.value !== null &&
    typeof (c.value as Record<string, unknown>).judgmentRule === 'string'
      ? String((c.value as Record<string, unknown>).judgmentRule)
      : c.description ?? c.name);

  const enabledSummary = enabled ? `已启用：${c.name}` : `已停用：${c.name}`;

  const contractMeta: TripConstraintContractMeta = {
    enabledSummary,
    scopeLabel,
    judgmentRule,
    violationResult,
    violationResultLabel: violationLabel(violationResult),
  };

  let value: unknown = c.value;
  if (templated?.value) {
    value = templated.value;
  } else if (typeof c.value === 'object' && c.value !== null) {
    value = mergeValue(c.value as Record<string, unknown>, judgmentRule, violationResult);
  } else if (c.value != null) {
    value = mergeValue({ raw: c.value }, judgmentRule, violationResult);
  }

  return {
    ...c,
    enabled,
    displayValue: templated?.displayValue,
    value,
    description: c.description ?? softConstraintDescription(c) ?? getConstraintTemplate(templateId ?? '')?.description,
    source: {
      ...c.source,
      ...(templateId ? { templateId } : {}),
    },
    contractMeta,
    ...(c.type === 'SOFT' && c.status !== 'DISABLED' ? { sectionKey: 'soft_prefer' as const } : {}),
  };
}

export function projectTripConstraintsForBff(items: TripConstraint[]): TripConstraint[] {
  return items.map(projectTripConstraintForBff);
}
