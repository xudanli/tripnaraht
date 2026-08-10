import { resolveP3ModuleCleanupStatus } from './p3-module-cleanup-status.util';

describe('P3 module cleanup status', () => {
  it('defers Bull and lists archived orphans', () => {
    const s = resolveP3ModuleCleanupStatus();
    expect(s.jobQueueDecision).toBe('DEFER_BULL');
    expect(s.archivedOrphans.some((p) => p.includes('cron'))).toBe(true);
    expect(s.namingMap.length).toBeGreaterThanOrEqual(3);
  });
});
