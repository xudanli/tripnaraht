import {
  assertOrtToolsShadowAuthority,
  countRealOpsGoldActive,
  evaluateOrtToolsAuthorityCanaryGate,
  resolveAuthoritativeRepairProviderForRequest,
  resolveAuthoritativeRepairProviderId,
} from './ortools-authority-canary.gate';
import type { AuthorityApprovalPackage } from './planning-signoff/authority-package.types';
import {
  hashAuthorityPackage,
  mintAuthorityToken,
} from './planning-signoff/authority-token';
import { resolveScopedAuthoritativeRepairProvider } from './planning-signoff/selected-trips-canary';

describe('ortools-authority-canary.gate (M4 Release Gate)', () => {
  const keys = [
    'OR_TOOLS_AUTHORITATIVE_CANARY',
    'OR_TOOLS_CANARY_STAGE',
    'OR_TOOLS_CANARY_PERCENT_APPROVED',
    'OR_TOOLS_PRODUCT_SIGNOFF',
    'OR_TOOLS_AUTHORITY_SIGNOFF',
    'OR_TOOLS_AUTHORITY_SIGNOFF_REQUIRED',
    'OR_TOOLS_AUTHORITY_TOKEN',
    'OR_TOOLS_AUTHORITY_TOKEN_SECRET',
    'OR_TOOLS_AUTHORITY_ENVIRONMENT',
    'OR_TOOLS_STABILITY_SIGNOFF',
    'OR_TOOLS_LOCALITY_SIGNOFF',
    'OR_TOOLS_REAL_GOLD_MIN',
  ] as const;
  const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  const approvedPkg = (): AuthorityApprovalPackage => ({
    schemaId: 'tripnara.planning_signoff.authority@v1',
    kind: 'authority',
    status: 'APPROVED',
    approved: true,
    approvedAt: '2026-07-15T00:00:00.000Z',
    approvedBy: 'product-owner-test',
    signoffId: 'm4-ra01-test',
    authorityScope: {
      operations: ['SHIFT', 'SWAP', 'SHORTEN', 'REROUTE'],
      excludedOperations: ['MOVE_DAY', 'REPLACE', 'AUTO_ARRANGE'],
      tripSelectionMode: 'selected_trips',
      destinations: ['IS'],
      maxRiskLevel: 'MEDIUM',
      requiresUserConfirmation: true,
    },
    rollbackProvider: 'neptune-repair',
    evidenceArtifactRefs: {
      stability: 'stability.json',
      locality: 'locality.json',
      gateway: 'gateway.json',
      rollback: 'rollback.json',
    },
  });

  it('defaults to shadow: engineering may be ready, release blocked', () => {
    for (const k of keys) delete process.env[k];
    process.env.OR_TOOLS_REAL_GOLD_MIN = '5';

    const report = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 0,
      forbiddenEdgeViolationSum: 0,
      runsTotal: 3,
      realGoldActiveCount: 0,
      stabilitySignedOff: false,
      localitySignedOff: false,
      ignoreSignoffBundle: true,
    });
    expect(report.mode).toBe('shadow');
    expect(report.authoritativePromotion).toBe(false);
    expect(report.releaseAuthorized).toBe(false);
    expect(report.blockedReasons).toEqual(
      expect.arrayContaining([
        'real_gold_replay',
        'product_signoff',
        'canary_flag',
        'signoff_token',
        'candidate_stability',
        'repair_locality',
      ]),
    );
    expect(resolveAuthoritativeRepairProviderId(report)).toBe('neptune-repair');
    expect(assertOrtToolsShadowAuthority(true, report)).toBe(false);
  });

  it('marks engineeringReady when only release items remain', () => {
    for (const k of keys) delete process.env[k];
    const report = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 0,
      forbiddenEdgeViolationSum: 0,
      runsTotal: 10,
      realGoldActiveCount: 5,
      evidenceStaleMainChainDone: true,
      stabilitySignedOff: true,
      localitySignedOff: true,
      gatewaySignedOff: true,
      rollbackReady: true,
      ignoreSignoffBundle: true,
    });
    expect(report.engineeringReady).toBe(true);
    expect(report.releaseAuthorized).toBe(false);
    expect(report.blockedReasons).toEqual(
      expect.arrayContaining([
        'product_signoff',
        'signoff_token',
        'canary_flag',
      ]),
    );
  });

  it('opens selected_trips canary only with scoped package + token + stage', () => {
    const pkg = approvedPkg();
    const secret = 'test-secret';
    process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET = secret;
    process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT = 'staging';
    process.env.OR_TOOLS_AUTHORITATIVE_CANARY = '1';
    process.env.OR_TOOLS_CANARY_STAGE = 'selected_trips';
    process.env.OR_TOOLS_REAL_GOLD_MIN = '2';

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
    process.env.OR_TOOLS_AUTHORITY_TOKEN = token;

    const report = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 0,
      forbiddenEdgeViolationSum: 0,
      runsTotal: 10,
      realGoldActiveCount: 2,
      evidenceStaleMainChainDone: true,
      stabilitySignedOff: true,
      localitySignedOff: true,
      gatewaySignedOff: true,
      rollbackReady: true,
      ignoreSignoffBundle: true,
      authorityPackageOverride: pkg,
    });
    expect(report.mode).toBe('canary_authoritative');
    expect(report.authoritativePromotion).toBe(true);
    expect(report.canaryStage).toBe('selected_trips');
    expect(resolveAuthoritativeRepairProviderId(report)).toBe('ortools-repair');
  });

  it('blocks percent canary without OR_TOOLS_CANARY_PERCENT_APPROVED', () => {
    const pkg = approvedPkg();
    const secret = 'test-secret';
    process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET = secret;
    process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT = 'staging';
    process.env.OR_TOOLS_AUTHORITATIVE_CANARY = '1';
    process.env.OR_TOOLS_CANARY_STAGE = '5%';
    delete process.env.OR_TOOLS_CANARY_PERCENT_APPROVED;

    const token = mintAuthorityToken(
      {
        signoffId: pkg.signoffId,
        artifactHash: hashAuthorityPackage(pkg),
        environment: 'staging',
        provider: 'ortools-repair',
        allowedOperations: ['SHIFT'],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        canaryStage: '5%',
      },
      secret,
    );
    process.env.OR_TOOLS_AUTHORITY_TOKEN = token;

    const report = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 0,
      realGoldActiveCount: 5,
      stabilitySignedOff: true,
      localitySignedOff: true,
      ignoreSignoffBundle: true,
      authorityPackageOverride: pkg,
    });
    expect(report.blockedReasons).toContain('canary_flag');
    expect(report.authoritativePromotion).toBe(false);
  });

  it('scopes provider to whitelist trip + allowed operation', () => {
    const pkg = approvedPkg();
    expect(
      resolveScopedAuthoritativeRepairProvider({
        gateAllowsOrtTools: true,
        tripId: 'WHITELIST_PLACEHOLDER_IS_01',
        operation: 'SHIFT',
        pkg,
        whitelist: {
          schemaId: 'tripnara.ortools_selected_trips_whitelist@v1',
          signoffId: pkg.signoffId,
          destinations: ['IS'],
          selectionCriteria: [],
          tripIds: ['WHITELIST_PLACEHOLDER_IS_01'],
        },
        stage: 'selected_trips',
      }),
    ).toBe('ortools-repair');

    expect(
      resolveScopedAuthoritativeRepairProvider({
        gateAllowsOrtTools: true,
        tripId: 'WHITELIST_PLACEHOLDER_IS_01',
        operation: 'MOVE_DAY',
        pkg,
        whitelist: {
          schemaId: 'tripnara.ortools_selected_trips_whitelist@v1',
          signoffId: pkg.signoffId,
          destinations: ['IS'],
          selectionCriteria: [],
          tripIds: ['WHITELIST_PLACEHOLDER_IS_01'],
        },
        stage: 'selected_trips',
      }),
    ).toBe('neptune-repair');

    expect(
      resolveAuthoritativeRepairProviderForRequest({
        tripId: 'not-listed',
        operation: 'SWAP',
        gate: {
          schemaId: 'tripnara.ortools_authority_canary@v1',
          engineeringReady: true,
          releaseAuthorized: true,
          mode: 'canary_authoritative',
          authoritativePromotion: true,
          canaryStage: 'selected_trips',
          blockedReasons: [],
          checks: [],
          generatedAt: new Date().toISOString(),
          rollbackHint: '',
          canaryRolloutHint: '',
        },
      }),
    ).toBe('neptune-repair');
  });

  it('counts real gold from manifest when present', () => {
    expect(typeof countRealOpsGoldActive()).toBe('number');
  });
});
