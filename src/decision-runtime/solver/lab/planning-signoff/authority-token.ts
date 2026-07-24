/**
 * Authority Token — binds signoff artifact hash + env + scope + expiry.
 *
 * Wire: OR_TOOLS_AUTHORITY_TOKEN=<base64url(claims)>.<hmac>
 * Secret: OR_TOOLS_AUTHORITY_TOKEN_SECRET (required to mint/verify HMAC)
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { AuthorityApprovalPackage } from './authority-package.types';

export interface AuthorityTokenClaims {
  signoffId: string;
  artifactHash: string;
  environment: 'staging' | 'production' | 'lab';
  provider: 'ortools-repair';
  allowedOperations: string[];
  expiresAt: string;
  canaryStage: 'selected_trips' | '5%' | '20%' | '50%' | '100%';
}

export interface AuthorityTokenVerifyResult {
  ok: boolean;
  reason?: string;
  claims?: AuthorityTokenClaims;
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8');
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

/** Canonical hash of the Product Approval Package (scope-bound). */
export function hashAuthorityPackage(pkg: AuthorityApprovalPackage): string {
  const canonical = {
    signoffId: pkg.signoffId,
    status: pkg.status,
    approved: pkg.approved,
    approvedAt: pkg.approvedAt ?? null,
    approvedBy: pkg.approvedBy ?? null,
    authorityScope: pkg.authorityScope,
    rollbackProvider: pkg.rollbackProvider,
    evidenceArtifactRefs: pkg.evidenceArtifactRefs,
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')
    .slice(0, 32);
}

export function mintAuthorityToken(
  claims: AuthorityTokenClaims,
  secret: string,
): string {
  if (!secret) throw new Error('OR_TOOLS_AUTHORITY_TOKEN_SECRET required to mint');
  const payload = b64url(JSON.stringify(claims));
  const sig = b64url(
    createHmac('sha256', secret).update(payload).digest(),
  );
  return `${payload}.${sig}`;
}

export function parseAuthorityToken(
  token: string,
  secret: string,
): AuthorityTokenVerifyResult {
  if (!token?.includes('.')) {
    return { ok: false, reason: 'token_format' };
  }
  if (!secret) {
    return { ok: false, reason: 'secret_missing' };
  }
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return { ok: false, reason: 'token_format' };
  const expected = b64url(
    createHmac('sha256', secret).update(payload).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'hmac_mismatch' };
  }
  try {
    const claims = JSON.parse(
      fromB64url(payload).toString('utf8'),
    ) as AuthorityTokenClaims;
    return { ok: true, claims };
  } catch {
    return { ok: false, reason: 'claims_parse' };
  }
}

/**
 * Verify token against approved authority package + runtime env.
 */
export function verifyAuthorityTokenAgainstPackage(input: {
  token: string;
  secret: string;
  pkg: AuthorityApprovalPackage;
  environment: AuthorityTokenClaims['environment'];
}): AuthorityTokenVerifyResult {
  const parsed = parseAuthorityToken(input.token, input.secret);
  if (!parsed.ok || !parsed.claims) return parsed;

  const c = parsed.claims;
  if (c.signoffId !== input.pkg.signoffId) {
    return { ok: false, reason: 'signoffId_mismatch', claims: c };
  }
  const expectedHash = hashAuthorityPackage(input.pkg);
  if (c.artifactHash !== expectedHash) {
    return { ok: false, reason: 'artifactHash_mismatch', claims: c };
  }
  if (c.environment !== input.environment) {
    return { ok: false, reason: 'environment_mismatch', claims: c };
  }
  if (c.provider !== 'ortools-repair') {
    return { ok: false, reason: 'provider_mismatch', claims: c };
  }
  if (c.provider !== 'ortools-repair' || input.pkg.rollbackProvider !== 'neptune-repair') {
    /* rollback provider is fixed on package; token only authorizes ortools */
  }
  const allowed = new Set(input.pkg.authorityScope.operations);
  for (const op of c.allowedOperations) {
    if (!allowed.has(op)) {
      return { ok: false, reason: `operation_not_in_scope:${op}`, claims: c };
    }
  }
  if (new Date(c.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: 'token_expired', claims: c };
  }
  if (input.pkg.status !== 'APPROVED' && input.pkg.status !== 'PASS') {
    return { ok: false, reason: 'package_not_approved', claims: c };
  }
  if (!input.pkg.approved) {
    return { ok: false, reason: 'package_not_approved', claims: c };
  }
  return { ok: true, claims: c };
}

export function resolveAuthorityEnvironment(): AuthorityTokenClaims['environment'] {
  const raw = (process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'lab')
    .trim()
    .toLowerCase();
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'staging' || raw === 'stage') return 'staging';
  return 'lab';
}
