import { Test } from '@nestjs/testing';
import { HarnessEvalModule } from '../harness-eval.module';
import { L1SmokeGateService } from './l1-smoke-gate.service';

describe('L1SmokeGateService', () => {
  it('applies lint strict and on-failure trace env', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HarnessEvalModule] }).compile();
    const gate = moduleRef.get(L1SmokeGateService);
    gate.applyEvalEnvironment();
    expect(process.env.ORCHESTRATOR_CONTEXT_LINT_STRICT).toBe('1');
    expect(process.env.HARNESS_TRACE_MODE).toBe('on-failure');
    await moduleRef.close();
  });
});
