import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ExplorationPrincipleSummaryService } from './exploration-principle-summary.service';
import type { ExplorationInput } from '../types/exploration.types';

describe('ExplorationPrincipleSummaryService', () => {
  const input: ExplorationInput = {
    destinationCodes: ['IS'],
    dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
    travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
    mobilityContext: { vehicleType: '4WD_SUV' },
    source: 'USER_CREATED',
  };

  const scenarios = {
    requireOwnedScenario: jest.fn(),
    parseInitialInput: jest.fn(),
  };

  let service: ExplorationPrincipleSummaryService;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EXPLORATION_PRINCIPLE_SUMMARY = '1';
    scenarios.requireOwnedScenario.mockResolvedValue({
      status: 'DRAFT',
      initialInput: input,
    });
    scenarios.parseInitialInput.mockReturnValue(input);
    service = new ExplorationPrincipleSummaryService(scenarios as never);
  });

  afterEach(() => {
    delete process.env.EXPLORATION_PRINCIPLE_SUMMARY;
    delete process.env.EXPLORATION_LLM_PRINCIPLE_SUMMARY_LIVE;
  });

  it('returns placeholder for empty principles', async () => {
    const result = await service.previewSummary('user-1', 'scn-1', []);
    expect(result.summary).toBeNull();
    expect(result.placeholder).toContain('请选择');
  });

  it('generates RULES summary reflecting rank 1 principle', async () => {
    const result = await service.previewSummary('user-1', 'scn-1', [
      { principleId: 'CORE_EXPERIENCE_FIRST', rank: 1 },
      { principleId: 'LOW_DRIVING', rank: 2 },
    ]);
    expect(result.source).toBe('RULES');
    expect(result.summary).toContain('核心体验优先');
    expect(result.highlights?.[0]).toContain('最高优先级');
    expect(result.generatedAt).toBeTruthy();
  });

  it('changes summary when rank 1 changes', async () => {
    const a = await service.previewSummary('user-1', 'scn-1', [
      { principleId: 'CORE_EXPERIENCE_FIRST', rank: 1 },
    ]);
    const b = await service.previewSummary('user-1', 'scn-1', [
      { principleId: 'STAY_STABILITY', rank: 1 },
    ]);
    expect(a.summary).not.toEqual(b.summary);
    expect(b.summary).toContain('住宿稳定');
  });

  it('rejects invalid principleId', async () => {
    await expect(
      service.previewSummary('user-1', 'scn-1', [
        { principleId: 'INVALID' as never, rank: 1 },
      ]),
    ).rejects.toThrow();
  });

  it('rejects locked scenario', async () => {
    scenarios.requireOwnedScenario.mockResolvedValue({ status: 'COMPLETED', initialInput: input });
    await expect(
      service.previewSummary('user-1', 'scn-1', [
        { principleId: 'LOW_DRIVING', rank: 1 },
      ]),
    ).rejects.toThrow(ConflictException);
  });

  it('throws 503 when feature disabled', async () => {
    delete process.env.EXPLORATION_PRINCIPLE_SUMMARY;
    process.env.EXPLORATION_CONSUMER_MVP_ENABLED = '0';
    await expect(
      service.previewSummary('user-1', 'scn-1', [
        { principleId: 'LOW_DRIVING', rank: 1 },
      ]),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
