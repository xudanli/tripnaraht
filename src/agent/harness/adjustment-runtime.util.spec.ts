import {
  applyConfirmedAdjustmentDraft,
  assertAdjustmentRuntimeEntry,
  assertNewAdjustmentTaskNotReusingQuery,
  confirmAdjustmentDraft,
  projectAdjustmentDraftForTrace,
  runAdjustmentDraftPipeline,
} from './adjustment-runtime.util';
import { compileAgentTaskContract } from './compile-agent-task-contract.util';
import { assertCapability } from './assert-task-capability.util';

describe('Adjustment Runtime Sprint 3', () => {
  it('CASE-A01: 第三天轻松一点 → Draft→Verify→WAIT_CONFIRM，Confirm 前禁 APPLY', async () => {
    const contract = compileAgentTaskContract({
      message: '把第3天行程轻松一点',
      turnId: 'a01',
      tripId: 't1',
    });
    expect(contract.taskType).toBe('ITINERARY_ADJUST');
    expect(contract.scope.days).toEqual([3]);
    expect(assertCapability(contract, 'APPLY').ok).toBe(false);
    expect(assertAdjustmentRuntimeEntry(contract).applyAllowed).toBe(false);

    const pipe = runAdjustmentDraftPipeline({
      contract,
      message: '把第3天行程轻松一点',
      beforeSummaryZh: 'Day3：蓝湖→黄金圈（节点偏满）',
      afterSummaryZh: 'Day3：蓝湖半日 + 雷市轻松散步（减车程）',
    });

    expect(pipe.awaitingConfirm).toBe(true);
    expect(pipe.draft.status).toBe('WAIT_CONFIRM');
    expect(pipe.draft.applyAllowed).toBe(false);
    expect(pipe.draft.goal.affectedDays).toEqual([3]);
    expect(pipe.draft.goal.intentKind).toBe('DAY_PACE');
    expect(pipe.phasesCompleted).toEqual(
      expect.arrayContaining(['DRAFT', 'VERIFY', 'BEFORE_AFTER', 'WAIT_CONFIRM']),
    );
    expect(pipe.phasesCompleted).not.toContain('APPLY');

    await expect(
      applyConfirmedAdjustmentDraft(pipe.draft, async () => ({ ok: true })),
    ).rejects.toThrow(/APPLY forbidden/);

    const confirmed = confirmAdjustmentDraft(pipe.draft);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.applyAllowed).toBe(true);

    const applied = await applyConfirmedAdjustmentDraft(confirmed, async () => ({
      ok: true,
      actionId: 'act_test',
      previousVersion: 'v1',
      newVersion: 'v2',
      rollbackToken: 'rb_1',
    }));
    expect(applied.status).toBe('APPLIED');
    expect(applied.receipt?.appliedToItinerary).toBe(true);
    expect(projectAdjustmentDraftForTrace(applied).receipt_action_id).toBe('act_test');
  });

  it('CASE-A02: 安排住宿 CTA 开新 ITINERARY_ADJUST task，不复用 Query taskId', () => {
    const query = compileAgentTaskContract({
      message: '哪一天没住宿',
      turnId: 'q01',
      tripId: 't1',
      taskId: 'task_query_q01',
    });
    expect(query.taskType).toBe('TRIP_QUERY');
    expect(query.authority).toBe('READ_ONLY');

    const adjust = compileAgentTaskContract({
      message: '帮我补第4天住宿',
      turnId: 'a02',
      tripId: 't1',
    });
    expect(adjust.taskType).toBe('ITINERARY_ADJUST');
    expect(adjust.scope.days).toEqual([4]);
    assertNewAdjustmentTaskNotReusingQuery({
      queryTaskId: query.taskId,
      adjustContract: adjust,
    });

    const pipe = runAdjustmentDraftPipeline({
      contract: adjust,
      message: '帮我补第4天住宿',
      beforeSummaryZh: 'Day4：缺过夜',
      afterSummaryZh: 'Day4：候选酒店走廊（待确认）',
    });
    expect(pipe.draft.goal.intentKind).toBe('LODGING_FILL');
    expect(pipe.awaitingConfirm).toBe(true);
  });

  it('TRIP_QUERY cannot enter Adjustment Runtime', () => {
    const q = compileAgentTaskContract({
      message: '哪一天没住宿',
      turnId: 'x',
      tripId: 't1',
    });
    expect(() => assertAdjustmentRuntimeEntry(q)).toThrow(/ITINERARY_ADJUST/);
  });

  it('repair loop respects maxRepairs then can still WAIT_CONFIRM after fix', () => {
    const contract = compileAgentTaskContract({
      message: '把第2天行程轻松一点',
      turnId: 'repair',
      tripId: 't1',
    });
    let attempts = 0;
    const pipe = runAdjustmentDraftPipeline({
      contract,
      message: '把第2天行程轻松一点',
      beforeSummaryZh: '满',
      afterSummaryZh: '草案',
      maxRepairs: 1,
      verifyFn: () => {
        attempts += 1;
        return attempts >= 2
          ? { ok: true, notesZh: ['ok'] }
          : { ok: false, notesZh: ['冲突'] };
      },
    });
    expect(pipe.draft.repairCount).toBe(1);
    expect(pipe.draft.status).toBe('WAIT_CONFIRM');
    expect(pipe.phasesCompleted).toContain('REPAIR');
  });
});
