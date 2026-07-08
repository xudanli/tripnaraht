import type { BlockerAssertionResult, BlockerCaseResult } from '../blockers/blocker-case.schema';

export async function runBlockerCase(input: {
  caseId: string;
  run: () => Promise<BlockerAssertionResult[]>;
}): Promise<BlockerCaseResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let assertions: BlockerAssertionResult[] = [];

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

export function expectBlockerPass(result: BlockerCaseResult): void {
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
