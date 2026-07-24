/**
 * ETA-L2 Selected Trips / Iceland default — operational authority gate.
 *
 * Engineering capability (Shadow L2) is always on.
 * Authoritative scheduling requires release flags + whitelist + kill-switch off.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { TravelEtaAuthority } from '../contracts/travel-eta.contract';

export type TravelEtaL2CanaryStage =
  | 'shadow'
  | 'selected_trips'
  | 'iceland_canary_5%'
  | 'iceland_canary_20%'
  | 'iceland_default';

export interface TravelEtaL2SelectedTripsWhitelist {
  schemaId: 'tripnara.travel_eta_l2_selected_trips@v1';
  tripIds: string[];
  notes?: string;
  /** Optional destinations for human ops (IS highlands) */
  destinations?: string[];
}

export interface TravelEtaL2AuthorityCheck {
  id: string;
  label: string;
  pass: boolean;
  status: 'PASS' | 'WAIT' | 'FAIL' | 'BLOCKED';
  layer: 'engineering' | 'release';
  detail?: string;
}

export interface TravelEtaL2AuthorityGateReport {
  schemaId: 'tripnara.travel_eta_l2_authority_gate@v1';
  canaryStage: TravelEtaL2CanaryStage;
  engineeringReady: boolean;
  releaseAuthorized: boolean;
  authoritativePromotion: boolean;
  killSwitch: boolean;
  blockedReasons: string[];
  checks: TravelEtaL2AuthorityCheck[];
  generatedAt: string;
  rollbackHint: string;
}

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

export function resolveTravelEtaL2CanaryStage(): TravelEtaL2CanaryStage {
  const raw = (process.env.TRAVEL_ETA_L2_CANARY_STAGE ?? 'shadow').trim().toLowerCase();
  if (raw === 'selected_trips' || raw === 'selected-trips') return 'selected_trips';
  if (raw === 'iceland_canary_5%' || raw === 'iceland-canary-5' || raw === '5%') {
    return 'iceland_canary_5%';
  }
  if (raw === 'iceland_canary_20%' || raw === 'iceland-canary-20' || raw === '20%') {
    return 'iceland_canary_20%';
  }
  if (raw === 'iceland_default' || raw === 'iceland-default' || raw === 'iceland') {
    return 'iceland_default';
  }
  return 'shadow';
}

export function defaultSelectedTripsWhitelistPath(): string {
  return join(
    process.cwd(),
    'src/transport/ops/travel-eta-l2-selected-trips.whitelist.json',
  );
}

export function loadTravelEtaL2SelectedTripsWhitelist(
  path?: string,
): TravelEtaL2SelectedTripsWhitelist | undefined {
  const fromEnv = (process.env.TRAVEL_ETA_L2_SELECTED_TRIP_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) {
    return {
      schemaId: 'tripnara.travel_eta_l2_selected_trips@v1',
      tripIds: fromEnv,
      notes: 'from TRAVEL_ETA_L2_SELECTED_TRIP_IDS',
    };
  }

  const p = path ?? defaultSelectedTripsWhitelistPath();
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as TravelEtaL2SelectedTripsWhitelist;
    if (!Array.isArray(parsed.tripIds)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function isTripInTravelEtaL2SelectedWhitelist(
  tripId: string | undefined,
  whitelist?: TravelEtaL2SelectedTripsWhitelist,
): boolean {
  if (!tripId) return false;
  const wl = whitelist ?? loadTravelEtaL2SelectedTripsWhitelist();
  return !!wl?.tripIds?.includes(tripId);
}

/**
 * Evaluate whether authoritative planningDuration may be used for scheduling.
 */
export function evaluateTravelEtaL2AuthorityGate(input?: {
  whitelist?: TravelEtaL2SelectedTripsWhitelist;
  goldMatrixPresent?: boolean;
  providerUnknownBlockedForAuth?: boolean;
}): TravelEtaL2AuthorityGateReport {
  const stage = resolveTravelEtaL2CanaryStage();
  const killSwitch = envFlag('TRAVEL_ETA_L2_KILL_SWITCH');
  const releaseApproved = envFlag('TRAVEL_ETA_L2_AUTHORITY_APPROVED');
  const forceAuthEnv = (process.env.TRAVEL_ETA_L2_AUTHORITY ?? 'shadow').toLowerCase() === 'authoritative';

  const goldPath = join(
    process.cwd(),
    'src/trips/dem/harness/f208-travel-eta-dem-gold.spec.ts',
  );
  const goldPresent = input?.goldMatrixPresent ?? existsSync(goldPath);
  const wl = input?.whitelist ?? loadTravelEtaL2SelectedTripsWhitelist();
  const hasWhitelist = (wl?.tripIds?.length ?? 0) > 0;

  const checks: TravelEtaL2AuthorityCheck[] = [
    {
      id: 'gold_matrix',
      label: 'Iceland ETA/DEM gold matrix present',
      pass: goldPresent,
      status: goldPresent ? 'PASS' : 'FAIL',
      layer: 'engineering',
      detail: goldPath,
    },
    {
      id: 'kill_switch',
      label: 'Kill switch off (TRAVEL_ETA_L2_KILL_SWITCH)',
      pass: !killSwitch,
      status: killSwitch ? 'BLOCKED' : 'PASS',
      layer: 'release',
      detail: killSwitch ? 'forced SHADOW' : 'clear',
    },
    {
      id: 'release_approved',
      label: 'Release approved (TRAVEL_ETA_L2_AUTHORITY_APPROVED=1)',
      pass: releaseApproved || stage === 'shadow',
      status: releaseApproved || stage === 'shadow' ? 'PASS' : 'WAIT',
      layer: 'release',
      detail:
        stage === 'shadow'
          ? 'shadow stage does not require approval'
          : releaseApproved
            ? 'approved'
            : 'set TRAVEL_ETA_L2_AUTHORITY_APPROVED=1 after canary signoff',
    },
    {
      id: 'selected_whitelist',
      label: 'Selected trips whitelist non-empty (when stage=selected_trips)',
      pass: stage !== 'selected_trips' || hasWhitelist,
      status: stage !== 'selected_trips' || hasWhitelist ? 'PASS' : 'WAIT',
      layer: 'release',
      detail: hasWhitelist
        ? `${wl!.tripIds.length} trip(s)`
        : 'TRAVEL_ETA_L2_SELECTED_TRIP_IDS or ops whitelist JSON',
    },
    {
      id: 'provider_unknown_policy',
      label: 'UNKNOWN provider cannot be high-confidence authoritative',
      pass: true,
      status: 'PASS',
      layer: 'engineering',
      detail: 'enforced at enrich-time when authority=AUTHORITATIVE',
    },
  ];

  const engineeringReady = checks
    .filter((c) => c.layer === 'engineering')
    .every((c) => c.pass);
  const releaseAuthorized =
    !killSwitch &&
    engineeringReady &&
    (stage === 'shadow' || releaseApproved) &&
    (stage !== 'selected_trips' || hasWhitelist);

  const authoritativePromotion =
    releaseAuthorized &&
    !killSwitch &&
    (stage === 'selected_trips' ||
      stage === 'iceland_canary_5%' ||
      stage === 'iceland_canary_20%' ||
      stage === 'iceland_default' ||
      forceAuthEnv);

  const blockedReasons: string[] = [];
  if (killSwitch) blockedReasons.push('KILL_SWITCH');
  if (!goldPresent) blockedReasons.push('GOLD_MATRIX_MISSING');
  if (stage !== 'shadow' && !releaseApproved) blockedReasons.push('RELEASE_NOT_APPROVED');
  if (stage === 'selected_trips' && !hasWhitelist) blockedReasons.push('WHITELIST_EMPTY');

  return {
    schemaId: 'tripnara.travel_eta_l2_authority_gate@v1',
    canaryStage: stage,
    engineeringReady,
    releaseAuthorized,
    authoritativePromotion,
    killSwitch,
    blockedReasons,
    checks,
    generatedAt: new Date().toISOString(),
    rollbackHint:
      'Kill: TRAVEL_ETA_L2_KILL_SWITCH=1 or TRAVEL_ETA_L2_CANARY_STAGE=shadow; unset TRAVEL_ETA_L2_AUTHORITY_APPROVED',
  };
}

/**
 * Resolve SHADOW vs AUTHORITATIVE for one trip under the ops gate.
 */
export function resolveTravelEtaAuthorityForTrip(opts: {
  tripId?: string;
  override?: TravelEtaAuthority;
  countryCode?: string;
  gate?: TravelEtaL2AuthorityGateReport;
  whitelist?: TravelEtaL2SelectedTripsWhitelist;
}): TravelEtaAuthority {
  if (opts.override === 'SHADOW' || opts.override === 'AUTHORITATIVE') {
    return opts.override;
  }

  const gate = opts.gate ?? evaluateTravelEtaL2AuthorityGate({ whitelist: opts.whitelist });
  if (gate.killSwitch || !gate.authoritativePromotion) {
    return 'SHADOW';
  }

  const stage = gate.canaryStage;
  if (stage === 'iceland_default') {
    const isIs =
      opts.countryCode?.toUpperCase() === 'IS' ||
      (opts.tripId != null && opts.tripId.toLowerCase().includes('_is_'));
    return isIs || isTripInTravelEtaL2SelectedWhitelist(opts.tripId, opts.whitelist)
      ? 'AUTHORITATIVE'
      : 'SHADOW';
  }

  if (
    stage === 'selected_trips' ||
    stage === 'iceland_canary_5%' ||
    stage === 'iceland_canary_20%'
  ) {
    // 5%/20% bucketing is ops traffic shaping; runtime still binds whitelist until hash canary lands
    return isTripInTravelEtaL2SelectedWhitelist(opts.tripId, opts.whitelist)
      ? 'AUTHORITATIVE'
      : 'SHADOW';
  }

  // Legacy env: TRAVEL_ETA_L2_AUTHORITY=authoritative without stage → still require gate
  const env = (process.env.TRAVEL_ETA_L2_AUTHORITY ?? 'shadow').toLowerCase();
  if (env === 'authoritative' && gate.releaseAuthorized) {
    if (isTripInTravelEtaL2SelectedWhitelist(opts.tripId, opts.whitelist)) {
      return 'AUTHORITATIVE';
    }
  }

  return 'SHADOW';
}

/**
 * High-risk authoritative path: UNKNOWN provider must not stay high-confidence.
 * Downgrades confidence; caller may keep SHADOW for schedule.
 */
export function applyProviderUnknownAuthorityGuard(
  authority: TravelEtaAuthority,
  provider: string,
  providerTraceStatus?: string,
): { authority: TravelEtaAuthority; blockedReason?: string } {
  if (authority !== 'AUTHORITATIVE') {
    return { authority };
  }
  if (provider === 'UNKNOWN' || providerTraceStatus === 'UNKNOWN') {
    return {
      authority: 'SHADOW',
      blockedReason: 'PROVIDER_UNKNOWN_BLOCKS_AUTHORITATIVE',
    };
  }
  return { authority };
}
