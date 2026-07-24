/**
 * Map Destination Pack rules → TravelCausalRule (Loop 3 lifecycle registry).
 */

import type { DestinationPackRule } from '../../decision-runtime/packs/rules/destination-rule.types';
import { STANDARD_CAUSAL_CASE_IDS } from '../fixtures/case-ids';
import {
  TRAVEL_CAUSAL_RULE_SCHEMA,
  type CausalRuleBasis,
  type TravelCausalRule,
} from '../types/travel-causal-rule.types';

const PACK_RULE_VERSION = '1.0.0';
const VALID_FROM = '2026-01-01T00:00:00.000Z';

function basisForPackRule(rule: DestinationPackRule): CausalRuleBasis {
  const key = `${rule.semanticKey} ${rule.ruleId}`.toUpperCase();
  if (key.includes('ROAD') || key.includes('REGULATION') || key.includes('PERMIT')) {
    return 'REGULATION';
  }
  if (key.includes('WEATHER') || key.includes('WIND') || key.includes('LOAD') || key.includes('FATIGUE')) {
    return 'PHYSICAL';
  }
  if (key.includes('RENTAL') || key.includes('OPERATOR')) {
    return 'OPERATOR_POLICY';
  }
  return 'DOMAIN_EXPERT';
}

function caseTagsForPackRule(rule: DestinationPackRule): string[] {
  const key = `${rule.semanticKey} ${rule.ruleId}`.toUpperCase();
  const tags: string[] = [];
  if (
    key.includes('WEATHER') ||
    key.includes('WIND') ||
    key.includes('TRANSPORT_BUFFER') ||
    key.includes('APPOINTMENT')
  ) {
    tags.push(STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT);
  }
  if (key.includes('ROAD') || key.includes('CLOSED') || key.includes('RESTRICTED')) {
    tags.push(STANDARD_CAUSAL_CASE_IDS.ROAD_CLOSURE_OVERNIGHT);
  }
  if (key.includes('LOAD') || key.includes('FATIGUE') || key.includes('DRIVE')) {
    tags.push(STANDARD_CAUSAL_CASE_IDS.MEMBER_FATIGUE);
  }
  return tags;
}

function effectTypeFromResult(rule: DestinationPackRule): string {
  return rule.result.constraintCode ?? rule.result.reasonCode ?? rule.semanticKey;
}

/**
 * Convert a single DestinationPackRule into an APPROVED TravelCausalRule.
 */
export function mapPackRuleToTravelCausalRule(
  rule: DestinationPackRule,
  opts?: { destinationPack?: string; bundlePath?: string },
): TravelCausalRule {
  const pack = (
    opts?.destinationPack ??
    rule.appliesWhen?.country ??
    'IS'
  ).toUpperCase();

  return {
    schema: TRAVEL_CAUSAL_RULE_SCHEMA,
    ruleId: `pack:${rule.ruleId}`,
    version: PACK_RULE_VERSION,
    cause: rule.conditions.map((c) => ({
      predicateId: c.field,
      params: {
        operator: c.operator,
        ...(c.value !== undefined ? { value: c.value } : {}),
        ...(c.values ? { values: c.values } : {}),
      },
      label: `${c.field} ${c.operator} ${c.value ?? c.values?.join(',') ?? ''}`.trim(),
    })),
    effects: [
      {
        effectType: effectTypeFromResult(rule),
        affectedEntityType: rule.whenCandidateUsesRoute ? 'SEGMENT' : 'ACTIVITY',
        predictedChange: {
          verdict: rule.result.verdict,
          reasonCode: rule.result.reasonCode,
          overridable: rule.result.overridable,
          semanticKey: rule.semanticKey,
        },
        explanationKey: rule.result.reasonCode,
      },
    ],
    basis: basisForPackRule(rule),
    evidenceRefs: [
      `destination-pack:${pack}`,
      ...(rule.sdrRuleId ? [`sdr:${rule.sdrRuleId}`] : []),
      ...(opts?.bundlePath ? [`bundle:${opts.bundlePath}`] : []),
    ],
    validFrom: VALID_FROM,
    reviewStatus: 'APPROVED',
    confidence: rule.result.verdict === 'BLOCK' ? 0.92 : 0.8,
    destinationPack: pack,
    caseTags: caseTagsForPackRule(rule),
  };
}

export function mapPackRulesToTravelCausalRules(
  rules: DestinationPackRule[],
  opts?: { destinationPack?: string },
): TravelCausalRule[] {
  return rules.map((r) => mapPackRuleToTravelCausalRule(r, opts));
}
