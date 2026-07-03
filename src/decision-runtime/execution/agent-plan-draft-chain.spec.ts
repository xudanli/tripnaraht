import {
  isAgenticMutationGuardForcedByWriteChain,
  resolveAgenticMutationWriteGuardMode,
} from './agentic-tool-side-effect.util';
import { isAgentPlanDraftOnlyEnabled } from './effective-plan-write-chain.config';

describe('Agent draft-only + agentic guard (Phase 5)', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
  const originalAgentic = process.env.AGENTIC_MUTATION_WRITE_GUARD;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
    if (originalAgentic === undefined) delete process.env.AGENTIC_MUTATION_WRITE_GUARD;
    else process.env.AGENTIC_MUTATION_WRITE_GUARD = originalAgentic;
  });

  it('CAS-082: write chain enables agent plan draft-only', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    expect(isAgentPlanDraftOnlyEnabled()).toBe(true);
  });

  it('CAS-083: write chain forces agentic mutation guard ENFORCE when unset', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    delete process.env.AGENTIC_MUTATION_WRITE_GUARD;
    expect(resolveAgenticMutationWriteGuardMode()).toBe('ENFORCE');
    expect(isAgenticMutationGuardForcedByWriteChain()).toBe(true);
  });

  it('CAS-084: explicit AGENTIC_MUTATION_WRITE_GUARD=OFF overrides write chain', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    process.env.AGENTIC_MUTATION_WRITE_GUARD = 'OFF';
    expect(resolveAgenticMutationWriteGuardMode()).toBe('OFF');
    expect(isAgenticMutationGuardForcedByWriteChain()).toBe(false);
  });
});
