import {
  resolveConstraintCapability,
  shouldUseAdvisoryViolationLabel,
} from './constraint-capability-registry.util';
import {
  TRIP_CONSTRAINT_LEGACY_IDS,
  TRIP_CONSTRAINT_OFFICIAL_IS_IDS,
  type TripConstraint,
} from '../types/trip-constraint.types';

const base = (overrides: Partial<TripConstraint>): TripConstraint => ({
  id: 'c_test',
  tripId: 'trip-1',
  name: '测试',
  category: 'SAFETY',
  type: 'HARD',
  status: 'ACTIVE',
  scope: { type: 'TRIP' },
  operator: 'LTE',
  value: {},
  allowRelaxation: false,
  locked: false,
  source: { type: 'USER' },
  visibility: 'TEAM',
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('constraint-capability-registry.util', () => {
  it('maps OPEN ENABLED keys for max daily drive', () => {
    const cap = resolveConstraintCapability(
      base({ id: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE }),
    );
    expect(cap.constraintKey).toBe('MAX_DAILY_DRIVE');
    expect(cap.enforcementLevel).toBe('ENABLED');
    expect(cap.phase0UiPolicy).toBe('OPEN');
    expect(cap.stages.feasibility).toBe(true);
    expect(cap.stages.tep).toBe(true);
  });

  it('maps catalog HARD without enforce to DISPLAY_ONLY + HIDDEN', () => {
    const cap = resolveConstraintCapability(
      base({
        id: 'c_tpl_elderly_walk_limit',
        source: { type: 'USER', templateId: 'elderly_walk_limit' },
      }),
    );
    expect(cap.constraintKey).toBe('ELDERLY_WALK_LIMIT');
    expect(cap.enforcementLevel).toBe('DISPLAY_ONLY');
    expect(cap.phase0UiPolicy).toBe('HIDDEN');
    expect(shouldUseAdvisoryViolationLabel(cap)).toBe(true);
  });

  it('maps Iceland official rules to PARTIAL DISPLAY_ONLY', () => {
    const cap = resolveConstraintCapability(
      base({
        id: TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD,
        source: { type: 'OFFICIAL_RULE' },
      }),
    );
    expect(cap.constraintKey).toBe('OFFICIAL_IS_FROAD_2WD');
    expect(cap.enforcementLevel).toBe('PARTIAL');
    expect(cap.phase0UiPolicy).toBe('DISPLAY_ONLY');
  });

  it('defaults unknown SOFT catalog to ADVISORY_ONLY HIDDEN', () => {
    const cap = resolveConstraintCapability(
      base({
        id: 'c_tpl_lunch_time_window',
        type: 'SOFT',
        source: { type: 'USER', templateId: 'lunch_time_window' },
      }),
    );
    expect(cap.enforcementLevel).toBe('ADVISORY_ONLY');
    expect(cap.phase0UiPolicy).toBe('HIDDEN');
  });
});
