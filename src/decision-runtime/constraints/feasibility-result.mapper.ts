/**
 * Maps CanonicalConstraintReport → legacy FeasibilityResult for compat consumers.
 */

import type { FeasibilityResult } from '../../trips/decision/constraints/constraint-engine.service';
import type { CanonicalConstraintReport } from './contracts/canonical-constraint-report';
import { isLegacyFeasibleFromReport } from './contracts/canonical-constraint-report';

export function mapReportToFeasibilityResult(
  report: CanonicalConstraintReport,
): FeasibilityResult {
  const violations = report.assertions
    .filter((a) => a.status !== 'PASS')
    .map((a) => ({
      code: a.constraintType,
      severity:
        a.status === 'BLOCK'
          ? ('error' as const)
          : a.status === 'WARNING'
            ? ('warning' as const)
            : ('info' as const),
      date: a.scope.dayId,
      slotId: a.scope.activityId,
      activityId: a.scope.activityId,
      message: a.message,
      suggestions: a.remediationHints,
    }));

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.length - errorCount - warningCount;

  const blockingSummary = report.assertions
    .filter((a) => a.status === 'BLOCK' || a.status === 'REQUIRES_VERIFICATION')
    .map((a) => a.message)
    .join('; ');

  return {
    feasible: isLegacyFeasibleFromReport(report),
    violations,
    infeasibilityExplanation:
      report.overallStatus === 'INFEASIBLE' || report.overallStatus === 'UNVERIFIED'
        ? {
            feasible: false,
            reasons: report.assertions
              .filter((a) => a.status !== 'PASS' && a.status !== 'WARNING')
              .map((a) => ({
                constraint: a.constraintType,
                description: a.message,
                fix_suggestions: a.remediationHints ?? [],
              })),
            summary: blockingSummary || report.degradedReasons.join('; ') || undefined,
          }
        : undefined,
    rawCheckResult: {
      violations,
      isValid: isLegacyFeasibleFromReport(report),
      summary: { errorCount, warningCount, infoCount },
    },
  };
}
