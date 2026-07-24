import { buildIcelandPlanningContextFixture } from '../fixtures/contexts/iceland-planning.fixture';
import {
  assertProjectionConsistency001,
  assertProjectionConsistency002,
  buildProjectionConsistencyReport,
} from './projection-consistency.util';
import {
  expectTravelContextHarnessPass,
  runTravelContextHarnessCase,
} from '../../protocol/run-travel-context-harness.util';
import { TravelContextProjectionResolverService } from '../../../travel-context/projections/travel-context-projection-resolver.service';
import { assertAllProjectionsShareRevision } from './projection-consistency.util';

describe('PROJECTION-CONSISTENCY-001 — open decision count alignment', () => {
  const snapshot = buildIcelandPlanningContextFixture();
  const resolver = new TravelContextProjectionResolverService();

  it('overview, decisions view, and snapshot SSOT agree on open decision count', async () => {
    const result = await runTravelContextHarnessCase({
      caseId: 'PROJECTION-CONSISTENCY-001',
      snapshot,
      run: async () => assertProjectionConsistency001(snapshot),
    });

    expectTravelContextHarnessPass(result);
    expect(result.anchor.inputRevision).toBe(snapshot.meta.revision);
    expect(result.anchor.contextId).toBe(snapshot.identity.contextId);
  });

  it('report helper surfaces mismatch for debugging', () => {
    const report = buildProjectionConsistencyReport(snapshot);
    expect(report.overviewOpenCount).toBe(2);
    expect(report.decisionsOpenCount).toBe(2);
    expect(report.snapshotOpenCount).toBe(2);
  });

  it('fails when open array length disagrees with counts (negative control)', async () => {
    const broken = buildIcelandPlanningContextFixture({
      decisions: {
        open: snapshot.decisions.open,
        counts: { total: 99, blocking: 0, actionable: 2 },
      },
    });

    const result = await runTravelContextHarnessCase({
      caseId: 'PROJECTION-CONSISTENCY-001-NEG',
      snapshot: broken,
      run: async () => assertProjectionConsistency001(broken),
    });

    expect(result.pass).toBe(false);
    expect(
      result.errors.some((e) => e.includes('decisions_open_array_length_matches_count')),
    ).toBe(true);
  });
});

describe('PROJECTION-CONSISTENCY-002 — effective plan version alignment', () => {
  const snapshot = buildIcelandPlanningContextFixture();

  it('plan effective version matches meta.bindings', async () => {
    const result = await runTravelContextHarnessCase({
      caseId: 'PROJECTION-CONSISTENCY-002',
      snapshot,
      run: async () => assertProjectionConsistency002(snapshot),
    });
    expectTravelContextHarnessPass(result);
  });
});

describe('PROJECTION-CONSISTENCY-003 — all views share revision', () => {
  const snapshot = buildIcelandPlanningContextFixture();
  const resolver = new TravelContextProjectionResolverService();

  it('overview, plan, decisions, monitoring envelopes use same revision', async () => {
    const views = (['overview', 'plan', 'decisions', 'monitoring'] as const).map((view) =>
      resolver.resolve(snapshot, view),
    );

    const result = await runTravelContextHarnessCase({
      caseId: 'PROJECTION-CONSISTENCY-003',
      snapshot,
      run: async () => assertAllProjectionsShareRevision(views),
    });

    expectTravelContextHarnessPass(result);
    for (const v of views) {
      expect(v.revision).toBe(snapshot.meta.revision);
      expect(v.snapshotId).toBe(snapshot.meta.snapshotId);
    }
  });
});
