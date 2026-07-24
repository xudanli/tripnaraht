import type { DecisionCollaborativeSubTaskKind } from '../contracts/unified-decision-ui.types';

export interface DecisionCollaborativeSubTaskSuggestion {
  kind: DecisionCollaborativeSubTaskKind;
  title: string;
  description?: string;
}

/** Map semanticKey → default follow-up sub-tasks after apply. */
export function buildSuggestedSubTasks(
  semanticKey?: string,
): DecisionCollaborativeSubTaskSuggestion[] {
  const base = semanticKey?.split(':')[0]?.toUpperCase() ?? '';

  if (
    base === 'ROAD_SEGMENT_UNAVAILABLE' ||
    base === 'ROAD_SEGMENT_RESTRICTED' ||
    base === 'FEASIBILITY_FAILURE'
  ) {
    return [
      {
        kind: 'TEAM_CONFIRM',
        title: '确认团队接受备选路线',
        description: '通知同行人路线变更并确认可行',
      },
      {
        kind: 'BOOKING_FOLLOWUP',
        title: '检查受影响预订',
        description: '核对因路线变更需改期的酒店或活动预订',
      },
    ];
  }

  if (base === 'BOOKING_INVALID' || /BOOKING|ACCOMMODATION|HOTEL/i.test(base)) {
    return [
      {
        kind: 'ACCOMMODATION_LOOKUP',
        title: '查找替代住宿',
      },
      {
        kind: 'CANCELLATION_POLICY',
        title: '确认原预订取消政策',
      },
    ];
  }

  return [
    {
      kind: 'TEAM_CONFIRM',
      title: '团队确认决策结果',
      description: '确保所有成员知晓并已接受本次决策',
    },
  ];
}
