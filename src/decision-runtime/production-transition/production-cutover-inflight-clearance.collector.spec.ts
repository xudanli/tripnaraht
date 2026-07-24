import { collectInflightClearance } from './production-cutover-inflight-clearance.collector';
import type { InflightOverlayFile } from './production-cutover-inflight-clearance.collector';

const validOverlay = (overrides: Partial<InflightOverlayFile> = {}): InflightOverlayFile => {
  const base = {
    value: 0,
    source: 'postgresql',
    checkedAt: '2026-07-02T12:00:00.000Z',
    checkedBy: 'test',
    evidence: 'sql:test-harness-v1',
  };
  const fields = [
    'activeDecisionRuns',
    'pausedDecisionRuns',
    'pausedDecisionRunsAcknowledged',
    'pendingAuthorizations',
    'expiredButExecutableAuthorizations',
    'orphanAuthorizations',
    'activeExecutions',
    'activeRollbacks',
    'unresolvedPartialFailures',
    'activeWriteLeases',
    'pendingQueueWriteJobs',
    'effectivePlanWritesLast5Minutes',
    'planVersionsCreatedLast5Minutes',
    'executeRequestsLast5Minutes',
  ] as const;
  const overlay = {} as InflightOverlayFile;
  for (const f of fields) {
    overlay[f] =
      f === 'pausedDecisionRunsAcknowledged'
        ? { ...base, value: true }
        : { ...base, ...(overrides[f] ?? {}) };
  }
  return { ...overlay, ...overrides };
};

describe('collectInflightClearance', () => {
  it('not ready without auditable overlay', async () => {
    const report = await collectInflightClearance({ prisma: null });
    expect(report.ready).toBe(false);
    expect(report.missingOverlayFields.length).toBeGreaterThan(0);
  });

  it('ready when all overlay fields are 0 with evidence', async () => {
    const report = await collectInflightClearance({
      prisma: null,
      overlay: validOverlay(),
    });
    expect(report.ready).toBe(true);
    expect(report.activeDecisionRuns).toBe(0);
    expect(report.authorization).toEqual({
      pendingAuthorizations: 0,
      expiredButExecutableAuthorizations: 0,
      orphanAuthorizations: 0,
    });
  });

  it('rejects overlay without evidence fields', async () => {
    const report = await collectInflightClearance({
      prisma: null,
      overlay: { activeDecisionRuns: { value: 0 } } as unknown as InflightOverlayFile,
    });
    expect(report.ready).toBe(false);
    expect(report.overlayEvidenceInvalid).toContain('activeDecisionRuns');
  });

  it('blocks non-zero decision runs even with overlay', async () => {
    const report = await collectInflightClearance({
      prisma: null,
      overlay: validOverlay({
        activeDecisionRuns: {
          value: 1,
          source: 'postgresql',
          checkedAt: '2026-07-02T12:00:00.000Z',
          checkedBy: 'ops',
          evidence: 'sql:active-decision-runs-v1',
        },
      }),
    });
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('decision-runs');
  });

  it('requires paused ack when paused runs > 0', async () => {
    const report = await collectInflightClearance({
      prisma: null,
      overlay: validOverlay({
        pausedDecisionRuns: {
          value: 2,
          source: 'postgresql',
          checkedAt: '2026-07-02T12:00:00.000Z',
          checkedBy: 'ops',
          evidence: 'sql:paused-decision-runs-v1',
        },
        pausedDecisionRunsAcknowledged: {
          value: false,
          source: 'decision-runtime-ops-review',
          checkedAt: '2026-07-02T12:00:00.000Z',
          checkedBy: 'ops',
          evidence: 'runbook:paused-runs-not-reviewed',
        },
      }),
    });
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('paused-runs-unacknowledged');
  });
});
