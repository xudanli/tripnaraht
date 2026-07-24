import { VatnajokullTrailStatusProvider } from '../providers/vatnajokull-trail-status.provider';

describe('VatnajokullTrailStatusProvider', () => {
  const provider = new VatnajokullTrailStatusProvider();

  it('loadLocalSnapshot 解析步道 JSON', () => {
    const snap = provider.loadLocalSnapshot();
    expect(snap?.trails.length).toBeGreaterThan(0);
  });

  it('toStatusOverrides CLOSED → ACTIVE 覆盖', () => {
    const snap = provider.loadLocalSnapshot();
    expect(snap).toBeDefined();
    const overrides = provider.toStatusOverrides(snap!);
    const s3 = overrides.find((o) => o.id.includes('s3'));
    expect(s3?.status).toBe('ACTIVE');
    expect(s3?.notes).toMatch(/关闭|CLOSED/i);
  });
});
