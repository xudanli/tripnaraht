import { BadRequestException } from '@nestjs/common';
import {
  assertMetadataSizeLimit,
  compactPlansMetadata,
  measureMetadataBytes,
  prepareMetadataForPersist,
  topMetadataKeysBySize,
} from './trip-metadata-size.util';
import { READINESS_CAUSAL_PREANALYSIS_METADATA_KEY } from '../readiness/utils/readiness-causal-preanalysis.util';

describe('trip-metadata-size.util', () => {
  const prevLimit = process.env.TRIP_METADATA_MAX_BYTES;

  afterEach(() => {
    if (prevLimit == null) delete process.env.TRIP_METADATA_MAX_BYTES;
    else process.env.TRIP_METADATA_MAX_BYTES = prevLimit;
  });

  it('reports top keys by serialized size', () => {
    const top = topMetadataKeysBySize({
      small: { a: 1 },
      big: { blob: 'x'.repeat(10_000) },
    });
    expect(top[0]?.key).toBe('big');
  });

  it('compacts plans by stripping uiOutput', () => {
    const compact = compactPlansMetadata({
      p1: {
        planVersion: 2,
        status: 'DRAFT',
        uiOutput: { blocks: [{ id: 'x'.repeat(50_000) }] },
        updatedAt: '2026-06-29T00:00:00.000Z',
      },
    });
    expect(compact?.p1).toMatchObject({ planVersion: 2, status: 'DRAFT' });
    expect((compact?.p1 as Record<string, unknown>).uiOutput).toBeUndefined();
  });

  it('prepareMetadataForPersist drops ephemeral keys to allow small constraint patch', () => {
    process.env.TRIP_METADATA_MAX_BYTES = '65536';
    const metadata: Record<string, unknown> = {
      [READINESS_CAUSAL_PREANALYSIS_METADATA_KEY]: { graph: 'x'.repeat(140_000) },
      feasibilityMonteCarloSnapshot: { sample: 'y'.repeat(3_000) },
      readinessGuardianNegotiation: { latest: 'z'.repeat(7_000) },
      plans: {
        plan_a: {
          planVersion: 1,
          status: 'DRAFT',
          uiOutput: { body: 'u'.repeat(90_000) },
          updatedAt: '2026-06-28T00:00:00.000Z',
        },
      },
      constraints: { maxSegmentDistanceKm: 250 },
    };

    expect(measureMetadataBytes(metadata)).toBeGreaterThan(65_536);

    const actions = prepareMetadataForPersist(metadata);
    expect(actions.length).toBeGreaterThan(0);
    expect(metadata[READINESS_CAUSAL_PREANALYSIS_METADATA_KEY]).toBeUndefined();
    expect((metadata.plans as Record<string, unknown>).plan_a).not.toHaveProperty('uiOutput');
    expect(measureMetadataBytes(metadata)).toBeLessThanOrEqual(65_536);

    metadata.constraints = {
      ...(metadata.constraints as object),
      maxDailyDrivingHours: 6,
    };
    expect(() => assertMetadataSizeLimit(metadata)).not.toThrow();
  });

  it('throws METADATA_TOO_LARGE with top keys when still over limit', () => {
    process.env.TRIP_METADATA_MAX_BYTES = '2048';
    const metadata = { blob: 'x'.repeat(5000) };
    expect(() => assertMetadataSizeLimit(metadata)).toThrow(BadRequestException);
    try {
      assertMetadataSizeLimit({ blob: 'x'.repeat(5000) });
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as { errorCode: string; message: string };
      expect(resp.errorCode).toBe('METADATA_TOO_LARGE');
      expect(resp.message).toContain('Top keys:');
    }
  });
});
