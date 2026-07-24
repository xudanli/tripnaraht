import type { PackageHarnessExpectedPlan } from '../harness/package-harness.types';

const CONTINUE_ONLY = new Set(['CONTINUE_AS_PLANNED', 'MAINTAIN_CURRENT_PACE', 'MAINTAIN_SCHEDULE']);

export function assertStopScenarioPlans(
  scenarioId: string,
  severityLevel: string | undefined,
  plans: PackageHarnessExpectedPlan[] | undefined,
): string[] {
  if (severityLevel !== 'STOP' || !plans?.length) return [];
  const failures: string[] = [];
  const minimal = plans.find((p) => p.planType === 'MINIMAL_CHANGE');
  if (!minimal) {
    failures.push(`${scenarioId}: STOP scenario missing MINIMAL_CHANGE plan`);
    return failures;
  }
  if (minimal.actionCodes.length === 0) {
    failures.push(`${scenarioId}: STOP MINIMAL_CHANGE must not have empty actionCodes`);
  }
  if (
    minimal.actionCodes.length === 1 &&
    CONTINUE_ONLY.has(minimal.actionCodes[0]!)
  ) {
    failures.push(`${scenarioId}: STOP MINIMAL_CHANGE cannot be CONTINUE-only`);
  }
  if ((minimal.safetyDelta?.min ?? 0) < 0) {
    const hasMitigation = minimal.actionCodes.some((code) => !CONTINUE_ONLY.has(code));
    if (!hasMitigation) {
      failures.push(
        `${scenarioId}: STOP MINIMAL_CHANGE with negative safetyDelta must include mitigating actions`,
      );
    }
  }
  return failures;
}

export function assertSafetyVetoOnPlans(
  scenarioId: string,
  severityLevel: string | undefined,
  plans: PackageHarnessExpectedPlan[] | undefined,
): string[] {
  if (severityLevel !== 'STOP' || !plans?.length) return [];
  const failures: string[] = [];
  for (const plan of plans) {
    if (plan.planType === 'UNAVAILABLE') continue;
    const unsafeContinue =
      plan.actionCodes.every((code) => CONTINUE_ONLY.has(code)) ||
      (plan.actionCodes.length === 1 && CONTINUE_ONLY.has(plan.actionCodes[0]!));
    if (unsafeContinue) {
      failures.push(`${scenarioId}: vetoed unsafe ${plan.planType} plan with continue-only actions`);
    }
  }
  return failures;
}

export function assertPlanDegradationStructure(
  scenarioId: string,
  plans: PackageHarnessExpectedPlan[] | undefined,
): string[] {
  if (!plans?.length) return [];
  const failures: string[] = [];
  const available = plans.filter((p) => p.planType !== 'UNAVAILABLE' && p.status !== 'UNAVAILABLE');
  const unavailable = plans.filter((p) => p.planType === 'UNAVAILABLE' || p.status === 'UNAVAILABLE');

  if (available.length === 3 && unavailable.length > 0) {
    failures.push(`${scenarioId}: 3 feasible plans should not include UNAVAILABLE entries`);
  }
  if (available.length + unavailable.length !== plans.length) {
    failures.push(`${scenarioId}: plans must be either feasible or UNAVAILABLE`);
  }
  for (const plan of unavailable) {
    if (plan.actionCodes.length > 0) {
      failures.push(`${scenarioId}: UNAVAILABLE plan must not contain actionable actionCodes`);
    }
  }
  return failures;
}
