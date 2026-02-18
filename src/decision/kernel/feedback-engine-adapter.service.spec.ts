/**
 * FeedbackEngineAdapterService 单元测试（Scheme D）
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackEngineAdapterService } from './feedback-engine-adapter.service';
import type { DecisionState } from './decision-state.types';

describe('FeedbackEngineAdapterService', () => {
  let service: FeedbackEngineAdapterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedbackEngineAdapterService],
    }).compile();
    service = module.get<FeedbackEngineAdapterService>(FeedbackEngineAdapterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 requestId 时应跳过 recordDecisionLog', async () => {
    const state = { systemState: {}, requestId: '' } as DecisionState;
    await expect(service.recordDecisionLog(state, 'TEST')).resolves.not.toThrow();
  });

  it('recordUserFeedback 无 rlhfCollector 时应静默跳过', async () => {
    await expect(
      service.recordUserFeedback({
        tripRunId: 't1',
        userId: 'u1',
        feedbackType: 'ACCEPT',
      }),
    ).resolves.not.toThrow();
  });
});
