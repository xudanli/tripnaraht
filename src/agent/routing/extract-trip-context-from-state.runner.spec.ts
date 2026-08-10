import { extractTripContextFromState } from './extract-trip-context-from-state.runner';
import type { ExtractTripContextFromStateHost } from './extract-trip-context-from-state.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('extract-trip-context-from-state.runner', () => {
  it('builds minimal context when trip_plan_request missing', () => {
    const host: ExtractTripContextFromStateHost = {
      extractSeason: () => 'winter',
    };
    const ctx = extractTripContextFromState(host, {
      request_id: 'r1',
    } as unknown as OrchestratorState);
    expect(ctx.itinerary.countries).toEqual([]);
  });

  it('uses memory nationality and season', () => {
    const host: ExtractTripContextFromStateHost = {
      agentMemoryContextStore: {
        get: () => ({ userBasics: { nationality: 'CN' } }),
      },
      extractSeason: () => 'summer',
    };
    const ctx = extractTripContextFromState(host, {
      request_id: 'r1',
      trip_plan_request: {
        destination: 'IS-Reykjavik',
        date_range: { start_date: '2026-07-01', end_date: '2026-07-10' },
      },
    } as unknown as OrchestratorState);
    expect(ctx.traveler.nationality).toBe('CN');
    expect(ctx.itinerary.season).toBe('summer');
    expect(ctx.itinerary.countries[0]).toBe('IS');
  });
});
