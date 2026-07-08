import { resolveDecisionRuntimeCapabilities } from '../execution/decision-runtime-capabilities.util';
import { evaluateLegacyDeprecatedReadiness } from './legacy-deprecated-readiness.evaluator';
import { evaluateConstraintDefaultOnPromotion } from './constraint-default-on-promotion.evaluator';
import { buildCanonicalDefaultPreviewCapabilities } from '../p4-phase/canonical-default-promotion.evaluator';

describe('legacy-deprecated-readiness.evaluator', () => {
  it('is not fully ready before production flip', () => {
    const caps = resolveDecisionRuntimeCapabilities();
    const eval_ = evaluateLegacyDeprecatedReadiness(caps);
    expect(eval_.ready).toBe(false);
  });

  it('passes legacy-boolean gate when architecture lint is clean', () => {
    const caps = resolveDecisionRuntimeCapabilities();
    const eval_ = evaluateLegacyDeprecatedReadiness(caps);
    const legacy = eval_.gates.find((g) => g.gateId === 'legacy-boolean-callers-zero');
    expect(legacy?.pass).toBe(true);
  });
});

describe('constraint-default-on-promotion.evaluator', () => {
  it('evaluates DEFAULT_ON readiness with preview caps', () => {
    const base = resolveDecisionRuntimeCapabilities();
    const preview = buildCanonicalDefaultPreviewCapabilities(base);
    const eval_ = evaluateConstraintDefaultOnPromotion(preview);
    expect(eval_.scenarios.length).toBe(7);
    expect(eval_.gates.find((g) => g.gateId === 'constraint-gateway-on')?.pass).toBe(true);
  });
});
