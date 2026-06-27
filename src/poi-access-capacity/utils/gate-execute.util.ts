/**
 * GATE-EXECUTE — 阻止「进行中」的权威来源
 */

import type { FeasibilityIssueDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { GateExecuteStatus } from '../types/poi-access-readiness.types';

export function computeGateExecute(issues: FeasibilityIssueDto[]): GateExecuteStatus {
  const reasons: GateExecuteStatus['reasons'] = [];

  for (const issue of issues) {
    if (issue.issueKind === 'poi_access_blocked') {
      reasons.push({
        code: 'access_hard_blocked',
        issueId: issue.id,
        message: issue.message,
      });
    }
    if (issue.issueKind === 'experience_regret_unconfirmed') {
      reasons.push({
        code: 'experience_regret_unconfirmed',
        issueId: issue.id,
        message: issue.message,
      });
    }
  }

  return { blocked: reasons.length > 0, reasons };
}

export function countGatingMustHandle(issues: FeasibilityIssueDto[]): number {
  return issues.filter(
    (i) =>
      i.priority === 'must_handle' &&
      i.issueKind !== 'poi_access_reservation_required',
  ).length;
}
