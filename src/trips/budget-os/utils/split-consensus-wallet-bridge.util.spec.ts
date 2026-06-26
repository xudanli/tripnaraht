import {
  buildWalletRuleFromConsensus,
  categoryRulesFromHybridBreakdown,
  DEFAULT_HYBRID_BREAKDOWN,
  hybridBreakdownFromCategoryRules,
} from './split-consensus-wallet-bridge.util';

describe('split-consensus-wallet-bridge.util', () => {
  it('maps split_aa to wallet split_aa', () => {
    expect(buildWalletRuleFromConsensus('split_aa', 4)).toEqual({
      mode: 'split_aa',
      splitBase: 4,
      categoryRules: null,
    });
  });

  it('maps hybrid to by_category with aligned categoryRules', () => {
    const rule = buildWalletRuleFromConsensus('hybrid', 3, DEFAULT_HYBRID_BREAKDOWN);
    expect(rule.mode).toBe('by_category');
    expect(rule.splitBase).toBe(3);
    expect(rule.categoryRules).toEqual(
      categoryRulesFromHybridBreakdown(DEFAULT_HYBRID_BREAKDOWN),
    );
    expect(rule.categoryRules?.transportation).toEqual({ type: 'one_pays' });
    expect(rule.categoryRules?.accommodation).toEqual({ type: 'split_aa' });
  });

  it('maps rotating_treat and proportional to custom', () => {
    expect(buildWalletRuleFromConsensus('rotating_treat', 2).mode).toBe('custom');
    expect(buildWalletRuleFromConsensus('proportional', 2).mode).toBe('custom');
  });

  it('round-trips hybrid breakdown from category rules for display', () => {
    const rules = categoryRulesFromHybridBreakdown(DEFAULT_HYBRID_BREAKDOWN);
    expect(hybridBreakdownFromCategoryRules(rules)).toEqual({
      transportation: 'rotating_treat',
      accommodation: 'split_aa',
      dining: 'rotating_treat',
      activities: 'split_aa',
    });
  });
});
