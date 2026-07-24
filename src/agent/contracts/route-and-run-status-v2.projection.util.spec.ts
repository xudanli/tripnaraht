import {
  inferStatusV2FromLegacy,
  legacyStatusStableUnderV2Projection,
  projectLegacyResultStatus,
} from './route-and-run-status-v2.projection.util';

describe('route-and-run-status-v2 projection', () => {
  it('projects RESOLVED + SUCCEEDED → OK', () => {
    const legacy = projectLegacyResultStatus({
      execution: { status: 'SUCCEEDED' },
      decision: { status: 'RESOLVED' },
      freshness: { status: 'CURRENT' },
      action: { status: 'NOT_REQUESTED' },
    });
    expect(legacy).toBe('OK');
  });

  it('projects NEEDS_CONFIRMATION → NEED_CONFIRMATION', () => {
    const legacy = projectLegacyResultStatus({
      execution: { status: 'SUCCEEDED' },
      decision: { status: 'NEEDS_CONFIRMATION' },
      freshness: { status: 'CURRENT' },
      action: { status: 'NOT_REQUESTED' },
    });
    expect(legacy).toBe('NEED_CONFIRMATION');
  });

  it('projects CONFLICTED + STALE → NEED_MORE_INFO', () => {
    const legacy = projectLegacyResultStatus({
      execution: { status: 'SUCCEEDED' },
      decision: { status: 'CONFLICTED' },
      freshness: { status: 'STALE' },
      action: { status: 'NOT_REQUESTED' },
    });
    expect(legacy).toBe('NEED_MORE_INFO');
  });

  it('legacy round-trip stable for known status pairs', () => {
    const statuses = [
      'OK',
      'PROCESSING',
      'NEED_MORE_INFO',
      'NEED_CONFIRMATION',
      'FAILED',
      'TIMEOUT',
      'REDIRECT_REQUIRED',
      'NEED_CONSENT',
    ] as const;
    for (const s of statuses) {
      expect(legacyStatusStableUnderV2Projection(s)).toBe(true);
    }
  });

  it('infers CONFLICTED decision from trip version conflict hint', () => {
    const v2 = inferStatusV2FromLegacy({
      legacyStatus: 'OK',
      tripVersionConflict: true,
    });
    expect(v2.decision.status).toBe('CONFLICTED');
    expect(v2.freshness.status).toBe('STALE');
  });
});
