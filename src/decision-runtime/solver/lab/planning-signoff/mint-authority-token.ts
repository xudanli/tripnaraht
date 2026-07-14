/**
 * Mint Authority Token bound to approved authority.json.
 *
 *   OR_TOOLS_AUTHORITY_TOKEN_SECRET=... npm run lab:mint-authority-token
 *   OR_TOOLS_AUTHORITY_ENVIRONMENT=staging
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PLANNING_SIGNOFF_ROOT } from './load-planning-signoff';
import type { AuthorityApprovalPackage } from './authority-package.types';
import {
  hashAuthorityPackage,
  mintAuthorityToken,
  resolveAuthorityEnvironment,
  type AuthorityTokenClaims,
} from './authority-token';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

async function main(): Promise<number> {
  const useTestPkg =
    process.argv.includes('--test-pkg') || Boolean(argValue('--pkg'));
  const pkgPath = argValue('--pkg')
    ? join(process.cwd(), argValue('--pkg')!)
    : useTestPkg
      ? join(PLANNING_SIGNOFF_ROOT, 'authority.test.json')
      : join(
          PLANNING_SIGNOFF_ROOT,
          argValue('--date') ??
            readFileSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'), 'utf8').trim(),
          'authority.json',
        );

  if (!existsSync(pkgPath)) {
    console.error(`FAIL: missing ${pkgPath}`);
    return 1;
  }
  const pkg = JSON.parse(
    readFileSync(pkgPath, 'utf8'),
  ) as AuthorityApprovalPackage;
  if (!pkg.approved || (pkg.status !== 'APPROVED' && pkg.status !== 'PASS')) {
    console.error(
      'FAIL: package must be APPROVED. For lab: npm run lab:mint-authority-token -- --test-pkg',
    );
    return 1;
  }

  const secret = (
    process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET ??
    (useTestPkg ? 'm4-ra01a-lab-harness-secret-not-for-prod' : '')
  ).trim();
  if (!secret) {
    console.error('FAIL: set OR_TOOLS_AUTHORITY_TOKEN_SECRET');
    return 1;
  }

  const ttlDays = Number(argValue('--ttl-days') ?? '14') || 14;
  const expiresAt = new Date(
    Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  // Lab/test package must not claim production
  const environment = useTestPkg
    ? 'lab'
    : resolveAuthorityEnvironment();
  const stage = (argValue('--stage') ??
    pkg.authorityScope.tripSelectionMode ??
    'selected_trips') as AuthorityTokenClaims['canaryStage'];

  if (stage === 'shadow' as string) {
    console.error('FAIL: token canaryStage cannot be shadow');
    return 1;
  }

  const claims: AuthorityTokenClaims = {
    signoffId: pkg.signoffId,
    artifactHash: hashAuthorityPackage(pkg),
    environment,
    provider: 'ortools-repair',
    allowedOperations: [...pkg.authorityScope.operations],
    expiresAt,
    canaryStage:
      stage === 'selected_trips' ||
      stage === '5%' ||
      stage === '20%' ||
      stage === '50%' ||
      stage === '100%'
        ? stage
        : 'selected_trips',
  };

  const token = mintAuthorityToken(claims, secret);

  if (useTestPkg || process.argv.includes('--write-env')) {
    const envPath = join(PLANNING_SIGNOFF_ROOT, '.lab-authority-token.env');
    writeFileSync(
      envPath,
      [
        '# Lab token — bound to authority.test.json only',
        `OR_TOOLS_AUTHORITY_TOKEN_SECRET=${secret}`,
        `OR_TOOLS_AUTHORITY_TOKEN=${token}`,
        `OR_TOOLS_AUTHORITY_ENVIRONMENT=${environment}`,
        '',
      ].join('\n'),
    );
  }

  console.log(
    JSON.stringify(
      {
        pkgPath: pkgPath.replace(`${process.cwd()}/`, ''),
        labOnly: useTestPkg,
        claims,
        token,
        exportHints: {
          OR_TOOLS_AUTHORITY_TOKEN: token,
          OR_TOOLS_AUTHORITY_ENVIRONMENT: environment,
          OR_TOOLS_CANARY_STAGE: claims.canaryStage,
          OR_TOOLS_AUTHORITATIVE_CANARY: '1',
        },
        note: useTestPkg
          ? 'Lab token for authority.test.json — never use for product canary'
          : 'Do not widen allowedOperations beyond authority.json scope',
      },
      null,
      2,
    ),
  );
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
