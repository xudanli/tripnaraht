import {
  buildCountryOfficialConstraints,
  buildConstraintsListSections,
  inferOfficialConstraintIdsFromConflict,
  isOfficialConstraintId,
  normalizeTripDestinationCode,
} from './country-official-constraints.util';
import { TRIP_CONSTRAINT_OFFICIAL_IS_IDS } from '../types/trip-constraint.types';

describe('country-official-constraints.util', () => {
  const trip = {
    id: 'trip-is-1',
    destination: 'IS',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('normalizeTripDestinationCode: Iceland aliases', () => {
    expect(normalizeTripDestinationCode('IS')).toBe('IS');
    expect(normalizeTripDestinationCode('Iceland')).toBe('IS');
    expect(normalizeTripDestinationCode('冰岛')).toBe('IS');
  });

  it('buildCountryOfficialConstraints: injects 4 Iceland EXTERNAL cards', () => {
    const items = buildCountryOfficialConstraints(trip, 'user-1');
    expect(items).toHaveLength(4);
    expect(items.every((c) => c.type === 'EXTERNAL')).toBe(true);
    expect(items.every((c) => c.source.type === 'OFFICIAL_RULE')).toBe(true);
    expect(items.every((c) => c.locked)).toBe(true);
    expect(items.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD,
        TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WINTER_FROAD,
        TRIP_CONSTRAINT_OFFICIAL_IS_IDS.RED_ALERT,
        TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WIND_SAFETY,
      ]),
    );
  });

  it('buildCountryOfficialConstraints: non-Iceland returns empty', () => {
    expect(
      buildCountryOfficialConstraints({ ...trip, destination: 'JP' }, 'user-1'),
    ).toEqual([]);
  });

  it('buildConstraintsListSections: official + user + snapshot', () => {
    const official = buildCountryOfficialConstraints(trip, 'user-1');
    const userLike = {
      id: 'c_budget_total',
      source: { type: 'USER' as const },
      type: 'HARD' as const,
    };
    const snapshot = {
      id: 'c_world_feasibility',
      source: { type: 'WORLD_DATA' as const },
      type: 'EXTERNAL' as const,
    };
    const sections = buildConstraintsListSections('IS', [
      ...(official as any),
      userLike as any,
      snapshot as any,
    ]);
    expect(sections?.map((s) => s.key)).toEqual(['user', 'official', 'snapshot']);
    expect(sections?.find((s) => s.key === 'official')?.label).toBe('冰岛通行规则');
  });

  it('inferOfficialConstraintIdsFromConflict: F-road 2WD', () => {
    const ids = inferOfficialConstraintIdsFromConflict({
      id: 'i1',
      source: 'feasibility',
      priority: 'must_handle',
      category: 'transport',
      title: '车型不兼容',
      message: '行程含 F 路但租车为 2WD',
      issue: {
        id: 'i1',
        priority: 'must_handle',
        category: 'transport',
        title: 'x',
        message: 'x',
        affectedDays: [1],
        severity: 'high',
        semanticKey: 'terrain.f_road_compatibility',
      },
    });
    expect(ids).toContain(TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD);
  });

  it('isOfficialConstraintId', () => {
    expect(isOfficialConstraintId('c_official_is_froad_2wd')).toBe(true);
    expect(isOfficialConstraintId('c_budget_total')).toBe(false);
  });
});
