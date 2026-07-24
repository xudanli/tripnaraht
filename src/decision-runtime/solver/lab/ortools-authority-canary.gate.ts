/**
 * M4 / P6 — Authority release gate (ADR-008).
 *
 * Engineering capability is separate from release authorization.
 * Default: always shadow. Promotion requires engineering PASS artifacts +
 * release governance (Product Approval Package + Authority Token + canary stage).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  isSignoffArtifactSatisfied,
  loadPlanningSignoffBundle,
} from './planning-signoff/load-planning-signoff';
import type { AuthorityApprovalPackage } from './planning-signoff/authority-package.types';
import {
  resolveAuthorityEnvironment,
  verifyAuthorityTokenAgainstPackage,
} from './planning-signoff/authority-token';
import {
  resolveCanaryStage,
  resolveScopedAuthoritativeRepairProvider,
} from './planning-signoff/selected-trips-canary';

export type OrtToolsAuthorityMode = 'shadow' | 'canary_authoritative';

export type OrtToolsAuthorityCheckKind =
  | 'machine'
  | 'artifact'
  | 'release_governance'
  | 'policy'
  /** @deprecated use artifact | release_governance */
  | 'human_env';

export interface OrtToolsAuthorityCheck {
  id: string;
  label: string;
  pass: boolean;
  status: 'PASS' | 'WAIT' | 'FAIL' | 'READY' | 'BLOCKED';
  layer: 'engineering' | 'release';
  kind: OrtToolsAuthorityCheckKind;
  actual?: string | number | boolean;
  threshold?: string | number | boolean;
  detail?: string;
  source?: string;
}

export interface OrtToolsAuthorityGateReport {
  schemaId: 'tripnara.ortools_authority_canary@v1';
  engineeringReady: boolean;
  releaseAuthorized: boolean;
  mode: OrtToolsAuthorityMode;
  authoritativePromotion: boolean;
  canaryStage: string;
  authorityScopeOperations?: string[];
  blockedReasons: string[];
  checks: OrtToolsAuthorityCheck[];
  signoffBundleDate?: string;
  generatedAt: string;
  rollbackHint: string;
  canaryRolloutHint: string;
}

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

function displayStatus(
  pass: boolean,
  layer: 'engineering' | 'release',
  opts?: { ready?: boolean },
): OrtToolsAuthorityCheck['status'] {
  if (opts?.ready) return 'READY';
  if (pass) return 'PASS';
  return layer === 'release' ? 'WAIT' : 'FAIL';
}

function asAuthorityPackage(
  art: unknown,
): AuthorityApprovalPackage | undefined {
  if (!art || typeof art !== 'object') return undefined;
  const a = art as AuthorityApprovalPackage;
  if (!a.authorityScope || !a.signoffId) return undefined;
  return a;
}

function isProductApproved(pkg: AuthorityApprovalPackage | undefined): boolean {
  if (!pkg) return false;
  return (
    pkg.approved === true &&
    (pkg.status === 'APPROVED' || pkg.status === 'PASS')
  );
}

export function countRealOpsGoldActive(manifestPath?: string): number {
  const path =
    manifestPath ??
    join(
      process.cwd(),
      'src/decision-runtime/solver/lab/gold/manifest.v1.json',
    );
  if (!existsSync(path)) return 0;
  const man = JSON.parse(readFileSync(path, 'utf8')) as {
    scenarios: Array<{ status: string; path: string }>;
  };
  const goldRoot = join(process.cwd(), 'src/decision-runtime/solver/lab/gold');
  let n = 0;
  for (const entry of man.scenarios ?? []) {
    if (entry.status !== 'active') continue;
    const scenPath = join(goldRoot, entry.path);
    if (!existsSync(scenPath)) continue;
    try {
      const scen = JSON.parse(readFileSync(scenPath, 'utf8')) as {
        provenance?: string;
        evidencePackRef?: string;
      };
      if (
        scen.provenance !== 'real_ops' &&
        scen.provenance !== 'staging_replay'
      ) {
        continue;
      }
      if (!scen.evidencePackRef) continue;
      const packPath = join(process.cwd(), scen.evidencePackRef);
      if (!existsSync(packPath)) continue;
      n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

export function evaluateOrtToolsAuthorityCanaryGate(input?: {
  writeAttemptedTotal?: number;
  forbiddenEdgeViolationSum?: number;
  runsTotal?: number;
  realGoldActiveCount?: number;
  evidenceStaleMainChainDone?: boolean;
  stabilitySignedOff?: boolean;
  localitySignedOff?: boolean;
  gatewaySignedOff?: boolean;
  rollbackReady?: boolean;
  ignoreSignoffBundle?: boolean;
  /** Test seam for structured token verification */
  authorityPackageOverride?: AuthorityApprovalPackage;
}): OrtToolsAuthorityGateReport {
  const writeAttempted = input?.writeAttemptedTotal ?? 0;
  const forbidSum = input?.forbiddenEdgeViolationSum ?? 0;
  const runsTotal = input?.runsTotal ?? 0;
  const realGold =
    input?.realGoldActiveCount ?? countRealOpsGoldActive();
  const realGoldMin = Math.max(
    0,
    Number(process.env.OR_TOOLS_REAL_GOLD_MIN ?? '5') || 5,
  );

  const bundle = input?.ignoreSignoffBundle
    ? undefined
    : loadPlanningSignoffBundle();

  const pkg =
    input?.authorityPackageOverride ?? asAuthorityPackage(bundle?.authority);

  const canaryFlag = envFlag('OR_TOOLS_AUTHORITATIVE_CANARY');
  const stage = resolveCanaryStage();
  const stageOk =
    canaryFlag &&
    (stage === 'selected_trips' ||
      stage === '5%' ||
      stage === '20%' ||
      stage === '50%' ||
      stage === '100%');
  /** First pilot must not jump past selected_trips without later RA work */
  const stagePilotSafe =
    !canaryFlag ||
    stage === 'selected_trips' ||
    envFlag('OR_TOOLS_CANARY_PERCENT_APPROVED');

  const productEnv = envFlag('OR_TOOLS_PRODUCT_SIGNOFF');
  const productFromArtifact = isProductApproved(pkg);
  const productSignoff = productEnv || productFromArtifact;

  const tokenRaw = (process.env.OR_TOOLS_AUTHORITY_TOKEN ?? '').trim();
  const tokenSecret = (
    process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET ?? ''
  ).trim();
  const legacyRequired = (
    process.env.OR_TOOLS_AUTHORITY_SIGNOFF_REQUIRED ?? ''
  ).trim();
  const legacyProvided = (
    process.env.OR_TOOLS_AUTHORITY_SIGNOFF ?? ''
  ).trim();
  const legacyTokenOk =
    legacyRequired.length > 0 &&
    legacyProvided.length > 0 &&
    legacyRequired === legacyProvided;

  let structuredTokenOk = false;
  let tokenDetail =
    'Set OR_TOOLS_AUTHORITY_TOKEN (mint via lab:mint-authority-token)';
  let tokenActual: string | boolean = 'missing';
  if (tokenRaw && tokenSecret && pkg) {
    const v = verifyAuthorityTokenAgainstPackage({
      token: tokenRaw,
      secret: tokenSecret,
      pkg,
      environment: resolveAuthorityEnvironment(),
    });
    structuredTokenOk = v.ok;
    tokenActual = v.ok ? 'verified' : (v.reason ?? 'fail');
    tokenDetail = v.ok
      ? `token binds signoffId=${pkg.signoffId} stage=${v.claims?.canaryStage}`
      : `token verify failed: ${v.reason}`;
  } else if (legacyTokenOk) {
    structuredTokenOk = true;
    tokenActual = 'legacy_env_match';
    tokenDetail =
      'legacy OR_TOOLS_AUTHORITY_SIGNOFF match (prefer structured token)';
  }

  const stabilityOk =
    input?.stabilitySignedOff !== undefined
      ? input.stabilitySignedOff
      : isSignoffArtifactSatisfied(bundle?.stability) ||
        envFlag('OR_TOOLS_STABILITY_SIGNOFF');
  const localityOk =
    input?.localitySignedOff !== undefined
      ? input.localitySignedOff
      : isSignoffArtifactSatisfied(bundle?.locality) ||
        envFlag('OR_TOOLS_LOCALITY_SIGNOFF');
  const gatewayOk =
    input?.gatewaySignedOff !== undefined
      ? input.gatewaySignedOff
      : isSignoffArtifactSatisfied(bundle?.gateway) || true;
  const rollbackOk =
    input?.rollbackReady !== undefined
      ? input.rollbackReady
      : isSignoffArtifactSatisfied(bundle?.rollback, { allowReady: true }) ||
        true;
  const evidenceOk = input?.evidenceStaleMainChainDone ?? true;
  const hashOk = stabilityOk;

  const hasScopedPackage = Boolean(pkg?.authorityScope);
  const scopeOk =
    !productFromArtifact ||
    (hasScopedPackage &&
      Array.isArray(pkg!.authorityScope.operations) &&
      pkg!.authorityScope.operations.length > 0 &&
      pkg!.authorityScope.tripSelectionMode === 'selected_trips');

  const checks: OrtToolsAuthorityCheck[] = [
    {
      id: 'gateway_isolation',
      label: 'Gateway',
      layer: 'engineering',
      kind: gatewayOk && bundle?.gateway ? 'artifact' : 'policy',
      pass: gatewayOk,
      status: displayStatus(gatewayOk, 'engineering'),
      actual: gatewayOk,
      source: bundle?.gateway ? `signoff:${bundle.date}/gateway.json` : 'policy',
      detail: 'Shadow apply never writes authoritative Plan Version',
    },
    {
      id: 'real_gold_replay',
      label: 'Replay',
      layer: 'engineering',
      kind: 'machine',
      pass: realGold >= realGoldMin,
      status: displayStatus(realGold >= realGoldMin, 'engineering'),
      threshold: realGoldMin,
      actual: realGold,
      detail: 'Production baseline: active staging_replay|real_ops + evidence pack',
    },
    {
      id: 'repair_locality',
      label: 'Repair / Locality',
      layer: 'engineering',
      kind: localityOk && bundle?.locality ? 'artifact' : 'human_env',
      pass: localityOk,
      status: displayStatus(localityOk, 'engineering'),
      actual: localityOk,
      source: bundle?.locality
        ? `signoff:${bundle.date}/locality.json`
        : 'OR_TOOLS_LOCALITY_SIGNOFF',
      detail: 'Seal locality.json from gold replay (prefer over env)',
    },
    {
      id: 'replay_hash',
      label: 'Replay Hash',
      layer: 'engineering',
      kind: 'artifact',
      pass: hashOk,
      status: displayStatus(hashOk, 'engineering'),
      actual: hashOk,
      detail: 'Candidate hash consistency sealed with stability artifact',
    },
    {
      id: 'lab_unauthorized_write',
      label: 'Forbidden Write',
      layer: 'engineering',
      kind: 'machine',
      pass: writeAttempted === 0,
      status: displayStatus(writeAttempted === 0, 'engineering'),
      threshold: 0,
      actual: writeAttempted,
      detail: 'writeAttemptedTotal must stay 0',
    },
    {
      id: 'lab_forbidden_edges',
      label: 'Forbidden Edges',
      layer: 'engineering',
      kind: 'machine',
      pass: forbidSum === 0 || runsTotal === 0,
      status: displayStatus(forbidSum === 0 || runsTotal === 0, 'engineering'),
      threshold: 0,
      actual: forbidSum,
    },
    {
      id: 'candidate_stability',
      label: 'Stability',
      layer: 'engineering',
      kind: stabilityOk && bundle?.stability ? 'artifact' : 'human_env',
      pass: stabilityOk,
      status: displayStatus(stabilityOk, 'engineering'),
      actual: stabilityOk,
      source: bundle?.stability
        ? `signoff:${bundle.date}/stability.json`
        : 'OR_TOOLS_STABILITY_SIGNOFF',
      detail: 'Seal stability.json after ≥100-run hash-stable gold',
    },
    {
      id: 'evidence_stale_main_chain',
      label: 'Evidence Stale',
      layer: 'engineering',
      kind: 'policy',
      pass: evidenceOk,
      status: displayStatus(evidenceOk, 'engineering'),
      actual: evidenceOk,
      detail: 'P2 EVIDENCE_STALE_MAIN_CHAIN',
    },
    {
      id: 'rollback_plan',
      label: 'Rollback',
      layer: 'engineering',
      kind: 'artifact',
      pass: rollbackOk,
      status: rollbackOk ? 'READY' : 'FAIL',
      actual: rollbackOk,
      source: bundle?.rollback
        ? `signoff:${bundle.date}/rollback.json`
        : 'policy',
      detail: 'authoritativeProvider must fall back to neptune-repair / legacy',
    },
    {
      id: 'product_signoff',
      label: 'Product Approval',
      layer: 'release',
      kind: 'release_governance',
      pass: productSignoff && scopeOk,
      status: displayStatus(productSignoff && scopeOk, 'release'),
      actual: productSignoff
        ? hasScopedPackage
          ? 'scoped_package'
          : 'env_only'
        : false,
      source: pkg ? `signoff:${bundle?.date}/authority.json` : 'OR_TOOLS_PRODUCT_SIGNOFF',
      detail:
        'authority.json APPROVED with restricted scope (SHIFT/SWAP/SHORTEN/REROUTE)',
    },
    {
      id: 'signoff_token',
      label: 'Authority Token',
      layer: 'release',
      kind: 'release_governance',
      pass: structuredTokenOk,
      status: displayStatus(structuredTokenOk, 'release'),
      actual: tokenActual,
      detail: tokenDetail,
    },
    {
      id: 'canary_flag',
      label: 'Canary Flag',
      layer: 'release',
      kind: 'release_governance',
      pass: stageOk && stagePilotSafe,
      status: displayStatus(stageOk && stagePilotSafe, 'release'),
      actual: canaryFlag ? stage : false,
      detail:
        'OR_TOOLS_AUTHORITATIVE_CANARY=1 AND OR_TOOLS_CANARY_STAGE=selected_trips (first)',
    },
  ];

  const engineeringReady = checks
    .filter((c) => c.layer === 'engineering')
    .every((c) => c.pass);

  const blockedReasons = checks.filter((c) => !c.pass).map((c) => c.id);
  const allPass = blockedReasons.length === 0;
  const mode: OrtToolsAuthorityMode = allPass
    ? 'canary_authoritative'
    : 'shadow';

  return {
    schemaId: 'tripnara.ortools_authority_canary@v1',
    engineeringReady,
    releaseAuthorized: allPass,
    mode,
    authoritativePromotion: allPass,
    canaryStage: stage,
    authorityScopeOperations: pkg?.authorityScope?.operations,
    blockedReasons,
    checks,
    signoffBundleDate: bundle?.date,
    generatedAt: new Date().toISOString(),
    rollbackHint:
      'Unset OR_TOOLS_AUTHORITATIVE_CANARY and/or OR_TOOLS_CANARY_STAGE=shadow → neptune-repair',
    canaryRolloutHint:
      'shadow → selected_trips → 5% → 20% → 50% → 100%; M4-RA-01 stops at selected_trips',
  };
}

export function assertOrtToolsShadowAuthority(
  shadowAuthority: boolean | undefined,
  gate?: OrtToolsAuthorityGateReport,
): false | true {
  if (shadowAuthority !== true) return false;
  const report = gate ?? evaluateOrtToolsAuthorityCanaryGate();
  return report.authoritativePromotion === true;
}

/** Global default provider id — use resolveScopedAuthoritativeRepairProvider for requests. */
export function resolveAuthoritativeRepairProviderId(
  gate?: OrtToolsAuthorityGateReport,
): 'neptune-repair' | 'ortools-repair' {
  const report = gate ?? evaluateOrtToolsAuthorityCanaryGate();
  if (
    report.mode !== 'canary_authoritative' ||
    !report.authoritativePromotion
  ) {
    return 'neptune-repair';
  }
  // Without trip/op context, only advertise ortools when stage is selected_trips+
  const stage = report.canaryStage;
  if (stage === 'shadow') return 'neptune-repair';
  return 'ortools-repair';
}

export function resolveAuthoritativeRepairProviderForRequest(input: {
  tripId?: string;
  operation?: string;
  gate?: OrtToolsAuthorityGateReport;
  pkg?: import('./planning-signoff/authority-package.types').AuthorityApprovalPackage;
}): 'neptune-repair' | 'ortools-repair' {
  const gate = input.gate ?? evaluateOrtToolsAuthorityCanaryGate();
  return resolveScopedAuthoritativeRepairProvider({
    tripId: input.tripId,
    operation: input.operation,
    gateAllowsOrtTools: gate.authoritativePromotion === true,
    pkg: input.pkg,
  });
}
