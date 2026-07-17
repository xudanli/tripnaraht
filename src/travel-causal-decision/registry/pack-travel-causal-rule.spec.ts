import { loadCountryPackRules } from '../../decision-runtime/packs/rules/pack-rule-bundle.loader';
import { mapPackRuleToTravelCausalRule } from './map-pack-rule-to-travel-causal-rule';
import {
  clearPackTravelCausalRuleCache,
  loadPackTravelCausalRules,
} from './load-pack-causal-rules';
import { getTravelCausalRule, listTravelCausalRules } from './travel-causal-rule.registry';
import { STANDARD_CAUSAL_CASE_IDS } from '../fixtures/case-ids';

describe('Pack → TravelCausalRule migration', () => {
  beforeEach(() => {
    clearPackTravelCausalRuleCache();
  });

  it('maps IS_ROAD_CLOSED_BLOCK into APPROVED TravelCausalRule', () => {
    const packRules = loadCountryPackRules('IS');
    const road = packRules.find((r) => r.ruleId === 'IS_ROAD_CLOSED_BLOCK');
    expect(road).toBeDefined();
    const mapped = mapPackRuleToTravelCausalRule(road!, { destinationPack: 'IS' });
    expect(mapped.ruleId).toBe('pack:IS_ROAD_CLOSED_BLOCK');
    expect(mapped.reviewStatus).toBe('APPROVED');
    expect(mapped.basis).toBe('REGULATION');
    expect(mapped.caseTags).toContain(STANDARD_CAUSAL_CASE_IDS.ROAD_CLOSURE_OVERNIGHT);
    expect(mapped.cause[0]?.predicateId).toBe('road.status');
  });

  it('registry merges pack rules with standard cases', () => {
    const all = listTravelCausalRules({ destinationPack: 'IS', reviewStatus: 'APPROVED' });
    expect(all.some((r) => r.ruleId === 'is.wind.gust_reduces_speed')).toBe(true);
    expect(all.some((r) => r.ruleId === 'pack:IS_ROAD_CLOSED_BLOCK')).toBe(true);
    expect(all.some((r) => r.ruleId === 'pack:IS_WEATHER_HIGH_WIND_BLOCK')).toBe(true);
    expect(all.some((r) => r.ruleId === 'pack:IS_DAILY_LOAD_EXCESSIVE_BLOCK')).toBe(true);

    expect(getTravelCausalRule('pack:IS_ROAD_CLOSED_BLOCK')?.destinationPack).toBe('IS');
    expect(loadPackTravelCausalRules('IS').length).toBeGreaterThan(3);
  });

  it('caseTag filter still isolates standard wind chain rules', () => {
    const wind = listTravelCausalRules({
      caseTag: STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT,
      includePackRules: false,
    });
    expect(wind.every((r) => !r.ruleId.startsWith('pack:'))).toBe(true);
    expect(wind.length).toBeGreaterThanOrEqual(2);
  });
});
