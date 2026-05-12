import type { ExecutionIR } from './execution-ir.types';
import { ExecutionIRSources } from './execution-ir.types';
import { assertIRCreatedOnlyByCompiler } from './ir-creation-guard';

describe('assertIRCreatedOnlyByCompiler', () => {
  it('accepts compiler-shaped IR', () => {
    const ir: ExecutionIR = {
      version: '1',
      steps: [{ type: 'CHECK', nodeId: 'n1' }],
      meta: {
        deterministic: true,
        source: ExecutionIRSources.DAG_COMPILER,
        dagId: 'abc',
        compiledAt: Date.now(),
      },
    };
    expect(() => assertIRCreatedOnlyByCompiler(ir, 'test')).not.toThrow();
  });

  it('rejects non-compiler source', () => {
    const ir = {
      version: '1',
      steps: [{ type: 'CHECK', nodeId: 'n1' }],
      meta: {
        deterministic: true,
        source: 'hand_roll',
        dagId: 'x',
        compiledAt: 1,
      },
    } as unknown as ExecutionIR;
    expect(() => assertIRCreatedOnlyByCompiler(ir, 'test')).toThrow(/\[IR-LOCK\]/);
  });
});
