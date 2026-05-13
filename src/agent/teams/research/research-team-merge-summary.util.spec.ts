import { buildTeamMergeSummary } from './research-team-merge-summary.util';
import type { ResearchContextMergeManifest } from './research-context.types';

describe('buildTeamMergeSummary', () => {
  it('aggregates keys and evidence counts per scope', () => {
    const log: ResearchContextMergeManifest[] = [
      {
        source: 'DestinationResearchMember',
        phase: 'parallel',
        keysTouched: ['poi_evidence', 'countryCode'],
        evidenceRefsAppended: 2,
      },
      {
        source: 'HotelResearchMember',
        phase: 'parallel',
        keysTouched: ['live_hotel_refresh'],
        evidenceRefsAppended: 1,
      },
      {
        source: 'TransportResearchMember',
        phase: 'pre_parallel',
        keysTouched: ['transport_evidence'],
        evidenceRefsAppended: 1,
      },
    ];
    expect(buildTeamMergeSummary(log)).toEqual({
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 4,
      scope_mutations: {
        destination: {
          updated_keys: ['countryCode', 'poi_evidence'],
          evidence_added_count: 2,
        },
        hotel: {
          updated_keys: ['live_hotel_refresh'],
          evidence_added_count: 1,
        },
        transport: {
          updated_keys: ['transport_evidence'],
          evidence_added_count: 1,
        },
      },
      fallback_suture_count: 0,
    });
  });

  it('dedupes same key from repeated merges into one scope bucket', () => {
    const log: ResearchContextMergeManifest[] = [
      { source: 'FlightResearchMember', phase: 'parallel', keysTouched: ['x'], evidenceRefsAppended: 0 },
      { source: 'FlightResearchMember', phase: 'sequential', keysTouched: ['x', 'y'], evidenceRefsAppended: 2 },
    ];
    const s = buildTeamMergeSummary(log);
    expect(s.scope_mutations.flight?.updated_keys).toEqual(['x', 'y']);
    expect(s.scope_mutations.flight?.evidence_added_count).toBe(2);
    expect(s.total_keys_touched).toBe(2);
    expect(s.fallback_suture_count).toBe(0);
  });

  it('counts FALLBACK_SUTURE manifests toward suture bucket', () => {
    const log: ResearchContextMergeManifest[] = [
      {
        source: 'FALLBACK_SUTURE',
        phase: 'parallel',
        keysTouched: ['live_hotel_refresh'],
        evidenceRefsAppended: 0,
        attribution: 'FALLBACK_SUTURE',
      },
    ];
    const s = buildTeamMergeSummary(log);
    expect(s.fallback_suture_count).toBe(1);
    expect(s.scope_mutations.suture?.updated_keys).toContain('live_hotel_refresh');
  });

  it('returns empty summary for undefined log', () => {
    expect(buildTeamMergeSummary(undefined)).toEqual({
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 0,
      scope_mutations: {},
      fallback_suture_count: 0,
    });
  });

  it('merges 5.0 global financial report and shadow alerts into summary', () => {
    const s = buildTeamMergeSummary(undefined, {
      globalReport: {
        lines: [{ scope: 'hotel', slot_id: 'p:0:x', estimated_cost: 200, marginal_utility: 0.4 }],
        total_estimated_cost: 200,
        total_user_budget: 10000,
      },
      budgetShadowAlerts: [
        {
          code: 'BUDGET_OVERRUN_ALERT',
          total_user_budget: 10000,
          total_estimated_cost: 11000,
          overrun_amount: 1000,
          overrun_ratio: 0.1,
          high_marginal_utility_contributors: [],
        },
      ],
    });
    expect(s.total_estimated_cost).toBe(200);
    expect(s.total_trip_budget).toBe(10000);
    expect(s.financial_lines).toHaveLength(1);
    expect(s.budget_shadow_alerts).toHaveLength(1);
  });
});
