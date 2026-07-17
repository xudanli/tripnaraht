/**
 * Validate a selected-trip pack against frozen dataset schema.
 *
 *   npm run lab:validate-selected-trip -- --tripId <id>
 *   npm run lab:validate-selected-trip -- --dir <path>
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  APPROVED_PILOT_OPERATIONS,
  PII_FORBIDDEN_KEYS,
  type ConstraintsFile,
  type EffectivePlanFile,
  type EvidenceSnapshotFile,
  type ExpectedOutcomeFile,
  type SelectedTripManifest,
  type TravelMatrixFile,
  type TriggerFile,
  type TripContextFile,
  type ValidationIssue,
  type ValidationReport,
} from './schema/types';

export const SELECTED_TRIPS_ROOT = join(
  process.cwd(),
  'src/decision-runtime/solver/lab/selected-trips',
);

export const PACKS_ROOT = join(SELECTED_TRIPS_ROOT, 'packs');

const REQUIRED_FILES = [
  'manifest.json',
  'trip-context.json',
  'effective-plan.json',
  'evidence-snapshot.json',
  'constraints.json',
  'travel-matrix.json',
  'trigger.json',
  'expected-outcome.json',
] as const;

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function issue(
  issues: ValidationIssue[],
  code: string,
  severity: 'error' | 'warn',
  path: string,
  message: string,
): void {
  issues.push({ code, severity, path, message });
}

function scanPii(obj: unknown, base: string, issues: ValidationIssue[]): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanPii(v, `${base}[${i}]`, issues));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = base ? `${base}.${k}` : k;
    if (
      (PII_FORBIDDEN_KEYS as readonly string[]).includes(k) &&
      v != null &&
      String(v).length > 0
    ) {
      issue(issues, 'pii_present', 'error', path, `Forbidden PII field: ${k}`);
    }
    scanPii(v, path, issues);
  }
}

export function resolvePackDir(tripIdOrDir: {
  tripId?: string;
  dir?: string;
}): string | undefined {
  if (tripIdOrDir.dir) return tripIdOrDir.dir;
  if (tripIdOrDir.tripId) return join(PACKS_ROOT, tripIdOrDir.tripId);
  return undefined;
}

export function validateSelectedTripPack(packDir: string): ValidationReport {
  const issues: ValidationIssue[] = [];
  const tripIdGuess = packDir.split('/').filter(Boolean).pop() ?? 'unknown';

  if (!existsSync(packDir)) {
    return {
      tripId: tripIdGuess,
      ok: false,
      eligible: false,
      issues: [
        {
          code: 'pack_missing',
          severity: 'error',
          path: packDir,
          message: 'pack directory missing',
        },
      ],
    };
  }

  for (const f of REQUIRED_FILES) {
    if (!existsSync(join(packDir, f))) {
      issue(issues, 'file_missing', 'error', f, `required file missing`);
    }
  }

  const manifest = readJson<SelectedTripManifest>(join(packDir, 'manifest.json'));
  const context = readJson<TripContextFile>(join(packDir, 'trip-context.json'));
  const plan = readJson<EffectivePlanFile>(join(packDir, 'effective-plan.json'));
  const evidence = readJson<EvidenceSnapshotFile>(
    join(packDir, 'evidence-snapshot.json'),
  );
  const constraints = readJson<ConstraintsFile>(join(packDir, 'constraints.json'));
  const matrix = readJson<TravelMatrixFile>(join(packDir, 'travel-matrix.json'));
  const trigger = readJson<TriggerFile>(join(packDir, 'trigger.json'));
  const expected = readJson<ExpectedOutcomeFile>(
    join(packDir, 'expected-outcome.json'),
  );

  const tripId = manifest?.tripId ?? context?.tripId ?? tripIdGuess;
  const planVersionId = manifest?.planVersionId;

  if (manifest && context && manifest.tripId !== context.tripId) {
    issue(issues, 'tripId_mismatch', 'error', 'trip-context.json', 'tripId ≠ manifest');
  }
  if (manifest && plan && manifest.tripId !== plan.tripId) {
    issue(issues, 'tripId_mismatch', 'error', 'effective-plan.json', 'tripId ≠ manifest');
  }
  if (
    planVersionId &&
    plan &&
    plan.planVersionId !== planVersionId
  ) {
    issue(
      issues,
      'planVersionId_mismatch',
      'error',
      'effective-plan.json',
      'planVersionId ≠ manifest',
    );
  }
  if (
    planVersionId &&
    trigger &&
    trigger.planVersionId !== planVersionId
  ) {
    issue(
      issues,
      'planVersionId_mismatch',
      'error',
      'trigger.json',
      'planVersionId ≠ manifest',
    );
  }

  const tz = manifest?.timezone ?? context?.timezone;
  if (!tz) {
    issue(issues, 'timezone_missing', 'error', 'trip-context.json', 'timezone required');
  }
  if (!context?.dateRange?.startDate || !context?.dateRange?.endDate) {
    issue(
      issues,
      'date_range_incomplete',
      'error',
      'trip-context.json.dateRange',
      'startDate/endDate required',
    );
  }
  if (context && context.destination !== 'IS' && manifest?.destination !== 'IS') {
    issue(
      issues,
      'destination_not_is',
      'error',
      'trip-context.json.destination',
      'pilot requires IS',
    );
  }

  const activities =
    plan?.days?.flatMap((d) => d.activities.map((a) => ({ ...a, dayId: d.dayId }))) ??
    [];
  let missingCoords = 0;
  for (const a of activities) {
    if (a.timeWindow) {
      if (a.timeWindow.startMin > a.timeWindow.endMin) {
        issue(
          issues,
          'time_window_invalid',
          'error',
          `effective-plan/${a.activityId}`,
          'startMin > endMin',
        );
      }
    }
    if (typeof a.isBooked !== 'boolean') {
      issue(
        issues,
        'booked_unspecified',
        'error',
        `effective-plan/${a.activityId}`,
        'isBooked must be boolean',
      );
    }
    if (a.poiId && (a.lat == null || a.lng == null)) {
      missingCoords += 1;
    }
  }
  if (missingCoords > 0) {
    issue(
      issues,
      'poi_coords_missing',
      'warn',
      'effective-plan.json',
      `${missingCoords} POI(s) missing lat/lng — matrix must cover hops`,
    );
  }

  if (!evidence?.evidenceVersionId) {
    issue(
      issues,
      'evidence_version_missing',
      'error',
      'evidence-snapshot.json',
      'evidenceVersionId required',
    );
  } else if (
    manifest?.evidenceVersionId &&
    manifest.evidenceVersionId !== evidence.evidenceVersionId
  ) {
    issue(
      issues,
      'evidence_version_mismatch',
      'error',
      'evidence-snapshot.json',
      'evidenceVersionId ≠ manifest',
    );
  }
  if (!evidence?.frozenAt) {
    issue(
      issues,
      'evidence_not_frozen',
      'error',
      'evidence-snapshot.json',
      'frozenAt required (export copy)',
    );
  }

  const op = (trigger?.operation ?? manifest?.intendedOperation ?? '').toUpperCase();
  if (!op) {
    issue(issues, 'operation_missing', 'error', 'trigger.json', 'operation required');
  } else if (
    !(APPROVED_PILOT_OPERATIONS as readonly string[]).includes(op)
  ) {
    issue(
      issues,
      'operation_out_of_scope',
      'error',
      'trigger.json.operation',
      `${op} not in pilot scope SHIFT|SWAP|SHORTEN|REROUTE`,
    );
  }

  if (!expected?.expectation) {
    issue(
      issues,
      'expected_outcome_incomplete',
      'error',
      'expected-outcome.json',
      'expectation required',
    );
  } else if (typeof expected.mustPreserveBooked !== 'boolean') {
    issue(
      issues,
      'expected_outcome_incomplete',
      'error',
      'expected-outcome.json',
      'mustPreserveBooked required',
    );
  }
  if (!expected?.reviewedBy) {
    issue(
      issues,
      'expected_outcome_unreviewed',
      'warn',
      'expected-outcome.json',
      'reviewedBy empty — fill before pilot execution',
    );
  }

  const nodeIds = new Set(
    activities.map((a) => a.poiId ?? a.activityId).filter(Boolean),
  );
  const edgeSet = new Set(
    (matrix?.edges ?? []).map((e) => `${e.from}->${e.to}`),
  );
  if (!matrix?.edges?.length) {
    issue(
      issues,
      'matrix_empty',
      'error',
      'travel-matrix.json',
      'edges required to rebuild distances',
    );
  } else if (nodeIds.size >= 2) {
    const ids = [...nodeIds];
    let missingHops = 0;
    for (let i = 0; i < ids.length - 1; i += 1) {
      const key = `${ids[i]}->${ids[i + 1]}`;
      if (!edgeSet.has(key)) missingHops += 1;
    }
    if (missingHops > 0) {
      issue(
        issues,
        'matrix_incomplete',
        'warn',
        'travel-matrix.json',
        `${missingHops} sequential hop(s) missing — ensure solver matrix rebuildable`,
      );
    }
  }

  if (!constraints?.constraints?.length) {
    issue(
      issues,
      'constraints_empty',
      'warn',
      'constraints.json',
      'no canonical constraints listed',
    );
  }

  for (const file of [
    'manifest.json',
    'trip-context.json',
    'effective-plan.json',
    'trigger.json',
    'expected-outcome.json',
  ]) {
    const body = readJson(join(packDir, file));
    if (body) scanPii(body, file, issues);
  }

  if (context && context.deidentified !== true && manifest?.deidentified !== true) {
    issue(
      issues,
      'not_deidentified',
      'error',
      'trip-context.json',
      'deidentified must be true for lab packs',
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    tripId,
    ok: errors.length === 0,
    eligible: errors.length === 0,
    issues,
    intendedOperation: op || undefined,
    source: manifest?.source,
    expectation: expected?.expectation,
  };
}

export function listPackTripIds(): string[] {
  if (!existsSync(PACKS_ROOT)) return [];
  return readdirSync(PACKS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

async function main(): Promise<number> {
  const tripId = argValue('--tripId');
  const dir = argValue('--dir');
  const packDir = resolvePackDir({ tripId, dir });
  if (!packDir) {
    console.error('Usage: --tripId <id> | --dir <path>');
    return 1;
  }
  const report = validateSelectedTripPack(packDir);
  console.log(JSON.stringify(report, null, 2));
  return report.ok ? 0 : 1;
}

if (require.main === module || process.argv[1]?.includes('validate-selected-trip')) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
