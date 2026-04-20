import { Test } from '@nestjs/testing';
import { HarnessModule } from '../harness.module';
import { HarnessTrajectoryExporterService } from './harness-trajectory-exporter.service';
import { HarnessTraceRecorderService } from '../tracing/harness-trace-recorder.service';
import { HarnessStepName } from '../contracts/harness-step.types';

describe('HarnessTrajectoryExporterService', () => {
  it('toExportable 汇总 L2/L3 校验失败', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    const recorder = moduleRef.get(HarnessTraceRecorderService);
    const exporter = moduleRef.get(HarnessTrajectoryExporterService);
    recorder.ensureTrace('t-exp', 'req-x');
    recorder.appendStep('t-exp', {
      step: HarnessStepName.VERIFY,
      startedAt: 'a',
      endedAt: 'b',
      visibleStateSnapshot: {},
      toolCalls: [],
      validationResults: [
        { passed: false, severity: 'L3', code: 'X', message: 'hard' },
        { passed: false, severity: 'L2', code: 'Y', message: 'soft' },
      ],
    });
    recorder.finalize('t-exp', 'FAILED');
    const trace = recorder.getTrace('t-exp')!;
    const out = exporter.toExportable(trace, { tripId: 'trip-1' });
    expect(out.validationSummary.hardFailures).toBe(1);
    expect(out.validationSummary.logicGaps).toBe(1);
    expect(out.tripId).toBe('trip-1');
    expect(out.finalStatus).toBe('FAILED');
  });
});
