import type {
  ConversationActionV1,
  TeamActionCardV1,
} from '../conversation-turn-result.types';

export type TeamActionAssembleSource = {
  suggested_operations?: Array<{
    id?: string;
    label?: string;
    kind?: string;
    payload?: Record<string, unknown>;
  }> | null;
  team_fitness_submission_status?: {
    pending?: Array<{ display_name?: string; name?: string }>;
    submitted?: Array<{ display_name?: string; name?: string }>;
    members?: Array<{
      display_name?: string;
      name?: string;
      submitted?: boolean;
    }>;
    answer_text?: string;
  } | null;
  answer_text?: string;
  notify_member_ids?: string[];
  notify_summary_zh?: string;
};

function isSilentVoteOp(op: {
  kind?: string;
  payload?: Record<string, unknown>;
  id?: string;
}): boolean {
  const route = String(op.payload?.route ?? op.payload?.action ?? '');
  return (
    route === 'silent_vote_create' ||
    op.id === 'start_silent_vote' ||
    String(op.kind) === 'client_navigation'
  );
}

/**
 * Team CTA / 体能状态 / 通知 → team_action 卡。
 */
export function adaptTeamActionFromTeamSource(
  src: TeamActionAssembleSource,
): { card: TeamActionCardV1; actions: ConversationActionV1[] } | null {
  const actions: ConversationActionV1[] = [];
  const fitness = src.team_fitness_submission_status;

  if (fitness) {
    const fromMembers = Array.isArray(fitness.members) ? fitness.members : [];
    const pending = (
      fitness.pending?.length
        ? fitness.pending
        : fromMembers.filter((m) => m.submitted !== true)
    )
      .map((m) => String(m.display_name ?? m.name ?? '').trim())
      .filter(Boolean);
    const submitted = (
      fitness.submitted?.length
        ? fitness.submitted
        : fromMembers.filter((m) => m.submitted === true)
    )
      .map((m) => String(m.display_name ?? m.name ?? '').trim())
      .filter(Boolean);
    const body =
      String(fitness.answer_text ?? src.answer_text ?? '').trim() ||
      (pending.length
        ? `尚未提交体能：${pending.join('、')}`
        : '全员已提交体能信息。');

    return {
      card: {
        kind: 'team_action',
        title_zh: '成员体能状态',
        body_zh: body,
        action_type: 'fitness_status',
        ...(pending.length ? { pending_member_names: pending } : {}),
        ...(submitted.length ? { submitted_member_names: submitted } : {}),
      },
      actions: [],
    };
  }

  const voteOps = (src.suggested_operations ?? []).filter(isSilentVoteOp);
  if (voteOps.length) {
    for (const op of voteOps) {
      const route = String(op.payload?.route ?? op.payload?.action ?? 'silent_vote_create');
      if (route !== 'silent_vote_create' && op.id !== 'start_silent_vote') continue;
      actions.push({
        id: String(op.id ?? 'start_silent_vote'),
        kind: 'client_navigation',
        label_zh: String(op.label ?? '发起投票'),
        payload: {
          route: 'silent_vote_create',
          action: 'silent_vote_create',
          ...(op.payload ?? {}),
        },
      });
    }
    if (actions.length) {
      return {
        card: {
          kind: 'team_action',
          title_zh: '团队确认',
          body_zh:
            String(src.answer_text ?? '').trim() ||
            '可发起 Silent Vote，收集成员选择后再调整计划。',
          action_type: 'silent_vote',
        },
        actions,
      };
    }
  }

  if (src.notify_member_ids?.length || src.notify_summary_zh) {
    const ids = src.notify_member_ids ?? [];
    actions.push({
      id: 'notify_members',
      kind: 'notify_members',
      label_zh: '通知成员',
      payload: { member_ids: ids },
    });
    return {
      card: {
        kind: 'team_action',
        title_zh: '团队通知',
        body_zh:
          String(src.notify_summary_zh ?? src.answer_text ?? '').trim() ||
          `将通知 ${ids.length || '相关'} 位成员。`,
        action_type: 'notify',
        ...(ids.length ? { notified_member_ids: ids } : {}),
      },
      actions,
    };
  }

  return null;
}
