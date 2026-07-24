/**
 * Evaluate ADR-008 Lab Sign-off report / metrics invariants.
 * Never promotes OR-Tools to authoritative.
 */

export interface OrToolsLabSignoffCheck {
  id: string;
  pass: boolean;
  threshold?: number | string;
  actual?: number | string;
  detail?: string;
}

export interface OrToolsLabSignoffReport {
  schemaId: 'tripnara.ortools_lab_signoff@v1';
  verdict: 'PASS' | 'FAIL';
  authoritativePromotion: false;
  nativeCpSat: false;
  checks: OrToolsLabSignoffCheck[];
  generatedAt?: string;
}

/** Policy gate on Nest metrics snapshot (evaluate-shadow path). */
export function evaluateOrToolsShadowMetricsGate(input: {
  writeAttemptedTotal: number;
  forbiddenEdgeViolationSum: number;
  runsTotal: number;
}): OrToolsLabSignoffCheck[] {
  return [
    {
      id: 'unauthorized_write',
      pass: input.writeAttemptedTotal === 0,
      threshold: 0,
      actual: input.writeAttemptedTotal,
    },
    {
      id: 'forbidden_edge_violations_sum',
      pass: input.forbiddenEdgeViolationSum === 0 || input.runsTotal === 0,
      threshold: 0,
      actual: input.forbiddenEdgeViolationSum,
      detail: 'shadow candidates must not traverse projected EDGE_FORBIDDEN',
    },
    {
      id: 'authoritative_promotion',
      pass: true,
      actual: 'false',
      detail: 'gate never promotes OR-Tools; always false',
    },
  ];
}

export function foldLabSignoffChecks(
  checks: OrToolsLabSignoffCheck[],
): OrToolsLabSignoffReport {
  return {
    schemaId: 'tripnara.ortools_lab_signoff@v1',
    verdict: checks.every((c) => c.pass) ? 'PASS' : 'FAIL',
    authoritativePromotion: false,
    nativeCpSat: false,
    checks,
    generatedAt: new Date().toISOString(),
  };
}

/** Validate Python lab_signoff.py JSON shape + hard rules. */
export function validatePythonLabSignoffReport(
  report: OrToolsLabSignoffReport,
): OrToolsLabSignoffReport {
  const extras: OrToolsLabSignoffCheck[] = [
    {
      id: 'report_nativeCpSat_false',
      pass: report.nativeCpSat === false,
      actual: String(report.nativeCpSat),
    },
    {
      id: 'report_no_authority_promotion',
      pass: report.authoritativePromotion === false,
      actual: String(report.authoritativePromotion),
    },
  ];
  return foldLabSignoffChecks([...report.checks, ...extras]);
}
