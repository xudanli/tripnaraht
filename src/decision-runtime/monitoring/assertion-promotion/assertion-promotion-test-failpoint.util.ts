/**
 * Devbox/staging-only failpoint for Retry Scheduler operational drills.
 * Default off; never enable in production.
 */

const consumedPromotionKeys = new Set<string>();

export function isAssertionPromotionTestFailOnceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === 'production') return false;
  const v = env.ASSERTION_PROMOTION_TEST_FAIL_ONCE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Consume one synthetic failure per promotionKey (in-process). */
export function consumeAssertionPromotionTestFailOnce(promotionKey: string): boolean {
  if (!isAssertionPromotionTestFailOnceEnabled()) return false;
  if (consumedPromotionKeys.has(promotionKey)) return false;
  consumedPromotionKeys.add(promotionKey);
  return true;
}

export function resetAssertionPromotionTestFailOnceForTests(): void {
  consumedPromotionKeys.clear();
}
