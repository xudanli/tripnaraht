import { projectEnvironmentEventToRisk } from '../adapters/environment-event-risk.adapter';
import {
  buildMemberImpactsForRecommendation,
  enrichRiskWithTripMembers,
  memberNamesMapToAffectedRefs,
  resolveAffectedMemberLabelsFromRisks,
} from './execution-risk-member.util';
import {
  buildHarnessActiveRisks,
  harnessWindEnvironmentDetail,
} from '../harness/execution-risk-p0.harness.util';

describe('execution-risk-member.util', () => {
  const tripMembers = memberNamesMapToAffectedRefs(
    new Map([
      ['u1', 'Patrick'],
      ['u2', 'Abu'],
    ]),
  );

  it('enriches environment wind risk with all trip members', () => {
    const [wind] = buildHarnessActiveRisks().filter((r) => r.code === 'WEATHER_STRONG_WIND');
    expect(wind.affectedMembers).toHaveLength(0);

    const enriched = enrichRiskWithTripMembers(wind, tripMembers);
    expect(enriched.affectedMembers).toHaveLength(2);
    expect(enriched.affectedMembers.map((m) => m.label)).toEqual(['Patrick', 'Abu']);
  });

  it('does not overwrite explicit affectedMembers', () => {
    const [wind] = buildHarnessActiveRisks().filter((r) => r.code === 'WEATHER_STRONG_WIND');
    const explicit = {
      ...wind,
      affectedMembers: [{ id: 'u9', label: 'Lara', kind: 'member' as const }],
    };
    const enriched = enrichRiskWithTripMembers(explicit, tripMembers);
    expect(enriched.affectedMembers).toHaveLength(1);
    expect(enriched.affectedMembers[0]?.label).toBe('Lara');
  });

  it('resolves member labels from linked risks without duplicates', () => {
    const [wind, block] = buildHarnessActiveRisks().filter(
      (r) => r.code === 'WEATHER_STRONG_WIND' || r.decisionProblemIds.length > 0,
    );
    const labels = resolveAffectedMemberLabelsFromRisks([
      {
        ...wind,
        affectedMembers: [
          { id: 'u1', label: 'Patrick', kind: 'member' },
          { id: 'u2', label: 'Abu', kind: 'member' },
        ],
      },
      {
        ...block,
        affectedMembers: [{ id: 'u2', label: 'Abu', kind: 'member' }],
      },
    ]);
    expect(labels).toEqual(['Patrick', 'Abu']);
  });

  it('builds per-member impacts for strong wind recommendation', () => {
    const projection = projectEnvironmentEventToRisk(harnessWindEnvironmentDetail());
    const risk = enrichRiskWithTripMembers(
      {
        ...projection,
        id: 'risk_wind',
        acknowledgementStatus: 'UNSEEN',
        treatmentStatus: 'ACTION_REQUIRED',
      },
      tripMembers,
    );

    const impacts = buildMemberImpactsForRecommendation({
      risk,
      label: '缩短徒步',
      description: '将冰川徒步缩短为 90 分钟',
      impactSummary: '-30min',
    });

    expect(impacts).toHaveLength(2);
    expect(impacts[0]?.impactType).toBe('DELAYED');
    expect(impacts[0]?.explanation).toContain('Patrick');
    expect(impacts[0]?.explanation).toContain('缩短徒步');
    expect(impacts[1]?.memberId).toBe('u2');
  });
});
