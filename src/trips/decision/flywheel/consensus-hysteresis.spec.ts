import { updateConsensusLatch } from './consensus-hysteresis';

describe('consensus-hysteresis', () => {
  it('enters emergency when 3 unique users INCREASE in last 6h', () => {
    const nowMs = Date.now();
    const at = new Date(nowMs - 60_000).toISOString();
    const out = updateConsensusLatch(
      { isEmergency: false },
      [
        { edgeId: 'e1', factor: 'global', direction: 'INCREASE', strength01: 0.2, reason: 'x', at, userId: 'u1', contextKey: 'IS:4:SUV' },
        { edgeId: 'e2', factor: 'global', direction: 'INCREASE', strength01: 0.2, reason: 'y', at, userId: 'u2', contextKey: 'IS:4:SUV' },
        { edgeId: 'e3', factor: 'global', direction: 'INCREASE', strength01: 0.2, reason: 'z', at, userId: 'u3', contextKey: 'IS:4:SUV' },
      ] as any,
      { contextKey: 'IS:4:SUV', nowMs, enterWindowHours: 6, enterMinUsers: 3, exitQuietHours: 12, exitMinDecreaseUsers: 2 },
    );
    expect(out.state.isEmergency).toBe(true);
  });

  it('stays emergency until 12h quiet + 2 DECREASE users', () => {
    const nowMs = Date.now();
    const lastInc = nowMs - 5 * 3600_000; // 5h ago
    const out = updateConsensusLatch(
      { isEmergency: true, lastIncreaseAtMs: lastInc, decreaseUsers: ['u1'] },
      [
        { edgeId: 'e1', factor: 'global', direction: 'DECREASE', strength01: 0.2, reason: 'ok', at: new Date(nowMs - 60_000).toISOString(), userId: 'u2', contextKey: 'IS:4:SUV' },
      ] as any,
      { contextKey: 'IS:4:SUV', nowMs, enterWindowHours: 6, enterMinUsers: 3, exitQuietHours: 12, exitMinDecreaseUsers: 2 },
    );
    expect(out.state.isEmergency).toBe(true); // not quiet enough
  });
});

