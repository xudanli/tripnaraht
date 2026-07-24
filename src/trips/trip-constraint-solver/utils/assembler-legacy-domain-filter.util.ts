import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import { isPhase6AssemblerLegacyDomainRulesSkipped } from '../../../decision-runtime/phase6-legacy-deprecation.config';
import { isPhase6GatewayDomainRulesExclusive } from '../../../decision-runtime/constraints/constraint-plan-verify.config';
import type { AssemblerGatewayDomainCoverage } from './assembler-gateway-coverage.util';
import { isAssemblerGatewayDomainCoverageActive } from './assembler-gateway-coverage.util';
import { buildFeasibilityIssueDedupeKey } from './feasibility-issue-dedup.util';
import { isScheduleDomainIssue } from './schedule-domain.util';

function isPoiAccessIssue(issue: FeasibilityIssueDto): boolean {
  return (
    String(issue.issueKind ?? '').startsWith('poi_access') ||
    issue.category === 'access_capacity' ||
    Boolean(issue.visitorAccess)
  );
}

function isGuardianProjectedIssue(issue: FeasibilityIssueDto): boolean {
  return (
    issue.proofs?.some((p) => p.evidenceSource === 'guardian-assertion') === true ||
    String(issue.category ?? '').includes('guardian')
  );
}

function isLegacyDomainIssue(
  issue: FeasibilityIssueDto,
  coverage: AssemblerGatewayDomainCoverage,
): boolean {
  if (coverage.poiAccess && isPoiAccessIssue(issue)) return true;
  if (coverage.schedule && isScheduleDomainIssue(issue)) return true;
  if (coverage.guardian && isGuardianProjectedIssue(issue)) return true;
  return false;
}

function projectedDomainFlags(projected: FeasibilityIssueDto[]): {
  keys: Set<string>;
  hasPoiAccess: boolean;
  hasSchedule: boolean;
  hasGuardian: boolean;
} {
  const keys = new Set<string>();
  let hasPoiAccess = false;
  let hasSchedule = false;
  let hasGuardian = false;
  for (const issue of projected) {
    keys.add(buildFeasibilityIssueDedupeKey(issue));
    if (isPoiAccessIssue(issue)) hasPoiAccess = true;
    if (isScheduleDomainIssue(issue)) hasSchedule = true;
    if (isGuardianProjectedIssue(issue)) hasGuardian = true;
  }
  return { keys, hasPoiAccess, hasSchedule, hasGuardian };
}

function shouldDropLegacyIssue(
  issue: FeasibilityIssueDto,
  flags: ReturnType<typeof projectedDomainFlags>,
  coverage?: AssemblerGatewayDomainCoverage,
): boolean {
  const key = buildFeasibilityIssueDedupeKey(issue);
  if (flags.keys.has(key)) return true;

  const exclusive = isPhase6GatewayDomainRulesExclusive() && isAssemblerGatewayDomainCoverageActive(coverage);
  if (exclusive && coverage && isLegacyDomainIssue(issue, coverage)) {
    return true;
  }

  if (flags.hasPoiAccess && isPoiAccessIssue(issue)) return true;
  if (flags.hasSchedule && isScheduleDomainIssue(issue)) return true;
  if (flags.hasGuardian && isGuardianProjectedIssue(issue)) return true;
  return false;
}

export function filterAssemblerLegacyIssuesWhenProjected(
  legacyIssues: FeasibilityIssueDto[],
  projectedIssues: FeasibilityIssueDto[],
  gatewayDomainCoverage?: AssemblerGatewayDomainCoverage,
): FeasibilityIssueDto[] {
  if (!isPhase6AssemblerLegacyDomainRulesSkipped()) {
    return legacyIssues;
  }

  const exclusive = isPhase6GatewayDomainRulesExclusive() && isAssemblerGatewayDomainCoverageActive(gatewayDomainCoverage);
  if (!exclusive && projectedIssues.length === 0) {
    return legacyIssues;
  }

  const flags = projectedDomainFlags(projectedIssues);

  return legacyIssues.filter((issue) => !shouldDropLegacyIssue(issue, flags, gatewayDomainCoverage));
}
