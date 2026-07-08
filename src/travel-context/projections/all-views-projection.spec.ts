import { buildIcelandPlanningContextFixture } from '../../harness/evals/fixtures/contexts/iceland-planning.fixture';
import { TravelContextProjectionResolverService } from '../projections/travel-context-projection-resolver.service';
import { assertAllProjectionsShareRevision } from '../../harness/evals/projections/projection-consistency.util';
import { mapTripOpenDecisions } from './view-projections.util';

describe('view-projections.util — trip open decisions', () => {
  it('maps workflow status and enforcement to OpenDecision', () => {
    const open = mapTripOpenDecisions({
      counts: { total: 1, blocking: 1, actionable: 1 },
      sources: [
        {
          problemId: 'prob_1',
          title: 'F208 closed',
          workflowStatus: 'WAITING_DECISION',
          enforcement: 'BLOCK',
        },
      ],
    });
    expect(open[0]?.decisionId).toBe('prob_1');
    expect(open[0]?.authorizationRequired).toBe(true);
    expect(open[0]?.status).toBe('WAITING_USER');
  });
});

describe('ALL-VIEWS-PROJECTION-001 — eight views share revision', () => {
  const resolver = new TravelContextProjectionResolverService();
  const snapshot = buildIcelandPlanningContextFixture();

  it('resolveAll returns 8 views with same revision', () => {
    const envelopes = resolver.resolveAll(snapshot);
    expect(envelopes).toHaveLength(8);
    const assertions = assertAllProjectionsShareRevision(
      envelopes.map((e) => ({ revision: e.revision, view: e.view })),
    );
    expect(assertions.every((a) => a.pass)).toBe(true);
  });

  it('each view includes observability schemaVersion', () => {
    for (const envelope of resolver.resolveAll(snapshot)) {
      expect(envelope.observability?.schemaVersion).toBe('travel-context-v1');
    }
  });
});
