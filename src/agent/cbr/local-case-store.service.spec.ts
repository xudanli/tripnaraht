import { LocalCaseStoreService } from './local-case-store.service';
import type { CaseRecord } from './case-record.types';

describe('LocalCaseStoreService', () => {
  it('aggregates avg wall-hit distance and counts', () => {
    const s = new LocalCaseStoreService();
    const base: Omit<CaseRecord, 'case_id'> = {
      query_signature: {
        conflict_type: 'REACHABILITY',
        primary_violation_type: 'REACHABILITY',
        region_id: 'is',
        month: 8,
        relaxation_types: ['upgrade_vehicle_to_4wd'],
      },
      outcome_payload: {
        historical_late_accept_rate: 1,
        wall_hit_distance_p90_latency_ms: 1000,
        wall_hit_distance_p90_event_span: 4,
        evidence_anchors: [{ source: 'X', note: 'e1' }],
      },
      precedent_summary: 'p1',
      provenance: { early_warning_id: 'ew1', request_id: 'r1', generated_at: new Date().toISOString() },
    };

    s.saveCase({ ...base, case_id: 'c1' });
    s.saveCase({
      ...base,
      case_id: 'c2',
      outcome_payload: { ...base.outcome_payload, wall_hit_distance_p90_latency_ms: 3000, wall_hit_distance_p90_event_span: 6 },
    });

    const out = s._debugDump();
    expect(out).toHaveLength(1);
    expect(out[0].total_count).toBe(2);
    expect(out[0].late_accept_count).toBe(2);
    expect(Math.round(out[0].avg_wall_hit_latency_ms ?? 0)).toBe(2000);
    expect(Math.round(out[0].avg_wall_hit_event_span ?? 0)).toBe(5);
  });

  it('search hard-matches conflict+violation and soft-scores region/month', () => {
    const s = new LocalCaseStoreService();
    const mk = (id: string, region: string, month: number): CaseRecord => ({
      case_id: id,
      query_signature: {
        conflict_type: 'SCOPE',
        primary_violation_type: 'SCOPE',
        region_id: region,
        month,
        relaxation_types: ['increase_days_by_1'],
      },
      outcome_payload: {
        historical_late_accept_rate: 1,
        wall_hit_distance_p90_latency_ms: 2000,
        wall_hit_distance_p90_event_span: 3,
        evidence_anchors: [{ source: 'E', note: id }],
      },
      precedent_summary: id,
      provenance: { early_warning_id: id },
    });
    s.saveCase(mk('a', 'is', 8));
    s.saveCase(mk('b', 'is', 9));
    s.saveCase(mk('c', 'no', 8));

    const hits = s.search({
      conflict_type: 'SCOPE',
      primary_violation_type: 'SCOPE',
      region_id: 'is',
      month: 8,
      relaxation_types: ['increase_days_by_1'],
      limit: 2,
    });
    expect(hits.length).toBeGreaterThan(0);
    // region+month should rank highest
    expect(hits[0].summary).toContain('N=');
  });

  it('records conversion and computes persuasion rate', () => {
    const s = new LocalCaseStoreService();
    const signature = { conflict_type: 'REACHABILITY' as const, primary_violation_type: 'REACHABILITY', region_id: 'is', month: 8 };
    s.recordConversion({ signature, action: 'upgrade_vehicle_to_4wd', kind: 'shown' });
    s.recordConversion({ signature, action: 'upgrade_vehicle_to_4wd', kind: 'shown' });
    s.recordConversion({ signature, action: 'upgrade_vehicle_to_4wd', kind: 'chosen_top' });
    const r = s.getPersuasionRate({ signature, action: 'upgrade_vehicle_to_4wd' });
    expect(r.shown_count).toBe(2);
    expect(r.chosen_top_count).toBe(1);
    // Laplace: (1+1)/(2+2)=0.5
    expect(r.rate).toBeCloseTo(0.5);
  });
});

