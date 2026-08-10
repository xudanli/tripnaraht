/**
 * Iceland Initial Plan arrange: coverage-first day assignment + optional per-day OR-Tools VRPTW.
 * Writes PlanProposalChange[] (ADD authority), not shadow-only attachments.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { extractPlaceMeta } from '../../attraction-explore/utils/attraction-explore-place.util';
import type { PlanProposalChange } from '../../arrange-itinerary/types/plan-proposal.types';
import { OrToolsSolverClient } from '../../../decision-runtime/solver/ortools-solver.client';
import { resolveOrToolsSolverBaseUrl } from '../../../decision-runtime/solver/ortools-solver.config';
import {
  buildSolverProblemFromDayItems,
  dateToDayMinutes,
  serviceDurationMinutes,
  type DayVrptwItemInput,
} from '../../../decision-runtime/solver/projection/build-solver-problem-from-day-items.util';
import { pickBestSolverCandidate } from '../../../decision-runtime/solver/adapters/ortools-to-plan-proposal-changes.adapter';
import { minutesToHhMm } from '../../../decision-runtime/solver/materialize/apply-day-order-to-route-plan.util';

export type IcelandInitialArrangeAuthority =
  | 'coverage_ortools'
  | 'coverage'
  | 'greedy';

export interface IcelandInitialArrangeResult {
  changes: PlanProposalChange[];
  authority: Exclude<IcelandInitialArrangeAuthority, 'greedy'>;
  emptyDayCountEstimate: number;
  assignedDayCount: number;
  activityCount: number;
}

@Injectable()
export class IcelandInitialPlanArrangeService {
  private readonly logger = new Logger(IcelandInitialPlanArrangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly solverClient?: OrToolsSolverClient,
  ) {}

  async buildInitialArrangeChanges(input: {
    tripId: string;
    options?: {
      respectNoNightDrive?: boolean;
      maxDailyDriveMinutes?: number;
    };
  }): Promise<IcelandInitialArrangeResult | null> {
    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId: input.tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });
    if (tripDays.length === 0) return null;

    const rows = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: { tripId: input.tripId },
      include: { Place: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (rows.length === 0) return null;

    const priorityRank: Record<string, number> = {
      must_go: 0,
      very_interested: 1,
      alternative: 2,
    };
    const roleRank: Record<string, number> = {
      USER_MUST_GO: 0,
      BOOKING: 0,
      REGION_CORE: 1,
      REGION_SECONDARY: 2,
      FALLBACK: 3,
      RECOMMENDER: 4,
    };
    const readRole = (sourceRef: unknown): string => {
      if (!sourceRef || typeof sourceRef !== 'object') return 'RECOMMENDER';
      const role = (sourceRef as { role?: unknown }).role;
      return typeof role === 'string' ? role : 'RECOMMENDER';
    };
    const readSubstitutionGroup = (sourceRef: unknown): string | null => {
      if (!sourceRef || typeof sourceRef !== 'object') return null;
      const g = (sourceRef as { substitutionGroup?: unknown }).substitutionGroup;
      return typeof g === 'string' && g.trim() ? g.trim() : null;
    };

    rows.sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        (roleRank[readRole(a.sourceRef)] ?? 9) -
          (roleRank[readRole(b.sourceRef)] ?? 9) ||
        a.sortOrder - b.sortOrder,
    );

    const eveningCap = input.options?.respectNoNightDrive === false ? 20 : 17;
    const morningStart = (dayDate: Date) => {
      const weekday = DateTime.fromJSDate(dayDate, { zone: 'utc' }).weekday;
      return weekday >= 6 ? 10 : 9;
    };

    type Slot = {
      candidateId: string;
      placeId: number;
      label: string;
      dwellHours: number;
    };

    const slotsByDay: Slot[][] = tripDays.map(() => []);
    const usedSubstitutionGroups = new Set<string>();

    const tryPlace = (row: (typeof rows)[number]): boolean => {
      const group = readSubstitutionGroup(row.sourceRef);
      if (group && usedSubstitutionGroups.has(group)) {
        return false; // skip — another representative already placed
      }
      const dwell = extractPlaceMeta(row.Place).suggestedDwellMinutes ?? 90;
      const dwellHours = Math.max(1, Math.ceil(dwell / 60));
      for (let d = 0; d < tripDays.length; d++) {
        const used = slotsByDay[d]!.reduce((s, x) => s + x.dwellHours, 0);
        const start = morningStart(tripDays[d]!.date);
        if (start + used + dwellHours <= eveningCap) {
          slotsByDay[d]!.push({
            candidateId: row.id,
            placeId: row.placeId,
            label: row.Place.nameCN || row.Place.nameEN || `Place ${row.placeId}`,
            dwellHours,
          });
          if (group) usedSubstitutionGroups.add(group);
          return true;
        }
      }
      return false;
    };

    // Round 1: coverage-first — prefer REGION_CORE across days (one per day when possible)
    const remaining = [...rows];
    for (let d = 0; d < tripDays.length && remaining.length > 0; d++) {
      const idx = remaining.findIndex((row) => {
        const group = readSubstitutionGroup(row.sourceRef);
        if (group && usedSubstitutionGroups.has(group)) return false;
        const dwell = extractPlaceMeta(row.Place).suggestedDwellMinutes ?? 90;
        const dwellHours = Math.max(1, Math.ceil(dwell / 60));
        const start = morningStart(tripDays[d]!.date);
        return start + dwellHours <= eveningCap;
      });
      if (idx < 0) continue;
      const row = remaining.splice(idx, 1)[0]!;
      const dwell = extractPlaceMeta(row.Place).suggestedDwellMinutes ?? 90;
      const dwellHours = Math.max(1, Math.ceil(dwell / 60));
      const group = readSubstitutionGroup(row.sourceRef);
      slotsByDay[d]!.push({
        candidateId: row.id,
        placeId: row.placeId,
        label: row.Place.nameCN || row.Place.nameEN || `Place ${row.placeId}`,
        dwellHours,
      });
      if (group) usedSubstitutionGroups.add(group);
    }

    // Round 2+: stack remaining by priority/role, respecting substitution groups
    let guard = 0;
    while (remaining.length > 0 && guard < 200) {
      guard += 1;
      const row = remaining[0]!;
      if (tryPlace(row)) {
        remaining.shift();
        continue;
      }
      // Cannot place (group conflict or no capacity) — drop from remaining
      remaining.shift();
    }

    let changes: PlanProposalChange[] = [];
    let assignedDayCount = 0;
    let activityCount = 0;

    for (let d = 0; d < tripDays.length; d++) {
      const daySlots = slotsByDay[d]!;
      if (daySlots.length === 0) continue;
      assignedDayCount += 1;
      let slotHour = morningStart(tripDays[d]!.date);
      const dayNumber = d + 1;
      for (const slot of daySlots) {
        const startTime = `${String(slotHour).padStart(2, '0')}:00`;
        const endHour = slotHour + slot.dwellHours;
        const endTime = `${String(Math.min(endHour, 23)).padStart(2, '0')}:00`;
        changes.push({
          operation: 'ADD',
          candidateId: slot.candidateId,
          placeId: slot.placeId,
          dayIndex: dayNumber,
          startTime,
          endTime,
          label: slot.label,
          itemType: ItemType.ACTIVITY,
          note: `[iceland-initial] ${slot.label}`,
          removeFromCandidates: true,
        });
        changes.push({
          operation: 'REMOVE_CANDIDATE',
          candidateId: slot.candidateId,
          dayIndex: dayNumber,
          label: slot.label,
        });
        activityCount += 1;
        slotHour = endHour;
      }
    }

    if (changes.filter((c) => c.operation === 'ADD').length === 0) {
      return null;
    }

    let authority: IcelandInitialArrangeResult['authority'] = 'coverage';
    if (this.solverClient && resolveOrToolsSolverBaseUrl()) {
      try {
        const rewritten = await this.rewriteDaysWithOrTools(
          input.tripId,
          changes,
        );
        if (rewritten.usedSolver) {
          changes = rewritten.changes;
          authority = 'coverage_ortools';
        }
      } catch (err) {
        this.logger.warn(
          `OR-Tools day VRPTW skipped trip=${input.tripId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const emptyDayCountEstimate = tripDays.length - assignedDayCount;
    return {
      changes,
      authority,
      emptyDayCountEstimate,
      assignedDayCount,
      activityCount,
    };
  }

  private async rewriteDaysWithOrTools(
    tripId: string,
    changes: PlanProposalChange[],
  ): Promise<{ changes: PlanProposalChange[]; usedSolver: boolean }> {
    if (!this.solverClient) return { changes, usedSolver: false };

    const adds = changes.filter((c) => c.operation === 'ADD');
    const removes = changes.filter((c) => c.operation === 'REMOVE_CANDIDATE');
    const dayIndexes = [...new Set(adds.map((a) => a.dayIndex))].sort(
      (a, b) => a - b,
    );

    let usedSolver = false;
    const newAdds: PlanProposalChange[] = [];

    for (const dayIndex of dayIndexes) {
      const dayAdds = adds.filter((a) => a.dayIndex === dayIndex);
      if (dayAdds.length < 2) {
        newAdds.push(...dayAdds);
        continue;
      }

      const items: DayVrptwItemInput[] = dayAdds.map((a) => ({
        itemId: a.candidateId!,
        label: a.label,
        startTime: `1970-01-01T${(a.startTime ?? '09:00').padStart(5, '0')}:00.000Z`,
        endTime: `1970-01-01T${(a.endTime ?? '10:00').padStart(5, '0')}:00.000Z`,
        placeId: a.placeId,
      }));

      const problem = buildSolverProblemFromDayItems({
        requestId: `iceland-initial:${tripId}:d${dayIndex}:${Date.now()}`,
        tripId,
        planVersionId: 'iceland-initial',
        evidenceVersionId: 'iceland-initial',
        dayIndex,
        items,
      });
      if (!problem) {
        newAdds.push(...dayAdds);
        continue;
      }

      const response = await this.solverClient.solve(problem);
      const best = pickBestSolverCandidate(response?.candidates ?? []);
      const dayPlan = best?.dayPlans?.[0];
      if (!dayPlan) {
        newAdds.push(...dayAdds);
        continue;
      }

      const byId = new Map(dayAdds.map((a) => [a.candidateId!, a]));
      const ordered: PlanProposalChange[] = [];
      dayPlan.nodeIds.forEach((nodeId, idx) => {
        if (nodeId === 'depot') return;
        const orig = byId.get(nodeId);
        if (!orig) return;
        const startMin =
          dayPlan.startMin?.[idx] ?? dateToDayMinutes(items.find((i) => i.itemId === nodeId)!.startTime);
        const item = items.find((i) => i.itemId === nodeId)!;
        const dur = serviceDurationMinutes(item);
        const endMin = startMin + dur;
        ordered.push({
          ...orig,
          startTime: minutesToHhMm(startMin),
          endTime: minutesToHhMm(Math.min(endMin, 23 * 60 + 59)),
          note: `[ortools-initial] ${orig.label ?? 'activity'}`,
        });
        byId.delete(nodeId);
      });
      // Append any unmatched in original order
      for (const leftover of byId.values()) {
        ordered.push(leftover);
      }
      if (ordered.length > 0) {
        usedSolver = true;
        newAdds.push(...ordered);
      } else {
        newAdds.push(...dayAdds);
      }
    }

    return {
      changes: [...newAdds, ...removes],
      usedSolver,
    };
  }
}
