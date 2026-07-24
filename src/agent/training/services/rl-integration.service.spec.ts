import { ConfigService } from '@nestjs/config';
import { RLIntegrationService } from './rl-integration.service';
import { ConstraintsEngineService } from './constraints-engine.service';
import { EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';

describe('RLIntegrationService Phase 6', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
  });

  function createService(constraintsEngine?: Partial<ConstraintsEngineService>) {
    const config = {
      get: (key: string) => {
        if (key === 'RL_INTEGRATION_ENABLED') return true;
        return undefined;
      },
    } as ConfigService;
    return new RLIntegrationService(
      config,
      undefined,
      constraintsEngine as ConstraintsEngineService,
    );
  }

  it('CAS-101: preDecision blocks trip mutation when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const svc = createService();
    const result = await svc.preDecision({
      requestId: 'req_101',
      action: 'readiness.applyRepair',
      userRequest: 'fix blocker',
      params: { tripId: 't1' },
    });
    expect(result.allowed).toBe(false);
    expect(result.writeChainRequired).toBe(true);
    expect(result.action).toBe('REJECT');
    expect(result.authorizedPaths?.length).toBeGreaterThan(0);
  });

  it('CAS-102: gateway-delegated violations become warnings not REJECT', async () => {
    delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    const engine = {
      checkConstraints: jest.fn().mockResolvedValue({
        is_blocked: false,
        block_authority: 'gateway',
        violations: [{ message: 'F208 closed' }],
        warnings: [{ message: 'soft hint' }],
      }),
    };
    const svc = createService(engine);
    const result = await svc.preDecision({
      requestId: 'req_102',
      action: 'readiness.check',
      userRequest: 'check',
      params: {},
    });
    expect(result.allowed).toBe(true);
    expect(result.warnings?.some((w) => w.includes('F208 closed'))).toBe(true);
    expect(result.warnings?.some((w) => w.includes('soft hint'))).toBe(true);
  });

  it('CAS-103: write chain response uses standard code constant', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const svc = createService();
    const result = await svc.preDecision({
      requestId: 'req_103',
      action: 'apply-repair',
      userRequest: 'x',
      params: {},
    });
    expect(result.writeChainRequired).toBe(true);
    expect(result.reasoning).toContain('Plan mutation blocked');
  });

  it('CAS-113: delegated is_blocked=true does not REJECT (defense in depth)', async () => {
    delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    process.env.CONSTRAINT_AGENT_BLOCK_DELEGATED = '1';
    const engine = {
      checkConstraints: jest.fn().mockResolvedValue({
        is_blocked: true,
        block_authority: 'gateway',
        narrate_only: true,
        violations: [{ message: 'hard rule' }],
        warnings: [],
      }),
    };
    const svc = createService(engine);
    const result = await svc.preDecision({
      requestId: 'req_113',
      action: 'readiness.check',
      userRequest: 'check',
      params: {},
    });
    expect(result.allowed).toBe(true);
    expect(result.action).not.toBe('REJECT');
    expect(result.warnings?.some((w) => w.includes('hard rule'))).toBe(true);
  });
});
