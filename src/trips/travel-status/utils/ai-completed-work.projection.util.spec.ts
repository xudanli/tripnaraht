import { DECISION_AUTOMATION_ACTOR_USER_ID } from '../../../decision-runtime/monitoring/decision-automation-chain.service';
import { projectAiCompletedWorkItems } from './ai-completed-work.projection.util';

describe('projectAiCompletedWorkItems', () => {
  it('marks automation actor resolutions as AUTO_REPAIR', () => {
    const result = projectAiCompletedWorkItems({
      resolutions: {
        p1: {
          resolutionId: 'res_auto',
          problemId: 'problem_1',
          selectedActionId: 'cand_indoor',
          writeChain: 'RFC001',
          status: 'APPLIED',
          decidedAt: '2026-07-04T10:00:00.000Z',
          decidedByUserId: DECISION_AUTOMATION_ACTOR_USER_ID,
        },
      },
    });

    expect(result.items[0]).toMatchObject({
      kind: 'AUTO_REPAIR',
      automatic: true,
      summary: '已自动处理（cand_indoor）',
    });
  });

  it('keeps manual resolutions as DECISION_APPLIED', () => {
    const result = projectAiCompletedWorkItems({
      resolutions: {
        p1: {
          resolutionId: 'res_manual',
          problemId: 'problem_2',
          selectedActionId: 'cand_a',
          writeChain: 'RFC001',
          status: 'APPLIED',
          decidedAt: '2026-07-04T09:00:00.000Z',
          decidedByUserId: 'user_123',
        },
      },
    });

    expect(result.items[0]).toMatchObject({
      kind: 'DECISION_APPLIED',
      automatic: false,
      summary: '已选择修复方案（cand_a）',
    });
  });

  it('prefers automation change log entries with undo metadata', () => {
    const result = projectAiCompletedWorkItems({
      resolutions: {},
      tripMetadata: {
        automationChangeLog: {
          schemaId: 'tripnara.automation_change_log@v1',
          entries: [
            {
              logId: 'acl_test',
              problemId: 'problem_1',
              appliedAt: '2026-07-04T11:00:00.000Z',
              changeSummary: '已根据室内备选调整第 2 天，共修改 1 项，可撤销',
              status: 'APPLIED',
              selectedActionId: 'cand_indoor',
              undoActionId: 'original',
              automatic: true,
              reversible: true,
            },
          ],
        },
      },
    });

    expect(result.items[0]).toMatchObject({
      activityId: 'acl_test',
      changeSummary: '已根据室内备选调整第 2 天，共修改 1 项，可撤销',
      undo: { enabled: true, logId: 'acl_test', undoActionId: 'original' },
    });
  });
});
