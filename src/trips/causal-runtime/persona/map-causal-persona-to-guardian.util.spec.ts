import { mapCausalProjectionToGuardianEvaluation } from './map-causal-persona-to-guardian.util';
import type { CausalPersonaProjection } from './causal-persona-projection.types';
import { CAUSAL_PERSONA_PROJECTION_SCHEMA } from './causal-persona-projection.types';

describe('mapCausalProjectionToGuardianEvaluation', () => {
  it('maps kernel slices to guardian evaluation without LLM', () => {
    const projection: CausalPersonaProjection = {
      schema: CAUSAL_PERSONA_PROJECTION_SCHEMA,
      kernelAuthoritative: true,
      abu: {
        persona: 'ABU',
        verdict: 'REJECT',
        explanation: 'F-road closed',
        causalChain: ['policy:F_ROAD_CLOSED'],
        evidence: [{ source: 'Kernel', excerpt: 'closed', relevance: 'policy' }],
        source: 'decision_kernel',
      },
      neptune: {
        persona: 'NEPTUNE',
        verdict: 'REPLACE',
        explanation: 'Shift departure',
        causalChain: ['intervention:SHIFT_TIME'],
        evidence: [],
        recommendations: [
          { action: '提前 30 分钟', reason: 'wind buffer', impact: 'lower miss' },
        ],
        source: 'iceland_causal_module',
      },
    };

    const result = mapCausalProjectionToGuardianEvaluation(projection);
    expect(result.guardiansInvoked).toEqual(['Abu', 'Neptune']);
    expect(result.evaluation.abu?.passed).toBe(false);
    expect(result.evaluation.neptune?.alternatives?.[0]?.replacement).toBe('提前 30 分钟');
    expect(result.insights.some((i) => i.persona === 'Abu' && i.severity === 'error')).toBe(true);
  });
});
