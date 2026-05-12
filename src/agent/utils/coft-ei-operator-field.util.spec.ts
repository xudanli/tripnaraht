import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import { COFT_EI_OPERATOR_FIELD_SCHEMA } from '../contracts/coft-ei.types';
import { DEFAULT_CAUSAL_FIELD_DYNAMICS } from './cognitive-execution-pipeline.util';
import {
  applyCausalOperatorField,
  causalOperatorFieldFromKernel,
} from './coft-ei-operator-field.util';
import { ukhfKernelForward } from './ukhf-unified-kernel.util';

const K: CausalInteractionKernel = {
  agentOrder: ['a', 'b'],
  matrix: [
    [0, 0.2],
    [0.2, 0],
  ],
};

const phi0: CausalFieldSnapshot = {
  queryId: 'q',
  timeStep: 0,
  particles: [
    { agentId: 'a', phi: 0.5 },
    { agentId: 'b', phi: 0.3 },
  ],
};

describe('coft-ei-operator-field.util', () => {
  it('applyCausalOperatorField matches ukhfKernelForward on same Kθ', () => {
    const field = causalOperatorFieldFromKernel(K);
    const a = applyCausalOperatorField(field, phi0, 'SHADOW', DEFAULT_CAUSAL_FIELD_DYNAMICS);
    const b = ukhfKernelForward(phi0, K, 'SHADOW', DEFAULT_CAUSAL_FIELD_DYNAMICS);
    expect(a.particles).toEqual(b.particles);
  });

  it('schema constant is stable for observability', () => {
    expect(COFT_EI_OPERATOR_FIELD_SCHEMA).toBe('coft-ei/operator-field/v1');
  });
});
