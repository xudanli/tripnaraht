/**
 * 「谁还没有提交体能信息」等团队体能提交状态查询：走轻量快路径，勿进全量规划。
 */

import { stripUiInjectedDayScheduleContext } from './ui-day-schedule-context.util';

export type TeamFitnessMemberStatus = {
  userId: string;
  displayName: string;
  role: string;
  submitted: boolean;
  fitnessLevel?: string | null;
};

/** 用户在问行程内谁尚未提交体能问卷 / 体能评估 */
export function isTeamFitnessSubmissionStatusQuery(message: string): boolean {
  const m = stripUiInjectedDayScheduleContext(String(message ?? '')).trim();
  if (!m) return false;
  const asksWhoMissing =
    /谁(?:还)?(?:没有|没|未)(?:提交|交|完成|填)/.test(m) ||
    /(?:还有谁|哪(?:些|个)人?)(?:还)?(?:没有|没|未)(?:提交|交|完成|填)/.test(m) ||
    /(?:谁的|哪些人的).{0,8}(?:体能|问卷).{0,8}(?:还没|没有|未)/.test(m) ||
    /who\s+(?:has(?:n'?t| not)|still\s+has(?:n'?t| not))\s+(?:submitted|completed|filled).{0,24}fitness/i.test(
      m,
    );
  const aboutFitness =
    /体能(?:信息|评估|问卷|档案|画像)?|fitness\s*(?:profile|assessment|questionnaire|info)?/i.test(
      m,
    );
  return asksWhoMissing && aboutFitness;
}

export function formatTeamFitnessMemberLabel(m: TeamFitnessMemberStatus): string {
  const name = m.displayName?.trim() || '未命名成员';
  const role = m.role?.trim();
  return role ? `${name}（${role}）` : name;
}

export function buildTeamFitnessSubmissionStatusAnswer(args: {
  tripName?: string | null;
  members: TeamFitnessMemberStatus[];
}): string {
  const { tripName, members } = args;
  const prefix = tripName?.trim() ? `针对行程「${tripName.trim()}」，` : '';
  if (members.length === 0) {
    return `${prefix}当前没有可核对的行程成员。请先在「成员 / 团队协作」确认协作者名单。`;
  }

  const missing = members.filter((m) => !m.submitted);
  const submitted = members.filter((m) => m.submitted);

  if (missing.length === 0) {
    return (
      `${prefix}全部 **${members.length}** 位成员都已提交体能评估。` +
      (submitted.length
        ? `\n已提交：${submitted.map(formatTeamFitnessMemberLabel).join('、')}。`
        : '')
    );
  }

  const missingLine = missing.map(formatTeamFitnessMemberLabel).join('、');
  const submittedLine = submitted.length
    ? `\n已提交（${submitted.length}）：${submitted.map(formatTeamFitnessMemberLabel).join('、')}。`
    : '';
  return (
    `${prefix}还有 **${missing.length}** 位成员未提交体能信息：${missingLine}。` +
    submittedLine +
    `\n请提醒对方在个人中心完成体能评估问卷。`
  );
}

/** 结构类型须能被 PrismaService 赋值（勿用 `args: unknown`，会因函数参数逆变失败） */
export type TeamFitnessPrismaLike = {
  trip: {
    findUnique: (args: {
      where: { id: string };
      select?: { name?: boolean; metadata?: boolean };
    }) => Promise<{
      name: string | null;
      metadata: unknown;
    } | null>;
  };
  tripCollaborator: {
    findMany: (args: {
      where: { tripId: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) => Promise<Array<{ userId: string; role: string }>>;
  };
  user: {
    findMany: (args: {
      where: { id: { in: string[] } };
      select?: { id?: boolean; displayName?: boolean; email?: boolean };
    }) => Promise<
      Array<{ id: string; displayName: string | null; email: string | null }>
    >;
  };
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
};

type PrismaLike = TeamFitnessPrismaLike;

function roleLabelZh(role: string): string {
  const r = role.trim().toUpperCase();
  if (r === 'OWNER') return '队长';
  if (r === 'PRIMARY_CONTACT') return '主要联系人';
  if (r === 'VIEWER') return '成员';
  if (r === 'EDITOR') return '编辑';
  if (r === 'ADVISOR') return '顾问';
  return role.trim() || '成员';
}

/**
 * 汇总行程协作者（含 metadata.userId 业主）的体能问卷提交状态。
 */
export async function loadTeamFitnessSubmissionStatuses(
  prisma: PrismaLike,
  tripId: string,
): Promise<{ tripName: string | null; members: TeamFitnessMemberStatus[] }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { name: true, metadata: true },
  });
  const collaborators = await prisma.tripCollaborator.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
  });

  const byUser = new Map<string, string>();
  for (const c of collaborators) {
    byUser.set(c.userId, c.role);
  }
  const meta = (trip?.metadata ?? null) as { userId?: string } | null;
  const ownerId = typeof meta?.userId === 'string' ? meta.userId.trim() : '';
  if (ownerId && !byUser.has(ownerId)) {
    byUser.set(ownerId, 'OWNER');
  }

  const userIds = [...byUser.keys()];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  let submittedIds = new Set<string>();
  let levelByUser = new Map<string, string | null>();
  if (userIds.length > 0) {
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ user_id: string; fitness_level: string | null }>
      >(
        `SELECT user_id, fitness_level FROM fitness_questionnaire_answers WHERE user_id = ANY($1::text[])`,
        userIds,
      );
      submittedIds = new Set(rows.map((r) => String(r.user_id)));
      levelByUser = new Map(rows.map((r) => [String(r.user_id), r.fitness_level]));
    } catch {
      submittedIds = new Set();
      levelByUser = new Map();
    }
  }

  const members: TeamFitnessMemberStatus[] = userIds.map((userId) => {
    const u = userById.get(userId);
    const displayName =
      u?.displayName?.trim() ||
      u?.email?.trim() ||
      `${userId.slice(0, 8)}…`;
    const submitted = submittedIds.has(userId);
    return {
      userId,
      displayName,
      role: roleLabelZh(byUser.get(userId) || 'MEMBER'),
      submitted,
      fitnessLevel: submitted ? levelByUser.get(userId) ?? null : null,
    };
  });

  // OWNER first, then others by original collaborator order
  members.sort((a, b) => {
    const rank = (r: string) => (r === '队长' ? 0 : r === '主要联系人' ? 1 : 2);
    return rank(a.role) - rank(b.role);
  });

  return { tripName: trip?.name ?? null, members };
}
