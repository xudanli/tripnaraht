/**
 * Architecture lint — formal constraint paths must consume CanonicalConstraintReport.
 * @see ADR-006 / DECISION_RUNTIME_MATURITY.md §5.2
 */

/** Direct ConstraintChecker.checkPlan — adapter + shadow-compare legacy leg only. */
export const CONSTRAINT_CHECK_PLAN_CALLER_ALLOWLIST = new Set([
  'src/trips/decision/constraints/constraint-checker.ts',
  'src/decision-runtime/constraints/providers/legacy-checker.provider.ts',
  'src/trips/decision/constraints/constraint-engine.service.ts',
  'src/decision-runtime/constraints/constraint-formal-path.architecture.config.ts',
]);

/** Direct `new ConstraintChecker()` — tests excluded by lint walker. */
export const CONSTRAINT_CHECKER_INSTANTIATION_ALLOWLIST = new Set([
  'src/trips/decision/constraints/constraint-checker.ts',
]);

/** Roots scanned for bypass patterns */
export const CONSTRAINT_FORMAL_PATH_GUARD_ROOTS = [
  'src/trips/decision',
  'src/decision-runtime/core',
  'src/guide-to-plan/services',
] as const;

export const CONSTRAINT_CHECK_PLAN_FORBIDDEN_OUTSIDE_ALLOWLIST = true;

export function normalizeRepoRelativePath(filePath: string, root: string): string {
  return filePath.replace(`${root}/`, '').replace(/\\/g, '/');
}
