import { DecisionStatsService } from './decision-stats.service';
import { countAbuPostNeptuneRechecks } from '../shared/persona-closure-log.util';

describe('DecisionStatsService.getPersonaClosureStats', () => {
  it('aggregates trip-level closure metrics from logs', async () => {
    const prisma = {
      decisionLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            tripId: 'trip-1',
            persona: 'NEPTUNE',
            action: 'REPLACE',
            decisionStage: 'SPATIAL_REPAIR',
            metadata: null,
          },
          {
            tripId: 'trip-1',
            persona: 'ABU',
            action: 'ALLOW',
            decisionStage: 'ABU_GATE',
            metadata: { persona_closure: { iter: 0, phase: 'post_neptune_recheck' } },
          },
          {
            tripId: 'trip-1',
            persona: 'ABU',
            action: 'ALLOW',
            decisionStage: 'FINALIZE',
            metadata: {
              personaClosureAudit: {
                iters: [],
                stopReason: 'ABU_RECHECK_PASS',
                totalAbuRechecks: 1,
              },
            },
          },
          {
            tripId: 'trip-2',
            persona: 'NEPTUNE',
            action: 'REPLACE',
            decisionStage: 'SPATIAL_REPAIR',
            metadata: null,
          },
          {
            tripId: 'trip-2',
            persona: 'ABU',
            action: 'REJECT',
            decisionStage: 'ABU_GATE',
            metadata: { persona_closure: { iter: 0, phase: 'post_neptune_recheck' } },
          },
          {
            tripId: 'trip-2',
            persona: 'ABU',
            action: 'REJECT',
            decisionStage: 'FINALIZE',
            metadata: {
              personaClosureAudit: {
                iters: [],
                stopReason: 'NEPTUNE_SHRINK_EXHAUSTED',
                totalAbuRechecks: 1,
              },
            },
          },
        ]),
      },
    };

    const service = new DecisionStatsService(prisma as any);
    const stats = await service.getPersonaClosureStats();

    expect(stats.neptuneReplaceTripCount).toBe(2);
    expect(stats.closureTriggeredTripCount).toBe(2);
    expect(stats.personaClosureTriggerRate).toBe(1);
    expect(stats.abuRejectAfterReplaceRate).toBe(0.5);
    expect(stats.stopReasonCounts.ABU_RECHECK_PASS).toBe(1);
    expect(stats.stopReasonCounts.NEPTUNE_SHRINK_EXHAUSTED).toBe(1);
    expect(countAbuPostNeptuneRechecks).toBeDefined();
  });
});
