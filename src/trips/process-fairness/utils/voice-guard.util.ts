export interface MemberParticipationSnapshot {
  userId: string;
  displayName: string;
  preferenceSubmits: number;
  voteParticipations: number;
  discussionUtterances: number;
  consecutiveSilentRounds: number;
  lastSpokeAt: string | null;
  engagementScore: number;
}

export interface VoiceGuardIntervention {
  userId: string;
  displayName: string;
  reason: 'consecutive_silent' | 'below_average_engagement';
  privateMessageCN: string;
  groupMessageCN: string;
  severity: 'medium' | 'high';
}

export interface VoiceGuardStatus {
  tripId: string;
  memberCount: number;
  averageEngagementScore: number;
  members: MemberParticipationSnapshot[];
  interventions: VoiceGuardIntervention[];
}

export const CONSECUTIVE_SILENT_THRESHOLD = 2;
export const ENGAGEMENT_GAP_RATIO = 0.5;

export function computeEngagementScore(input: {
  preferenceSubmits: number;
  voteParticipations: number;
  discussionUtterances: number;
}): number {
  return (
    input.preferenceSubmits * 2 +
    input.voteParticipations * 1.5 +
    input.discussionUtterances * 1
  );
}

export function detectVoiceGuardInterventions(
  members: MemberParticipationSnapshot[],
): VoiceGuardIntervention[] {
  if (members.length === 0) return [];

  const avg =
    members.reduce((sum, m) => sum + m.engagementScore, 0) / members.length;
  const interventions: VoiceGuardIntervention[] = [];

  for (const m of members) {
    if (m.consecutiveSilentRounds >= CONSECUTIVE_SILENT_THRESHOLD) {
      interventions.push({
        userId: m.userId,
        displayName: m.displayName,
        reason: 'consecutive_silent',
        privateMessageCN:
          '你的想法对我们很重要，要不要花 2 分钟看看大家的选择，告诉我们你的感受？',
        groupMessageCN: `目前${m.displayName}还没有对当前方案发表意见，我们要不要等一等，听听 TA 的想法？`,
        severity: m.consecutiveSilentRounds >= 3 ? 'high' : 'medium',
      });
      continue;
    }

    if (
      avg > 0 &&
      m.engagementScore < avg * ENGAGEMENT_GAP_RATIO &&
      m.discussionUtterances === 0
    ) {
      interventions.push({
        userId: m.userId,
        displayName: m.displayName,
        reason: 'below_average_engagement',
        privateMessageCN:
          '你的想法对我们很重要，要不要花 2 分钟看看大家的选择，告诉我们你的感受？',
        groupMessageCN: `目前${m.displayName}的参与度较低，我们要不要邀请 TA 分享一下看法？`,
        severity: 'medium',
      });
    }
  }

  return interventions;
}
