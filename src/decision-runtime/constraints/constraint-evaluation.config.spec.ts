import {
  normalizeDecisionRuntimeMode,
  resolveEffectiveRuntimeMode,
  shouldRunFullPlanOptimizationShadow,
  isCanonicalPlanSelectionAuthority,
} from './constraint-evaluation.config';

describe('constraint-evaluation.config runtime modes', () => {
  const prev = process.env.DECISION_RUNTIME_MODE;

  afterEach(() => {
    if (prev === undefined) delete process.env.DECISION_RUNTIME_MODE;
    else process.env.DECISION_RUNTIME_MODE = prev;
  });

  it('maps deprecated CANARY to DUAL_RUN', () => {
    expect(normalizeDecisionRuntimeMode('CANARY')).toBe('DUAL_RUN');
  });

  it('runs shadow for SHADOW and DUAL_RUN but not CANONICAL', () => {
    process.env.DECISION_RUNTIME_MODE = 'SHADOW';
    expect(shouldRunFullPlanOptimizationShadow()).toBe(true);
    expect(isCanonicalPlanSelectionAuthority()).toBe(false);

    process.env.DECISION_RUNTIME_MODE = 'DUAL_RUN';
    expect(shouldRunFullPlanOptimizationShadow()).toBe(true);
    expect(resolveEffectiveRuntimeMode()).toBe('DUAL_RUN');

    process.env.DECISION_RUNTIME_MODE = 'CANONICAL';
    expect(shouldRunFullPlanOptimizationShadow()).toBe(false);
    expect(isCanonicalPlanSelectionAuthority()).toBe(true);
  });

  it('treats legacy CANARY env as DUAL_RUN shadow (not authority)', () => {
    process.env.DECISION_RUNTIME_MODE = 'CANARY';
    expect(resolveEffectiveRuntimeMode()).toBe('DUAL_RUN');
    expect(isCanonicalPlanSelectionAuthority()).toBe(false);
    expect(shouldRunFullPlanOptimizationShadow()).toBe(true);
  });
});
