import { loadCountryPackRules } from './pack-rule-bundle.loader';
import {
  applyPackRuleToCandidate,
  findFirstMatchingPackRule,
} from './pack-rule-evaluator';

describe('Destination pack rules (RFC-002 Phase 2)', () => {
  it('RULE-001: loads IS road rules from country pack', () => {
    const rules = loadCountryPackRules('IS');
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules.some((r) => r.ruleId === 'IS_ROAD_CLOSED_BLOCK')).toBe(true);
  });

  it('RULE-002: CLOSED + uses route → BLOCK', () => {
    const rules = loadCountryPackRules('IS');
    const ctx = {
      country: 'IS',
      facts: { road: { status: 'CLOSED' } },
      candidateUsesRoute: true,
    };
    const rule = findFirstMatchingPackRule(rules, ctx, 'ROAD_SEGMENT_UNAVAILABLE');
    expect(rule?.ruleId).toBe('IS_ROAD_CLOSED_BLOCK');
    const applied = applyPackRuleToCandidate(rule!, ctx);
    expect(applied?.verdict).toBe('BLOCK');
    expect(applied?.overridable).toBe(false);
  });

  it('RULE-003: CLOSED + bypass route → PASS', () => {
    const rules = loadCountryPackRules('IS');
    const ctx = {
      country: 'IS',
      facts: { road: { status: 'CLOSED' } },
      candidateUsesRoute: false,
    };
    const rule = findFirstMatchingPackRule(rules, ctx, 'ROAD_SEGMENT_UNAVAILABLE');
    const applied = applyPackRuleToCandidate(rule!, ctx);
    expect(applied?.verdict).toBe('PASS');
    expect(applied?.constraintCode).toBe('ROAD_BYPASS');
  });

  it('RULE-004: LIMITED + uses route → WARNING overridable', () => {
    const rules = loadCountryPackRules('IS');
    const ctx = {
      country: 'IS',
      facts: { road: { status: 'LIMITED' } },
      candidateUsesRoute: true,
    };
    const rule = findFirstMatchingPackRule(rules, ctx, 'ROAD_SEGMENT_RESTRICTED');
    expect(rule?.ruleId).toBe('IS_ROAD_LIMITED_WARN');
    const applied = applyPackRuleToCandidate(rule!, ctx);
    expect(applied?.verdict).toBe('WARNING');
    expect(applied?.overridable).toBe(true);
  });

  it('RULE-005: excessive daily load + uses route → BLOCK', () => {
    const rules = loadCountryPackRules('IS');
    const ctx = {
      country: 'IS',
      facts: {
        driving: { hours: 10, thresholdHours: 8, dayIndex: 1, excessive: true },
        load: { physicalLoad: 1.25 },
        candidate: { isSplitDay: false, id: 'original' },
      },
      candidateUsesRoute: true,
    };
    const rule = findFirstMatchingPackRule(rules, ctx, 'EXCESSIVE_DAILY_LOAD');
    expect(rule?.ruleId).toBe('IS_DAILY_LOAD_EXCESSIVE_BLOCK');
    const applied = applyPackRuleToCandidate(rule!, ctx);
    expect(applied?.verdict).toBe('BLOCK');
    expect(applied?.overridable).toBe(false);
  });
});
