import type { RoutePlanDraft } from '../shared/world-model.types';
import type { DecisionLogEntry } from '../shared/decision-result.types';
import { PersonaClosureLoopService } from './persona-closure-loop.service';
import type { WorldModelContext } from '../shared/world-model.types';

function log(stage: DecisionLogEntry['decisionStage'], persona: DecisionLogEntry['persona'], action: string): DecisionLogEntry {
  return {
    persona,
    action: action as DecisionLogEntry['action'],
    explanation: `${persona} ${action}`,
    reasonCodes: [`${persona}_${action}`],
    timestamp: new Date().toISOString(),
    decisionSource: 'PHYSICAL',
    decisionStage: stage,
  };
}

function plan(tripId: string, segments: Array<{ id: string; poiId?: string }>): RoutePlanDraft {
  return {
    tripId,
    routeDirectionId: 'rd-1',
    segments: segments.map((s) => ({ id: s.id, poiId: s.poiId } as RoutePlanDraft['segments'][0])),
  };
}

const minimalWorld = {
  physical: { countryCode: 'IS', month: 1, demEvidence: [], roadStates: [], hazardZones: [], ferryStates: [] },
  human: { maxDailyAscentM: 1000, rollingAscent3DaysM: 2000, maxSlopePct: 30 },
  routeDirection: { id: 'rd-1', tags: [] },
} as unknown as WorldModelContext;

describe('PersonaClosureLoopService', () => {
  let service: PersonaClosureLoopService;
  let abuEvaluate: jest.Mock;
  let dreEvaluate: jest.Mock;
  let nepEvaluate: jest.Mock;

  beforeEach(() => {
    abuEvaluate = jest.fn();
    dreEvaluate = jest.fn();
    nepEvaluate = jest.fn();
    service = new PersonaClosureLoopService(
      { evaluate: abuEvaluate } as any,
      { evaluate: dreEvaluate } as any,
      { evaluate: nepEvaluate } as any,
    );
  });

  it('NO_REPLACE: Neptune 未改 plan 时 Abu 只调用一次', async () => {
    const base = plan('t1', [{ id: 's1' }]);
    abuEvaluate.mockResolvedValue({ allowed: true, action: 'ALLOW', logs: [log('ABU_GATE', 'ABU', 'ALLOW')] });
    dreEvaluate.mockResolvedValue({ allowed: true, action: 'ALLOW', logs: [log('PACE_ADJUST', 'DR_DRE', 'ALLOW')] });
    nepEvaluate.mockResolvedValue({
      allowed: true,
      action: 'ALLOW',
      logs: [log('SPATIAL_REPAIR', 'NEPTUNE', 'ALLOW')],
    });

    const out = await service.run(minimalWorld, base, { maxIters: 2, maxNeptuneRetriesPerIter: 1, revalidateDrdreAfterAbuPass: false });

    expect(abuEvaluate).toHaveBeenCalledTimes(1);
    expect(out.allowed).toBe(true);
    expect(out.personaClosureAudit.stopReason).toBe('NO_REPLACE');
    expect(out.personaClosureAudit.totalAbuRechecks).toBe(0);
  });

  it('REPLACE 后 Abu 重验通过', async () => {
    const base = plan('t1', [{ id: 's1' }]);
    const patched = plan('t1', [{ id: 's2', poiId: 'p2' }]);
    abuEvaluate
      .mockResolvedValueOnce({ allowed: true, action: 'ALLOW', logs: [log('ABU_GATE', 'ABU', 'ALLOW')] })
      .mockResolvedValueOnce({ allowed: true, action: 'ALLOW', logs: [log('ABU_GATE', 'ABU', 'ALLOW')] });
    dreEvaluate.mockResolvedValue({ allowed: true, action: 'ALLOW', logs: [log('PACE_ADJUST', 'DR_DRE', 'ALLOW')] });
    nepEvaluate.mockResolvedValue({
      allowed: true,
      action: 'REPLACE',
      updatedPlan: patched,
      logs: [log('SPATIAL_REPAIR', 'NEPTUNE', 'REPLACE')],
    });

    const out = await service.run(minimalWorld, base);

    expect(abuEvaluate).toHaveBeenCalledTimes(2);
    expect(out.allowed).toBe(true);
    expect(out.plan).toBe(patched);
    expect(out.personaClosureAudit.stopReason).toBe('ABU_RECHECK_PASS');
    expect(out.personaClosureAudit.totalAbuRechecks).toBe(1);
    expect(out.logs.some((l) => (l.metadata as any)?.persona_closure?.phase === 'post_neptune_recheck')).toBe(true);
  });

  it('REPLACE 后 Abu 重验 REJECT 且无收缩成功 → REJECT', async () => {
    const base = plan('t1', [{ id: 's1' }]);
    const patched = plan('t1', [{ id: 's2', poiId: 'bad' }]);
    abuEvaluate
      .mockResolvedValueOnce({ allowed: true, action: 'ALLOW', logs: [log('ABU_GATE', 'ABU', 'ALLOW')] })
      .mockResolvedValueOnce({
        allowed: false,
        action: 'REJECT',
        logs: [log('ABU_GATE', 'ABU', 'REJECT')],
      });
    dreEvaluate.mockResolvedValue({ allowed: true, action: 'ALLOW', logs: [log('PACE_ADJUST', 'DR_DRE', 'ALLOW')] });
    nepEvaluate
      .mockResolvedValueOnce({
        allowed: true,
        action: 'REPLACE',
        updatedPlan: patched,
        logs: [log('SPATIAL_REPAIR', 'NEPTUNE', 'REPLACE')],
      })
      .mockResolvedValueOnce({
        allowed: true,
        action: 'ALLOW',
        logs: [log('SPATIAL_REPAIR', 'NEPTUNE', 'ALLOW')],
      });

    const out = await service.run(minimalWorld, base, {
      maxIters: 2,
      maxNeptuneRetriesPerIter: 1,
      revalidateDrdreAfterAbuPass: false,
    });

    expect(out.allowed).toBe(false);
    expect(out.finalAction).toBe('REJECT');
    expect(out.personaClosureAudit.stopReason).toBe('NEPTUNE_SHRINK_EXHAUSTED');
  });

  it('Abu 初检 REJECT 不进入闭环', async () => {
    abuEvaluate.mockResolvedValue({
      allowed: false,
      action: 'REJECT',
      logs: [log('ABU_GATE', 'ABU', 'REJECT')],
    });

    const out = await service.run(minimalWorld, plan('t1', [{ id: 's1' }]));

    expect(dreEvaluate).not.toHaveBeenCalled();
    expect(nepEvaluate).not.toHaveBeenCalled();
    expect(out.personaClosureAudit.stopReason).toBe('ABU_FATAL_REJECT');
  });
});
