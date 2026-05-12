import {
  mergeReplanLineageIntoTripRunMetadata,
  resolveOrchestratorPlanVersionAfterReplan,
  type TripRunReplanLineageInput,
} from './trip-run-replan-metadata.util';

describe('trip-run-replan-metadata.util', () => {
  describe('resolveOrchestratorPlanVersionAfterReplan', () => {
    it('returns 1 when no previous', () => {
      expect(resolveOrchestratorPlanVersionAfterReplan(undefined)).toBe(1);
      expect(resolveOrchestratorPlanVersionAfterReplan({})).toBe(1);
    });
    it('returns previous + 1, floored at 1', () => {
      expect(resolveOrchestratorPlanVersionAfterReplan({ previous_plan_version: 0 })).toBe(1);
      expect(resolveOrchestratorPlanVersionAfterReplan({ previous_plan_version: 3 })).toBe(4);
    });
  });

  it('returns base unchanged when lineage empty', () => {
    const base = { request_id: 'r1' };
    expect(mergeReplanLineageIntoTripRunMetadata(base, undefined)).toBe(base);
    expect(mergeReplanLineageIntoTripRunMetadata(base, {})).toEqual(base);
  });

  it('merges replan_context with version and hash', () => {
    const lineage: TripRunReplanLineageInput = {
      previous_plan_version: 4,
      previous_world_snapshot_hash: '  sha256:abc  ',
    };
    const out = mergeReplanLineageIntoTripRunMetadata({ request_id: 'r1' }, lineage);
    expect(out.request_id).toBe('r1');
    expect(out.replan_context).toEqual({
      previous_plan_version: 4,
      previous_world_snapshot_hash: 'sha256:abc',
    });
  });

  it('includes plan_version 0', () => {
    const out = mergeReplanLineageIntoTripRunMetadata(
      {},
      { previous_plan_version: 0 },
    );
    expect(out.replan_context).toEqual({ previous_plan_version: 0 });
  });

  it('omits replan_context when only whitespace hash and no version', () => {
    const out = mergeReplanLineageIntoTripRunMetadata({ a: 1 }, { previous_world_snapshot_hash: '   ' });
    expect(out).toEqual({ a: 1 });
  });
});
