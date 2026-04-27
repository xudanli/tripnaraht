import {
  countNegativeClarificationSinceLastEarlyWarning,
  pickNarratorHintTemplate,
  resolvePersuasionTierFromRejections,
  resolvePersuasionTierFromContext,
} from './persuasion-tier.util';

describe('persuasion-tier.util', () => {
  it('counts negative clarification feedback since last early warning', () => {
    const log = [
      { metadata: { system_action: 'EARLY_WARNING' } },
      { metadata: { system_action: 'CLARIFICATION_FEEDBACK', reward: 0 } },
      { metadata: { system_action: 'CLARIFICATION_FEEDBACK', reward: -1 } },
      { metadata: { system_action: 'CLARIFICATION_FEEDBACK', reward: 1 } },
    ];
    expect(countNegativeClarificationSinceLastEarlyWarning(log as any)).toBe(2);
  });

  it('maps rejection rounds to tiers', () => {
    expect(resolvePersuasionTierFromRejections(0)).toBe(1);
    expect(resolvePersuasionTierFromRejections(1)).toBe(2);
    expect(resolvePersuasionTierFromRejections(2)).toBe(3);
  });

  it('respects forced persuasion_tier in context', () => {
    expect(resolvePersuasionTierFromContext({ persuasion_tier: 2, decision_log: [] })).toBe(2);
  });

  it('picks narrator_hints_by_tier with legacy fallback', () => {
    const cond = {
      narrator_hint: 'legacy',
      narrator_hints_by_tier: { '1': 't1', '2': 't2', '3': 't3' },
    };
    expect(pickNarratorHintTemplate(cond, 2)).toBe('t2');
    const onlyLegacy = { narrator_hint: 'only' };
    expect(pickNarratorHintTemplate(onlyLegacy, 3)).toBe('only');
  });
});
