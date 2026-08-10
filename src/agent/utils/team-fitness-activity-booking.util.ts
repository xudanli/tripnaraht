/**
 * 活动预订轻量路径：汇总团队体能提交状态 → prompt 行 + activity_search_meta。
 */

import {
  formatTeamFitnessMemberLabel,
  loadTeamFitnessSubmissionStatuses,
  type TeamFitnessMemberStatus,
} from './team-fitness-submission-status.util';
import { isActivityAdvanceBookingConsultQuery } from '../chat/build-activity-booking-chat-cards.util';

const FITNESS_RANK: Record<string, number> = {
  LOW: 1,
  MEDIUM_LOW: 2,
  MEDIUM: 3,
  MEDIUM_HIGH: 4,
  HIGH: 5,
};

/** 目录活动对体能的粗档要求（木桶原则对照） */
const ACTIVITY_FITNESS_NEED: Array<{ match: RegExp; need: string; labelZh: string }> = [
  {
    match: /冰川徒步|冰洞|glacier\s*hike|ice\s*cave|超级吉普|高地|Þórsmörk|Thorsmork/i,
    need: 'MEDIUM_HIGH',
    labelZh: '冰川徒步/高地体验',
  },
  {
    match: /徒步|登山|hiking|trekking/i,
    need: 'MEDIUM',
    labelZh: '徒步类活动',
  },
  {
    match: /蓝湖|温泉|船游|Zodiac|博物馆/i,
    need: 'LOW',
    labelZh: '低强度体验',
  },
];

export type TeamFitnessActivityBookingMeta = {
  submitted_count: number;
  missing_count: number;
  member_count: number;
  floor_level: string | null;
  floor_display_zh: string | null;
  activity_need_level: string | null;
  activity_label_zh: string | null;
  fit: 'ok' | 'tight' | 'insufficient' | 'unknown';
  fit_zh: string;
  missing_names_zh: string[];
  submitted_summary_zh: string[];
};

function normalizeLevel(raw: string | null | undefined): string | null {
  const t = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!t) return null;
  if (t === 'MED' || t === 'MID') return 'MEDIUM';
  if (FITNESS_RANK[t] != null) return t;
  return null;
}

function levelRank(level: string | null): number {
  if (!level) return 0;
  return FITNESS_RANK[level] ?? 0;
}

function levelDisplayZh(level: string | null): string {
  switch (level) {
    case 'LOW':
      return '偏低';
    case 'MEDIUM_LOW':
      return '中偏低';
    case 'MEDIUM':
      return '中等';
    case 'MEDIUM_HIGH':
      return '中偏高';
    case 'HIGH':
      return '较高';
    default:
      return '未知';
  }
}

function inferActivityNeed(message: string): { need: string; labelZh: string } | null {
  const m = String(message ?? '');
  for (const row of ACTIVITY_FITNESS_NEED) {
    if (row.match.test(m)) return { need: row.need, labelZh: row.labelZh };
  }
  return null;
}

function computeFloor(members: TeamFitnessMemberStatus[]): string | null {
  const levels = members
    .filter((m) => m.submitted)
    .map((m) => normalizeLevel(m.fitnessLevel))
    .filter((x): x is string => Boolean(x));
  if (!levels.length) return null;
  return levels.reduce((min, cur) => (levelRank(cur) < levelRank(min) ? cur : min), levels[0]);
}

function assessFit(
  floor: string | null,
  need: string | null,
  missingCount: number,
): { fit: TeamFitnessActivityBookingMeta['fit']; fit_zh: string } {
  if (missingCount > 0 && !floor) {
    return {
      fit: 'unknown',
      fit_zh: `尚有 ${missingCount} 人未提交体能，暂无法用团队木桶评估强度`,
    };
  }
  if (!floor || !need) {
    return {
      fit: 'unknown',
      fit_zh: floor
        ? `团队体能木桶约「${levelDisplayZh(floor)}」；本活动强度未定级，预订前请自行确认`
        : '缺少已提交体能成员，无法做团队适配判断',
    };
  }
  const gap = levelRank(floor) - levelRank(need);
  if (gap >= 0) {
    return {
      fit: 'ok',
      fit_zh: `团队体能木桶「${levelDisplayZh(floor)}」可覆盖本活动建议强度「${levelDisplayZh(need)}」`,
    };
  }
  if (gap === -1) {
    return {
      fit: 'tight',
      fit_zh: `团队体能木桶「${levelDisplayZh(floor)}」略低于建议「${levelDisplayZh(need)}」，建议选轻松场次或确认体感较弱成员是否同行`,
    };
  }
  return {
    fit: 'insufficient',
    fit_zh: `团队体能木桶「${levelDisplayZh(floor)}」明显低于建议「${levelDisplayZh(need)}」，请先核对较弱成员是否适合，或改选低强度场次`,
  };
}

export function buildTeamFitnessActivityBookingMeta(
  members: TeamFitnessMemberStatus[],
  userMessage: string,
): TeamFitnessActivityBookingMeta {
  const submitted = members.filter((m) => m.submitted);
  const missing = members.filter((m) => !m.submitted);
  const floor = computeFloor(members);
  const activity = inferActivityNeed(userMessage);
  const { fit, fit_zh } = assessFit(floor, activity?.need ?? null, missing.length);
  return {
    submitted_count: submitted.length,
    missing_count: missing.length,
    member_count: members.length,
    floor_level: floor,
    floor_display_zh: floor ? levelDisplayZh(floor) : null,
    activity_need_level: activity?.need ?? null,
    activity_label_zh: activity?.labelZh ?? null,
    fit,
    fit_zh,
    missing_names_zh: missing.map(formatTeamFitnessMemberLabel),
    submitted_summary_zh: submitted.map((m) => {
      const lv = normalizeLevel(m.fitnessLevel);
      return `${formatTeamFitnessMemberLabel(m)}：${levelDisplayZh(lv)}`;
    }),
  };
}

/** 注入轻量问答的团队体能块 */
export function buildTeamFitnessActivityBookingPromptLines(
  meta: TeamFitnessActivityBookingMeta,
): string[] {
  const lines = [
    '【团队体能 · 活动预订】以下为行程协作者体能提交状态（木桶原则：以最弱已提交成员为准；未提交者不计入木桶）。',
    `已提交 ${meta.submitted_count}/${meta.member_count}` +
      (meta.floor_display_zh ? `；团队木桶≈${meta.floor_display_zh}` : '；尚无可用木桶'),
  ];
  if (meta.submitted_summary_zh.length) {
    lines.push(`已提交：${meta.submitted_summary_zh.join('；')}`);
  }
  if (meta.missing_names_zh.length) {
    lines.push(`未提交：${meta.missing_names_zh.join('、')}（勿把主账号体能当成全队）`);
  }
  if (meta.activity_label_zh && meta.activity_need_level) {
    lines.push(
      `当前意向活动「${meta.activity_label_zh}」建议强度≈${levelDisplayZh(meta.activity_need_level)}`,
    );
  }
  lines.push(`适配结论：${meta.fit_zh}`);
  lines.push(
    '正文须点名团队体能适配结论（可简短）；若 fit=insufficient/tight，须提示确认较弱成员或改场次；未提交者提醒补问卷。勿编造未出现的成员体能数字。',
  );
  return lines;
}

/**
 * 活动预订咨询 + 绑定 trip：加载团队体能并生成 prompt / meta。
 */
export async function resolveTeamFitnessForActivityBooking(input: {
  prisma: Parameters<typeof loadTeamFitnessSubmissionStatuses>[0];
  tripId?: string | null;
  message?: string | null;
}): Promise<{
  meta: TeamFitnessActivityBookingMeta;
  promptLines: string[];
} | null> {
  const tripId = String(input.tripId ?? '').trim();
  const message = String(input.message ?? '');
  if (!tripId || !isActivityAdvanceBookingConsultQuery(message)) return null;
  try {
    const { members } = await loadTeamFitnessSubmissionStatuses(input.prisma, tripId);
    if (!members.length) return null;
    const meta = buildTeamFitnessActivityBookingMeta(members, message);
    return { meta, promptLines: buildTeamFitnessActivityBookingPromptLines(meta) };
  } catch {
    return null;
  }
}
