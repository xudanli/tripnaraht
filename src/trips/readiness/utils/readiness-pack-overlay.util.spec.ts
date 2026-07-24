import {
  filterPackRulesForOverlay,
  isProfileDerivableEntryTransitRule,
  mergeReadinessFindings,
} from './readiness-pack-overlay.util';
import type { Rule } from '../types/readiness-pack.types';
import type { ReadinessFinding } from '../types/readiness-findings.types';

describe('readiness-pack-overlay.util', () => {
  it('flags derivable entry_transit visa rules', () => {
    expect(
      isProfileDerivableEntryTransitRule({
        id: 'rule.visa.schengen',
        category: 'entry_transit',
        severity: 'high',
        then: { level: 'must', message: 'x' },
      } as Rule),
    ).toBe(true);
  });

  it('does not throw when entry_transit rule has no id', () => {
    expect(
      isProfileDerivableEntryTransitRule({
        category: 'entry_transit',
        severity: 'high',
        then: { level: 'must', message: 'x' },
      } as Rule),
    ).toBe(false);
    expect(
      filterPackRulesForOverlay([
        {
          category: 'entry_transit',
          severity: 'high',
          when: { seasonIn: { values: ['winter'] } },
          then: { level: 'must', message: 'x' },
        } as Rule,
      ]),
    ).toHaveLength(1);
  });

  it('keeps overlay rules with when and non-derivable id', () => {
    const rules: Rule[] = [
      {
        id: 'rule.visa.static',
        category: 'entry_transit',
        severity: 'high',
        when: { seasonIn: { values: ['winter'] } },
        then: { level: 'must', message: 'visa' },
      } as Rule,
      {
        id: 'rule.glacier.guide.required',
        category: 'activities_bookings',
        severity: 'high',
        when: { activityIn: { values: ['glacier'] } },
        then: { level: 'blocker', message: 'guide required' },
      } as Rule,
      {
        id: 'rule.no-when',
        category: 'safety_hazards',
        severity: 'medium',
        then: { level: 'should', message: 'static hazard' },
      } as Rule,
    ];
    const filtered = filterPackRulesForOverlay(rules);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('rule.glacier.guide.required');
  });

  it('merge prefers overlay item on duplicate id', () => {
    const base: ReadinessFinding = {
      destinationId: 'IS',
      packId: 'facts.is',
      blockers: [],
      must: [{ id: 'a', category: 'logistics', severity: 'high', level: 'must', message: 'base' }],
      should: [],
      optional: [],
      risks: [],
    };
    const overlay: ReadinessFinding = {
      destinationId: 'IS',
      packId: 'pack.is',
      blockers: [],
      must: [{ id: 'a', category: 'logistics', severity: 'high', level: 'must', message: 'overlay' }],
      should: [],
      optional: [],
      risks: [],
    };
    const merged = mergeReadinessFindings(base, overlay);
    expect(merged.must).toHaveLength(1);
    expect(merged.must[0].message).toBe('overlay');
  });
});
