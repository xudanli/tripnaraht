/**
 * 目的地规则 BFF 投影 — OFFICIAL_RULE 与 hard_must_satisfy 分离
 */

import type {
  DestinationRuleTier,
  DestinationRuleVerificationStatus,
  TripConstraint,
  TripConstraintContractMeta,
  ViolationResultCode,
} from '../types/trip-constraint.types';

const VIOLATION_LABELS: Record<ViolationResultCode, string> = {
  BLOCK: '阻断执行',
  CONFIRM: '需确认后调整',
};

const TIER_VIOLATION_LABELS: Record<DestinationRuleTier, string> = {
  BLOCK: '阻断路线',
  CONDITIONAL: '检查条件是否满足',
  ADVISORY: '影响风险评分',
};

export function mapSeverityToDestinationRuleTier(
  severity: 'CRITICAL' | 'WARNING' | undefined,
  explicit?: DestinationRuleTier,
): DestinationRuleTier {
  if (explicit) return explicit;
  return severity === 'WARNING' ? 'ADVISORY' : 'BLOCK';
}

export function mapTierToViolationResultCode(tier: DestinationRuleTier): ViolationResultCode {
  return tier === 'BLOCK' ? 'BLOCK' : 'CONFIRM';
}

export function resolveDestinationRuleVerificationStatus(
  c: TripConstraint,
): DestinationRuleVerificationStatus {
  if (c.status === 'OUTDATED') return 'OUTDATED';
  if (c.status === 'DRAFT') return 'PENDING';
  const raw = c.value as { verificationStatus?: string } | undefined;
  if (raw?.verificationStatus === 'OUTDATED') return 'OUTDATED';
  if (raw?.verificationStatus === 'PENDING') return 'PENDING';
  return 'CURRENT';
}

function readDestinationRuleValue(c: TripConstraint): Record<string, unknown> {
  return c.value && typeof c.value === 'object' ? (c.value as Record<string, unknown>) : {};
}

export function projectDestinationRuleForBff(c: TripConstraint): TripConstraint {
  const raw = readDestinationRuleValue(c);
  const tier = mapSeverityToDestinationRuleTier(
    raw.severity as 'CRITICAL' | 'WARNING' | undefined,
    raw.destinationRuleTier as DestinationRuleTier | undefined,
  );
  const judgmentRule =
    typeof raw.judgmentRule === 'string'
      ? raw.judgmentRule
      : c.description ?? c.name;
  const violationResultLabel =
    typeof raw.violationResult === 'string' ? raw.violationResult : TIER_VIOLATION_LABELS[tier];
  const violationCode = mapTierToViolationResultCode(tier);
  const verificationStatus = resolveDestinationRuleVerificationStatus(c);
  const scopeLabel =
    typeof raw.applicableScope === 'string'
      ? raw.applicableScope
      : c.scope.type === 'DOMAIN'
        ? '目的地规则'
        : c.scope.type === 'ITEM'
          ? '指定景点'
          : '行程范围';
  const enabled = c.status !== 'DISABLED';

  const tripImpact =
    typeof raw.tripImpact === 'string'
      ? raw.tripImpact
      : c.hasConflict
        ? `当前方案可能违反「${c.name}」，请调整路线或刷新证据`
        : undefined;

  const value = {
    ...raw,
    destinationRuleCategory: raw.destinationRuleCategory ?? 'REGULATION',
    destinationRuleTier: tier,
    judgmentRule,
    violationResult: violationResultLabel,
    rule: judgmentRule,
    violation: violationResultLabel,
    ...(tripImpact ? { tripImpact } : {}),
  };

  const contractMeta: TripConstraintContractMeta = {
    enabledSummary: enabled ? `已生效：${c.name}` : `已停用：${c.name}`,
    scopeLabel: typeof raw.applicableScope === 'string' ? raw.applicableScope : scopeLabel,
    judgmentRule,
    violationResult: violationCode,
    violationResultLabel,
  };

  return {
    ...c,
    type: 'EXTERNAL',
    enabled,
    locked: true,
    sectionKey: 'readonly_official',
    verificationStatus,
    displayValue: typeof raw.applicableScope === 'string' ? raw.applicableScope : undefined,
    value,
    source: {
      ...c.source,
      type: 'OFFICIAL_RULE',
      templateId:
        c.source.templateId ??
        (typeof raw.templateId === 'string' ? raw.templateId : undefined),
    },
    contractMeta,
    cardTone: c.hasConflict
      ? tier === 'BLOCK'
        ? 'danger'
        : 'caution'
      : tier === 'ADVISORY'
        ? 'default'
        : 'default',
  };
}

export function projectDestinationRulesForBff(items: TripConstraint[]): TripConstraint[] {
  return items.map((c) =>
    c.source.type === 'OFFICIAL_RULE' || c.id.startsWith('c_official_')
      ? projectDestinationRuleForBff(c)
      : c,
  );
}
