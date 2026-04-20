import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { HarnessModule } from '../harness.module';
import { HarnessReplayBuilderService } from './harness-replay-builder.service';
import { HarnessTraceRecorderService } from './harness-trace-recorder.service';
import { HarnessStepName } from '../contracts/harness-step.types';

describe('HarnessReplayBuilderService', () => {
  it('requireTrace 在不存在时抛 NotFoundException', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    const builder = moduleRef.get(HarnessReplayBuilderService);
    expect(() => builder.requireTrace('missing')).toThrow(NotFoundException);
  });

  it('buildReplayPayload 返回步骤数与摘要', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    const recorder = moduleRef.get(HarnessTraceRecorderService);
    const builder = moduleRef.get(HarnessReplayBuilderService);
    recorder.ensureTrace('tr-1', 'req-1');
    recorder.appendStep('tr-1', {
      step: HarnessStepName.PLAN_GEN,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      visibleStateSnapshot: {},
      toolCalls: [],
      validationResults: [{ passed: true, severity: 'L1', code: 'OK', message: 'ok' }],
    });
    const payload = builder.buildReplayPayload('tr-1');
    expect(payload.stepCount).toBe(1);
    expect(payload.summary).toContain('tr-1');
    expect(payload.summary).toContain('harnessTotalMs=');
    expect(payload.trace.steps[0].step).toBe(HarnessStepName.PLAN_GEN);
  });
});
