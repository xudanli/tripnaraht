import { shouldPassthroughQueryRewriteForOrchestrationNl } from './query-rewrite-orchestration-guard.util';
import {
  AURORA_DAY_DESIGNATION_MSG,
  CONSULTANT_FULL_TRIP_REPLAN_MSG,
  TRIP_RANGE_6D_ICELAND,
} from './route-and-run-intent.fixtures';
import { rewriteQueryWithRules } from './query-rewriting.util';

describe('query-rewrite-orchestration-guard.util', () => {
  it('passthrough aurora day designation NL (not prepend destination)', () => {
    expect(shouldPassthroughQueryRewriteForOrchestrationNl(AURORA_DAY_DESIGNATION_MSG)).toBe(true);
    const out = rewriteQueryWithRules({
      query: AURORA_DAY_DESIGNATION_MSG,
      scene: 'hotel',
      session: { selectedDestination: '冰岛' },
    });
    expect(out.contextualized_query).toBe(AURORA_DAY_DESIGNATION_MSG);
    expect(out.contextualized_query).not.toMatch(/^冰岛\s/);
  });

  it('passthrough full trip replan NL', () => {
    expect(
      shouldPassthroughQueryRewriteForOrchestrationNl(
        CONSULTANT_FULL_TRIP_REPLAN_MSG,
        TRIP_RANGE_6D_ICELAND,
      ),
    ).toBe(true);
  });

  it('still rewrites genuine hotel search queries', () => {
    expect(shouldPassthroughQueryRewriteForOrchestrationNl('维克附近带温泉的酒店')).toBe(false);
    const out = rewriteQueryWithRules({
      query: '维克附近带温泉的酒店',
      scene: 'hotel',
      session: { selectedDestination: '冰岛' },
    });
    expect(out.contextualized_query).toMatch(/冰岛|维克/i);
  });
});
