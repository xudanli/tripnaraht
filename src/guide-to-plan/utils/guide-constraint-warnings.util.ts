import type { ConstraintAssertion } from '../../decision-runtime/constraints/contracts/constraint-assertion';
import type { CanonicalConstraintReport } from '../../decision-runtime/constraints/contracts/canonical-constraint-report';

export function constraintAssertionsToWarnings(
  assertions: ConstraintAssertion[],
): string[] {
  return assertions
    .filter((a) => a.status !== 'PASS')
    .map((a) => {
      const prefix =
        a.status === 'BLOCK'
          ? '[阻断]'
          : a.status === 'REQUIRES_VERIFICATION'
            ? '[待核实]'
            : a.status === 'UNKNOWN'
              ? '[未知]'
              : '[提示]';
      return `${prefix} ${a.message}`;
    });
}

export function constraintReportToWarnings(report: CanonicalConstraintReport): string[] {
  const warnings = constraintAssertionsToWarnings(report.assertions);
  if (report.overallStatus === 'UNVERIFIED' || report.overallStatus === 'INFEASIBLE') {
    warnings.unshift(`Canonical 约束评估：${report.overallStatus}（非已确认可执行结论）`);
  }
  return warnings.slice(0, 8);
}
