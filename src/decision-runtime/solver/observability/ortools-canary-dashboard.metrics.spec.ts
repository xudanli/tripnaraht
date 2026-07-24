import { OrToolsCanaryDashboardCollector } from './ortools-canary-dashboard.metrics';

describe('OrToolsCanaryDashboardCollector', () => {
  it('exposes safety / quality / release views with audit fields', () => {
    const c = new OrToolsCanaryDashboardCollector();
    c.record({
      decisionId: 'd1',
      tripId: 't1',
      operation: 'SHIFT',
      at: new Date().toISOString(),
      canaryStage: 'selected_trips',
      whitelistMatched: true,
      authorityArtifactId: 'm4-ra01-test',
      authorityTokenId: 'tok_ab12',
      candidateProvider: 'ortools-repair',
      decisionAuthority: 'decision-runtime',
      writeAuthorizer: 'gateway',
      fallbackProvider: 'neptune-repair',
      gatewayResult: 'PASS',
      decisionResult: 'ACCEPT',
      evidenceVersionAtSolve: 'ev-1',
      evidenceVersionAtExecute: 'ev-1',
      planVersionId: 'pv-1',
      elapsedMs: 42,
      outcomes: {
        gatewayBypass: false,
        unauthorizedPlanVersionWrite: false,
        evidenceStaleContinued: false,
        bookedContentMutated: false,
        autoFallbackFailed: false,
        duplicatePlanVersion: false,
        fellBackToNeptune: false,
        revalidatedAfterWrite: true,
        localityOk: true,
        candidateAccepted: true,
        travelDeltaMin: -12,
        timeWindowImproved: true,
      },
    });
    const snap = c.snapshot();
    expect(snap.views.safety.gatewayBypass).toBe(0);
    expect(snap.views.quality.candidatePassRate).toBe(1);
    expect(snap.views.release.whitelistMatchedTotal).toBe(1);
    expect(snap.views.release.canaryStagesSeen).toContain('selected_trips');
    expect(c.hasSafetyIncident(snap)).toBe(false);
    expect(snap.recent[0].authorityTokenId).toBe('tok_ab12');
  });
});
