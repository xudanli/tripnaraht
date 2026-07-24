/**
 * Activity Editor Authoritative Page Context builder.
 * Refs only from client; re-fetches day plan + runs arrange-itinerary proposal preview.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import { PlanProposalBuilderService } from '../../arrange-itinerary/services/plan-proposal-builder.service';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import type { PlanProposal } from '../../arrange-itinerary/types/plan-proposal.types';
import type {
  AuthoritativePageContext,
  AvailableAction,
  ClientPageState,
  EntityProjection,
  EntityRef,
} from '../contracts/page-insight.types';
import type { ContextHashVersionInputs } from './page-insight-context-hash.service';

const COPILOT_PREVIEW_USER = 'copilot-context-builder';
const DEFAULT_DURATION_MINUTES = 120;

export interface ActivityEditorContextGate {
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
}

export interface ActivityEditorBuiltContext {
  authoritative: AuthoritativePageContext;
  versions: ContextHashVersionInputs;
  gate: ActivityEditorContextGate;
  placeId?: number;
  placeName?: string;
  dayIndex?: number;
  dayId?: string;
  dayItems: DayItemSummary[];
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  proposal?: PlanProposal;
  proposalError?: string;
  /** Tokens allowed in advisor copy (numbers / labels from facts). */
  allowedFactTokens: string[];
}

@Injectable()
export class ActivityEditorPageContextBuilder {
  private readonly logger = new Logger(ActivityEditorPageContextBuilder.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly proposalBuilder?: PlanProposalBuilderService,
    @Optional() private readonly snapshotAssembler?: TripContextSnapshotAssemblerService,
  ) {}

  async build(tripId: string, client: ClientPageState): Promise<ActivityEditorBuiltContext> {
    const missing: string[] = [];
    if (client.pageMode !== 'ACTIVITY_EDITOR') missing.push('pageMode');
    if (client.insightScope !== 'ACTIVITY') missing.push('insightScope');

    const resolved = await this.resolveActivityAndDay(tripId, client);
    if (!resolved.placeId) missing.push('activity');
    if (resolved.dayIndex == null) missing.push('targetDay');

    const gate: ActivityEditorContextGate = {
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

    const versions: ContextHashVersionInputs = {
      relevantTripProjectionVersion:
        snapshotRef.effectivePlanVersionId ?? `rev_${snapshotRef.revision}`,
      relevantConstraintVersion: String(snapshotRef.constraintsVersion),
      relevantWorldStateVersion: undefined,
      draftRevision,
    };

    const dayItems = resolved.dayId
      ? await this.loadDayItems(resolved.dayId)
      : [];

    const slot = computeAppendSlot(dayItems);
    const startTime = slot.startTime;
    const endTime = slot.endTime;
    const durationMinutes = slot.durationMinutes;

    let proposal: PlanProposal | undefined;
    let proposalError: string | undefined;

    if (gate.ok && this.proposalBuilder && resolved.placeId != null && resolved.dayIndex != null) {
      try {
        proposal = await this.proposalBuilder.buildCreateItemProposal({
          tripId,
          userId: COPILOT_PREVIEW_USER,
          body: {
            dayIndex: resolved.dayIndex,
            type: ItemType.ACTIVITY,
            placeId: resolved.placeId,
            placeName: resolved.placeName,
            startTime,
            endTime,
            insertMode: 'append',
          },
        });
      } catch (err) {
        proposalError = (err as Error).message;
        this.logger.warn(`proposal preview failed: ${proposalError}`);
      }
    } else if (gate.ok && !this.proposalBuilder) {
      proposalError = 'PLAN_PROPOSAL_BUILDER_UNAVAILABLE';
    }

    const allowedFactTokens = collectAllowedTokens({
      placeName: resolved.placeName,
      dayIndex: resolved.dayIndex,
      startTime,
      endTime,
      durationMinutes,
      dayItems,
      proposal,
    });

    const selectedEntities: EntityProjection[] = [];
    if (resolved.placeId != null) {
      selectedEntities.push({
        ref: { entityType: 'POI', entityId: String(resolved.placeId) },
        payload: { placeName: resolved.placeName },
      });
    }
    if (resolved.dayIndex != null) {
      selectedEntities.push({
        ref: { entityType: 'DAY', entityId: String(resolved.dayIndex) },
        payload: { dayId: resolved.dayId, itemCount: dayItems.length },
      });
    }

    const availableActions: AvailableAction[] = [];
    if (proposal?.proposalId) {
      availableActions.push({
        actionType: 'PREVIEW_ADD_ACTIVITY',
        ref: `plan-proposal:${proposal.proposalId}`,
        kind: 'PREVIEW',
      });
    }

    const authoritative: AuthoritativePageContext = {
      tripSnapshot: {
        tripVersion: versions.relevantTripProjectionVersion,
        payload: { snapshotId: snapshotRef.snapshotId },
      },
      relevantWorldState: {
        worldStateVersion: versions.relevantWorldStateVersion ?? 'none',
      },
      constraintAssessments: [],
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
      placeId: resolved.placeId,
      placeName: resolved.placeName,
      dayIndex: resolved.dayIndex,
      dayId: resolved.dayId,
      dayItems,
      startTime,
      endTime,
      durationMinutes,
      proposal,
      proposalError,
      allowedFactTokens,
    };
  }

  private async resolveActivityAndDay(
    tripId: string,
    client: ClientPageState,
  ): Promise<{
    placeId?: number;
    placeName?: string;
    dayIndex?: number;
    dayId?: string;
  }> {
    const refs = client.selectedRefs ?? [];
    let placeId = parsePlaceId(refs);
    let dayIndex = parseDayIndex(refs, client);
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

    let placeName: string | undefined;
    if (placeId != null) {
      const place = await this.prisma.place.findUnique({
        where: { id: placeId },
        select: { nameCN: true, nameEN: true },
      });
      placeName = place?.nameCN || place?.nameEN || undefined;
    }

    return { placeId, placeName, dayIndex, dayId };
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
        Place: { select: { nameCN: true, nameEN: true } },
      },
    });
    return items.map((it) => ({
      itemId: it.id,
      label: it.Place?.nameCN || it.Place?.nameEN || it.note || it.type,
      startTime: it.startTime ? formatHhMm(it.startTime) : undefined,
      endTime: it.endTime ? formatHhMm(it.endTime) : undefined,
      type: it.type,
    }));
  }
}

function parsePlaceId(refs: EntityRef[]): number | undefined {
  for (const r of refs) {
    const t = r.entityType.toUpperCase();
    if (t === 'POI' || t === 'PLACE' || t === 'ACTIVITY_PRODUCT' || t === 'ACTIVITY') {
      const n = Number(r.entityId);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

function parseDayId(refs: EntityRef[]): string | undefined {
  for (const r of refs) {
    if (r.entityType.toUpperCase() === 'DAY' && !/^\d+$/.test(r.entityId)) {
      return r.entityId;
    }
  }
  return undefined;
}

function parseDayIndex(refs: EntityRef[], client: ClientPageState): number | undefined {
  if (client.viewport?.selectedDayIndex != null && client.viewport.selectedDayIndex >= 1) {
    return client.viewport.selectedDayIndex;
  }
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

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function computeAppendSlot(dayItems: DayItemSummary[]): {
  startTime: string;
  endTime: string;
  durationMinutes: number;
} {
  const durationMinutes = DEFAULT_DURATION_MINUTES;
  const lastEnd = [...dayItems].reverse().find((i) => i.endTime)?.endTime;
  const startTime = lastEnd ?? '10:00';
  const endTime = addMinutes(startTime, durationMinutes);
  return { startTime, endTime, durationMinutes };
}

function collectAllowedTokens(input: {
  placeName?: string;
  dayIndex?: number;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  dayItems: DayItemSummary[];
  proposal?: PlanProposal;
}): string[] {
  const tokens = new Set<string>();
  if (input.placeName) tokens.add(input.placeName);
  if (input.dayIndex != null) {
    tokens.add(String(input.dayIndex));
    tokens.add(`第${input.dayIndex}天`);
  }
  if (input.startTime) tokens.add(input.startTime);
  if (input.endTime) tokens.add(input.endTime);
  if (input.durationMinutes != null) {
    tokens.add(String(input.durationMinutes));
    tokens.add(String(Math.round(input.durationMinutes / 60)));
  }
  for (const it of input.dayItems) {
    if (it.label) tokens.add(it.label);
    if (it.startTime) tokens.add(it.startTime);
    if (it.endTime) tokens.add(it.endTime);
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
  return [...tokens];
}
