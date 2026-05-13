import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import {
  isLeaderScopedMemberPackContext,
  isScopedCommerceTransportOnlyContext,
} from './research-scoped-commerce.eligibility';

describe('isLeaderScopedMemberPackContext', () => {
  const basePrior = { hotel_search_meta: { x: 1 } };

  it('returns true for scoped_partial with hotel+flight+transport and trip', () => {
    const ctx: PhaseExecutorContext = {
      requestId: 'r1',
      researchMode: 'scoped_partial',
      priorResearchData: basePrior,
      researchScopesToRecompute: ['hotel', 'flight', 'transport'],
      tripPlanRequest: { destination: 'Tokyo' },
    };
    expect(isLeaderScopedMemberPackContext(ctx)).toBe(true);
  });

  it('returns true when destination is in scopes with prior', () => {
    const ctx: PhaseExecutorContext = {
      requestId: 'r1',
      researchMode: 'scoped_partial',
      priorResearchData: basePrior,
      researchScopesToRecompute: ['hotel', 'destination'],
      tripPlanRequest: { destination: 'Tokyo' },
    };
    expect(isLeaderScopedMemberPackContext(ctx)).toBe(true);
  });

  it('returns true for compliance-only scopes with prior', () => {
    const ctx: PhaseExecutorContext = {
      requestId: 'r1',
      researchMode: 'scoped_partial',
      priorResearchData: basePrior,
      researchScopesToRecompute: ['compliance'],
      tripPlanRequest: { destination: 'Tokyo' },
    };
    expect(isLeaderScopedMemberPackContext(ctx)).toBe(true);
  });

  it('rejects common scope mixed with leader pack scopes', () => {
    const ctx: PhaseExecutorContext = {
      requestId: 'r1',
      researchMode: 'scoped_partial',
      priorResearchData: basePrior,
      researchScopesToRecompute: ['hotel', 'common'],
      tripPlanRequest: { destination: 'Tokyo' },
    };
    expect(isLeaderScopedMemberPackContext(ctx)).toBe(false);
  });

  it('rejects missing prior', () => {
    const ctx: PhaseExecutorContext = {
      requestId: 'r1',
      researchMode: 'scoped_partial',
      researchScopesToRecompute: ['hotel'],
      tripPlanRequest: { destination: 'Tokyo' },
    };
    expect(isLeaderScopedMemberPackContext(ctx)).toBe(false);
  });

  it('deprecated alias matches leader helper', () => {
    const ctx: PhaseExecutorContext = {
      requestId: 'r1',
      researchMode: 'scoped_partial',
      priorResearchData: basePrior,
      researchScopesToRecompute: ['hotel', 'flight', 'transport'],
      tripPlanRequest: { destination: 'Tokyo' },
    };
    expect(isScopedCommerceTransportOnlyContext(ctx)).toBe(isLeaderScopedMemberPackContext(ctx));
  });
});
