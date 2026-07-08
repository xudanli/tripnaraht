import { computeTripContextRevision } from './trip-context-snapshot.assembler.service';
import { buildTripWorldStateFromPrismaTrip } from './utils/build-trip-world-state-from-prisma.util';

describe('TripContextSnapshotAssembler utilities', () => {
  it('computeTripContextRevision is stable for same inputs', () => {
    const a = computeTripContextRevision({
      constraintsVersion: 3,
      effectivePlanVersionId: 'pv_abc',
      tripUpdatedAt: '2026-07-04T10:00:00.000Z',
    });
    const b = computeTripContextRevision({
      constraintsVersion: 3,
      effectivePlanVersionId: 'pv_abc',
      tripUpdatedAt: '2026-07-04T10:00:00.000Z',
    });
    expect(a).toBe(b);
    expect(a).toContain('cv3');
    expect(a).toContain('pv_abc');
  });

  it('computeTripContextRevision changes when constraintsVersion changes', () => {
    const a = computeTripContextRevision({
      constraintsVersion: 3,
      tripUpdatedAt: '2026-07-04T10:00:00.000Z',
    });
    const b = computeTripContextRevision({
      constraintsVersion: 4,
      tripUpdatedAt: '2026-07-04T10:00:00.000Z',
    });
    expect(a).not.toBe(b);
  });

  it('computeTripContextRevision changes when travelGraphCompileId changes', () => {
    const a = computeTripContextRevision({
      constraintsVersion: 3,
      tripUpdatedAt: '2026-07-04T10:00:00.000Z',
      travelGraphCompileId: 'compile_a',
    });
    const b = computeTripContextRevision({
      constraintsVersion: 3,
      tripUpdatedAt: '2026-07-04T10:00:00.000Z',
      travelGraphCompileId: 'compile_b',
    });
    expect(a).not.toBe(b);
    expect(a).toContain('compile_a');
  });

  it('buildTripWorldStateFromPrismaTrip binds tripId and duration', () => {
    const world = buildTripWorldStateFromPrismaTrip({
      id: 'trip_1',
      destination: 'IS',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-08'),
    });
    expect(world.context.tripId).toBe('trip_1');
    expect(world.context.durationDays).toBe(8);
    expect(world.context.destination).toBe('IS');
  });
});
