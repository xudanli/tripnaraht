import type { TeamTaskStatus } from '../types/team-tasks.types';

type SortableTask = {
  status: string;
  assigneeMemberId: string | null;
  assigneeName: string | null;
  dueAt: Date | null;
  updatedAt: Date;
};

const STATUS_RANK: Record<string, number> = {
  open: 0,
  claimed: 1,
  done: 2,
};

/** mine 判定（列表 scope=mine / stats.mineOpenOrClaimed） */
export function isMineRelevant(
  row: {
    status: string;
    assigneeMemberId: string | null;
    assigneeName: string | null;
  },
  userId: string,
): boolean {
  if (row.assigneeMemberId === userId) return true;
  if (
    row.assigneeMemberId == null &&
    row.assigneeName === '全员' &&
    (row.status === 'open' || row.status === 'claimed')
  ) {
    return true;
  }
  if (row.status === 'open' && !row.assigneeMemberId) return true;
  return false;
}

export function sortTeamTasks<T extends SortableTask>(
  rows: T[],
  userId: string,
): T[] {
  return [...rows].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;

    if (a.status === 'claimed' && b.status === 'claimed') {
      const aMine = a.assigneeMemberId === userId ? 0 : 1;
      const bMine = b.assigneeMemberId === userId ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
    }

    const aDue = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;

    return a.updatedAt.getTime() - b.updatedAt.getTime();
  });
}

export function computeTeamTaskStats(
  rows: Array<{
    status: string;
    assigneeMemberId: string | null;
    assigneeName: string | null;
  }>,
  userId: string,
): {
  open: number;
  claimed: number;
  done: number;
  mineOpenOrClaimed: number;
} {
  let open = 0;
  let claimed = 0;
  let done = 0;
  let mineOpenOrClaimed = 0;

  for (const r of rows) {
    if (r.status === 'open') open += 1;
    else if (r.status === 'claimed') claimed += 1;
    else if (r.status === 'done') done += 1;

    if (
      (r.status === 'open' || r.status === 'claimed') &&
      isMineRelevant(r, userId)
    ) {
      mineOpenOrClaimed += 1;
    }
  }

  return { open, claimed, done, mineOpenOrClaimed };
}

export function nextStatusOnAssigneeChange(
  current: TeamTaskStatus,
  hasAssignee: boolean,
): TeamTaskStatus | null {
  if (current === 'done' || current === 'cancelled') return null;
  return hasAssignee ? 'claimed' : 'open';
}
