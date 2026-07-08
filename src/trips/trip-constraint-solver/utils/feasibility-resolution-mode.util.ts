/**
 * Feasibility issue → resolution mode (discovery layer).
 * Only DECISION_REQUIRED issues synthesize DecisionProblems.
 */

import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import type { AutomationPolicy } from '../types/travel-decision-contract.types';
import {
  isReadinessInformIssue,
  stableProblemId,
} from '../../decision-semantics/normalizers/constraint-semantic.normalizer';
import { applyAutomationPolicyToResolutionMode } from './automation-resolution-policy.util';

export type FeasibilityResolutionMode =
  | 'DIRECT_EDIT'
  | 'AUTO_FIX'
  | 'EVIDENCE_REFRESH'
  | 'COLLABORATION'
  | 'DECISION_REQUIRED';

export interface FeasibilityResolutionContext {
  linkedDecisionProblemId?: string | null;
  escalationReason?: string;
}

function countActionableRepairOptions(issue: FeasibilityIssueDto): number {
  const fromOptions = (issue.repairOptions ?? []).filter((o) => o.type !== 'inform').length;
  const planBHints = issue.visitorAccess?.evaluation?.planBHints?.length ?? 0;
  return Math.max(fromOptions, planBHints > 1 ? planBHints : 0);
}

function isStructuralMealGap(issue: FeasibilityIssueDto): boolean {
  const blob = `${issue.title} ${issue.message} ${issue.issueKind ?? ''}`;
  if (issue.category === 'itinerary_completeness' || issue.issueKind === 'itinerary_structure') {
    return true;
  }
  if (issue.proofs?.some((p) => p.constraint === 'LUNCH_MISSING' || p.constraint === 'DINNER_MISSING')) {
    return true;
  }
  return /LUNCH_MISSING|DINNER_MISSING|缺(午餐|晚餐)|未安排(午餐|晚餐)|meal_missing/.test(blob);
}

function isCoverageEvidenceGap(issue: FeasibilityIssueDto): boolean {
  if (issue.id.startsWith('coverage-gap:')) return true;
  if (issue.proofs?.some((p) => p.evidenceType === 'coverage-gap')) return true;
  if (
    /缺少证据覆盖|证据覆盖不足|opening_hours|开放时间未/.test(`${issue.title} ${issue.message}`) &&
    countActionableRepairOptions(issue) < 2 &&
    !issue.issueKind?.startsWith('poi_access')
  ) {
    return true;
  }
  return false;
}

function isMealWindowObjectGap(issue: FeasibilityIssueDto): boolean {
  const key = `${issue.semanticKey ?? ''} ${issue.issueKind ?? ''}`;
  return /meal_window_gap|MEAL_WINDOW_GAP/.test(key);
}

function isStayLinkageOnly(issue: FeasibilityIssueDto): boolean {
  const key = `${issue.semanticKey ?? ''} ${issue.issueKind ?? ''}`;
  return /stay_linkage|STAY_LINKAGE/.test(key) && countActionableRepairOptions(issue) <= 1;
}

function involvesCrossItemImpact(issue: FeasibilityIssueDto): boolean {
  if ((issue.affectedDays?.length ?? 0) > 1) return true;
  if (issue.fromItemId && issue.toItemId && issue.fromItemId !== issue.toItemId) return true;
  const anchors = issue.anchors as { fromDayNumber?: number; toDayNumber?: number } | undefined;
  if (
    anchors?.fromDayNumber != null &&
    anchors?.toDayNumber != null &&
    anchors.fromDayNumber !== anchors.toDayNumber
  ) {
    return true;
  }
  return false;
}

function lowestProofConfidence(issue: FeasibilityIssueDto): number {
  const confidences = (issue.proofs ?? [])
    .map((p) => p.confidence)
    .filter((c): c is number => typeof c === 'number');
  if (confidences.length === 0) return 1;
  return Math.min(...confidences);
}

/** Whether the decision runtime should synthesize a DecisionProblem. */
export function shouldEscalateToDecision(
  issue: FeasibilityIssueDto,
  draftMode: FeasibilityResolutionMode,
): boolean {
  if (draftMode === 'DECISION_REQUIRED') return true;
  if (draftMode === 'DIRECT_EDIT' || draftMode === 'EVIDENCE_REFRESH' || draftMode === 'COLLABORATION') {
    return false;
  }

  const optionCount = countActionableRepairOptions(issue);
  if (optionCount >= 2) return true;
  if (issue.category === 'team_fit' || issue.issueKind?.includes('preference')) return true;
  if (involvesCrossItemImpact(issue) && issue.priority !== 'pending_confirm') return true;
  if (lowestProofConfidence(issue) < 0.7 && optionCount >= 1) return true;
  if (issue.priority === 'must_handle' && optionCount >= 1) return true;
  if (issue.severity === 'high' && issue.issueKind?.startsWith('poi_access')) return true;
  return false;
}

function buildEscalationReason(issue: FeasibilityIssueDto): string {
  const parts: string[] = [];
  const optionCount = countActionableRepairOptions(issue);
  if (optionCount >= 2) parts.push('多方案权衡');
  if (issue.category === 'team_fit') parts.push('团队偏好');
  if (involvesCrossItemImpact(issue)) parts.push('跨行程项影响');
  if (lowestProofConfidence(issue) < 0.7) parts.push('置信度不足');
  if (issue.priority === 'must_handle') parts.push('必处理阻断');
  return parts.join('、') || '需要用户取舍';
}

export function inferFeasibilityResolutionMode(issue: FeasibilityIssueDto): FeasibilityResolutionMode {
  if (isReadinessInformIssue(issue)) {
    return 'EVIDENCE_REFRESH';
  }

  if (issue.category === 'team_fit' || issue.issueKind?.includes('preference')) {
    return 'COLLABORATION';
  }

  if (isStructuralMealGap(issue) || isMealWindowObjectGap(issue)) {
    return 'DIRECT_EDIT';
  }

  if (isStayLinkageOnly(issue)) {
    return 'DIRECT_EDIT';
  }

  if (isCoverageEvidenceGap(issue)) {
    return 'EVIDENCE_REFRESH';
  }

  const optionCount = countActionableRepairOptions(issue);
  const blob = `${issue.semanticKey ?? ''} ${issue.issueKind ?? ''} ${issue.title}`;

  if (/meal_late|MEAL_WINDOW_VS_ARRIVAL/.test(blob)) {
    return optionCount >= 2 ? 'DECISION_REQUIRED' : 'AUTO_FIX';
  }

  if (issue.issueKind?.startsWith('poi_access')) {
    if (optionCount >= 2 || (issue.visitorAccess?.evaluation?.planBHints?.length ?? 0) >= 2) {
      return 'DECISION_REQUIRED';
    }
    return 'EVIDENCE_REFRESH';
  }

  if (
    issue.issueKind === 'inter_day_travel' ||
    issue.issueKind === 'same_day_travel' ||
    issue.issueKind === 'daily_drive' ||
    issue.issueKind === 'no_night_drive'
  ) {
    return issue.priority === 'must_handle' || optionCount >= 2
      ? 'DECISION_REQUIRED'
      : 'AUTO_FIX';
  }

  if (optionCount >= 2) return 'DECISION_REQUIRED';
  if (optionCount === 1) return 'AUTO_FIX';
  if (issue.priority === 'must_handle') return 'DECISION_REQUIRED';
  if (issue.priority === 'suggest_adjust') return 'AUTO_FIX';
  return 'EVIDENCE_REFRESH';
}

export function resolveFeasibilityIssueResolution(
  issue: FeasibilityIssueDto,
  options?: { automation?: AutomationPolicy },
): FeasibilityIssueDto & FeasibilityResolutionContext {
  const inferredMode = inferFeasibilityResolutionMode(issue);
  const draftMode = applyAutomationPolicyToResolutionMode(
    issue,
    inferredMode,
    options?.automation,
  );
  const escalated = shouldEscalateToDecision(issue, draftMode);
  const resolutionMode: FeasibilityResolutionMode = escalated ? 'DECISION_REQUIRED' : draftMode;
  const linkedDecisionProblemId =
    resolutionMode === 'DECISION_REQUIRED' ? stableProblemId(issue) : null;

  return {
    ...issue,
    resolutionMode,
    linkedDecisionProblemId,
    escalationReason: escalated ? buildEscalationReason(issue) : undefined,
  };
}

export function enrichFeasibilityIssuesWithResolution(
  issues: FeasibilityIssueDto[],
  options?: { automation?: AutomationPolicy },
): FeasibilityIssueDto[] {
  return issues.map((issue) => resolveFeasibilityIssueResolution(issue, options));
}

export function filterIssuesForDecisionEscalation(
  issues: FeasibilityIssueDto[],
): FeasibilityIssueDto[] {
  return issues.filter((issue) => {
    const mode = issue.resolutionMode ?? inferFeasibilityResolutionMode(issue);
    if (mode !== 'DECISION_REQUIRED') return false;
    return shouldEscalateToDecision(issue, mode);
  });
}
