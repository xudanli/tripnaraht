import type { ConfigService } from '@nestjs/config';

function parseIdList(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Platform roles for `/admin/**` god-mode APIs.
 * Merges: JWT `roles` claim, env allow-lists `ADMIN_USER_IDS` / `OPERATOR_USER_IDS`, and DB `users.platform_role`.
 */
export function resolvePlatformRoles(
  config: ConfigService | undefined,
  userId: string,
  jwtRoles?: unknown,
  dbPlatformRole?: string | null,
): string[] {
  const set = new Set<string>();
  if (Array.isArray(jwtRoles)) {
    for (const r of jwtRoles) {
      const x = String(r).trim().toUpperCase();
      if (x) set.add(x);
    }
  }
  const uid = String(userId ?? '').trim();
  if (config && uid) {
    if (parseIdList(config.get<string>('ADMIN_USER_IDS')).includes(uid)) set.add('ADMIN');
    if (parseIdList(config.get<string>('OPERATOR_USER_IDS')).includes(uid)) set.add('OPERATOR');
  }
  const pr = String(dbPlatformRole ?? '').trim().toUpperCase();
  if (pr === 'ADMIN' || pr === 'OPERATOR') set.add(pr);
  return Array.from(set);
}

export function hasAdminPlatformAccess(roles: string[] | undefined): boolean {
  const r = new Set((roles ?? []).map((x) => String(x).toUpperCase()));
  return r.has('ADMIN') || r.has('OPERATOR');
}
