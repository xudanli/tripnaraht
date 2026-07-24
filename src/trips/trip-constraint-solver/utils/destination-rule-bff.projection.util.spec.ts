import { buildCountryOfficialConstraints } from './country-official-constraints.util';
import { projectTripConstraintForBff } from './trip-constraint-bff.projection.util';
import { buildTravelDecisionContractSections } from './travel-decision-contract-sections.util';
import { TRIP_CONSTRAINT_OFFICIAL_IS_IDS } from '../types/trip-constraint.types';

describe('destination-rule-bff.projection.util', () => {
  const trip = {
    id: 'trip-is',
    destination: 'IS',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-03T12:00:00.000Z'),
  };

  it('projects OFFICIAL_RULE with readonly_official section and destination rule value', () => {
    const [raw] = buildCountryOfficialConstraints(trip, 'user-1').filter(
      (c) => c.id === TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD,
    );
    const projected = projectTripConstraintForBff({ ...raw, hasConflict: true });

    expect(projected.type).toBe('EXTERNAL');
    expect(projected.source.type).toBe('OFFICIAL_RULE');
    expect(projected.source.templateId).toBe('f_road_vehicle_access');
    expect(projected.sectionKey).toBe('readonly_official');
    expect(projected.locked).toBe(true);
    expect(projected.enabled).toBe(true);
    expect(projected.verificationStatus).toBe('CURRENT');
    expect((projected.value as Record<string, unknown>).destinationRuleTier).toBe('BLOCK');
    expect((projected.value as Record<string, unknown>).judgmentRule).toContain('四驱');
    expect((projected.value as Record<string, unknown>).violationResult).toBe('阻断路线');
    expect(projected.contractMeta?.violationResultLabel).toBe('阻断路线');
    expect(projected.contractMeta?.scopeLabel).toBe('高地道路（F 路）');
    expect(projected.cardTone).toBe('danger');
  });

  it('ADVISORY tier maps to CONFIRM / 影响风险评分', () => {
    const [raw] = buildCountryOfficialConstraints(trip, 'user-1').filter(
      (c) => c.id === TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WIND_SAFETY,
    );
    const projected = projectTripConstraintForBff(raw);
    expect((projected.value as Record<string, unknown>).destinationRuleTier).toBe('ADVISORY');
    expect(projected.contractMeta?.violationResult).toBe('CONFIRM');
    expect(projected.contractMeta?.violationResultLabel).toBe('影响风险评分');
  });

  it('official rules never appear in hard_must_satisfy section', () => {
    const official = buildCountryOfficialConstraints(trip, 'user-1').map(projectTripConstraintForBff);
    const userHard = {
      id: 'c_budget_total',
      type: 'HARD' as const,
      category: 'BUDGET' as const,
      source: { type: 'USER' as const },
      enabled: true,
    };
    const sections = buildTravelDecisionContractSections([...(official as any), userHard as any], new Set());
    const hard = sections.find((s) => s.key === 'hard_must_satisfy');
    const readonly = sections.find((s) => s.key === 'readonly_official');
    expect(hard?.constraintIds).toEqual(['c_budget_total']);
    expect(readonly?.readonly).toBe(true);
    expect(readonly?.constraintIds).toContain(TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD);
    expect(hard?.constraintIds.some((id) => id.startsWith('c_official_'))).toBe(false);
  });
});
