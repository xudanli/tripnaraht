/**
 * Itinerary Day Editor Authoritative Page Context builder.
 * Day-scoped: completeness, gaps, booking, feasibility — not trip-wide tips.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlanProposalBuilderService } from '../../arrange-itinerary/services/plan-proposal-builder.service';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import type { PlanProposal } from '../../arrange-itinerary/types/plan-proposal.types';
import {
  CONFIRMED_BOOKING_STATUSES,
  PENDING_BOOKING_STATUSES,
} from '../../utils/timeline-overview.util';
import type {
  AuthoritativePageContext,
  AvailableAction,
  ClientPageState,
  EntityProjection,
  EntityRef,
} from '../contracts/page-insight.types';
import {
  DAY_BUFFER_TIGHT_MINUTES,
  DAY_GAP_OPTIMIZE_MINUTES,
  dayPlanStatusToSeverity,
  isSystemMaintenanceIssue,
  type DayPlanStatus,
  type DaySeverity,
} from '../contracts/itinerary-day-editor-ai';
import type { ContextHashVersionInputs } from './page-insight-context-hash.service';

const COPILOT_PREVIEW_USER = 'copilot-context-builder';

export interface DayEditorContextGate {
  ok: boolean;
  code?: 'CONTEXT_MISSING';
  missing: string[];
}

export interface DayItemSummary {
  itemId: string;
  label: string;
  startTime?: string;
  endTime?: string;
  type: string;
  bookingStatus?: string;
  needsBooking: boolean;
}

export interface DayGapSummary {
  afterLabel: string;
  beforeLabel: string;
  startTime: string;
  endTime: string;
  minutes: number;
}

export interface DayIssueSummary {
  issueId: string;
  priority: string;
  message: string;
  affectedLabels: string[];
  /** True when message is stale-rule / data-maintenance — demote from primary. */
  systemMaintenance?: boolean;
}

export interface ItineraryDayEditorBuiltContext {
  authoritative: AuthoritativePageContext;
  versions: ContextHashVersionInputs;
  gate: DayEditorContextGate;
  dayIndex?: number;
  dayId?: string;
  dayItems: DayItemSummary[];
  /** Primary planning status for the day advisor. */
  dayPlanStatus: DayPlanStatus;
  /** Legacy mirror of dayPlanStatus. */
  daySeverity: DaySeverity;
  topIssue?: DayIssueSummary;
  mustHandleCount: number;
  suggestAdjustCount: number;
  activityCount: number;
  lodgingCount: number;
  pendingBookingLabels: string[];
  confirmedActivityLabels: string[];
  gaps: DayGapSummary[];
  longestGap?: DayGapSummary;
  minTransferMinutes?: number;
  incompleteReason?: string;
  proposal?: PlanProposal;
  proposalActionType?: 'PREVIEW_REORDER' | 'ADD_BUFFER' | 'MOVE_TO_ANOTHER_DAY';
  proposalError?: string;
  localOverlap?: { a: string; b: string; detail: string };
  allowedFactTokens: string[];
}

@Injectable()
export class ItineraryDayEditorPageContextBuilder {
  private readonly logger = new Logger(ItineraryDayEditorPageContextBuilder.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly proposalBuilder?: PlanProposalBuilderService,
    @Optional() private readonly feasibility?: FeasibilityReportService,
    @Optional() private readonly snapshotAssembler?: TripContextSnapshotAssemblerService,
  ) {}

  async build(
    tripId: string,
    client: ClientPageState,
  ): Promise<ItineraryDayEditorBuiltContext> {
    const missing: string[] = [];
    if (client.pageMode !== 'ITINERARY_DAY_EDITOR') missing.push('pageMode');
    if (client.insightScope !== 'ITINERARY_DAY') missing.push('insightScope');

    const resolved = await this.resolveDay(tripId, client);
    if (resolved.dayIndex == null) missing.push('selectedDay');

    const gate: DayEditorContextGate = {
      ok: missing.length === 0,
      code: missing.length ? 'CONTEXT_MISSING' : undefined,
      missing,
    };

    let snapshotRef: Awaited<
      ReturnType<TripContextSnapshotAssemblerService['resolveSnapshotRef']>
    > = {
      snapshotId: 'unknown',
      revision: '0',
      constraintsVersion: 0,
    };
    try {
      if (this.snapshotAssembler) {
        snapshotRef = await this.snapshotAssembler.resolveSnapshotRef(tripId);
      }
    } catch (err) {
      this.logger.warn(`snapshot ref failed: ${(err as Error).message}`);
    }

    const draftRevision =
      client.draftRevision ?? client.draftRef?.revision ?? null;

    const dayItems = resolved.dayId ? await this.loadDayItems(resolved.dayId) : [];
    const localOverlap = detectLocalOverlap(dayItems);
    const gaps = detectGaps(dayItems);
    const longestGap = gaps.slice().sort((a, b) => b.minutes - a.minutes)[0];
    const minTransferMinutes = minPositiveTransfer(dayItems);

    const activityItems = dayItems.filter((i) => isActivityLike(i.type));
    const lodgingItems = dayItems.filter((i) => isLodging(i.type));
    const pendingBookingLabels = dayItems
      .filter((i) => i.needsBooking)
      .map((i) => i.label);
    const confirmedActivityLabels = activityItems
      .filter((i) => i.bookingStatus && CONFIRMED_BOOKING_STATUSES.has(i.bookingStatus))
      .map((i) => i.label);

    let incompleteReason: string | undefined;
    if (gate.ok) {
      if (activityItems.length === 0 && lodgingItems.length > 0) {
        incompleteReason = '只有住宿，关键活动与路线尚未安排';
      } else if (dayItems.length === 0) {
        incompleteReason = '当天尚无任何安排';
      } else if (activityItems.length === 0) {
        incompleteReason = '当天还没有可执行的活动';
      }
    }

    let mustHandleCount = 0;
    let suggestAdjustCount = 0;
    let topIssue: DayIssueSummary | undefined;
    let feasibilityHard = false;
    let feasibilitySoft = false;

    if (gate.ok && resolved.dayIndex != null && this.feasibility) {
      try {
        const report = await this.feasibility.validateScope(tripId, {
          type: 'day',
          dayNumber: resolved.dayIndex,
        });
        mustHandleCount = report.summary?.mustHandle ?? 0;
        suggestAdjustCount =
          (report.summary?.suggestAdjust ?? 0) + (report.summary?.pendingConfirm ?? 0);
        const issues = (report.issues ?? []) as Array<{
          id?: string;
          issueId?: string;
          priority?: string;
          message?: string;
          title?: string;
          affectedDays?: number[];
          relatedItemIds?: string[];
        }>;
        const dayIssues = issues.filter((i) =>
          (i.affectedDays?.length ?? 0) === 0
            ? true
            : i.affectedDays!.includes(resolved.dayIndex!),
        );

        const ranked = dayIssues
          .map((picked) => {
            const message = picked.message || picked.title || '当日安排存在冲突';
            const labels = dayItems
              .filter((it) => (picked.relatedItemIds ?? []).includes(it.itemId))
              .map((it) => it.label);
            return {
              issueId: String(picked.issueId ?? picked.id ?? 'issue'),
              priority: picked.priority ?? 'suggest_adjust',
              message,
              affectedLabels: labels,
              systemMaintenance: isSystemMaintenanceIssue(message),
            } satisfies DayIssueSummary;
          })
          .sort((a, b) => {
            const score = (x: DayIssueSummary) =>
              (x.priority === 'must_handle' ? 100 : 10) - (x.systemMaintenance ? 80 : 0);
            return score(b) - score(a);
          });

        topIssue = ranked[0];
        feasibilityHard =
          mustHandleCount > 0 ||
          ranked.some((i) => i.priority === 'must_handle' && !i.systemMaintenance);
        feasibilitySoft =
          suggestAdjustCount > 0 ||
          ranked.some(
            (i) =>
              !i.systemMaintenance &&
              (i.priority === 'suggest_adjust' || i.priority === 'pending_confirm'),
          );
      } catch (err) {
        this.logger.warn(`validateScope failed: ${(err as Error).message}`);
      }
    }

    if (localOverlap) {
      feasibilitySoft = true;
      if (!topIssue || topIssue.systemMaintenance) {
        topIssue = {
          issueId: 'local_overlap',
          priority: 'suggest_adjust',
          message: localOverlap.detail,
          affectedLabels: [localOverlap.a, localOverlap.b],
        };
      }
    }

    const dayPlanStatus = deriveDayPlanStatus({
      incompleteReason,
      feasibilityHard,
      feasibilitySoft,
      localOverlap: !!localOverlap,
      longestGap,
      minTransferMinutes,
      pendingBookingLabels,
      topIssue,
    });
    const daySeverity = dayPlanStatusToSeverity(dayPlanStatus);

    const versions: ContextHashVersionInputs = {
      relevantTripProjectionVersion:
        snapshotRef.effectivePlanVersionId ?? `rev_${snapshotRef.revision}`,
      relevantConstraintVersion: String(snapshotRef.constraintsVersion),
      relevantWorldStateVersion: [
        `day:${resolved.dayId ?? resolved.dayIndex ?? 'none'}`,
        `items:${dayItems.length}`,
        `book:${pendingBookingLabels.length}`,
        `gaps:${gaps.length}`,
        `status:${dayPlanStatus}`,
      ].join(':'),
      draftRevision,
    };

    let proposal: PlanProposal | undefined;
    let proposalError: string | undefined;
    let proposalActionType:
      | 'PREVIEW_REORDER'
      | 'ADD_BUFFER'
      | 'MOVE_TO_ANOTHER_DAY'
      | undefined;

    const needsRepairProposal =
      gate.ok &&
      (dayPlanStatus === 'BLOCKED' ||
        dayPlanStatus === 'TIGHT' ||
        (dayPlanStatus === 'OPTIMIZABLE' && !!localOverlap));

    if (needsRepairProposal && this.proposalBuilder && resolved.dayIndex != null) {
      const action = pickAiAction(topIssue, dayItems);
      try {
        if (action === 'add_buffer') {
          const slot = suggestBufferSlot(dayItems);
          proposal = await this.proposalBuilder.buildCreateGapProposal({
            tripId,
            userId: COPILOT_PREVIEW_USER,
            body: {
              dayIndex: resolved.dayIndex,
              startTime: slot.startTime,
              endTime: slot.endTime,
              label: '缓冲',
            },
          });
          proposalActionType = 'ADD_BUFFER';
        } else {
          proposal = await this.proposalBuilder.buildAiActionProposal({
            tripId,
            userId: COPILOT_PREVIEW_USER,
            body: {
              action,
              dayIndex: resolved.dayIndex,
            },
            answer: 'copilot-day-editor',
          });
          proposalActionType = 'PREVIEW_REORDER';
        }
      } catch (err) {
        proposalError = (err as Error).message;
        this.logger.warn(`day repair proposal failed: ${proposalError}`);
      }
    } else if (needsRepairProposal && !this.proposalBuilder) {
      proposalError = 'PLAN_PROPOSAL_BUILDER_UNAVAILABLE';
    }

    const allowedFactTokens = collectAllowedTokens({
      dayIndex: resolved.dayIndex,
      dayItems,
      topIssue,
      proposal,
      localOverlap,
      gaps,
      pendingBookingLabels,
      incompleteReason,
    });

    const selectedEntities: EntityProjection[] = [];
    if (resolved.dayIndex != null) {
      selectedEntities.push({
        ref: { entityType: 'DAY', entityId: String(resolved.dayIndex) },
        payload: {
          dayId: resolved.dayId,
          itemCount: dayItems.length,
          dayPlanStatus,
        },
      });
    }

    const availableActions: AvailableAction[] = [];
    if (dayPlanStatus === 'INCOMPLETE') {
      availableActions.push({
        actionType: 'GENERATE_DAY_DRAFT',
        ref: `day-draft:${resolved.dayIndex}`,
        kind: 'COMMAND',
      });
    }
    if (longestGap && longestGap.minutes >= DAY_GAP_OPTIMIZE_MINUTES) {
      availableActions.push({
        actionType: 'FILL_GAP',
        ref: `day-gap:${resolved.dayIndex}:${longestGap.startTime}`,
        kind: 'COMMAND',
      });
    }
    if (pendingBookingLabels.length > 0) {
      const lodgingPending = lodgingItems.filter((i) => i.needsBooking);
      availableActions.push({
        actionType: lodgingPending.length ? 'OPEN_LODGING' : 'CONFIRM_BOOKING',
        ref: lodgingPending[0]
          ? `lodging:${lodgingPending[0].itemId}`
          : `day-booking:${resolved.dayIndex}`,
        kind: 'NAVIGATION',
      });
    }
    if (proposal?.proposalId && proposalActionType) {
      availableActions.push({
        actionType: proposalActionType,
        ref: `plan-proposal:${proposal.proposalId}`,
        kind: 'PREVIEW',
      });
    }
    if (topIssue && !topIssue.systemMaintenance && topIssue.issueId !== 'local_overlap') {
      availableActions.push({
        actionType: 'OPEN_CONFLICT',
        ref: `feasibility-issue:${topIssue.issueId}`,
        kind: 'NAVIGATION',
      });
    }

    const authoritative: AuthoritativePageContext = {
      tripSnapshot: {
        tripVersion: versions.relevantTripProjectionVersion,
        payload: { snapshotId: snapshotRef.snapshotId },
      },
      relevantWorldState: {
        worldStateVersion: versions.relevantWorldStateVersion ?? 'none',
        payload: {
          dayPlanStatus,
          gaps,
          pendingBookingLabels,
        },
      },
      constraintAssessments: topIssue
        ? [{ assessmentId: topIssue.issueId, payload: topIssue }]
        : [],
      decisionProblems: [],
      selectedEntities,
      draftDelta:
        client.draftRef != null
          ? {
              draftId: client.draftRef.draftId,
              revision: client.draftRef.revision,
            }
          : undefined,
      availableActions,
      pageFocus: {
        pageId: client.pageId,
        lifecycle: client.lifecycle,
        selectedRefs: client.selectedRefs ?? [],
        viewport: client.viewport,
        recentAction: client.recentAction,
      },
    };

    return {
      authoritative,
      versions,
      gate,
      dayIndex: resolved.dayIndex,
      dayId: resolved.dayId,
      dayItems,
      dayPlanStatus,
      daySeverity,
      topIssue,
      mustHandleCount,
      suggestAdjustCount,
      activityCount: activityItems.length,
      lodgingCount: lodgingItems.length,
      pendingBookingLabels,
      confirmedActivityLabels,
      gaps,
      longestGap,
      minTransferMinutes,
      incompleteReason,
      proposal,
      proposalActionType,
      proposalError,
      localOverlap,
      allowedFactTokens,
    };
  }

  private async resolveDay(
    tripId: string,
    client: ClientPageState,
  ): Promise<{ dayIndex?: number; dayId?: string }> {
    const refs = client.selectedRefs ?? [];
    let dayIndex =
      client.viewport?.selectedDayIndex != null && client.viewport.selectedDayIndex >= 1
        ? client.viewport.selectedDayIndex
        : parseDayIndex(refs);
    let dayId: string | undefined =
      client.viewport?.selectedDayId ?? parseDayId(refs);

    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });

    if (dayId && dayIndex == null) {
      const idx = tripDays.findIndex((d) => d.id === dayId);
      if (idx >= 0) dayIndex = idx + 1;
    }
    if (dayIndex != null && !dayId && tripDays[dayIndex - 1]) {
      dayId = tripDays[dayIndex - 1]!.id;
    }
    return { dayIndex, dayId };
  }

  private async loadDayItems(dayId: string): Promise<DayItemSummary[]> {
    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: dayId },
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true,
        type: true,
        startTime: true,
        endTime: true,
        note: true,
        bookingStatus: true,
        Place: { select: { nameCN: true, nameEN: true } },
      },
    });
    return items.map((it) => {
      const status = (it.bookingStatus ?? '').toUpperCase();
      const needsBooking =
        PENDING_BOOKING_STATUSES.has(status) ||
        (!status && isLodging(it.type));
      return {
        itemId: it.id,
        label: it.Place?.nameCN || it.Place?.nameEN || it.note || it.type,
        startTime: it.startTime ? formatHhMm(it.startTime) : undefined,
        endTime: it.endTime ? formatHhMm(it.endTime) : undefined,
        type: it.type,
        bookingStatus: status || undefined,
        needsBooking,
      };
    });
  }
}

function deriveDayPlanStatus(input: {
  incompleteReason?: string;
  feasibilityHard: boolean;
  feasibilitySoft: boolean;
  localOverlap: boolean;
  longestGap?: DayGapSummary;
  minTransferMinutes?: number;
  pendingBookingLabels: string[];
  topIssue?: DayIssueSummary;
}): DayPlanStatus {
  if (input.feasibilityHard) return 'BLOCKED';
  if (input.incompleteReason) return 'INCOMPLETE';
  if (
    input.localOverlap ||
    (input.minTransferMinutes != null &&
      input.minTransferMinutes < DAY_BUFFER_TIGHT_MINUTES) ||
    (input.feasibilitySoft &&
      input.topIssue &&
      !input.topIssue.systemMaintenance &&
      /缓冲|过紧|驾驶|日落|关闭|营业|时间窗|转场/i.test(input.topIssue.message))
  ) {
    return 'TIGHT';
  }
  if (
    (input.longestGap && input.longestGap.minutes >= DAY_GAP_OPTIMIZE_MINUTES) ||
    input.pendingBookingLabels.length > 0 ||
    (input.feasibilitySoft && input.topIssue && !input.topIssue.systemMaintenance)
  ) {
    return 'OPTIMIZABLE';
  }
  return 'READY';
}

function isActivityLike(type: string): boolean {
  const t = type.toUpperCase();
  return ['ACTIVITY', 'POI', 'ATTRACTION', 'MEAL', 'LUNCH', 'HIKE', 'TOUR'].includes(t);
}

function isLodging(type: string): boolean {
  const t = type.toUpperCase();
  return ['ACCOMMODATION', 'HOTEL', 'LODGING', 'STAY'].includes(t);
}

function parseDayId(refs: EntityRef[]): string | undefined {
  for (const r of refs) {
    if (r.entityType.toUpperCase() === 'DAY' && !/^\d+$/.test(r.entityId)) {
      return r.entityId;
    }
  }
  return undefined;
}

function parseDayIndex(refs: EntityRef[]): number | undefined {
  for (const r of refs) {
    if (r.entityType.toUpperCase() === 'DAY' && /^\d+$/.test(r.entityId)) {
      const n = Number(r.entityId);
      if (n >= 1) return n;
    }
  }
  return undefined;
}

function formatHhMm(d: Date): string {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function detectLocalOverlap(
  items: DayItemSummary[],
): { a: string; b: string; detail: string } | undefined {
  const timed = items.filter((i) => i.startTime && i.endTime);
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i]!;
      const b = timed[j]!;
      const a0 = toMinutes(a.startTime!);
      const a1 = toMinutes(a.endTime!);
      const b0 = toMinutes(b.startTime!);
      const b1 = toMinutes(b.endTime!);
      if (a0 < b1 && b0 < a1) {
        return {
          a: a.label,
          b: b.label,
          detail: `「${a.label}」与「${b.label}」时间重叠。`,
        };
      }
    }
  }
  return undefined;
}

function detectGaps(items: DayItemSummary[]): DayGapSummary[] {
  const timed = items
    .filter((i) => i.startTime && i.endTime)
    .slice()
    .sort((a, b) => toMinutes(a.startTime!) - toMinutes(b.startTime!));
  const gaps: DayGapSummary[] = [];
  for (let i = 0; i < timed.length - 1; i += 1) {
    const cur = timed[i]!;
    const next = timed[i + 1]!;
    const end = toMinutes(cur.endTime!);
    const start = toMinutes(next.startTime!);
    const minutes = start - end;
    if (minutes >= DAY_GAP_OPTIMIZE_MINUTES) {
      gaps.push({
        afterLabel: cur.label,
        beforeLabel: next.label,
        startTime: cur.endTime!,
        endTime: next.startTime!,
        minutes,
      });
    }
  }
  return gaps;
}

function minPositiveTransfer(items: DayItemSummary[]): number | undefined {
  const timed = items
    .filter((i) => i.startTime && i.endTime)
    .slice()
    .sort((a, b) => toMinutes(a.startTime!) - toMinutes(b.startTime!));
  let min: number | undefined;
  for (let i = 0; i < timed.length - 1; i += 1) {
    const minutes = toMinutes(timed[i + 1]!.startTime!) - toMinutes(timed[i]!.endTime!);
    if (minutes >= 0 && (min == null || minutes < min)) min = minutes;
  }
  return min;
}

function pickAiAction(
  topIssue: DayIssueSummary | undefined,
  dayItems: DayItemSummary[],
): 'resolve_conflicts' | 'arrange_lunch' | 'optimize_route' | 'add_buffer' {
  const msg = `${topIssue?.message ?? ''} ${topIssue?.affectedLabels.join(' ') ?? ''}`;
  if (/午餐|午饭|meal|lunch/i.test(msg) || dayItems.some((i) => /MEAL|LUNCH/i.test(i.type))) {
    if (/午餐|午饭|lunch/i.test(msg)) return 'arrange_lunch';
  }
  if (/缓冲|buffer|密集|过紧/i.test(msg)) return 'add_buffer';
  if (/驾驶|车程|drive|route/i.test(msg)) return 'optimize_route';
  return 'resolve_conflicts';
}

function suggestBufferSlot(dayItems: DayItemSummary[]): {
  startTime: string;
  endTime: string;
} {
  const mid = dayItems.find((i) => i.endTime && toMinutes(i.endTime) >= 12 * 60);
  if (mid?.endTime) {
    const start = mid.endTime;
    const endMin = toMinutes(start) + 30;
    const nh = Math.floor(endMin / 60) % 24;
    const nm = endMin % 60;
    return {
      startTime: start,
      endTime: `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`,
    };
  }
  return { startTime: '14:00', endTime: '14:30' };
}

function collectAllowedTokens(input: {
  dayIndex?: number;
  dayItems: DayItemSummary[];
  topIssue?: DayIssueSummary;
  proposal?: PlanProposal;
  localOverlap?: { a: string; b: string; detail: string };
  gaps: DayGapSummary[];
  pendingBookingLabels: string[];
  incompleteReason?: string;
}): string[] {
  const tokens = new Set<string>();
  if (input.dayIndex != null) {
    tokens.add(String(input.dayIndex));
    tokens.add(`第${input.dayIndex}天`);
    tokens.add(`Day ${input.dayIndex}`);
  }
  for (const it of input.dayItems) {
    if (it.label) tokens.add(it.label);
    if (it.startTime) tokens.add(it.startTime);
    if (it.endTime) tokens.add(it.endTime);
  }
  for (const g of input.gaps) {
    tokens.add(g.startTime);
    tokens.add(g.endTime);
    tokens.add(g.afterLabel);
    tokens.add(g.beforeLabel);
  }
  for (const l of input.pendingBookingLabels) tokens.add(l);
  if (input.incompleteReason) tokens.add(input.incompleteReason);
  if (input.topIssue && !input.topIssue.systemMaintenance) {
    tokens.add(input.topIssue.message);
    for (const l of input.topIssue.affectedLabels) tokens.add(l);
  }
  if (input.localOverlap) {
    tokens.add(input.localOverlap.a);
    tokens.add(input.localOverlap.b);
    tokens.add(input.localOverlap.detail);
  }
  if (input.proposal) {
    for (const w of input.proposal.validation.warnings) tokens.add(w);
    for (const c of input.proposal.validation.conflicts) tokens.add(c.message);
    for (const t of input.proposal.tradeoffs) tokens.add(t);
    if (input.proposal.diff.summary) tokens.add(input.proposal.diff.summary);
    for (const ch of input.proposal.diff.timelineChanges) {
      tokens.add(ch.label);
      if (ch.from) tokens.add(ch.from);
      if (ch.to) tokens.add(ch.to);
    }
  }
  tokens.add('空档');
  tokens.add('住宿');
  tokens.add('预订');
  tokens.add('冰川');
  tokens.add('徒步');
  return [...tokens];
}
