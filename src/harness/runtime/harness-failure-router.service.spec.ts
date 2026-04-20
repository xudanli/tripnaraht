import { HarnessFailureRouterService } from './harness-failure-router.service';
import { HarnessStepName } from '../contracts/harness-step.types';
import type { HarnessStepContract } from '../contracts/harness-step.types';
import type { HarnessGraderResult } from '../inferential/harness-inferential-grader.interface';

describe('HarnessFailureRouterService', () => {
  const contract: HarnessStepContract = {
    name: HarnessStepName.VERIFY,
    allowedTools: [],
    requiredInputPaths: [],
    requiredOutputPaths: [],
    readableStatePaths: [],
    writableStatePaths: [],
    deterministicValidators: [],
    onFailure: {
      level1: 'RETRY',
      level2: 'RETURN_TO_RESEARCH',
      level3: 'BLOCK',
    },
  };

  it('eventsFromGraderResults 将未通过的 grader 转为 failure event', () => {
    const router = new HarnessFailureRouterService();
    const results: HarnessGraderResult[] = [
      {
        passed: false,
        score: 0,
        label: 'bad pacing',
        explanation: 'Too tight',
        severity: 'L2',
      },
    ];
    const ev = router.eventsFromGraderResults(contract, 't1', 'r1', HarnessStepName.VERIFY, results);
    expect(ev).toHaveLength(1);
    expect(ev[0].code).toContain('GRADER');
    expect(ev[0].suggestedAction).toBe('RETURN_TO_RESEARCH');
  });
});
