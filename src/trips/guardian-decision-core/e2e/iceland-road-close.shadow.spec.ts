/**
 * WP1 — Iceland road-close shadow comparison E2E (Legacy proxy vs RFC-001).
 */

import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from '../detection/road-close-impact-analyzer';
import { LegacyRfc001ComparatorService } from '../shadow/legacy-rfc001-comparator.service';
import { RoadSegmentUnavailableShadowService } from '../shadow/road-segment-unavailable-shadow.service';
import {
  buildIcelandRoadCloseHarnessStack,
  createHarnessMockPrisma,
  harnessTripRow,
  HARNESS_ITEM_DRIVE,
  HARNESS_TRIP_ID,
} from './iceland-road-close.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('Iceland road-close shadow (WP1)', () => {
  it('SHADOW-001: F208 CLOSED → RFC blocks original, legacy stub allows → RFC_PREFERRED', async () => {
    const mock = createHarnessMockPrisma({ [HARNESS_TRIP_ID]: harnessTripRow() });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandRoadCloseHarnessStack(prisma);
    const comparator = new LegacyRfc001ComparatorService();
    const shadow = new RoadSegmentUnavailableShadowService(
      prisma,
      stack.runner,
      comparator,
    );

    const event = buildRoadStatusChangedEvent({
      tripId: HARNESS_TRIP_ID,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: buildItemSegmentId(HARNESS_TRIP_ID, HARNESS_ITEM_DRIVE),
    });

    const result = await shadow.compareFromEvent(event);

    expect(result.schemaId).toBe('tripnara.rfc001_shadow_comparison@v1');
    expect(result.rfc001.hardBlockOnOriginal).toBe(true);
    expect(result.rfc001.candidateIds.length).toBeGreaterThanOrEqual(2);
    expect(result.metrics.affectedScopeAgreement).toBe(true);
    expect(['RFC_PREFERRED', 'STRATEGY_DIFFERENCE']).toContain(result.diff.kind);

    const stored = await shadow.listStored(HARNESS_TRIP_ID);
    expect(stored.items.length).toBeGreaterThanOrEqual(1);
    expect(stored.aggregate?.sampleCount).toBeGreaterThanOrEqual(1);
  });

  it('SHADOW-002: in-memory aggregate tracks samples', async () => {
    const mock = createHarnessMockPrisma({ [HARNESS_TRIP_ID]: harnessTripRow() });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandRoadCloseHarnessStack(prisma);
    const shadow = new RoadSegmentUnavailableShadowService(
      prisma,
      stack.runner,
      new LegacyRfc001ComparatorService(),
    );

    const event = buildRoadStatusChangedEvent({
      tripId: HARNESS_TRIP_ID,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: buildItemSegmentId(HARNESS_TRIP_ID, HARNESS_ITEM_DRIVE),
    });

    await shadow.compareFromEvent(event, { persist: false });
    await shadow.compareFromEvent(event, { persist: false });

    const agg = shadow.getInMemoryAggregate();
    expect(agg.sampleCount).toBe(2);
    expect(agg.meanCandidateOverlapRate).toBeDefined();
  });
});
