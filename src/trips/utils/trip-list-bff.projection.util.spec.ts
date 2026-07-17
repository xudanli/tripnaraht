import { DateTime } from 'luxon';
import {
  resolveTripListDisplayStatus,
  resolveDisplayStatusLabel,
  toApiTripStatus,
  expandStatusFilter,
  computeLitePlanningProgressPercent,
  buildTripListSummary,
  projectTripListCardMetadata,
  mapTripRowToListCard,
} from './trip-list-bff.projection.util';

describe('trip-list-bff.projection.util', () => {
  const now = DateTime.fromISO('2026-07-07T12:00:00.000+08:00');

  it('maps IN_PROGRESS/TRAVELING to API status IN_PROGRESS', () => {
    expect(toApiTripStatus('IN_PROGRESS')).toBe('IN_PROGRESS');
    expect(toApiTripStatus('TRAVELING')).toBe('IN_PROGRESS');
  });

  it('resolves pre_trip within 14 days', () => {
    const displayStatus = resolveTripListDisplayStatus({
      status: 'PLANNING',
      startDate: new Date('2026-07-15T00:00:00.000Z'),
      now,
    });
    expect(displayStatus).toBe('pre_trip');
    expect(resolveDisplayStatusLabel(displayStatus)).toBe('行前准备');
  });

  it('expands IN_PROGRESS filter to TRAVELING', () => {
    expect(expandStatusFilter(['IN_PROGRESS'])).toEqual(
      expect.arrayContaining(['IN_PROGRESS', 'TRAVELING']),
    );
  });

  it('prefers metadata progressPercent for planning progress', () => {
    const progress = computeLitePlanningProgressPercent({
      metadata: { progressPercent: 45 },
      destination: 'IS',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-05'),
      totalItems: 3,
      daysWithItems: 2,
      totalDays: 4,
    });
    expect(progress).toBe(45);
  });

  it('surfaces readinessScore from overallReadinessCache when fresh', () => {
    const updatedAt = new Date();
    const summary = buildTripListSummary({
      destination: 'IS',
      status: 'PLANNING',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-07'),
      metadata: {
        overallReadinessCache: {
          score: 78,
          state: 'NEAR_READY',
          stateLabelZh: '接近就绪',
          evidenceConfidence: 80,
          blockerCount: 0,
          pendingConfirmationCount: 2,
          calculatedAt: updatedAt.toISOString(),
        },
      },
      totalItems: 10,
      daysWithItems: 5,
      totalDays: 6,
      memberCount: 2,
      memberAvatars: [],
      totalBudget: 0,
      updatedAt,
    });
    expect(summary.readinessScore).toBe(78);
    expect(summary.readinessState).toBe('NEAR_READY');
  });

  it('strips heavy collector evidence from list-card metadata', () => {
    const projected = projectTripListCardMetadata({
      progressPercent: 40,
      coverImageUrl: 'https://cdn.example.com/is.jpg',
      rfc001VedurCollectorRawEvidence: { huge: true },
      canonicalCausalTracesV1: [{ id: 1 }],
    });
    expect(projected).toEqual({
      progressPercent: 40,
      coverImageUrl: 'https://cdn.example.com/is.jpg',
    });

    const card = mapTripRowToListCard({
      trip: {
        id: 'trip-a',
        name: 'A',
        destination: 'IS',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-07T00:00:00.000Z'),
        status: 'PLANNING',
        budgetConfig: null,
        metadata: {
          progressPercent: 40,
          rfc001GagnaveitaCollectorRawEvidence: { raw: 'x'.repeat(1000) },
        },
        createdAt: new Date('2026-07-02T00:00:00.000Z'),
        updatedAt: new Date('2026-07-02T00:00:00.000Z'),
        TripDay: [{ id: 'day-a', date: new Date('2026-08-01T00:00:00.000Z'), _count: { ItineraryItem: 1 } }],
      },
      totalBudget: 0,
      memberCount: 1,
      memberAvatars: [],
      listSummary: null,
    });
    expect(card.metadata).toEqual({ progressPercent: 40 });
  });
});
