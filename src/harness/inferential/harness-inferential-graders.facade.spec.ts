import { Test } from '@nestjs/testing';
import { HarnessModule } from '../harness.module';
import { HarnessInferentialGradersFacade } from './harness-inferential-graders.facade';
import type { HarnessExecutionContext } from '../runtime/execution-context.types';
import { HarnessStepName } from '../contracts/harness-step.types';

describe('HarnessInferentialGradersFacade', () => {
  it('stub-pass.grader 已注册且恒通过', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    const facade = moduleRef.get(HarnessInferentialGradersFacade);
    const ctx: HarnessExecutionContext = {
      traceId: 't',
      requestId: 'r',
      step: HarnessStepName.VERIFY,
      visibleState: {},
      visibleEvidence: [],
      allowedTools: [],
      writableStatePaths: [],
      metadata: { startedAt: new Date().toISOString(), actor: 'test' },
    };
    const results = await facade.runAll(['stub-pass.grader'], {}, ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].label).toBe('STUB_PASS');
  });

  it('pacing-heuristic.grader 对过密日程返回未通过', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    const facade = moduleRef.get(HarnessInferentialGradersFacade);
    const many = Array.from({ length: 26 }, (_, i) => ({ id: `p${i}` }));
    const ctx: HarnessExecutionContext = {
      traceId: 't',
      requestId: 'r',
      step: HarnessStepName.PLAN_GEN,
      visibleState: {
        tripState: { planDraft: { days: [{ items: many }] } },
      },
      visibleEvidence: [],
      allowedTools: [],
      writableStatePaths: [],
      metadata: { startedAt: new Date().toISOString(), actor: 'test' },
    };
    const results = await facade.runAll(['pacing-heuristic.grader'], {}, ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].label).toBe('PACING_OVERPACKED');
  });

  it('未注册的 grader 名称返回 MISSING_GRADER', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    const facade = moduleRef.get(HarnessInferentialGradersFacade);
    const ctx: HarnessExecutionContext = {
      traceId: 't',
      requestId: 'r',
      step: HarnessStepName.VERIFY,
      visibleState: {},
      visibleEvidence: [],
      allowedTools: [],
      writableStatePaths: [],
      metadata: { startedAt: new Date().toISOString(), actor: 'test' },
    };
    const results = await facade.runAll(['unknown.grader'], {}, ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].label).toBe('MISSING_GRADER');
  });
});
