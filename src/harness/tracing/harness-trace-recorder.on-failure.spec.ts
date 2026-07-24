import { HarnessStepName } from '../contracts/harness-step.types';
import { HarnessFailureLevel } from '../failures/failure-level.enum';
import { HarnessTraceRecorderService } from './harness-trace-recorder.service';

describe('HarnessTraceRecorderService.retrofitTrajectoryOnFailure', () => {
  it('builds closed trace with retrofit metadata', () => {
    const recorder = new HarnessTraceRecorderService();
    const trace = recorder.retrofitTrajectoryOnFailure({
      traceId: 't-1',
      requestId: 'r-1',
      failedPhase: HarnessStepName.VERIFY,
      runStatus: 'FAILED',
      failureEvents: [
        {
          traceId: 't-1',
          requestId: 'r-1',
          step: HarnessStepName.VERIFY,
          level: HarnessFailureLevel.LEVEL_2_LOGIC_GAP,
          type: 'LOGIC',
          code: 'EVIDENCE_SNAPSHOT_UNBOUND',
          message: 'unbound',
          autoRecoverable: true,
          suggestedAction: 'RETURN_TO_RESEARCH',
          createdAt: new Date().toISOString(),
        },
      ],
      validationResults: [
        {
          passed: false,
          severity: 'L2',
          code: 'EVIDENCE_SNAPSHOT_UNBOUND',
          message: 'unbound',
        },
      ],
      dsoSnapshot: {
        harnessRuntime: { researchEvidenceSnapshotId: 'snap-1' },
        constraints: { gateOutcome: 'ALLOW' },
        systemState: { currentPhase: 'VERIFY' },
      },
      priorFailuresSummary: [],
    });

    expect(trace.endedAt).toBeDefined();
    expect(trace.retrofit?.triggeredBy).toBe('ON_FAILURE_TRIGGER');
    expect(trace.steps).toHaveLength(1);
    expect(recorder.getTrace('t-1')).toBe(trace);
  });
});
