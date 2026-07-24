import { ConstraintsEngineService } from './constraints-engine.service';

describe('ConstraintsEngineService block delegation', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '1';
  });

  afterEach(() => {
    process.env = env;
  });

  afterAll(() => {
    process.env = env;
  });

  it('CAS-017: marks block_authority=gateway and never blocks when delegated', async () => {
    const service = new ConstraintsEngineService({} as never);
    const result = await service.checkConstraints({ days: [] } as any, {});
    expect(result.is_blocked).toBe(false);
    expect(result.block_authority).toBe('gateway');
  });

  it('CAS-112: Phase 6 delegates approval authority and sets narrate_only', async () => {
    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '0';
    process.env.PHASE6_LEGACY_DEPRECATION = '1';
    const service = new ConstraintsEngineService({} as never);
    const result = await service.checkConstraints({ days: [] } as any, {});
    expect(result.narrate_only).toBe(true);
    expect(result.requires_approval).toBe(false);
    expect(result.approval_authority).toBe('gateway');
  });
});
