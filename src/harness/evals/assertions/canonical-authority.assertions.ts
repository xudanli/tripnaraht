import type { AuthorityAssertionResult } from '../authority/authority-case.schema';

export function authorityAssert(input: {
  layer: AuthorityAssertionResult['layer'];
  name: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}): AuthorityAssertionResult {
  return {
    layer: input.layer,
    name: input.name,
    pass: input.pass,
    expected: input.expected,
    actual: input.actual,
    message: input.message,
  };
}

/** Decision Ledger 闭环所需 node kinds（AU-P1-008） */
export const LEDGER_CLOSURE_KINDS = [
  'PROBLEM',
  'EVIDENCE',
  'CONSTRAINTS',
  'CANDIDATES',
  'EVALUATION',
  'SELECTED_DECISION',
  'REJECTED_ALTERNATIVES',
  'PLAN_CHANGE',
  'EXECUTION_STATUS',
] as const;

export type LedgerClosureKind = (typeof LEDGER_CLOSURE_KINDS)[number];

export function assertLedgerClosurePresent(input: {
  presentKinds: string[];
}): AuthorityAssertionResult[] {
  const missing = LEDGER_CLOSURE_KINDS.filter((k) => !input.presentKinds.includes(k));
  return [
    authorityAssert({
      layer: 'decision_ledger',
      name: 'ledger_closure_kinds',
      pass: missing.length === 0,
      expected: [...LEDGER_CLOSURE_KINDS],
      actual: input.presentKinds,
      message:
        missing.length > 0
          ? `Missing ledger kinds: ${missing.join(', ')}`
          : 'Full decision closure recorded',
    }),
  ];
}

/** 写权威链四步（AU-P0-002） */
export function assertWriteAuthorityChain(input: {
  hasDecisionId: boolean;
  constraintEvaluated: boolean;
  tripVersionChecked: boolean;
  writeGuardPassed: boolean;
}): AuthorityAssertionResult[] {
  const steps: Array<{ key: keyof typeof input; label: string }> = [
    { key: 'hasDecisionId', label: 'decision_id_present' },
    { key: 'constraintEvaluated', label: 'constraint_evaluation' },
    { key: 'tripVersionChecked', label: 'trip_version_check' },
    { key: 'writeGuardPassed', label: 'write_guard' },
  ];
  return steps.map(({ key, label }) =>
    authorityAssert({
      layer: 'write_guard',
      name: label,
      pass: input[key],
      expected: true,
      actual: input[key],
      message: input[key] ? undefined : `${label} missing in write path`,
    }),
  );
}

/** 三模式安全 parity（AU-P1-007） */
export function assertSafetyVerdictParity(input: {
  mode: string;
  executable: boolean;
  needsConfirmation: boolean;
  writeAllowed: boolean;
  violationCodes: string[];
}): AuthorityAssertionResult {
  return authorityAssert({
    layer: 'constraint_gateway',
    name: `safety_verdict_${input.mode}`,
    pass: true,
    actual: {
      executable: input.executable,
      needsConfirmation: input.needsConfirmation,
      writeAllowed: input.writeAllowed,
      violationCodes: [...input.violationCodes].sort(),
    },
    message: `Recorded safety verdict for ${input.mode} (compare across modes)`,
  });
}

export async function runAuthorityCase(input: {
  caseId: string;
  run: () => Promise<AuthorityAssertionResult[]>;
}): Promise<import('../authority/authority-case.schema').AuthorityCaseResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let assertions: AuthorityAssertionResult[] = [];

  try {
    assertions = await input.run();
    for (const a of assertions) {
      if (!a.pass) {
        errors.push(`[${a.layer}] ${a.name}: ${a.message ?? 'failed'}`);
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return {
    caseId: input.caseId,
    pass: errors.length === 0,
    assertions,
    errors,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export function expectAuthorityPass(
  result: import('../authority/authority-case.schema').AuthorityCaseResult,
): void {
  if (!result.pass) {
    throw new Error(
      `${result.caseId} failed:\n${result.errors.join('\n')}\n` +
        result.assertions
          .filter((a) => !a.pass)
          .map((a) => `  - ${a.layer}/${a.name}`)
          .join('\n'),
    );
  }
}
