import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import { ConflictType } from '../../dto/trip-conflicts.dto';
import type { FrictionDomain } from '../../decision-profiling/types/decision-profiling.types';
import type {
  DecisionStyleType,
  MoneyDnaCard,
  TravelStyleCard,
} from '../../decision-profiling/types/decision-profiling.types';
import {
  buildHighRiskAlerts,
  computeFrictionMatrix,
} from '../../decision-profiling/utils/friction-matrix.util';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import {
  buildTeamFitUiHints,
  teamPacingIssueKind,
} from './team-fit-ui-hints.util';

function isTeamFrictionIssue(issueKind?: string): boolean {
  return (
    issueKind === 'member_friction' ||
    (Boolean(issueKind?.startsWith('team_pacing_')) &&
      issueKind !== 'team_pacing_fatigue' &&
      issueKind !== 'team_pacing_profiling')
  );
}

export interface TeamFitMemberInput {
  userId: string;
  displayName: string;
  style?: TravelStyleCard;
  money?: MoneyDnaCard;
  quizCompleted?: boolean;
}

export interface TeamFitAssessmentInput {
  tripId: string;
  members: TeamFitMemberInput[];
  conflicts: ConflictDto[];
}

export interface TeamFitAssessmentResult {
  score: number;
  memberCount: number;
  profilingCompletedCount: number;
  issues: FeasibilityIssueDto[];
}

const PACE_STRATEGY =
  '设定每日「固定锚点 + 弹性时段」，高强度日优先照顾节奏保守成员。';

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function buildProfilingCoverageIssue(
  tripId: string,
  memberCount: number,
  completedCount: number,
): FeasibilityIssueDto | undefined {
  if (memberCount <= 1) return undefined;
  if (completedCount >= memberCount) return undefined;

  return {
    id: `issue-team-fit-profiling-${tripId}`,
    priority: 'pending_confirm',
    category: 'team_fit',
    issueKind: teamPacingIssueKind('profiling'),
    title: '成员决策画像未齐',
    message: `${completedCount}/${memberCount} 位成员已完成决策画像，团队适配评估置信度较低`,
    affectedDays: [],
    severity: 'medium',
    uiHints: buildTeamFitUiHints({
      kind: 'profiling_incomplete',
      affectedMemberIds: [],
    }),
    proofs: [
      {
        entity: '团队决策画像',
        constraint: 'profiling_completion',
        currentFact: `已完成 ${completedCount}/${memberCount} 人`,
        evidenceSource: 'trip.decision_profiling_status',
        evidenceType: 'profiling_coverage',
        conclusion: '建议成员补全旅行风格 / Money DNA 测验后再确认团队适配',
        ruleId: 'team_fit.profiling.coverage',
        confidence: 0.9,
      },
    ],
    actionRequired: '邀请未完成成员补全决策画像',
  };
}

function frictionAlertToIssue(tripId: string, alert: ReturnType<typeof buildHighRiskAlerts>[0]): FeasibilityIssueDto {
  return {
    id: `issue-team-fit-${alert.id}`,
    priority: alert.domain === 'pace' ? 'suggest_adjust' : 'pending_confirm',
    category: 'team_fit',
    issueKind: teamPacingIssueKind('friction', alert.domain),
    title: `${alert.domainLabel} · 成员差异`,
    message: alert.summary,
    affectedDays: [],
    severity: alert.domain === 'pace' ? 'high' : 'medium',
    uiHints: buildTeamFitUiHints({
      kind: 'member_friction',
      domain: alert.domain,
      affectedMemberIds: [alert.memberAId, alert.memberBId],
    }),
    proofs: [
      {
        entity: `${alert.memberAName} · ${alert.memberBName}`,
        constraint: `team_friction.${alert.domain}`,
        currentFact: alert.summary,
        evidenceSource: 'decision-profiling.friction-matrix',
        evidenceType: 'team_friction',
        conclusion: alert.recommendedStrategy,
        ruleId: `team_fit.${alert.domain}.compatibility`,
        confidence: 0.85,
      },
    ],
    actionRequired: alert.recommendedStrategy,
  };
}

function fatigueConflictToIssue(tripId: string, conflict: ConflictDto): FeasibilityIssueDto {
  const dayMatch = conflict.affectedDays?.[0]?.match(/(\d+)/);
  const dayNumber = dayMatch ? Number(dayMatch[1]) : undefined;

  return {
    id: `issue-team-fit-fatigue-${conflict.id}`,
    priority: 'suggest_adjust',
    category: 'team_fit',
    issueKind: teamPacingIssueKind('fatigue'),
    title: '高强度日 · 成员体能风险',
    message: `${conflict.description}；多人同行时需确认最弱体能成员能否承受`,
    affectedDays: dayNumber ? [dayNumber] : [],
    severity: 'high',
    uiHints: buildTeamFitUiHints({
      kind: 'team_fatigue',
      affectedDayNumbers: dayNumber ? [dayNumber] : undefined,
    }),
    proofs: [
      {
        entity: '团队节奏',
        constraint: 'fatigue_capacity',
        currentFact: conflict.description,
        evidenceSource: 'trip-conflicts',
        evidenceType: 'fatigue_exceeded',
        conclusion: PACE_STRATEGY,
        ruleId: 'team_fit.fatigue.group_capacity',
        confidence: 0.8,
      },
    ],
    actionRequired: PACE_STRATEGY,
  };
}

function scoreFromIssues(issues: FeasibilityIssueDto[], memberCount: number, profilingRatio: number): number {
  if (memberCount <= 1) return 100;

  let score = 88;
  score -= (1 - profilingRatio) * 25;

  for (const issue of issues) {
    if (isTeamFrictionIssue(issue.issueKind)) {
      score -= issue.priority === 'suggest_adjust' ? 18 : 10;
    } else if (issue.issueKind === 'team_fatigue' || issue.issueKind === 'team_pacing_fatigue') {
      score -= 15;
    } else if (
      issue.issueKind === 'profiling_incomplete' ||
      issue.issueKind === 'team_pacing_profiling'
    ) {
      score -= 8;
    }
  }

  return clampScore(score);
}

/**
 * 团队成员适配：决策画像摩擦矩阵 + 冲突疲劳 → feasibility issues + proofs。
 */
export function assessTeamFit(input: TeamFitAssessmentInput): TeamFitAssessmentResult {
  const memberCount = input.members.length;
  const profilingCompletedCount = input.members.filter((m) => m.quizCompleted).length;
  const profilingRatio = memberCount > 0 ? profilingCompletedCount / memberCount : 1;

  if (memberCount <= 1) {
    return {
      score: 100,
      memberCount,
      profilingCompletedCount,
      issues: [],
    };
  }

  const issues: FeasibilityIssueDto[] = [];

  const profilingIssue = buildProfilingCoverageIssue(
    input.tripId,
    memberCount,
    profilingCompletedCount,
  );
  if (profilingIssue) issues.push(profilingIssue);

  const profileReady = input.members.filter(
    (m): m is TeamFitMemberInput & { style: TravelStyleCard; money: MoneyDnaCard } =>
      Boolean(m.style?.styleType && m.money?.vector),
  );

  if (profileReady.length >= 2) {
    const matrix = computeFrictionMatrix(
      profileReady.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        style: m.style,
        money: m.money,
      })),
    );
    const alerts = buildHighRiskAlerts(matrix);
    for (const alert of alerts.slice(0, 3)) {
      issues.push(frictionAlertToIssue(input.tripId, alert));
    }
  }

  const fatigueConflicts = input.conflicts.filter((c) => c.type === ConflictType.FATIGUE_EXCEEDED);
  for (const conflict of fatigueConflicts.slice(0, 2)) {
    issues.push(fatigueConflictToIssue(input.tripId, conflict));
  }

  return {
    score: scoreFromIssues(issues, memberCount, profilingRatio),
    memberCount,
    profilingCompletedCount,
    issues,
  };
}

export type TeamFitChecklistResult = 'passed' | 'pending' | 'failed' | 'deferred';

export function deriveTeamFitChecklistStatus(
  assessment: TeamFitAssessmentResult,
): { result: TeamFitChecklistResult; detail?: string } {
  if (assessment.memberCount <= 1) {
    return { result: 'passed', detail: '单人行程' };
  }

  const blockers = assessment.issues.filter((i) => i.priority === 'must_handle');
  if (blockers.length > 0) {
    return { result: 'failed', detail: blockers[0]?.message };
  }

  const friction = assessment.issues.filter((i) => isTeamFrictionIssue(i.issueKind));
  const fatigue = assessment.issues.filter(
    (i) => i.issueKind === 'team_fatigue' || i.issueKind === 'team_pacing_fatigue',
  );
  const profiling = assessment.issues.filter(
    (i) => i.issueKind === 'profiling_incomplete' || i.issueKind === 'team_pacing_profiling',
  );

  if (friction.length > 0 || fatigue.length > 0) {
    const top = friction[0] ?? fatigue[0];
    return { result: 'pending', detail: top?.title ?? '存在成员适配风险' };
  }

  if (profiling.length > 0) {
    return {
      result: 'pending',
      detail: `${assessment.profilingCompletedCount}/${assessment.memberCount} 成员画像已完成`,
    };
  }

  return { result: 'passed', detail: `团队适配良好（${assessment.memberCount} 人）` };
}

export function parseStoredTravelStyleCard(
  userId: string,
  raw: unknown,
): TravelStyleCard | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const styleType = row.styleType;
  if (typeof styleType !== 'string') return undefined;
  return {
    userId,
    styleType: styleType as DecisionStyleType,
    styleLabel: String(row.styleLabel ?? styleType),
    coreDrivers: Array.isArray(row.coreDrivers) ? (row.coreDrivers as string[]) : [],
    teamRole: String(row.teamRole ?? ''),
    compatibilityHints: Array.isArray(row.compatibilityHints)
      ? (row.compatibilityHints as string[])
      : [],
    confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
    completedAt: String(row.completedAt ?? new Date().toISOString()),
    source: 'reused',
  };
}

export function parseStoredMoneyDnaCard(userId: string, raw: unknown): MoneyDnaCard | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const vector = row.vector;
  if (!vector || typeof vector !== 'object') {
    return {
      userId,
      vector: {
        experienceTendency: 0.5,
        qualityTendency: 0.5,
        timeValueTendency: 0.5,
        socialScarcityTendency: 0.5,
      },
      consumptionPace: 'balanced',
      confidence: 0.5,
      completedAt: new Date().toISOString(),
      source: 'inferred',
    };
  }
  const v = vector as Record<string, unknown>;
  return {
    userId,
    vector: {
      experienceTendency: Number(v.experienceTendency ?? 0.5),
      qualityTendency: Number(v.qualityTendency ?? 0.5),
      timeValueTendency: Number(v.timeValueTendency ?? 0.5),
      socialScarcityTendency: Number(v.socialScarcityTendency ?? 0.5),
    },
    budgetRangeMin: typeof row.budgetRangeMin === 'number' ? row.budgetRangeMin : undefined,
    budgetRangeMax: typeof row.budgetRangeMax === 'number' ? row.budgetRangeMax : undefined,
    consumptionPace:
      row.consumptionPace === 'planned' ||
      row.consumptionPace === 'spontaneous' ||
      row.consumptionPace === 'balanced'
        ? row.consumptionPace
        : 'balanced',
    confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
    completedAt: String(row.completedAt ?? new Date().toISOString()),
    source: 'reused',
  };
}
