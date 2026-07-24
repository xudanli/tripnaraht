/**
 * Resolve activity / schedule context for Execution Slip option copy.
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { ExecutionSlipOptionContext } from '../contracts/execution-slip-option-preview.types';
import { EXECUTION_SCHEDULE_INFEASIBLE_CAPABILITY } from '../contracts/execution-slip.types';
import { EXECUTION_SLIP_CANDIDATE_IDS } from '../contracts/execution-slip.types';
import {
  EXECUTION_DEPARTURE_SLIP_EVENT,
  type ExecutionDepartureSlipPayload,
} from '../evidence/execution-departure-changed.event';
import type { TravelDecisionEvent } from '../evidence/travel-decision-event.types';
import { fetchPlanItemImpactDetails } from './plan-item-impact-details.util';
import { EXECUTION_SUBSTITUTE_POI_ID } from './execution-slip-repair-candidate.adapter';
import {
  buildExecutionSlipScheduleContext,
  formatExecutionSlipClockLabel,
} from './execution-slip-option-copy.util';
import { readMetadataWindow } from '../utils/execution-activity-context.util';

const DEFAULT_TIMEZONE = 'Atlantic/Reykjavik';

function readExecutionDeparturePayload(
  event?: TravelDecisionEvent,
): ExecutionDepartureSlipPayload | undefined {
  if (!event || event.eventType !== EXECUTION_DEPARTURE_SLIP_EVENT) return undefined;
  return event.payload as ExecutionDepartureSlipPayload;
}

function readSubstituteActivityId(metadata: unknown): string | undefined {
  const drill = (metadata as Record<string, unknown> | null)?.executionSlipCanaryDrill as
    | { substituteActivityId?: string }
    | undefined;
  return typeof drill?.substituteActivityId === 'string'
    ? drill.substituteActivityId
    : undefined;
}

export async function resolveExecutionSlipOptionContext(
  prisma: PrismaService,
  input: {
    tripId: string;
    problem: Rfc001DecisionProblem;
    triggerEvent?: TravelDecisionEvent;
    repairCandidates: Rfc001RepairCandidate[];
    tripMetadata?: unknown;
  },
): Promise<ExecutionSlipOptionContext | null> {
  if (input.problem.semanticCapability !== EXECUTION_SCHEDULE_INFEASIBLE_CAPABILITY) {
    return null;
  }

  const payload = readExecutionDeparturePayload(input.triggerEvent);
  const itemIds = input.problem.affectedPlanItemIds;
  if (!itemIds.length) return null;

  const details = await fetchPlanItemImpactDetails(prisma, itemIds);
  const byId = new Map(details.map((d) => [d.itemId, d]));

  const currentActivityId = payload?.activityId ?? itemIds[0];
  const nextActivityId =
    payload?.nextActivityId ??
    itemIds.find((id) => id !== currentActivityId) ??
    itemIds[itemIds.length - 1];

  const current = byId.get(currentActivityId);
  const next = byId.get(nextActivityId);
  if (!next) return null;

  const shortenCandidate = input.repairCandidates.find(
    (c) => c.candidateId === EXECUTION_SLIP_CANDIDATE_IDS.SHORTEN_CURRENT_STAY,
  );
  const shortenMinutes = shortenCandidate
    ? Math.abs(shortenCandidate.estimatedAddedDurationMinutes)
    : undefined;

  const nextItem = await prisma.itineraryItem.findUnique({
    where: { id: nextActivityId },
    select: {
      travelFromPreviousDuration: true,
      Place: { select: { metadata: true } },
      TripDay: { select: { Trip: { select: { metadata: true } } } },
    },
  });

  const tripMetadata = input.tripMetadata ?? nextItem?.TripDay?.Trip?.metadata;
  const nextWindow = readMetadataWindow(nextItem?.Place?.metadata);
  const timezone = nextWindow?.timezone ?? DEFAULT_TIMEZONE;

  let substituteActivityId = readSubstituteActivityId(tripMetadata);
  if (!substituteActivityId) {
    const substituteRow = await prisma.itineraryItem.findFirst({
      where: {
        TripDay: { tripId: input.tripId },
        Place: {
          metadata: {
            path: ['poiKey'],
            equals: EXECUTION_SUBSTITUTE_POI_ID,
          },
        },
      },
      select: { id: true },
      orderBy: { order: 'asc' },
    });
    substituteActivityId = substituteRow?.id;
  }

  let substituteActivityTitle: string | undefined;
  let substituteLastEntryAt: string | undefined;
  if (substituteActivityId) {
    const substituteDetails = await fetchPlanItemImpactDetails(prisma, [substituteActivityId]);
    substituteActivityTitle = substituteDetails[0]?.label;
    const substituteItem = await prisma.itineraryItem.findUnique({
      where: { id: substituteActivityId },
      select: { Place: { select: { metadata: true } } },
    });
    const substituteWindow = readMetadataWindow(substituteItem?.Place?.metadata);
    substituteLastEntryAt = substituteWindow?.lastEntryAt;
  }

  const referenceIso = payload?.observedAt ?? payload?.projectedEta;
  const scheduleContext = buildExecutionSlipScheduleContext({
    projectedEta: payload?.projectedEta,
    lastEntryAt: payload?.lastEntryAt ?? nextWindow?.lastEntryAt,
    slipMinutes: payload?.slipMinutes,
    travelDurationMinutes: nextItem?.travelFromPreviousDuration ?? undefined,
    timezone,
    referenceIso,
  });

  return {
    currentActivityId,
    currentActivityTitle: current?.label ?? currentActivityId,
    nextActivityId,
    nextActivityTitle: next.label,
    substituteActivityId,
    substituteActivityTitle,
    substituteLastEntryAt,
    substituteLastEntryAtLabel: formatExecutionSlipClockLabel(
      substituteLastEntryAt,
      timezone,
      referenceIso,
    ),
    scheduleContext,
    shortenMinutes,
    timezone,
  };
}
