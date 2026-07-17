import type {
  MobilePlanningMemberStyle,
  MobilePlanningTeamMemberDto,
} from '../dto/mobile-planning.types';

export interface PlanningMemberProfilingFacts {
  travelStyleCompleted: boolean;
  moneyDnaCompleted: boolean;
  quizCompleted: boolean;
}

export interface ProjectPlanningMemberInput {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string | null;
  lastActiveAt?: string;
  isPlaceholder: boolean;
  profiling?: PlanningMemberProfilingFacts;
  focusAreas?: string[];
  /** Extra confirmation gaps beyond profiling flags (e.g. onboarding hard limits) */
  extraPendingConfirmations?: string[];
}

/** Weights align with readiness MEMBER preference vs hard-limits emphasis. */
const WEIGHT_TRAVEL_STYLE = 0.4;
const WEIGHT_MONEY_DNA = 0.4;
const WEIGHT_QUIZ = 0.2;

export function computePreferenceProgress(facts?: PlanningMemberProfilingFacts): number {
  if (!facts) return 0;
  let score = 0;
  if (facts.travelStyleCompleted) score += WEIGHT_TRAVEL_STYLE;
  if (facts.moneyDnaCompleted) score += WEIGHT_MONEY_DNA;
  if (facts.quizCompleted) score += WEIGHT_QUIZ;
  return Math.round(score * 100) / 100;
}

export function resolvePendingConfirmations(
  facts?: PlanningMemberProfilingFacts,
  extra: string[] = [],
): string[] {
  const pending: string[] = [];
  if (!facts?.travelStyleCompleted) pending.push('旅行风格');
  if (!facts?.moneyDnaCompleted) pending.push('体力偏好');
  if (!facts?.quizCompleted) pending.push('决策画像');
  for (const item of extra) {
    if (item.trim() && !pending.includes(item)) pending.push(item);
  }
  return pending;
}

export function resolvePlanningMemberStyle(input: {
  isPlaceholder: boolean;
  progress: number;
  profiling?: PlanningMemberProfilingFacts;
}): MobilePlanningMemberStyle {
  if (input.isPlaceholder) return 'invite';

  const travelDone = input.profiling?.travelStyleCompleted === true;
  const moneyDone = input.profiling?.moneyDnaCompleted === true;
  const quizDone = input.profiling?.quizCompleted === true;

  if (travelDone && moneyDone && quizDone) return 'complete';

  // Hard-limits gap after some preference progress → attention (readiness MUST)
  if (!moneyDone && (travelDone || quizDone || input.progress > 0)) {
    return 'attention';
  }

  return 'pending';
}

export function resolvePlanningStatusLabel(input: {
  style: MobilePlanningMemberStyle;
  progress: number;
  focusAreas?: string[];
}): string {
  switch (input.style) {
    case 'complete':
      return '偏好完成';
    case 'attention':
      return '体力需求未确认';
    case 'invite':
      return '邀请后可加入协作';
    case 'pending':
    default:
      if (input.progress > 0) return '偏好填写中';
      if (input.focusAreas && input.focusAreas.length > 0) return '已填写愿望';
      return '偏好填写中';
  }
}

export function projectPlanningTeamMember(
  input: ProjectPlanningMemberInput,
): MobilePlanningTeamMemberDto {
  if (input.isPlaceholder) {
    return {
      id: input.id,
      name: input.name,
      role: input.role ?? 'member',
      statusLabel: resolvePlanningStatusLabel({ style: 'invite', progress: 0 }),
      progress: 0,
      style: 'invite',
      isPlaceholder: true,
      focusAreas: undefined,
      pendingConfirmations: undefined,
      avatarUrl: input.avatarUrl ?? undefined,
      lastActiveAt: input.lastActiveAt,
    };
  }

  const progress = computePreferenceProgress(input.profiling);
  const style = resolvePlanningMemberStyle({
    isPlaceholder: false,
    progress,
    profiling: input.profiling,
  });
  const pendingConfirmations =
    style === 'complete'
      ? undefined
      : resolvePendingConfirmations(input.profiling, input.extraPendingConfirmations ?? []);

  const focusAreas =
    input.focusAreas && input.focusAreas.length > 0
      ? input.focusAreas.slice(0, 4)
      : undefined;

  return {
    id: input.id,
    name: input.name,
    role: input.role,
    statusLabel: resolvePlanningStatusLabel({
      style,
      progress,
      focusAreas,
    }),
    progress,
    style,
    isPlaceholder: false,
    focusAreas,
    pendingConfirmations:
      pendingConfirmations && pendingConfirmations.length > 0
        ? pendingConfirmations
        : undefined,
    avatarUrl: input.avatarUrl ?? undefined,
    lastActiveAt: input.lastActiveAt,
  };
}

export function truncateFocusAreas(areas: string[], max = 4): string[] {
  return areas
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, max);
}
