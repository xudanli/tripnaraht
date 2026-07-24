import type {
  ReadinessRepairIterationView,
  ReadinessRepairLoopResult,
  ReadinessRepairSnapshot,
} from '../types/loop-run.types';
import type { FeasibilityIssueDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { ReadinessGuardianNegotiationSnapshot } from '../../trips/readiness/types/coverage-map.types';
import type { PersonaAlertDto } from '../../trips/dto/persona-alerts.dto';
import { projectFeasibilityIssueToPersonaAlert } from '../../trips/utils/guardian-user-facing.projection.util';

export type TripLoopUiPhase = 'validating' | 'issues_found' | 'awaiting_approval' | 'completed' | 'failed';

export interface TripLoopChecklistItemDto {
  id: string;
  label: string;
  result: 'passed' | 'pending' | 'failed' | 'deferred';
  detail?: string;
}

export interface TripLoopIssueCardDto {
  issueId: string;
  title: string;
  problem: string;
  systemAttempts: string[];
  recommendation: string;
  impact?: {
    budgetDelta?: string;
    travelDelta?: string;
    preferenceImpact?: string;
  };
  requiresApproval: boolean;
  optionId?: string;
  /** 与 persona-alerts / Decision Strip 同源 BFF 投影 */
  personaAlert?: PersonaAlertDto;
}

export interface TripLoopUiViewDto {
  phase: TripLoopUiPhase;
  headline: string;
  subheadline: string;
  progress: {
    completedChecks: number;
    totalChecks: number;
    label: string;
  };
  checklist: TripLoopChecklistItemDto[];
  issueCards: TripLoopIssueCardDto[];
  /** M3：与 GET persona-alerts 同源（本次 loop 涉及的 must_handle issues） */
  personaAlerts?: PersonaAlertDto[];
  primaryAction?: {
    label: string;
    loopRunId: string;
    patchCount: number;
  };
  snapshot: {
    before: ReadinessRepairSnapshot;
    after: ReadinessRepairSnapshot;
  };
}

const CHECK_LABELS = [
  { id: 'schedule', label: '时间可执行性' },
  { id: 'opening_hours', label: '营业时间' },
  { id: 'team_fit', label: '团队成员适配' },
  { id: 'weather', label: '天气风险' },
  { id: 'booking', label: '预订完整度' },
] as const;

export function buildTripLoopUiView(
  result: ReadinessRepairLoopResult,
  options?: {
    feasibilityIssues?: FeasibilityIssueDto[];
    guardianNegotiation?: ReadinessGuardianNegotiationSnapshot;
  },
): TripLoopUiViewDto {
  const phase = resolvePhase(result);
  const checklist = buildChecklist(result);
  const issueById = new Map(
    (options?.feasibilityIssues ?? []).map((issue) => [issue.id, issue]),
  );
  const issueCards = buildIssueCards(result, issueById, options?.guardianNegotiation);
  const personaAlerts = issueCards
    .map((card) => card.personaAlert)
    .filter((a): a is PersonaAlertDto => a != null);
  const completedChecks = checklist.filter((c) => c.result === 'passed').length;

  return {
    phase,
    headline: buildHeadline(phase, result),
    subheadline: buildSubheadline(result),
    progress: {
      completedChecks,
      totalChecks: checklist.length,
      label: phase === 'validating' ? '方案验证中' : `已完成 ${completedChecks}/${checklist.length} 项检查`,
    },
    checklist,
    issueCards,
    ...(personaAlerts.length ? { personaAlerts } : {}),
    primaryAction:
      result.requiresApproval && result.recommendedPatches.length > 0
        ? {
            label: '采用推荐调整',
            loopRunId: result.loopRunId,
            patchCount: result.recommendedPatches.length,
          }
        : undefined,
    snapshot: {
      before: result.before,
      after: result.after,
    },
  };
}

function resolvePhase(result: ReadinessRepairLoopResult): TripLoopUiPhase {
  if (result.status === 'FAILED') return 'failed';
  if (result.status === 'COMPLETED' && result.before.hardBlockers === 0) return 'completed';
  if (result.requiresApproval || result.status === 'WAITING_FOR_HUMAN') return 'awaiting_approval';
  if (result.iterations.length > 0 || result.before.hardBlockers > 0) return 'issues_found';
  return 'validating';
}

function buildHeadline(phase: TripLoopUiPhase, result: ReadinessRepairLoopResult): string {
  switch (phase) {
    case 'completed':
      return '方案已通过验证';
    case 'failed':
      return '验证未能完成';
    case 'awaiting_approval':
      return `发现 ${result.iterations.length || result.before.hardBlockers} 个问题，待您确认`;
    case 'issues_found':
      return `发现 ${result.before.hardBlockers} 个问题`;
    default:
      return '方案验证中';
  }
}

function buildSubheadline(result: ReadinessRepairLoopResult): string {
  const { before, after } = result;
  if (after.canStartExecute) {
    return '当前方案满足可执行条件';
  }
  return `准备度 ${before.readinessScore} → ${after.readinessScore} · 必处理 ${before.mustHandleCount} 项`;
}

function buildChecklist(result: ReadinessRepairLoopResult): TripLoopChecklistItemDto[] {
  const blockers = result.before.hardBlockers;
  const iterations = result.iterations.length;
  const checklistOverrides =
    result.after.checklist ?? result.before.checklist ?? {};

  return CHECK_LABELS.map((item) => {
    const override = checklistOverrides[item.id];
    if (override) {
      return { id: item.id, label: item.label, result: override.result, detail: override.detail };
    }

    let resultStatus: TripLoopChecklistItemDto['result'] = 'passed';
    let detail: string | undefined;
    const index = CHECK_LABELS.findIndex((c) => c.id === item.id);

    if (blockers > 0 && index >= CHECK_LABELS.length - blockers) {
      resultStatus = iterations > 0 ? 'pending' : 'failed';
      detail = iterations > 0 ? '系统已生成修复建议' : '待处理';
    }

    return { id: item.id, label: item.label, result: resultStatus, detail };
  });
}

function buildIssueCards(
  result: ReadinessRepairLoopResult,
  issueById: Map<string, FeasibilityIssueDto>,
  guardianNegotiation?: ReadinessGuardianNegotiationSnapshot,
): TripLoopIssueCardDto[] {
  return result.iterations.map((it) => toIssueCard(it, result, issueById, guardianNegotiation));
}

function toIssueCard(
  iteration: ReadinessRepairIterationView,
  result: ReadinessRepairLoopResult,
  issueById: Map<string, FeasibilityIssueDto>,
  guardianNegotiation?: ReadinessGuardianNegotiationSnapshot,
): TripLoopIssueCardDto {
  const issueDto =
    issueById.get(iteration.issueId) ??
    ({
      id: iteration.issueId,
      priority: 'must_handle',
      category: 'other',
      title: iteration.issueTitle,
      message: iteration.issueTitle,
      affectedDays: [],
      severity: 'high',
    } satisfies FeasibilityIssueDto);

  const personaAlert = projectFeasibilityIssueToPersonaAlert(issueDto, {
    audience: 'user',
    guardianNegotiation,
  });

  const recommended = result.recommendedPatches.find((p) => p.issueId === iteration.issueId);
  const attempts = iteration.attemptedOptions.slice(0, 3).map((optId, idx) => {
    if (optId === iteration.proposal.optionId) {
      return `${idx + 1}. ${iteration.proposal.title}`;
    }
    return `${idx + 1}. 备选方案 ${optId}`;
  });

  return {
    issueId: iteration.issueId,
    title: personaAlert?.title ?? iteration.issueTitle,
    problem: personaAlert?.explanation ?? iteration.issueTitle,
    systemAttempts: attempts.length > 0 ? attempts : ['系统正在评估修复方案'],
    recommendation: recommended?.title ?? iteration.proposal.title,
    impact: buildImpact(iteration),
    requiresApproval: iteration.validation.wouldDefer === true || result.requiresApproval,
    optionId: recommended?.optionId ?? iteration.proposal.optionId,
    ...(personaAlert ? { personaAlert } : {}),
  };
}

function buildImpact(iteration: ReadinessRepairIterationView): TripLoopIssueCardDto['impact'] {
  const before = iteration.validation.feasibilityScoreBefore;
  const after = iteration.validation.feasibilityScoreAfter;
  if (before == null || after == null) return undefined;
  const delta = after - before;
  return {
    preferenceImpact: delta >= 0 ? '全员偏好影响较小' : '需关注体验权衡',
  };
}
