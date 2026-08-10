/**
 * P1 semantic convergence — config & budget dual-write tests.
 */

import {
  isBudgetLegacyDualWriteEnabled,
  isLegacyDecisionEngineDeprecatedForNewWork,
  isP1SemanticConvergenceEnabled,
} from './p1-semantic-convergence.config';
import { resolveConstraintGatewayMode } from './constraints/constraint-gateway-mode.config';
import { resolveDecisionRuntimeMode } from './constraints/constraint-evaluation.config';
import { dualWriteLegacyTotals } from '../trips/budget-os/utils/budget-config.util';
import { PLAN_VERSION_SEMANTICS } from './plan-version-semantics';
import { DECISION_INBOX_PROJECTIONS, listActiveDecisionInboxProjections } from './decision-inbox-semantics';
import { resolveP1SemanticConvergenceStatus } from './p1-semantic-convergence-status.util';

describe('P1 semantic convergence', () => {
  const keys = [
    'P1_SEMANTIC_CONVERGENCE',
    'CONSTRAINT_GATEWAY_MODE',
    'CONSTRAINT_EVALUATION_GATEWAY_ENABLED',
    'DECISION_RUNTIME_MODE',
    'DECISION_GATEWAY_UNIFIED',
    'RFC001_SHADOW_MODE',
    'BUDGET_DUAL_WRITE_LEGACY',
    'NODE_ENV',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('is off by default in test NODE_ENV', () => {
    expect(isP1SemanticConvergenceEnabled()).toBe(false);
    expect(resolveConstraintGatewayMode()).toBe('OFF');
    expect(resolveDecisionRuntimeMode()).toBe('LEGACY');
  });

  it('when P1 on: gateway ON, runtime CANONICAL, budget dual-write off', () => {
    process.env.P1_SEMANTIC_CONVERGENCE = '1';
    expect(isP1SemanticConvergenceEnabled()).toBe(true);
    expect(resolveConstraintGatewayMode()).toBe('ON');
    expect(resolveDecisionRuntimeMode()).toBe('CANONICAL');
    expect(isBudgetLegacyDualWriteEnabled()).toBe(false);
    expect(isLegacyDecisionEngineDeprecatedForNewWork()).toBe(true);
  });

  it('respects explicit SHADOW_COMPARE under P1', () => {
    process.env.P1_SEMANTIC_CONVERGENCE = '1';
    process.env.CONSTRAINT_GATEWAY_MODE = 'SHADOW_COMPARE';
    expect(resolveConstraintGatewayMode()).toBe('SHADOW_COMPARE');
  });

  it('budget dualWriteLegacyTotals skips legacy fields when P1 on', () => {
    process.env.P1_SEMANTIC_CONVERGENCE = '1';
    const out = dualWriteLegacyTotals(
      { totalBudget: 999 },
      {
        total: 100,
        currency: 'ISK',
        source: 'user',
        setAt: '2026-01-01T00:00:00.000Z',
      },
    );
    expect(out.budgetIntent?.total).toBe(100);
    expect(out.totalBudget).toBe(999); // unchanged legacy field
    expect(out.total).toBeUndefined();
  });

  it('budget dual-write can be forced on', () => {
    process.env.P1_SEMANTIC_CONVERGENCE = '1';
    process.env.BUDGET_DUAL_WRITE_LEGACY = '1';
    const out = dualWriteLegacyTotals(
      {},
      {
        total: 50,
        currency: 'CNY',
        source: 'user',
        setAt: '2026-01-01T00:00:00.000Z',
      },
    );
    expect(out.totalBudget).toBe(50);
    expect(out.total).toBe(50);
  });

  it('documents plan version taxonomy and inbox projections', () => {
    expect(PLAN_VERSION_SEMANTICS.length).toBeGreaterThanOrEqual(5);
    expect(listActiveDecisionInboxProjections().every((p) => p.disposition === 'KEEP')).toBe(
      true,
    );
    expect(DECISION_INBOX_PROJECTIONS.some((p) => p.disposition === 'DEPRECATE')).toBe(true);
  });

  it('status util exposes schema', () => {
    process.env.P1_SEMANTIC_CONVERGENCE = '1';
    const s = resolveP1SemanticConvergenceStatus();
    expect(s.schemaId).toBe('tripnara.p1_semantic_convergence@v1');
    expect(s.enabled).toBe(true);
    expect(s.constraintGateway.mode).toBe('ON');
    expect(s.decisionRuntime.mode).toBe('CANONICAL');
    expect(s.budget.legacyDualWriteEnabled).toBe(false);
  });
});
