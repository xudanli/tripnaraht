import {
  deriveEffectiveMemoryAuthority,
  mayEnterHardDecisionSurface,
  mayEnterSoftDecisionSurface,
  toEffectiveDecisionFacet,
} from './effective-memory-authority.util';
import { makeEffectiveMemoryItem } from './make-effective-memory-item.util';
import { projectAdvisoryHintsFromEffectiveContext } from './project-advisory-hints-from-etc.util';
import { projectUserTravelProfileFromEffectiveContext } from './project-profile-from-etc.util';
import { createDefaultUserTravelProfile } from '../../agent/memory/interfaces/user-travel-profile.interface';
import type { EffectiveTravelerContextV1 } from './effective-traveler-context.types';

describe('deriveEffectiveMemoryAuthority', () => {
  it('maps semantic types to consumption authorities', () => {
    expect(deriveEffectiveMemoryAuthority('CONSTRAINT')).toBe('CONSTRAINT');
    expect(deriveEffectiveMemoryAuthority('PREFERENCE')).toBe('ADVISORY');
    expect(deriveEffectiveMemoryAuthority('HABIT')).toBe('CONTEXT');
    expect(deriveEffectiveMemoryAuthority('TRADEOFF')).toBe('UTILITY');
    expect(deriveEffectiveMemoryAuthority('AVOIDANCE')).toBe('PENALTY');
  });
});

describe('soft/hard surface gates', () => {
  it('keeps HABIT off soft and hard surfaces', () => {
    expect(mayEnterSoftDecisionSurface('CONTEXT')).toBe(false);
    expect(
      mayEnterHardDecisionSurface({
        authority: 'CONTEXT',
        layer: 'L1_PERSISTENT',
      }),
    ).toBe(false);
  });

  it('allows L2 override onto hard even when advisory', () => {
    expect(
      mayEnterHardDecisionSurface({
        authority: 'ADVISORY',
        layer: 'L2_TRIP_OVERRIDE',
      }),
    ).toBe(true);
  });
});

describe('toEffectiveDecisionFacet', () => {
  it('emits ADR decision fields', () => {
    const item = makeEffectiveMemoryItem({
      domain: 'MOBILITY',
      semanticType: 'PREFERENCE',
      key: 'driving_tolerance',
      value: '3H',
      layer: 'L1_PERSISTENT',
      confidence: 0.72,
      sourceRefs: ['episode_123', 'memory_456'],
    });
    expect(toEffectiveDecisionFacet(item)).toEqual({
      value: '3H',
      authority: 'ADVISORY',
      confidence: 0.72,
      provenance: ['episode_123', 'memory_456'],
      sourceScope: 'L1_PERSISTENT',
      domain: 'MOBILITY',
      semanticType: 'PREFERENCE',
      key: 'driving_tolerance',
    });
  });
});

describe('projectors respect authority', () => {
  it('soft skips HABIT sleep_quality winner', () => {
    const habit = makeEffectiveMemoryItem({
      domain: 'SLEEP',
      semanticType: 'HABIT',
      key: 'pace',
      value: 'SLOW',
      layer: 'L1_PERSISTENT',
    });
    const etc = {
      effective: { pace: habit },
      items: [habit],
      advisoryHints: [],
      tripOverridesApplied: [],
    } as unknown as EffectiveTravelerContextV1;
    expect(projectAdvisoryHintsFromEffectiveContext(etc)).toEqual([]);
  });

  it('hard skips HABIT pace (does not overwrite profile)', () => {
    const base = createDefaultUserTravelProfile('u1');
    base.pacePreference = 'FAST';
    const habit = makeEffectiveMemoryItem({
      domain: 'PACE',
      semanticType: 'HABIT',
      key: 'pace',
      value: 'SLOW',
      layer: 'L1_PERSISTENT',
    });
    const etc = {
      effective: { pace: habit },
      items: [habit],
      tripOverridesApplied: [],
    } as unknown as EffectiveTravelerContextV1;
    const out = projectUserTravelProfileFromEffectiveContext(base, etc);
    expect(out.profile.pacePreference).toBe('FAST');
    expect(out.appliedFields).not.toContain('pacePreference');
  });
});
