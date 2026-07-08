import type { PlanningDaySplitDto } from '../../trips/trip-constraint-solver/types/planning-conflicts.types';

export type PlanGateMemberSplitChangeKind =
  | 'split_added'
  | 'split_removed'
  | 'meetup_changed'
  | 'branch_changed'
  | 'member_assignment_changed';

export interface PlanGateMemberSplitChange {
  day: number;
  kind: PlanGateMemberSplitChangeKind;
  label: string;
  before?: string;
  after?: string;
  impact: 'low' | 'medium' | 'high';
  missingMeetup?: boolean;
}

function summarizeSplit(daySplit: PlanningDaySplitDto): string {
  const branchLabels = daySplit.branches
    .map((b) => `${b.groupLabel}${b.members?.length ? `(${b.members.length}人)` : ''}`)
    .join(' / ');
  const meetup = daySplit.rejoin?.title ?? daySplit.stats?.meetupTime;
  return [daySplit.title, branchLabels, meetup ? `汇合：${meetup}` : undefined]
    .filter(Boolean)
    .join(' · ');
}

function branchSignature(daySplit: PlanningDaySplitDto): string {
  return daySplit.branches
    .map((b) => `${b.id}:${(b.members ?? []).map((m) => m.id ?? m.displayName).join(',')}`)
    .sort()
    .join('|');
}

function hasMeetup(daySplit: PlanningDaySplitDto): boolean {
  return Boolean(daySplit.rejoin?.title || daySplit.stats?.meetupTime);
}

export function projectMemberSplitDiff(
  baselineSplits: PlanningDaySplitDto[] | undefined,
  draftSplits: PlanningDaySplitDto[] | undefined,
): PlanGateMemberSplitChange[] {
  const baselineByDay = new Map<number, PlanningDaySplitDto>();
  const draftByDay = new Map<number, PlanningDaySplitDto>();

  for (const s of baselineSplits ?? []) baselineByDay.set(s.dayNumber, s);
  for (const s of draftSplits ?? []) draftByDay.set(s.dayNumber, s);

  const days = new Set([...baselineByDay.keys(), ...draftByDay.keys()]);
  const changes: PlanGateMemberSplitChange[] = [];

  for (const day of [...days].sort((a, b) => a - b)) {
    const before = baselineByDay.get(day);
    const after = draftByDay.get(day);

    if (!before && after) {
      changes.push({
        day,
        kind: 'split_added',
        label: `第 ${day} 天启用成员分流`,
        after: summarizeSplit(after),
        impact: 'high',
        missingMeetup: after.branches.length > 1 && !hasMeetup(after),
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        day,
        kind: 'split_removed',
        label: `第 ${day} 天取消分流`,
        before: summarizeSplit(before),
        impact: 'medium',
      });
      continue;
    }

    if (!before || !after) continue;

    const beforeMeet = before.rejoin?.title ?? before.stats?.meetupTime;
    const afterMeet = after.rejoin?.title ?? after.stats?.meetupTime;
    if (beforeMeet !== afterMeet) {
      changes.push({
        day,
        kind: 'meetup_changed',
        label: `第 ${day} 天汇合点/时间调整`,
        before: beforeMeet,
        after: afterMeet,
        impact: 'high',
        missingMeetup: after.branches.length > 1 && !hasMeetup(after),
      });
    }

    if (branchSignature(before) !== branchSignature(after)) {
      changes.push({
        day,
        kind: 'branch_changed',
        label: `第 ${day} 天分流编组变化`,
        before: summarizeSplit(before),
        after: summarizeSplit(after),
        impact: 'medium',
      });
    } else if (before.title !== after.title) {
      changes.push({
        day,
        kind: 'member_assignment_changed',
        label: `第 ${day} 天分流说明更新`,
        before: before.title,
        after: after.title,
        impact: 'low',
      });
    }

    if (after.branches.length > 1 && !hasMeetup(after)) {
      const already = changes.some((c) => c.day === day && c.missingMeetup);
      if (!already) {
        changes.push({
          day,
          kind: 'meetup_changed',
          label: `第 ${day} 天分流缺少汇合点`,
          impact: 'high',
          missingMeetup: true,
        });
      }
    }
  }

  return changes;
}

export function memberSplitBlockers(changes: PlanGateMemberSplitChange[]): string[] {
  return changes
    .filter((c) => c.missingMeetup)
    .map((c) => c.label);
}
