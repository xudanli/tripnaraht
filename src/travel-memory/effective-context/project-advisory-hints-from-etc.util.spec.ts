import {
  buildEtcSoftHintsAudit,
  projectAdvisoryHintsFromEffectiveContext,
} from './project-advisory-hints-from-etc.util';
import { makeEffectiveMemoryItem } from './make-effective-memory-item.util';
import type { EffectiveTravelerContextV1 } from './effective-traveler-context.types';
import type { TravelMemoryDecisionHintV1 } from '../context-assembly/selective-consume.util';

function baseEtc(
  overrides: Partial<EffectiveTravelerContextV1> & {
    effective: EffectiveTravelerContextV1['effective'];
    items?: EffectiveTravelerContextV1['items'];
    advisoryHints?: TravelMemoryDecisionHintV1[];
  },
): EffectiveTravelerContextV1 {
  return {
    schemaId: 'tripnara.effective_traveler_context@v1',
    version: 1,
    consumptionMode: 'SHADOW',
    subjectId: 'u1',
    tripId: 't1',
    resolvedAt: new Date().toISOString(),
    items: overrides.items ?? [],
    byDomain: {},
    effective: overrides.effective,
    tripOverridesApplied: overrides.tripOverridesApplied ?? [],
    advisoryHints: overrides.advisoryHints ?? [],
    provenance: {
      osProfilePresent: true,
      osBasicsPresent: false,
      osTravelPreferenceKeys: [],
      tmrStructuredKeys: [],
      tmrTripKeys: [],
      itemCount: 0,
      domainCount: 0,
    },
    designPrinciple: 'test',
    ...overrides,
  };
}

describe('projectAdvisoryHintsFromEffectiveContext', () => {
  it('maps L1 pace to travel.pace PACE_CONSTRAINT', () => {
    const hints = projectAdvisoryHintsFromEffectiveContext(
      baseEtc({
        effective: {
          pace: makeEffectiveMemoryItem({
            domain: 'PACE',
            semanticType: 'PREFERENCE',
            key: 'pace',
            value: 'SLOW',
            layer: 'L1_PERSISTENT',
            confidence: 0.8,
            sourceRefs: ['os.userTravelProfile.pacePreference'],
          }),
        },
      }),
    );
    expect(hints).toEqual([
      expect.objectContaining({
        key: 'travel.pace',
        influence: 'PACE_CONSTRAINT',
        advisoryOnly: true,
        value: 'SLOW',
      }),
    ]);
  });

  it('maps L2 pace to trip.paceOverride and skips duplicate travel.pace from advisory', () => {
    const hints = projectAdvisoryHintsFromEffectiveContext(
      baseEtc({
        effective: {
          pace: makeEffectiveMemoryItem({
            domain: 'PACE',
            semanticType: 'PREFERENCE',
            key: 'pace',
            value: 'FAST',
            layer: 'L2_TRIP_OVERRIDE',
            confidence: 0.9,
            sourceRefs: ['tmr.evidence:M-L2'],
          }),
        },
        tripOverridesApplied: ['pace'],
        advisoryHints: [
          {
            key: 'travel.pace',
            value: 'SLOW',
            influence: 'PACE_CONSTRAINT',
            confidence: 0.9,
            memoryId: 'old',
            advisoryOnly: true,
          },
          {
            key: 'episode.ep1',
            value: { regret: 'HIGH' },
            influence: 'EPISODE_WARNING',
            confidence: 0.7,
            memoryId: 'ep1',
            advisoryOnly: true,
          },
        ],
      }),
    );
    expect(hints.map((h) => h.key)).toEqual([
      'trip.paceOverride',
      'episode.ep1',
    ]);
    expect(hints[0].memoryId).toBe('M-L2');
    expect(hints.every((h) => h.advisoryOnly)).toBe(true);
  });

  it('maps stay movement to MEMBER_CONSTRAINT for hotel soft', () => {
    const hints = projectAdvisoryHintsFromEffectiveContext(
      baseEtc({
        effective: {
          accommodationMovement: makeEffectiveMemoryItem({
            domain: 'STAY',
            semanticType: 'PREFERENCE',
            key: 'accommodation_movement',
            value: 'MINIMIZE_CHANGES',
            layer: 'L1_PERSISTENT',
            confidence: 0.75,
            sourceRefs: ['tmr.structured.travel.accommodationMovement'],
          }),
        },
      }),
    );
    expect(hints[0]).toEqual(
      expect.objectContaining({
        key: 'travel.accommodationMovement',
        influence: 'MEMBER_CONSTRAINT',
        advisoryOnly: true,
      }),
    );
  });
});

describe('buildEtcSoftHintsAudit', () => {
  it('diffs etc vs tmr keys', () => {
    const audit = buildEtcSoftHintsAudit({
      mode: 'shadow',
      etcHints: [
        {
          key: 'travel.pace',
          value: 'SLOW',
          influence: 'PACE_CONSTRAINT',
          confidence: 0.8,
          memoryId: 'a',
          advisoryOnly: true,
        },
        {
          key: 'trip.paceOverride',
          value: 'FAST',
          influence: 'TRIP_OVERRIDE',
          confidence: 0.9,
          memoryId: 'b',
          advisoryOnly: true,
        },
      ],
      tmrHints: [
        {
          key: 'travel.pace',
          value: 'SLOW',
          influence: 'PACE_CONSTRAINT',
          confidence: 0.8,
          memoryId: 'a',
          advisoryOnly: true,
        },
      ],
      softSource: 'tmr',
      applied: false,
    });
    expect(audit.keysOnlyInEtc).toEqual(['trip.paceOverride']);
    expect(audit.keysOnlyInTmr).toEqual([]);
    expect(audit.applied).toBe(false);
  });
});
