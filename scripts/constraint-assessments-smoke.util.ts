import type { PrismaClient } from '@prisma/client';
import { resolveTripDestinationCountry } from '../src/decision-runtime/packs/loader/country-pack-registry.util';
import { buildUnifiedConstraintAssessmentBundle } from '../src/decision-runtime/constraints/utils/unified-constraint-assessment.builder';
import { resolveEvaluationContextVersion } from '../src/decision-runtime/constraints/utils/evaluation-context-version.util';
import { readMaxDailyDriveMinutesFromMetadata } from '../src/trips/tep/utils/tep-constraint-profile-sync.util';
import { buildDailyDriveExceededConflicts } from '../src/trips/trip-constraint-solver/utils/daily-drive-conflicts.util';
import { assembleFeasibilityReport } from '../src/trips/trip-constraint-solver/utils/feasibility-assembler.util';
import { resolveSelfDriveProfile } from '../src/trips/tep/resolvers/self-drive-profile.resolver';
import { validateTepPlanningSnapshot } from '../src/trips/tep/validation/tep-validator';
import { projectDailyDrivePlansForTrip } from './tep-pilot-smoke.util';

function emptyReadiness() {
  return {
    score: 100,
    dimensions: [],
    findings: [],
    coverageGaps: [],
    emergencyContacts: [],
  };
}

export async function runConstraintAssessmentsSmokeForTrip(
  prisma: PrismaClient,
  tripId: string,
  options?: { travelMinutes?: number; travelItemId?: string },
): Promise<ReturnType<typeof buildUnifiedConstraintAssessmentBundle>> {
  if (options?.travelMinutes != null && options.travelItemId) {
    await prisma.itineraryItem.update({
      where: { id: options.travelItemId },
      data: { travelFromPreviousDuration: options.travelMinutes },
    });
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { TripDay: { orderBy: { date: 'asc' } } },
  });
  if (!trip) {
    throw new Error(`Trip ${tripId} not found`);
  }

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : {};

  const countryCode = resolveTripDestinationCountry(trip.destination) ?? 'IS';
  const profile = resolveSelfDriveProfile({
    tripId,
    explorationInput: undefined,
    tripPacingConfig: trip.pacingConfig,
    tripMetadata: metadata,
    destinationCountry: countryCode,
  });

  const dailyDrivePlans = await projectDailyDrivePlansForTrip(prisma, tripId);
  const tepAssessment = validateTepPlanningSnapshot({
    tripId,
    countryCode,
    profile,
    dailyDrivePlans,
  });

  const maxMinutes = readMaxDailyDriveMinutesFromMetadata(metadata) ?? 360;
  const maxHours = maxMinutes / 60;
  const dailyDriveMinutes = new Map<number, number>();
  for (const plan of dailyDrivePlans) {
    const driveMinutes = plan.legs.reduce((sum, leg) => sum + leg.baseNavigationMinutes, 0);
    dailyDriveMinutes.set(plan.dayIndex, driveMinutes);
  }

  const conflicts = buildDailyDriveExceededConflicts({
    dailyDriveMinutes,
    maxDailyDrivingHours: maxHours,
  });

  const tripDays = trip.TripDay.map((day, index) => ({
    id: day.id,
    dayNumber: index + 1,
  }));

  const feasibilityReport = assembleFeasibilityReport({
    trip: {
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      metadata: trip.metadata,
    },
    tripDays,
    readiness: emptyReadiness() as never,
    conflicts,
    revision: { tripUpdatedAt: trip.updatedAt.toISOString(), constraintsVersion: 1 },
  });

  const generatedAt = new Date().toISOString();
  const contextVersion = resolveEvaluationContextVersion({
    tripId,
    metadata: trip.metadata,
    updatedAt: trip.updatedAt,
    countryCode: trip.destination,
  });

  return buildUnifiedConstraintAssessmentBundle({
    tripId,
    generatedAt,
    contextVersion,
    evaluatedAt: feasibilityReport.verifiedAt ?? generatedAt,
    feasibilityIssues: feasibilityReport.issues,
    tepRuleResults: tepAssessment.ruleResults.filter((r) => r.ruleId.startsWith('SDR-')),
    contractRequirements: {
      MAX_DAILY_DRIVE: `≤ ${maxHours}h`,
    },
  });
}
