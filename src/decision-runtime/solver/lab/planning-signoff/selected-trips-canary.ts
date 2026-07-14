/**
 * M4-RA-01 — selected_trips canary: whitelist + operation scope.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  AuthorityApprovalPackage,
  CanaryTripSelectionMode,
} from './authority-package.types';
import { loadPlanningSignoffBundle } from './load-planning-signoff';

export interface SelectedTripsWhitelist {
  schemaId: 'tripnara.ortools_selected_trips_whitelist@v1';
  signoffId: string;
  destinations: string[];
  selectionCriteria: string[];
  tripIds: string[];
  notes?: string;
}

export function resolveCanaryStage(): CanaryTripSelectionMode {
  const raw = (process.env.OR_TOOLS_CANARY_STAGE ?? 'shadow').trim();
  const allowed: CanaryTripSelectionMode[] = [
    'shadow',
    'selected_trips',
    '5%',
    '20%',
    '50%',
    '100%',
  ];
  return (allowed.includes(raw as CanaryTripSelectionMode)
    ? raw
    : 'shadow') as CanaryTripSelectionMode;
}

export function loadSelectedTripsWhitelist(
  path?: string,
): SelectedTripsWhitelist | undefined {
  const p =
    path ??
    join(
      process.cwd(),
      'src/decision-runtime/solver/lab/planning-signoff/selected-trips.whitelist.json',
    );
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as SelectedTripsWhitelist;
  } catch {
    return undefined;
  }
}

export function isTripInSelectedCanary(
  tripId: string | undefined,
  whitelist?: SelectedTripsWhitelist,
): boolean {
  if (!tripId) return false;
  const wl = whitelist ?? loadSelectedTripsWhitelist();
  if (!wl?.tripIds?.length) return false;
  return wl.tripIds.includes(tripId);
}

export function isOperationAuthorizedByPackage(
  operation: string | undefined,
  pkg: AuthorityApprovalPackage | undefined,
): boolean {
  if (!operation || !pkg) return false;
  const op = operation.toUpperCase();
  if (pkg.authorityScope.excludedOperations.map((x) => x.toUpperCase()).includes(op)) {
    return false;
  }
  return pkg.authorityScope.operations.map((x) => x.toUpperCase()).includes(op);
}

export function loadApprovedAuthorityPackage():
  | AuthorityApprovalPackage
  | undefined {
  const bundle = loadPlanningSignoffBundle();
  const art = bundle?.authority as AuthorityApprovalPackage | undefined;
  if (!art?.authorityScope) return undefined;
  return art;
}

/**
 * Runtime elevation for one request. Gate may be green, but scope/trip still bind.
 */
export function resolveScopedAuthoritativeRepairProvider(input: {
  tripId?: string;
  operation?: string;
  gateAllowsOrtTools: boolean;
  pkg?: AuthorityApprovalPackage;
  whitelist?: SelectedTripsWhitelist;
  stage?: CanaryTripSelectionMode;
}): 'neptune-repair' | 'ortools-repair' {
  if (!input.gateAllowsOrtTools) return 'neptune-repair';
  const stage = input.stage ?? resolveCanaryStage();
  if (stage === 'shadow') return 'neptune-repair';

  const pkg = input.pkg ?? loadApprovedAuthorityPackage();
  if (!pkg?.approved) return 'neptune-repair';
  if (pkg.status !== 'APPROVED' && pkg.status !== 'PASS') {
    return 'neptune-repair';
  }
  if (!isOperationAuthorizedByPackage(input.operation, pkg)) {
    return 'neptune-repair';
  }

  if (stage === 'selected_trips') {
    return isTripInSelectedCanary(input.tripId, input.whitelist)
      ? 'ortools-repair'
      : 'neptune-repair';
  }

  // Percent stages: ops still scoped; trip sampling is ops policy (not implemented here)
  if (stage === '5%' || stage === '20%' || stage === '50%' || stage === '100%') {
    return 'ortools-repair';
  }
  return 'neptune-repair';
}
