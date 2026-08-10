import {
  assertDecisionRuntimeEntry,
  commitDecisionSelection,
  projectDecisionProblemForTrace,
  runDecisionSupportPipeline,
  runRouteScopeDecision,
  runVehicleRoadFitDecision,
  tryRunDecisionFromMessage,
} from './decision-runtime.util';
import { compileAgentTaskContract } from './compile-agent-task-contract.util';
import { assertCapability } from './assert-task-capability.util';

describe('Decision Runtime D2 pipeline', () => {
  function decisionContract(message: string) {
    const c = compileAgentTaskContract({
      message,
      turnId: 'turn-d',
      tripId: 'trip_dec',
    });
    expect(c.taskType).toBe('DECISION_SUPPORT');
    expect(c.authority).toBe('DECISION_COMMIT');
    expect(assertCapability(c, 'CREATE_DECISION').ok).toBe(true);
    expect(assertCapability(c, 'APPLY').ok).toBe(false);
    expect(assertCapability(c, 'PLAN').ok).toBe(false);
    return c;
  }

  it('CASE-D01: 两驱还是四驱 — Options→Gate→Compare→Recommend→Commit，不 APPLY', () => {
    const message = '我们租两驱还是四驱？可能要走一点高地 F-road';
    const contract = decisionContract(message);
    const pipe = runVehicleRoadFitDecision({ contract, message });

    expect(pipe.phasesCompleted).toEqual(
      expect.arrayContaining(['PROBLEM', 'OPTIONS', 'GATE', 'COMPARE', 'RECOMMEND']),
    );
    expect(pipe.phasesCompleted).not.toContain('COMMIT');
    expect(pipe.awaitingSelect).toBe(true);
    expect(pipe.problem.decisionKey).toBe('VEHICLE_ROAD_FIT');
    expect(pipe.problem.commitAuthority).toBe('DECISION_ONLY');
    expect(pipe.problem.recommendedOptionId).toBe('4wd');
    expect(pipe.gateResults.find((g) => g.optionId === '2wd')?.passed).toBe(false);
    expect(pipe.recommendationZh).toMatch(/四驱/);

    const committed = runVehicleRoadFitDecision({
      contract,
      message,
      selectedOptionId: '4wd',
    });
    expect(committed.phasesCompleted).toEqual(
      expect.arrayContaining(['SELECT', 'COMMIT']),
    );
    expect(committed.problem.status).toBe('COMMITTED');
    expect(committed.problem.selectedOptionId).toBe('4wd');
    expect(projectDecisionProblemForTrace(committed.problem).commit_authority).toBe(
      'DECISION_ONLY',
    );
  });

  it('CASE-D02: 环岛还是南岸 — 短行程偏向南岸；Commit 不改 Plan', () => {
    const message = '环岛还是只跑南岸？我们只有 5 天，想轻松一点';
    const contract = decisionContract(message);
    const pipe = runRouteScopeDecision({ contract, message });
    expect(pipe.problem.recommendedOptionId).toBe('south_coast');
    expect(pipe.awaitingSelect).toBe(true);

    const committed = commitDecisionSelection(pipe.problem, 'south_coast');
    expect(committed.status).toBe('COMMITTED');
    expect(committed.commitAuthority).toBe('DECISION_ONLY');
  });

  it('tryRunDecisionFromMessage routes known decision utterances', () => {
    const c = decisionContract('两驱还是四驱');
    const r = tryRunDecisionFromMessage({ contract: c, message: '两驱还是四驱' });
    expect(r?.problem.kind).toBe('VEHICLE_ROAD_FIT');
  });

  it('TRIP_QUERY contract cannot enter Decision Runtime', () => {
    const q = compileAgentTaskContract({
      message: '哪一天没住宿',
      turnId: 'q',
      tripId: 't1',
    });
    expect(() => assertDecisionRuntimeEntry(q)).toThrow(/CREATE_DECISION|capability_denied/);
  });

  it('pipeline rejects APPLY-capable misconfigured contract', () => {
    const c = compileAgentTaskContract({
      message: '两驱还是四驱',
      turnId: 'bad',
      tripId: 't1',
    });
    const poisoned = {
      ...c,
      capabilities: {
        allow: [...c.capabilities.allow, 'APPLY' as const],
        deny: c.capabilities.deny.filter((x) => x !== 'APPLY'),
      },
    };
    expect(() =>
      runDecisionSupportPipeline({
        contract: poisoned,
        kind: 'GENERIC_CHOICE',
        questionZh: '选 A 还是 B？',
        options: [
          { optionId: 'a', labelZh: 'A', scoreHint: 1 },
          { optionId: 'b', labelZh: 'B', scoreHint: 2 },
        ],
      }),
    ).toThrow(/APPLY is forbidden/);
  });
});
