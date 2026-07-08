import { applyConstraintsVersionToPlanningConflictsResponse } from './planning-conflicts-constraints-version.util';
import type { PlanningConflictsResponse } from '../types/planning-conflicts.types';

const base: PlanningConflictsResponse = {
  tripId: 'trip-1',
  summary: { total: 0, hard: 0, schedule: 0, transport: 0, teamFit: 0, booking: 0, structure: 0 },
  conflicts: [],
  isStale: false,
};

describe('planning-conflicts-constraints-version.util', () => {
  it('marks isStale when query constraintsVersion lags server', () => {
    const out = applyConstraintsVersionToPlanningConflictsResponse(
      base,
      { constraintsVersion: 4 },
      3,
    );
    expect(out.constraintsVersion).toBe(4);
    expect(out.isStale).toBe(true);
  });

  it('keeps isStale false when query matches server', () => {
    const out = applyConstraintsVersionToPlanningConflictsResponse(
      base,
      { constraintsVersion: 4 },
      4,
    );
    expect(out.isStale).toBe(false);
  });

  it('returns server constraintsVersion when query omitted', () => {
    const out = applyConstraintsVersionToPlanningConflictsResponse(
      base,
      { constraintsVersion: 2 },
    );
    expect(out.constraintsVersion).toBe(2);
  });
});
