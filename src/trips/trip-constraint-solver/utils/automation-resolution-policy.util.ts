/**
 * Apply TravelDecisionContract AutomationPolicy to feasibility resolution modes.
 */

import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import type { AutomationPolicy } from '../types/travel-decision-contract.types';
import type { FeasibilityResolutionMode } from './feasibility-resolution-mode.util';

function countActionableRepairOptions(issue: FeasibilityIssueDto): number {
  const fromOptions = (issue.repairOptions ?? []).filter((o) => o.type !== 'inform').length;
  const planBHints = issue.visitorAccess?.evaluation?.planBHints?.length ?? 0;
  return Math.max(fromOptions, planBHints > 1 ? planBHints : 0);
}

function issueBlob(issue: FeasibilityIssueDto): string {
  return `${issue.semanticKey ?? ''} ${issue.issueKind ?? ''} ${issue.title} ${issue.message}`.toLowerCase();
}

function matchesSemanticKeys(blob: string, keys: string[]): boolean {
  return keys.some((key) => blob.includes(key.toLowerCase().replace(/_/g, ' ')) || blob.includes(key));
}

export function isConfirmationRequiredByAutomationPolicy(
  issue: FeasibilityIssueDto,
  automation: AutomationPolicy,
): boolean {
  const blob = issueBlob(issue);
  const keys = automation.confirmationRequired ?? [];

  if (matchesSemanticKeys(blob, keys)) return true;

  if (/remove_poi|删除景点|删.*景点/.test(blob)) return true;
  if (/change_lodging|更换住宿|换.*酒店|换.*住宿/.test(blob)) return true;
  if (/increase_cost|增加费用|超预算|budget/.test(blob) && issue.category === 'budget') return true;
  if (/change_intercity|跨城|inter_day_travel/.test(blob) && issue.issueKind === 'inter_day_travel') {
    return true;
  }

  if (
    issue.issueKind === 'daily_drive' &&
    issue.priority === 'must_handle' &&
    countActionableRepairOptions(issue) >= 2
  ) {
    return keys.includes('change_lodging') || keys.includes('change_intercity_route');
  }

  return false;
}

export function isAutoAllowedByAutomationPolicy(
  issue: FeasibilityIssueDto,
  automation: AutomationPolicy,
): boolean {
  const blob = issueBlob(issue);
  const keys = automation.autoAllowed ?? [];

  if (matchesSemanticKeys(blob, keys)) return true;

  if (/refresh_road_weather|evidence|coverage-gap|证据/.test(blob)) return true;
  if (/meal_late|shift_meal|顺延.*午餐|午餐.*顺延/.test(blob)) return true;
  if (/buffer|缓冲/.test(blob)) return true;

  if (issue.id.startsWith('coverage-gap:')) return true;
  if (issue.issueKind === 'meal_late' && countActionableRepairOptions(issue) <= 1) return true;

  return false;
}

export function applyAutomationPolicyToResolutionMode(
  issue: FeasibilityIssueDto,
  draftMode: FeasibilityResolutionMode,
  automation?: AutomationPolicy,
): FeasibilityResolutionMode {
  if (!automation) return draftMode;

  const level = automation.defaultLevel;

  if (isConfirmationRequiredByAutomationPolicy(issue, automation)) {
    if (draftMode === 'AUTO_FIX' || draftMode === 'EVIDENCE_REFRESH') {
      return 'DECISION_REQUIRED';
    }
    return draftMode;
  }

  if (level === 'INFORM_ONLY') {
    if (draftMode === 'DECISION_REQUIRED') {
      return issue.priority === 'must_handle' ? 'DECISION_REQUIRED' : 'EVIDENCE_REFRESH';
    }
    return draftMode;
  }

  if (level === 'SUGGEST') {
    return draftMode;
  }

  if (isAutoAllowedByAutomationPolicy(issue, automation)) {
    if (draftMode === 'DECISION_REQUIRED' && countActionableRepairOptions(issue) <= 1) {
      return 'AUTO_FIX';
    }
    if (draftMode === 'EVIDENCE_REFRESH') {
      return 'AUTO_FIX';
    }
  }

  if (level === 'AUTO_REPAIR_LOW_RISK') {
    if (draftMode === 'DECISION_REQUIRED' && isAutoAllowedByAutomationPolicy(issue, automation)) {
      return 'AUTO_FIX';
    }
    return draftMode;
  }

  if (level === 'AUTO_EXECUTE_CONDITIONAL') {
    if (draftMode === 'DECISION_REQUIRED' && isAutoAllowedByAutomationPolicy(issue, automation)) {
      return 'AUTO_FIX';
    }
  }

  return draftMode;
}
