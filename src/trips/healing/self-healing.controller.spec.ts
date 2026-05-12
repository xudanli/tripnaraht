import { SelfHealingController } from './self-healing.controller';

describe('SelfHealingController', () => {
  it('marks STABLE on quiet noop diff when scores allow', () => {
    const c = new SelfHealingController({ velocityThreshold: 100 });
    const out = c.ingest(
      {
        changedSlots: [],
        severity: 'LOW',
        requiresReplan: false,
        isMeaningfulChange: false,
      },
      1_000,
    );
    expect(out.status).toBe('STABLE');
    expect(out.shouldPauseStream).toBe(true);
  });

  it('marks UNSTABLE on high severity meaningful churn', () => {
    const c = new SelfHealingController();
    const out = c.ingest(
      {
        changedSlots: ['a'],
        severity: 'HIGH',
        requiresReplan: true,
        isMeaningfulChange: true,
      },
      2_000,
    );
    expect(out.status).toBe('UNSTABLE');
    expect(out.iteration).toBe(1);
    expect(out.shouldPauseStream).toBe(false);
  });
});
