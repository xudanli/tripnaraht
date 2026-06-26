import { Test, TestingModule } from '@nestjs/testing';
import { LoopStopPolicyService } from './loop-stop-policy.service';
import { getLoopDefinition } from '../registry/loop-definition.registry';

describe('LoopStopPolicyService', () => {
  let service: LoopStopPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoopStopPolicyService],
    }).compile();
    service = module.get(LoopStopPolicyService);
  });

  it('stops when success criteria met', () => {
    const def = getLoopDefinition('READINESS_REPAIR');
    const result = service.evaluateReadinessRepairSuccess(def, {
      readinessScore: 90,
      hardBlockers: 0,
      mustHandleCount: 0,
      suggestAdjustCount: 0,
      canStartExecute: true,
      verdictStatus: 'EXECUTABLE',
    });
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.status).toBe('COMPLETED');
    }
  });

  it('detects no progress', () => {
    const result = service.evaluateNoProgress({
      previousHardBlockers: 3,
      currentHardBlockers: 3,
      previousReadiness: 62,
      currentReadiness: 62,
      recentProposalKeys: ['issue-1:opt-a'],
      currentProposalKey: 'issue-1:opt-a',
    });
    expect(result.stop).toBe(true);
    if (result.stop) {
      expect(result.reason).toBe('no_progress_detected');
    }
  });

  it('caps iterations', () => {
    const result = service.evaluateIterationCap(5, 5);
    expect(result.stop).toBe(true);
  });
});
