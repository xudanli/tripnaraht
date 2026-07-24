/**
 * M4-RA-01A — runtime fault injection (no real whitelist trips required).
 */

import {
  evaluateOrtToolsAuthorityCanaryGate,
  resolveAuthoritativeRepairProviderForRequest,
} from '../ortools-authority-canary.gate';
import type { AuthorityApprovalPackage } from './authority-package.types';
import {
  hashAuthorityPackage,
  mintAuthorityToken,
  verifyAuthorityTokenAgainstPackage,
} from './authority-token';
import { resolveScopedAuthoritativeRepairProvider } from './selected-trips-canary';
import {
  drillCanaryKillProvider,
  drillDiscardPendingAfterCanaryOff,
  drillGatewayBlockForbidsWrite,
  drillIdempotentPlanVersionWrite,
  drillSolverUnavailableFallback,
  drillStaleCandidateVoid,
} from './rollback-drill-scenarios';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('M4-RA-01A rollback / fault injection', () => {
  const keys = [
    'OR_TOOLS_AUTHORITATIVE_CANARY',
    'OR_TOOLS_CANARY_STAGE',
    'OR_TOOLS_CANARY_PERCENT_APPROVED',
    'OR_TOOLS_AUTHORITY_TOKEN',
    'OR_TOOLS_AUTHORITY_TOKEN_SECRET',
    'OR_TOOLS_AUTHORITY_ENVIRONMENT',
  ] as const;
  const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  const testPkg = (): AuthorityApprovalPackage =>
    JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'src/decision-runtime/solver/lab/planning-signoff/authority.test.json',
        ),
        'utf8',
      ),
    ) as AuthorityApprovalPackage;

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  function openGate(pkg: AuthorityApprovalPackage, token: string, secret: string) {
    process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET = secret;
    process.env.OR_TOOLS_AUTHORITY_TOKEN = token;
    process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT = 'staging';
    process.env.OR_TOOLS_AUTHORITATIVE_CANARY = '1';
    process.env.OR_TOOLS_CANARY_STAGE = 'selected_trips';
    return evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 0,
      realGoldActiveCount: 5,
      stabilitySignedOff: true,
      localitySignedOff: true,
      gatewaySignedOff: true,
      rollbackReady: true,
      ignoreSignoffBundle: true,
      authorityPackageOverride: pkg,
    });
  }

  it('rejects expired Authority Token', () => {
    const pkg = testPkg();
    const secret = 'fault-secret';
    const token = mintAuthorityToken(
      {
        signoffId: pkg.signoffId,
        artifactHash: hashAuthorityPackage(pkg),
        environment: 'staging',
        provider: 'ortools-repair',
        allowedOperations: [...pkg.authorityScope.operations],
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        canaryStage: 'selected_trips',
      },
      secret,
    );
    const v = verifyAuthorityTokenAgainstPackage({
      token,
      secret,
      pkg,
      environment: 'staging',
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('token_expired');

    process.env.OR_TOOLS_AUTHORITY_TOKEN = token;
    process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET = secret;
    process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT = 'staging';
    process.env.OR_TOOLS_AUTHORITATIVE_CANARY = '1';
    process.env.OR_TOOLS_CANARY_STAGE = 'selected_trips';
    const report = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 0,
      realGoldActiveCount: 5,
      stabilitySignedOff: true,
      localitySignedOff: true,
      ignoreSignoffBundle: true,
      authorityPackageOverride: pkg,
    });
    expect(report.blockedReasons).toContain('signoff_token');
    expect(report.authoritativePromotion).toBe(false);
  });

  it('rejects token when artifact hash mismatches', () => {
    const pkg = testPkg();
    const secret = 'fault-secret';
    const token = mintAuthorityToken(
      {
        signoffId: pkg.signoffId,
        artifactHash: 'deadbeefdeadbeefdeadbeefdeadbeef',
        environment: 'staging',
        provider: 'ortools-repair',
        allowedOperations: ['SHIFT'],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        canaryStage: 'selected_trips',
      },
      secret,
    );
    const v = verifyAuthorityTokenAgainstPackage({
      token,
      secret,
      pkg,
      environment: 'staging',
    });
    expect(v.reason).toBe('artifactHash_mismatch');
  });

  it('falls back when trip not on whitelist', () => {
    const pkg = testPkg();
    expect(
      resolveScopedAuthoritativeRepairProvider({
        gateAllowsOrtTools: true,
        tripId: 'not_whitelisted',
        operation: 'SHIFT',
        pkg,
        whitelist: {
          schemaId: 'tripnara.ortools_selected_trips_whitelist@v1',
          signoffId: pkg.signoffId,
          destinations: ['IS'],
          selectionCriteria: [],
          tripIds: ['only_this'],
        },
        stage: 'selected_trips',
      }),
    ).toBe('neptune-repair');
  });

  it('falls back when operation out of approved scope', () => {
    const pkg = testPkg();
    expect(
      resolveScopedAuthoritativeRepairProvider({
        gateAllowsOrtTools: true,
        tripId: 'only_this',
        operation: 'MOVE_DAY',
        pkg,
        whitelist: {
          schemaId: 'tripnara.ortools_selected_trips_whitelist@v1',
          signoffId: pkg.signoffId,
          destinations: ['IS'],
          selectionCriteria: [],
          tripIds: ['only_this'],
        },
        stage: 'selected_trips',
      }),
    ).toBe('neptune-repair');
  });

  it('closing canary before execute forces neptune', () => {
    const pkg = testPkg();
    const secret = 'fault-secret';
    const token = mintAuthorityToken(
      {
        signoffId: pkg.signoffId,
        artifactHash: hashAuthorityPackage(pkg),
        environment: 'staging',
        provider: 'ortools-repair',
        allowedOperations: [...pkg.authorityScope.operations],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        canaryStage: 'selected_trips',
      },
      secret,
    );
    const open = openGate(pkg, token, secret);
    expect(open.authoritativePromotion).toBe(true);

    delete process.env.OR_TOOLS_AUTHORITATIVE_CANARY;
    process.env.OR_TOOLS_CANARY_STAGE = 'shadow';
    const closed = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 0,
      realGoldActiveCount: 5,
      stabilitySignedOff: true,
      localitySignedOff: true,
      ignoreSignoffBundle: true,
      authorityPackageOverride: pkg,
    });
    expect(closed.authoritativePromotion).toBe(false);
    expect(
      resolveAuthoritativeRepairProviderForRequest({
        tripId: 'only_this',
        operation: 'SWAP',
        gate: closed,
      }),
    ).toBe('neptune-repair');
  });

  it('Gateway BLOCK / forbidden write blocks promotion', () => {
    const pkg = testPkg();
    const secret = 'fault-secret';
    const token = mintAuthorityToken(
      {
        signoffId: pkg.signoffId,
        artifactHash: hashAuthorityPackage(pkg),
        environment: 'staging',
        provider: 'ortools-repair',
        allowedOperations: ['REROUTE'],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        canaryStage: 'selected_trips',
      },
      secret,
    );
    process.env.OR_TOOLS_AUTHORITY_TOKEN = token;
    process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET = secret;
    process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT = 'staging';
    process.env.OR_TOOLS_AUTHORITATIVE_CANARY = '1';
    process.env.OR_TOOLS_CANARY_STAGE = 'selected_trips';

    const report = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 1,
      realGoldActiveCount: 5,
      stabilitySignedOff: true,
      localitySignedOff: true,
      ignoreSignoffBundle: true,
      authorityPackageOverride: pkg,
    });
    expect(report.blockedReasons).toContain('lab_unauthorized_write');
    expect(report.authoritativePromotion).toBe(false);
  });

  it('stale evidence voids prior OR-Tools attachment (RD-06)', () => {
    expect(
      drillStaleCandidateVoid({
        attachmentEvidenceVersionId: 'ev-1',
        currentEvidenceVersionId: 'ev-2',
      }),
    ).toEqual({ usable: false });
    expect(
      drillStaleCandidateVoid({
        attachmentEvidenceVersionId: 'ev-1',
        currentEvidenceVersionId: 'ev-1',
      }),
    ).toEqual({ usable: true });
  });

  it('canary kill discards pending ortools candidates (RD-05)', () => {
    const pkg = testPkg();
    expect(
      drillCanaryKillProvider({
        gateAllowsOrtTools: false,
        tripId: 'only_this',
        operation: 'SHIFT',
        pkg,
        stage: 'shadow',
        whitelistTripIds: ['only_this'],
      }),
    ).toBe('neptune-repair');

    const q = drillDiscardPendingAfterCanaryOff({
      canaryStillOn: false,
      pending: [
        { candidateId: 'o1', provider: 'ortools-repair', executed: false },
        { candidateId: 'o2', provider: 'ortools-repair', executed: true },
        { candidateId: 'n1', provider: 'neptune-repair', executed: false },
      ],
    });
    expect(q.discarded).toEqual(['o1']);
    expect(q.retained).toEqual(['o2', 'n1']);
  });

  it('solver unavailable / empty shadow forces Neptune fallback', () => {
    expect(
      drillSolverUnavailableFallback({
        solverOk: false,
        shadowCandidateCount: 0,
        gateAllowsOrtTools: true,
      }),
    ).toBe('neptune-repair');
    expect(
      drillSolverUnavailableFallback({
        solverOk: true,
        shadowCandidateCount: 0,
        gateAllowsOrtTools: true,
      }),
    ).toBe('neptune-repair');
  });

  it('Gateway BLOCK forbids Plan Version write', () => {
    expect(drillGatewayBlockForbidsWrite({ gatewayResult: 'BLOCK' })).toEqual({
      mayWritePlanVersion: false,
    });
    expect(drillGatewayBlockForbidsWrite({ gatewayResult: 'PASS' })).toEqual({
      mayWritePlanVersion: true,
    });
  });

  it('duplicate decisionId does not create second Plan Version (RD-08)', () => {
    const first = drillIdempotentPlanVersionWrite({
      decisionId: 'dec-1',
      proposedPlanVersionId: 'pv-a',
      priorWrites: [],
    });
    expect(first.accept).toBe(true);
    const second = drillIdempotentPlanVersionWrite({
      decisionId: 'dec-1',
      proposedPlanVersionId: 'pv-b',
      priorWrites: [{ decisionId: 'dec-1', planVersionId: first.planVersionId }],
    });
    expect(second.duplicate).toBe(true);
    expect(second.planVersionId).toBe('pv-a');
    expect(second.accept).toBe(false);
  });
});
