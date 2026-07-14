import { wireOrtToolsEvaluateCanary } from './ortools-canary-evaluate.wire';
import { OrToolsCanaryDashboardCollector } from './ortools-canary-dashboard.metrics';
import type { OrtToolsEvaluateShadowAttachment } from '../bridge/ortools-road-evaluate-shadow.bridge';
import type { OrtToolsAuthorityGateReport } from '../lab/ortools-authority-canary.gate';
import type { AuthorityApprovalPackage } from '../lab/planning-signoff/authority-package.types';
import {
  hashAuthorityPackage,
  mintAuthorityToken,
} from '../lab/planning-signoff/authority-token';
import { evaluateOrtToolsAuthorityCanaryGate } from '../lab/ortools-authority-canary.gate';

function baseAttachment(
  overrides?: Partial<OrtToolsEvaluateShadowAttachment>,
): OrtToolsEvaluateShadowAttachment {
  return {
    schemaId: 'tripnara.ortools_evaluate_shadow@v1',
    report: {
      schemaId: 'tripnara.ortools_repair_shadow@v1',
      tripId: 't1',
      requestId: 'r1',
      comparedAt: new Date().toISOString(),
      authorityProviderId: 'neptune-repair',
      shadowProviderId: 'ortools-repair',
      authorityProposalCount: 1,
      shadowProposalCount: 1,
      shadowFoundCandidate: true,
      shadowNativeCpSat: false,
      forbiddenEdgeViolations: 0,
      bookedNodeDropped: false,
      undeclaredNodeDrops: false,
      writeAttempted: false,
      gatewayRequired: true,
      notes: [],
    },
    gatewayByCandidateId: {
      ortools_c1: {
        candidateId: 'ortools_c1',
        overallStatus: 'PASS',
        degraded: false,
        assertionCount: 1,
      },
    },
    neptuneCandidateCount: 1,
    shadowCandidateCount: 1,
    shadowAuthority: false,
    shadowRepairCandidates: [
      {
        candidateId: 'ortools_c1',
        actor: 'NEPTUNE',
        generatorVersion: 'ortools-repair-shadow-0.2.0',
      } as never,
    ],
    solverOperation: 'REROUTE',
    evidenceVersionId: 'ev-1',
    ...overrides,
  };
}

describe('wireOrtToolsEvaluateCanary', () => {
  const keys = [
    'OR_TOOLS_AUTHORITATIVE_CANARY',
    'OR_TOOLS_CANARY_STAGE',
    'OR_TOOLS_AUTHORITY_TOKEN',
    'OR_TOOLS_AUTHORITY_TOKEN_SECRET',
    'OR_TOOLS_AUTHORITY_ENVIRONMENT',
  ] as const;
  const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
    for (const k of keys) delete process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('records dashboard and keeps Neptune authority when gate blocked', () => {
    const dash = new OrToolsCanaryDashboardCollector();
    const wired = wireOrtToolsEvaluateCanary({
      tripId: 'WHITELIST_PLACEHOLDER_IS_01',
      operation: 'REROUTE',
      neptuneCandidates: [
        { candidateId: 'n1', actor: 'NEPTUNE' } as never,
      ],
      ortoolsShadow: baseAttachment(),
      dashboard: dash,
      gate: {
        schemaId: 'tripnara.ortools_authority_canary@v1',
        engineeringReady: true,
        releaseAuthorized: false,
        mode: 'shadow',
        authoritativePromotion: false,
        canaryStage: 'shadow',
        blockedReasons: ['product_signoff'],
        checks: [],
        generatedAt: new Date().toISOString(),
        rollbackHint: '',
        canaryRolloutHint: '',
      },
    });

    expect(wired.meta.authoritativeProviderId).toBe('neptune-repair');
    expect(wired.meta.mergedIntoRepairCandidates).toBe(false);
    expect(wired.repairCandidates.map((c) => c.candidateId)).toEqual(['n1']);
    expect(wired.ortoolsShadow.shadowAuthority).toBe(false);
    expect(wired.ortoolsShadow.canary?.whitelistMatched).toBe(true);
    expect(dash.snapshot().decisionsTotal).toBe(1);
    expect(dash.snapshot().views.release.whitelistMatchedTotal).toBe(1);
  });

  it('merges Gateway-PASS OR-Tools candidates when canary authorized + scoped', () => {
    const pkg: AuthorityApprovalPackage = {
      schemaId: 'tripnara.planning_signoff.authority@v1',
      kind: 'authority',
      status: 'APPROVED',
      approved: true,
      approvedAt: '2026-07-15T00:00:00.000Z',
      approvedBy: 'test',
      signoffId: 'wire-test',
      authorityScope: {
        operations: ['SHIFT', 'SWAP', 'SHORTEN', 'REROUTE'],
        excludedOperations: ['MOVE_DAY', 'REPLACE'],
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
    };
    const secret = 'wire-secret';
    process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET = secret;
    process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT = 'staging';
    process.env.OR_TOOLS_AUTHORITATIVE_CANARY = '1';
    process.env.OR_TOOLS_CANARY_STAGE = 'selected_trips';
    process.env.OR_TOOLS_AUTHORITY_TOKEN = mintAuthorityToken(
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

    const gate = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: 0,
      realGoldActiveCount: 5,
      stabilitySignedOff: true,
      localitySignedOff: true,
      gatewaySignedOff: true,
      rollbackReady: true,
      ignoreSignoffBundle: true,
      authorityPackageOverride: pkg,
    });
    expect(gate.authoritativePromotion).toBe(true);

    const dash = new OrToolsCanaryDashboardCollector();
    const wired = wireOrtToolsEvaluateCanary({
      tripId: 'WHITELIST_PLACEHOLDER_IS_01',
      operation: 'REROUTE',
      neptuneCandidates: [
        { candidateId: 'n1', actor: 'NEPTUNE' } as never,
      ],
      ortoolsShadow: baseAttachment(),
      dashboard: dash,
      gate,
      pkg,
    });

    expect(wired.meta.authoritativeProviderId).toBe('ortools-repair');
    expect(wired.meta.mergedIntoRepairCandidates).toBe(true);
    expect(wired.repairCandidates.map((c) => c.candidateId)).toEqual([
      'ortools_c1',
      'n1',
    ]);
    expect(wired.ortoolsShadow.report.authorityProviderId).toBe('ortools-repair');
    expect(wired.ortoolsShadow.shadowAuthority).toBe(false);
    expect(dash.snapshot().views.quality.candidatePassRate).toBe(1);
  });

  it('does not merge when operation out of scope even if gate green', () => {
    const pkg: AuthorityApprovalPackage = {
      schemaId: 'tripnara.planning_signoff.authority@v1',
      kind: 'authority',
      status: 'APPROVED',
      approved: true,
      signoffId: 'wire-test-scope',
      authorityScope: {
        operations: ['SHIFT', 'SWAP', 'SHORTEN', 'REROUTE'],
        excludedOperations: ['MOVE_DAY', 'REPLACE'],
        tripSelectionMode: 'selected_trips',
        destinations: ['IS'],
        maxRiskLevel: 'MEDIUM',
        requiresUserConfirmation: true,
      },
      rollbackProvider: 'neptune-repair',
      evidenceArtifactRefs: {
        stability: 's',
        locality: 'l',
        gateway: 'g',
        rollback: 'r',
      },
    };
    const gate = {
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
    } satisfies OrtToolsAuthorityGateReport;

    process.env.OR_TOOLS_CANARY_STAGE = 'selected_trips';
    const wired = wireOrtToolsEvaluateCanary({
      tripId: 'WHITELIST_PLACEHOLDER_IS_01',
      operation: 'MOVE_DAY',
      neptuneCandidates: [
        { candidateId: 'n1', actor: 'NEPTUNE' } as never,
      ],
      ortoolsShadow: baseAttachment({ solverOperation: 'MOVE_DAY' }),
      gate,
      pkg,
    });
    expect(wired.meta.authoritativeProviderId).toBe('neptune-repair');
    expect(wired.meta.mergedIntoRepairCandidates).toBe(false);
  });
});
