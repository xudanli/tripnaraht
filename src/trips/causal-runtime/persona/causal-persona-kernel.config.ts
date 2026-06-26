/** P3 feature flag — default on unless explicitly disabled. */
export function isCausalPersonaKernelEnabled(): boolean {
  const raw = process.env.CAUSAL_PERSONA_KERNEL ?? process.env.TRIP_CAUSAL_PERSONA_KERNEL ?? '1';
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}

export function shouldSkipLlmGuardianEval(projection?: {
  kernelAuthoritative?: boolean;
} | null): boolean {
  if (!isCausalPersonaKernelEnabled()) return false;
  return projection?.kernelAuthoritative === true;
}
