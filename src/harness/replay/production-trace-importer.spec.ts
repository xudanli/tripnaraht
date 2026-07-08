import { importProductionTraceToHarnessCase, parseProductionTraceJson } from './production-trace-importer';
import { buildIcelandPlanningContextFixture } from '../evals/fixtures/contexts/iceland-planning.fixture';
import { buildAuthorityHarnessAnchor } from '../evals/authority/authority-context-anchor.util';

describe('production-trace-importer', () => {
  it('imports trace to harness case with regression id', () => {
    const inputAnchor = buildAuthorityHarnessAnchor({
      tripId: 'trip_replay',
      runtimeAuthority: 'CANONICAL',
    });

    const imported = importProductionTraceToHarnessCase({
      traceId: 'trace_abc123',
      capturedAt: '2026-07-05T12:00:00.000Z',
      contextId: inputAnchor.contextId,
      inputAnchor,
      outputAnchor: {
        ...inputAnchor,
        outputRevision: inputAnchor.inputRevision + 1,
      },
      triggerType: 'WORLD_EVENT',
      anonymized: true,
    });

    expect(imported.harnessCase.category).toBe('REPLAY');
    expect(imported.harnessCase.caseId).toMatch(/^REGRESSION-/);
    expect(imported.harnessCase.expect.invariants).toContain('CTX-STATE-002');
    expect(imported.fixtureId).toMatch(/^replay_/);
  });

  it('parseProductionTraceJson rejects invalid payload', () => {
    expect(parseProductionTraceJson(null)).toBeNull();
    expect(parseProductionTraceJson({ traceId: 'x' })).toBeNull();
  });

  it('parseProductionTraceJson accepts valid minimal trace', () => {
    const anchor = buildAuthorityHarnessAnchor({ tripId: 't1' });
    const parsed = parseProductionTraceJson({
      traceId: 'tr1',
      capturedAt: '2026-07-05T12:00:00.000Z',
      contextId: anchor.contextId,
      inputAnchor: anchor,
      triggerType: 'USER_INTENT',
      anonymized: true,
    });
    expect(parsed?.traceId).toBe('tr1');
  });
});

describe('replay-runner integration shell', () => {
  it('fixture supports replay harness case generation', () => {
    const snapshot = buildIcelandPlanningContextFixture();
    const anchor = buildAuthorityHarnessAnchor({ tripId: snapshot.identity.tripId });
    const { harnessCase } = importProductionTraceToHarnessCase({
      traceId: 'road_closure_001',
      capturedAt: new Date().toISOString(),
      contextId: snapshot.identity.contextId,
      inputAnchor: anchor,
      triggerType: 'WORLD_EVENT',
      anonymized: true,
    });
    expect(harnessCase.given.contextFixtureId).toContain('road_closure');
  });
});
