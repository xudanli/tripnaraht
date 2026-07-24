import { DecisionTelemetryReplayService } from './decision-telemetry-replay.service';

describe('DecisionTelemetryReplayService', () => {
  it('replays stored counterfactual projection', async () => {
    const prisma = {
      decisionLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dec-1',
          userChoice: { selectedOptionId: 'guided' },
          availableOptions: [],
          metadata: {
            telemetry_v2: {
              decision: { optionId: 'guided' },
              candidates: [
                {
                  optionId: 'guided',
                  label: '跟团',
                  counterfactual: { projected_outcome: { satisfaction: 4 } },
                },
                {
                  optionId: 'self-drive',
                  label: '自驾',
                  counterfactual: {
                    projected_outcome: { satisfaction: 2.5, trip_friction_score: 0.8 },
                    narrative_zh: '冬季自驾风险高',
                  },
                },
              ],
            },
          },
        }),
      },
    };

    const svc = new DecisionTelemetryReplayService(prisma as never);
    const result = await svc.replayCounterfactual({
      decisionLogId: 'dec-1',
      alternativeOptionId: 'self-drive',
    });

    expect(result.source).toBe('stored_projection');
    expect(result.answer_zh).toContain('冬季自驾');
    expect(result.projection.projected_outcome?.trip_friction_score).toBe(0.8);
  });
});
