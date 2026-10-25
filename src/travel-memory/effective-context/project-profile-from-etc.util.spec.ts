import { projectUserTravelProfileFromEffectiveContext } from './project-profile-from-etc.util';
import { resolveEffectiveTravelerContextConsumeMode } from './resolve-etc-consume-mode.util';
import { makeEffectiveMemoryItem } from './make-effective-memory-item.util';
import { createDefaultUserTravelProfile } from '../../agent/memory/interfaces/user-travel-profile.interface';
import type { EffectiveTravelerContextV1 } from './effective-traveler-context.types';

describe('resolveEffectiveTravelerContextConsumeMode', () => {
  it('defaults to off', () => {
    expect(resolveEffectiveTravelerContextConsumeMode({})).toBe('off');
  });
  it('parses shadow and active', () => {
    expect(
      resolveEffectiveTravelerContextConsumeMode({
        EFFECTIVE_TRAVELER_CONTEXT_CONSUME: 'shadow',
      }),
    ).toBe('shadow');
    expect(
      resolveEffectiveTravelerContextConsumeMode({
        EFFECTIVE_TRAVELER_CONTEXT_CONSUME: 'active',
      }),
    ).toBe('active');
  });
});

describe('projectUserTravelProfileFromEffectiveContext', () => {
  it('applies L2 FAST over base SLOW', () => {
    const base = createDefaultUserTravelProfile('u1');
    base.pacePreference = 'SLOW';
    const paceItem = makeEffectiveMemoryItem({
      domain: 'PACE',
      semanticType: 'PREFERENCE',
      key: 'pace',
      value: 'RELAXED',
      layer: 'L1_PERSISTENT',
      confidence: 0.8,
    });
    const l2 = makeEffectiveMemoryItem({
      domain: 'PACE',
      semanticType: 'PREFERENCE',
      key: 'pace',
      value: 'FAST',
      layer: 'L2_TRIP_OVERRIDE',
      confidence: 0.8,
    });
    const etc = {
      effective: { pace: l2 },
      items: [paceItem, l2],
      tripOverridesApplied: ['pace'],
    } as EffectiveTravelerContextV1;

    const out = projectUserTravelProfileFromEffectiveContext(base, etc);
    expect(out.profile.pacePreference).toBe('FAST');
    expect(out.appliedFields).toContain('pacePreference');
    expect(out.l2Fields).toContain('pacePreference');
  });

  it('maps RELAXED string to SLOW pace', () => {
    const base = createDefaultUserTravelProfile('u1');
    const etc = {
      effective: {
        pace: makeEffectiveMemoryItem({
          domain: 'PACE',
          semanticType: 'PREFERENCE',
          key: 'pace',
          value: 'RELAXED',
          layer: 'L1_PERSISTENT',
          confidence: 0.9,
        }),
      },
      items: [],
      tripOverridesApplied: [],
    } as unknown as EffectiveTravelerContextV1;

    const out = projectUserTravelProfileFromEffectiveContext(base, etc);
    expect(out.profile.pacePreference).toBe('SLOW');
  });
});
