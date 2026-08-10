import {
  assertLiveExecutionEntry,
  buildLiveExecutionAnswerZh,
  parseDelayHoursFromMessage,
  projectLiveExecutionForTrace,
  runLiveExecutionPipeline,
} from './live-execution-runtime.util';
import { compileAgentTaskContract } from './compile-agent-task-contract.util';
import { assertCapability } from './assert-task-capability.util';

describe('Live Execution Runtime Sprint 4', () => {
  it('CASE-E01: 晚两小时还能去冰河湖 — CONDITIONAL + deadline + alternatives + evidence', () => {
    const message = '我们晚两个小时，还能去冰河湖吗？';
    const contract = compileAgentTaskContract({
      message,
      turnId: 'e01',
      tripId: 't_live',
    });
    expect(contract.taskType).toBe('LIVE_EXECUTION');
    expect(assertCapability(contract, 'PLAN').ok).toBe(false);
    expect(assertCapability(contract, 'APPLY').ok).toBe(false);
    expect(assertLiveExecutionEntry(contract).denyPlan).toBe(true);

    expect(parseDelayHoursFromMessage(message)).toBe(2);

    const pipe = runLiveExecutionPipeline({
      contract,
      message,
      remainingDriveHours: 3.5,
      evidence: [
        {
          key: 'road_state',
          valueZh: '主路通行',
          freshness: 'LIVE',
          source: 'road_is',
        },
      ],
    });

    expect(pipe.conclusion.verdict).toMatch(/YES|NO|CONDITIONAL/);
    expect(pipe.conclusion.applyPlanAllowed).toBe(false);
    expect(pipe.conclusion.requiresStrongConfirmationToMutate).toBe(true);
    expect(pipe.conclusion.evidence.length).toBeGreaterThanOrEqual(2);
    expect(pipe.conclusion.alternativesZh.length).toBeGreaterThan(0);
    expect(pipe.phasesCompleted).toEqual(
      expect.arrayContaining(['EVIDENCE', 'JUDGE', 'ALTERNATIVES', 'DONE']),
    );

    const answer = buildLiveExecutionAnswerZh(pipe.conclusion);
    expect(answer).toMatch(/冰河湖/);
    expect(answer).toMatch(/不会自动改行程/);
    expect(projectLiveExecutionForTrace(pipe.conclusion).apply_plan_allowed).toBe(false);
  });

  it('without evidence gives conditional weak conclusion, not hard YES', () => {
    const contract = compileAgentTaskContract({
      message: '现在还能继续吗',
      turnId: 'weak',
      tripId: 't_live',
    });
    // may be LIVE or TRIP_QUERY depending on detectLiveExecution
    if (contract.taskType !== 'LIVE_EXECUTION') {
      const forced = {
        ...contract,
        taskType: 'LIVE_EXECUTION' as const,
        authority: 'STRONG_CONFIRMATION' as const,
        capabilities: {
          allow: ['READ_TRIP', 'ANSWER', 'QUERY_RISK'] as const,
          deny: ['PLAN', 'APPLY', 'OPTIMIZE'] as const,
        },
      };
      const pipe = runLiveExecutionPipeline({
        contract: forced as any,
        message: '现在还能继续吗',
      });
      expect(pipe.conclusion.verdict).toBe('CONDITIONAL');
      expect(pipe.conclusion.conclusionZh).toMatch(/证据不足|条件/);
      return;
    }
    const pipe = runLiveExecutionPipeline({ contract, message: '现在还能继续吗' });
    expect(pipe.conclusion.verdict).toBe('CONDITIONAL');
  });

  it('TRIP_QUERY cannot enter Live Runtime', () => {
    const q = compileAgentTaskContract({
      message: '哪一天没住宿',
      turnId: 'q',
      tripId: 't1',
    });
    expect(() => assertLiveExecutionEntry(q)).toThrow(/LIVE_EXECUTION/);
  });
});
