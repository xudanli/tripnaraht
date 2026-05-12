import { collectIcelandInsurancePolicyIssues } from './iceland-insurance-arbitrator.util';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';

describe('collectIcelandInsurancePolicyIssues', () => {
  const baseResearch = {
    country_code: 'IS',
    car_rentals: [{ name: 'Economy', insurance: 'Basic cover, high excess' }],
  };

  it('emits gravel_protection_gap WARNING when east exposure and no GP / zero tier', () => {
    const it: Itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-07-01',
          items: [
            {
              id: 'seg1',
              type: 'TRANSPORT',
              evidence_refs: [],
              metadata: { route_segment_ref: 'ring-road:east-fjords' },
            } as any,
          ],
        },
      ],
    } as Itinerary;
    const issues = collectIcelandInsurancePolicyIssues({ itinerary: it, research_data: baseResearch });
    expect(issues.some((i) => i.violation?.anchor.ruleId?.includes('gravel_protection_gap'))).toBe(true);
    expect(issues.find((i) => i.violation?.anchor.ruleId?.includes('gravel_protection_gap'))?.severity).toBe('WARNING');
  });

  it('emits saap_gap INFO near Vik without SAAP', () => {
    const it: Itinerary = {
      request_id: 'r2',
      days: [
        {
          date: '2026-07-02',
          items: [
            {
              id: 'p1',
              type: 'POI',
              evidence_refs: [],
              location_ref: { name: 'Vík', place_id: 'vik' },
            } as any,
          ],
        },
      ],
    } as Itinerary;
    const issues = collectIcelandInsurancePolicyIssues({
      itinerary: it,
      research_data: baseResearch,
    });
    expect(issues.some((i) => i.violation?.anchor.ruleId?.includes('saap_gap'))).toBe(true);
    expect(issues.find((i) => i.violation?.anchor.ruleId?.includes('saap_gap'))?.severity).toBe('INFO');
  });

  it('emits high_excess_warning when env complexity + basic excess', () => {
    const it: Itinerary = {
      request_id: 'r3',
      days: [{ date: '2026-07-03', items: [{ id: 'x', type: 'POI', evidence_refs: [] } as any] }],
    } as Itinerary;
    const issues = collectIcelandInsurancePolicyIssues({
      itinerary: it,
      research_data: {
        ...baseResearch,
        safetravel_alerts: [{ title: 'Wind', severity: 'high' }, { title: 'Road', severity: 'medium' }],
      },
    });
    expect(issues.some((i) => i.violation?.anchor.ruleId?.includes('high_excess_warning'))).toBe(true);
  });

  it('skips when no rental evidence blob', () => {
    const it: Itinerary = {
      request_id: 'r4',
      days: [{ date: '2026-07-01', items: [{ id: 'seg1', type: 'TRANSPORT', metadata: { route_segment_ref: 'ring-road:east-fjords' }, evidence_refs: [] } as any] }],
    } as Itinerary;
    expect(collectIcelandInsurancePolicyIssues({ itinerary: it, research_data: { country_code: 'IS' } }).length).toBe(0);
  });

  it('merges user_query into insurance blob (shadow intent)', () => {
    const it: Itinerary = {
      request_id: 'r4b',
      days: [
        {
          date: '2026-07-02',
          items: [
            {
              id: 'p1',
              type: 'POI',
              evidence_refs: [],
              location_ref: { name: 'Vík', place_id: 'vik' },
            } as any,
          ],
        },
      ],
    } as Itinerary;
    const issues = collectIcelandInsurancePolicyIssues({
      itinerary: it,
      research_data: { country_code: 'IS', car_rentals: [] },
      user_query: 'Lotus Platinum zero excess',
    });
    expect(issues.filter((i) => i.violation?.anchor.ruleId?.includes('saap_gap')).length).toBe(0);
  });

  it('skips GP warning when zero-excess tier detected in blob', () => {
    const it: Itinerary = {
      request_id: 'r5',
      days: [
        {
          date: '2026-07-01',
          items: [
            { id: 'seg1', type: 'TRANSPORT', evidence_refs: [], metadata: { route_segment_ref: 'east-fjords' } } as any,
          ],
        },
      ],
    } as Itinerary;
    const issues = collectIcelandInsurancePolicyIssues({
      itinerary: it,
      research_data: {
        country_code: 'IS',
        car_rentals: [{ name: 'Zero', package: 'Platinum all-inclusive zero excess' }],
      },
    });
    expect(issues.filter((i) => i.violation?.anchor.ruleId?.includes('gravel_protection_gap')).length).toBe(0);
  });
});
