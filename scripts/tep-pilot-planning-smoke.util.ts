import type { PrismaClient } from '@prisma/client';
import { resolveTripDestinationCountry } from '../src/decision-runtime/packs/loader/country-pack-registry.util';
import type { ExecutabilityStatus, RuleOutcome } from '../src/trips/tep/contracts/tep-self-drive.types';
import { resolveSelfDriveProfile } from '../src/trips/tep/resolvers/self-drive-profile.resolver';
import { validateTepPlanningSnapshot } from '../src/trips/tep/validation/tep-validator';
import {
  TEP_PILOT_PLANNING_TEMPLATES,
  TEP_PILOT_TRIP_BY_TEMPLATE,
  type TepPilotTemplateId,
} from './tep-pilot-is-seed.constants';
import { projectDailyDrivePlansForTrip } from './tep-pilot-smoke.util';
import { readPilotRuntimeHints } from './tep-pilot-runtime-smoke.util';

export type TepPilotPlanningSmokeTemplate =
  | (typeof TEP_PILOT_PLANNING_TEMPLATES)[number]
  | 'planning-all';

export interface PlanningSmokeExpect {
  status: ExecutabilityStatus;
  ruleIds: string[];
  outcomes?: RuleOutcome[];
}

export function parsePlanningSmokeTemplate(argv: string[]): TepPilotPlanningSmokeTemplate {
  const hit = argv.find((a) => a.startsWith('--template='));
  const raw = hit?.split('=').slice(1).join('=') ?? 'planning-all';
  if (raw === 'planning-all' || raw === 'all') return 'planning-all';
  if (
    raw === '05' ||
    raw === '07' ||
    raw === '08' ||
    raw === '09' ||
    raw === '10'
  ) {
    return raw;
  }
  throw new Error(`Unknown --template=${raw} (use 05|07|08|09|10|planning-all)`);
}

export function resolvePlanningSmokeTemplates(
  template: TepPilotPlanningSmokeTemplate,
): Array<(typeof TEP_PILOT_PLANNING_TEMPLATES)[number]> {
  if (template === 'planning-all') return [...TEP_PILOT_PLANNING_TEMPLATES];
  return [template];
}

export async function runPlanningPilotSmoke(
  prisma: PrismaClient,
  template: (typeof TEP_PILOT_PLANNING_TEMPLATES)[number],
): Promise<Record<string, unknown>> {
  const tripId = TEP_PILOT_TRIP_BY_TEMPLATE[template as Exclude<TepPilotTemplateId, 'all' | 'planning-all' | '302'>];

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { destination: true, metadata: true, pacingConfig: true },
  });
  if (!trip) {
    throw new Error(
      `Trip ${tripId} not found — run: npm run tep:pilot-seed -- --template=${template} --reset`,
    );
  }

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : {};

  const hints = readPilotRuntimeHints(metadata);
  const expected = hints?.expected as PlanningSmokeExpect | undefined;
  if (!expected?.status || !expected.ruleIds?.length) {
    throw new Error(`pilot_is_${template} missing tepPilotRuntimeHints.expected`);
  }

  const countryCode = resolveTripDestinationCountry(trip.destination) ?? 'IS';
  const profile =
    hints?.profile ??
    resolveSelfDriveProfile({
      tripId,
      explorationInput: undefined,
      tripPacingConfig: trip.pacingConfig,
      tripMetadata: metadata,
      destinationCountry: countryCode,
    });

  const dailyDrivePlans = await projectDailyDrivePlansForTrip(prisma, tripId);
  const assessment = validateTepPlanningSnapshot({
    tripId,
    countryCode,
    profile,
    dailyDrivePlans,
    activityArrivals: hints?.activityArrivals,
    roadConditions: hints?.roadConditions as
      | Array<{
          roadRef: string;
          roadId?: string;
          status: string;
          observedAt?: string;
          validUntil?: string;
        }>
      | undefined,
  });

  const statusPass = assessment.status === expected.status;
  const rulesPass = expected.ruleIds.every((id) =>
    assessment.ruleResults.some((r) => r.ruleId === id),
  );
  const outcomesPass =
    !expected.outcomes?.length ||
    expected.outcomes.every((o) => assessment.ruleResults.some((r) => r.outcome === o));

  const pass = statusPass && rulesPass && outcomesPass;

  const output = {
    ok: pass,
    template: `PILOT-IS-${template}`,
    tripId,
    certScenarioId: hints?.certScenarioId,
    assessmentStatus: assessment.status,
    expectedStatus: expected.status,
    ruleIds: assessment.ruleResults.map((r) => r.ruleId),
    expectedRuleIds: expected.ruleIds,
    outcomes: assessment.ruleResults.map((r) => r.outcome),
  };

  if (!pass) {
    throw new Error(`PILOT-IS-${template} planning smoke failed: ${JSON.stringify(output)}`);
  }
  return output;
}

export async function runPlanningPilotSmokeBatch(
  prisma: PrismaClient,
  template: TepPilotPlanningSmokeTemplate,
): Promise<Record<string, unknown>> {
  const templates = resolvePlanningSmokeTemplates(template);
  if (templates.length === 1) {
    return runPlanningPilotSmoke(prisma, templates[0]!);
  }
  return {
    ok: true,
    templates: await Promise.all(templates.map((t) => runPlanningPilotSmoke(prisma, t))),
  };
}
