import type { SplitMechanismMode } from '../../decision-profiling/types/decision-profiling.types';
import type {
  CategoryPaymentRule,
  PutWalletRuleInput,
} from '../types/travel-wallet.types';

/** Default hybrid breakdown from split-mechanism recommendations. */
export const DEFAULT_HYBRID_BREAKDOWN: Record<string, SplitMechanismMode> = {
  transportation: 'proportional',
  accommodation: 'split_aa',
  dining: 'rotating_treat',
  activities: 'split_aa',
};

export function consensusModeToCategoryRule(mode: SplitMechanismMode): CategoryPaymentRule {
  if (mode === 'rotating_treat' || mode === 'proportional') {
    return { type: 'one_pays' };
  }
  return { type: 'split_aa' };
}

export function categoryRulesFromHybridBreakdown(
  breakdown: Record<string, SplitMechanismMode>,
): Record<string, CategoryPaymentRule> {
  const rules: Record<string, CategoryPaymentRule> = {};
  for (const [category, mode] of Object.entries(breakdown)) {
    rules[category] = consensusModeToCategoryRule(mode);
  }
  return rules;
}

export function hybridBreakdownFromCategoryRules(
  rules: Record<string, CategoryPaymentRule> | null | undefined,
): Record<string, SplitMechanismMode> | undefined {
  if (!rules || Object.keys(rules).length === 0) return undefined;

  const out: Record<string, SplitMechanismMode> = {};
  for (const [category, rule] of Object.entries(rules)) {
    out[category] = rule.type === 'one_pays' ? 'rotating_treat' : 'split_aa';
  }
  return out;
}

export function buildWalletRuleFromConsensus(
  mode: SplitMechanismMode,
  memberCount: number,
  hybridBreakdown?: Record<string, SplitMechanismMode>,
): PutWalletRuleInput {
  const splitBase = memberCount;

  switch (mode) {
    case 'split_aa':
      return { mode: 'split_aa', splitBase, categoryRules: null };
    case 'hybrid':
      return {
        mode: 'by_category',
        splitBase,
        categoryRules: categoryRulesFromHybridBreakdown(
          hybridBreakdown ?? DEFAULT_HYBRID_BREAKDOWN,
        ),
      };
    case 'rotating_treat':
    case 'proportional':
      return { mode: 'custom', splitBase, categoryRules: null };
    default:
      return { mode: 'split_aa', splitBase, categoryRules: null };
  }
}
