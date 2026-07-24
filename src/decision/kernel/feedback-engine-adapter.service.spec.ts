/**
 * FeedbackEngineAdapterService 单元测试（Scheme D）
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackEngineAdapterService } from './feedback-engine-adapter.service';
import type { DecisionState } from './decision-state.types';
import { RLHFSignalCollectorService } from '../../agent/services/rlhf-signal-collector.service';

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

  it('recordDecisionLog 应写入 observationHarness 与 dilemmaElicitationHint（P0）', async () => {
    const recorded: unknown[] = [];
    const collector = {
      recordFeedbackSignal: jest.fn((s: unknown) => {
        recorded.push(s);
        return s;
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        FeedbackEngineAdapterService,
        { provide: RLHFSignalCollectorService, useValue: collector },
      ],
    }).compile();
    const svc = mod.get(FeedbackEngineAdapterService);

    const state = {
      systemState: { requestId: 'run-1', version: 1 },
      userIntent: { destination: 'X' },
      environmentState: {},
      tripState: {},
      optimizationHints: {
        dilemmaElicitationHint: { reason: 'EVIDENCE_CONTRADICTION', crossSpread: 0.5, hint: 'ask user' },
      },
      research_data: {
        observationHarness: {
          parallel: true,
          minVoiScore: 0.1,
          audit: [
            {
              execution: { evidenceKind: 'station_forecast', summary: 'ok' },
            },
          ],
          suggestDilemmaElicitation: { reason: 'EVIDENCE_CONTRADICTION', crossSpread: 0.5 },
          passabilityEvidence: { passability01: 0.4, evidenceWeight: 0.8 },
          excludedPoiIds: ['p1'],
        },
      },
    } as DecisionState;

    await svc.recordDecisionLog(state, 'PLAN_SCORE');
    expect(collector.recordFeedbackSignal).toHaveBeenCalled();
    const arg = collector.recordFeedbackSignal.mock.calls[0][0] as {
      context: { observationHarness?: { schemaVersion: number }; dilemmaElicitationHint?: { reason: string } };
    };
    expect(arg.context.observationHarness?.schemaVersion).toBe(1);
    expect(arg.context.dilemmaElicitationHint?.reason).toBe('EVIDENCE_CONTRADICTION');
  });

  it('recordOutcomeCapture 带 rlhfJsonEval 时应附加 jsonKvInfluence', async () => {
    const collector = { recordFeedbackSignal: jest.fn((s: unknown) => s) };
    const mod = await Test.createTestingModule({
      providers: [
        FeedbackEngineAdapterService,
        { provide: RLHFSignalCollectorService, useValue: collector },
      ],
    }).compile();
    const svc = mod.get(FeedbackEngineAdapterService);

    await svc.recordOutcomeCapture({
      tripRunId: 't1',
      userId: 'u1',
      subjective: { satisfaction: 0.9 },
      rlhfJsonEval: {
        contextSnapshot: { userIntent: { budget: 1000 } },
        utilityWeights: { cost: 1 },
        modification: { field: 'userIntent.budget', from: 900, to: 1000 },
      },
    });

    const ctx = collector.recordFeedbackSignal.mock.calls[0][0].context as {
      jsonKvInfluence?: { entries: { path: string }[] };
    };
    expect(ctx.jsonKvInfluence?.entries?.length).toBeGreaterThan(0);
  });
});
