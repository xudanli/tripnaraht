import { BadRequestException } from '@nestjs/common';
import {
  applyEmbeddedHikingToWorldState,
  computeEmbeddedSegmentDurationDays,
  mergeTripMetadata,
  validateHikingMetadataFields,
  getMaxHikingSegments,
  extractHttpErrorCode,
} from './embedded-hiking-trip-metadata.util';

describe('embedded-hiking-trip-metadata.util', () => {
  it('deep-merges nested keys without wiping siblings', () => {
    const existing = {
      hardTrekTrailPlan: { segments: [{ day: 1 }] },
      generationProgress: { step: 2 },
    };
    const merged = mergeTripMetadata(existing, {
      hikingProfile: 'embedded',
    });
    expect(merged.hardTrekTrailPlan).toEqual(existing.hardTrekTrailPlan);
    expect(merged.generationProgress).toEqual(existing.generationProgress);
    expect(merged.hikingProfile).toBe('embedded');
  });

  it('replaces hikingSegments array wholesale', () => {
    const merged = mergeTripMetadata(
      {
        hikingSegments: [{ segmentId: 'a', startDate: '2026-03-01', endDate: '2026-03-02', routeDirectionId: 1 }],
      },
      {
        hikingSegments: [{ segmentId: 'b', startDate: '2026-03-05', endDate: '2026-03-06', routeDirectionId: 2 }],
      },
    );
    expect(merged.hikingSegments).toHaveLength(1);
    expect((merged.hikingSegments as { segmentId: string }[])[0].segmentId).toBe('b');
  });

  it('rejects segment dates outside trip bounds', () => {
    try {
      validateHikingMetadataFields(
        {
          hikingSegments: [
            {
              segmentId: 'x',
              startDate: '2026-04-01',
              endDate: '2026-04-02',
              routeDirectionId: 1,
            },
          ],
        },
        {
          startDate: new Date('2026-03-10T00:00:00.000Z'),
          endDate: new Date('2026-03-20T00:00:00.000Z'),
        },
      );
      fail('expected BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(extractHttpErrorCode(e)).toBe('SEGMENT_DATE_OUT_OF_RANGE');
    }
  });

  it('computes embedded segment duration span', () => {
    expect(
      computeEmbeddedSegmentDurationDays([
        { segmentId: 'a', startDate: '2026-03-10', endDate: '2026-03-11', routeDirectionId: 1 },
        { segmentId: 'b', startDate: '2026-03-14', endDate: '2026-03-15', routeDirectionId: 2 },
      ]),
    ).toBe(6);
  });

  it('applyEmbeddedHikingToWorldState overrides durationDays', () => {
    const state = {
      context: { durationDays: 14, preferences: {} },
      signals: {},
    };
    const r = applyEmbeddedHikingToWorldState(state, {
      hikingProfile: 'embedded',
      hikingSegments: [
        { segmentId: 'a', startDate: '2026-03-10', endDate: '2026-03-12', routeDirectionId: 1 },
      ],
    });
    expect(r.applied).toBe(true);
    expect(state.context!.durationDays).toBe(3);
    expect((state.signals as { embeddedHiking?: { effectiveDurationDays: number } }).embeddedHiking)
      .toMatchObject({ effectiveDurationDays: 3 });
  });

  it('enforces segment count limit', () => {
    const prev = process.env.TRIP_HIKING_SEGMENT_MAX;
    process.env.TRIP_HIKING_SEGMENT_MAX = '2';
    expect(getMaxHikingSegments()).toBe(2);
    try {
      validateHikingMetadataFields(
        {
          hikingSegments: [
            { segmentId: '1', startDate: '2026-03-10', endDate: '2026-03-10', routeDirectionId: 1 },
            { segmentId: '2', startDate: '2026-03-11', endDate: '2026-03-11', routeDirectionId: 1 },
            { segmentId: '3', startDate: '2026-03-12', endDate: '2026-03-12', routeDirectionId: 1 },
          ],
        },
        {
          startDate: new Date('2026-03-10T00:00:00.000Z'),
          endDate: new Date('2026-03-20T00:00:00.000Z'),
        },
      );
      fail('expected BadRequestException');
    } catch (e) {
      expect(extractHttpErrorCode(e)).toBe('TRIP_SEGMENT_LIMIT');
    }
    process.env.TRIP_HIKING_SEGMENT_MAX = prev;
  });
});
