/**
 * Latent implicit-parse Shadow — default OFF; kill switch forces OFF.
 */

export function isLatentImplicitParseKillSwitchEngaged(): boolean {
  const v = process.env.LATENT_IMPLICIT_PARSE_KILL_SWITCH?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Explicit opt-in. Unset → disabled. */
export function isLatentImplicitParseShadowEnabled(): boolean {
  if (isLatentImplicitParseKillSwitchEngaged()) return false;
  const v = process.env.LATENT_IMPLICIT_PARSE_SHADOW?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function assertLatentImplicitParseShadowEnabled(): void {
  if (isLatentImplicitParseKillSwitchEngaged()) {
    throw new Error(
      'LATENT implicit-parse kill switch engaged (LATENT_IMPLICIT_PARSE_KILL_SWITCH)',
    );
  }
  if (!isLatentImplicitParseShadowEnabled()) {
    throw new Error(
      'LATENT implicit-parse Shadow disabled (set LATENT_IMPLICIT_PARSE_SHADOW=1)',
    );
  }
}
