/**
 * Strip / reject decision-authoritative language from model free text.
 * Extraction layer must not carry safety verdicts into assessment copy.
 */

const FORBIDDEN_PATTERNS: RegExp[] = [
  /这条道路安全/,
  /你可以继续开/,
  /一定是四驱/,
  /活动已经取消/,
  /活动已取消/,
  /不需要遵守官方标志/,
  /直接进入即可/,
  /road is safe/i,
  /you can keep driving/i,
  /definitely 4wd/i,
  /ignore (the )?official/i,
];

export function containsForbiddenDecisionLanguage(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

export function assertNoForbiddenDecisionLanguage(
  texts: string[],
): void {
  for (const t of texts) {
    if (containsForbiddenDecisionLanguage(t)) {
      throw new Error(
        `Forbidden decision language in extraction output: ${t.slice(0, 80)}`,
      );
    }
  }
}

/** Drop any extractedFacts that look like mutation commands */
export function stripCommandLikeFacts<
  T extends { key: string; value: unknown },
>(facts: T[]): T[] {
  return facts.filter((f) => {
    const k = f.key.toLowerCase();
    if (k.includes('apply') || k.includes('command') || k.includes('mutation')) {
      return false;
    }
    if (
      typeof f.value === 'string' &&
      containsForbiddenDecisionLanguage(f.value)
    ) {
      return false;
    }
    return true;
  });
}
