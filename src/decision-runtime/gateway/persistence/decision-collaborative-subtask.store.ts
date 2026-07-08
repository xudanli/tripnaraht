/**
 * Decision Problem resolution follow-up sub-tasks (Collab SSOT).
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';

const METADATA_KEY = 'decisionProblemCollaborativeSubTasks';

export type DecisionCollaborativeSubTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type DecisionCollaborativeSubTaskKind =
  | 'ACCOMMODATION_LOOKUP'
  | 'CANCELLATION_POLICY'
  | 'TEAM_CONFIRM'
  | 'BOOKING_FOLLOWUP'
  | 'OTHER';

export interface StoredDecisionCollaborativeSubTask {
  id: string;
  tripId: string;
  problemId: string;
  resolutionId: string;
  actionPlanId?: string;
  kind: DecisionCollaborativeSubTaskKind;
  title: string;
  description?: string;
  status: DecisionCollaborativeSubTaskStatus;
  assigneeUserId?: string;
  /** Snapshot of decision problem title at create/seed time */
  problemTitle?: string;
  createdAt: string;
  createdByUserId: string;
}

export interface DecisionCollaborativeSubTaskStoreState {
  items: StoredDecisionCollaborativeSubTask[];
}

@Injectable()
export class DecisionCollaborativeSubTaskStoreService {
  constructor(private readonly prisma: PrismaService) {}

  read(metadata: unknown): DecisionCollaborativeSubTaskStoreState {
    const root = (metadata ?? {}) as Record<string, unknown>;
    const raw = root[METADATA_KEY] as DecisionCollaborativeSubTaskStoreState | undefined;
    return { items: [...(raw?.items ?? [])] };
  }

  async listForTrip(tripId: string): Promise<StoredDecisionCollaborativeSubTask[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return this.read(trip?.metadata).items;
  }

  async listForResolution(
    tripId: string,
    resolutionId: string,
  ): Promise<StoredDecisionCollaborativeSubTask[]> {
    const items = await this.listForTrip(tripId);
    return items.filter((item) => item.resolutionId === resolutionId);
  }

  async getById(
    tripId: string,
    subTaskId: string,
  ): Promise<StoredDecisionCollaborativeSubTask | undefined> {
    const items = await this.listForTrip(tripId);
    return items.find((item) => item.id === subTaskId);
  }

  async update(
    tripId: string,
    subTaskId: string,
    patch: Partial<
      Pick<
        StoredDecisionCollaborativeSubTask,
        'status' | 'assigneeUserId' | 'title' | 'description' | 'actionPlanId' | 'problemTitle'
      >
    >,
  ): Promise<StoredDecisionCollaborativeSubTask | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const state = this.read(meta);
    const index = state.items.findIndex((item) => item.id === subTaskId);
    if (index < 0) return undefined;

    const current = state.items[index];
    state.items[index] = {
      ...current,
      ...patch,
      title: patch.title?.trim() ?? current.title,
      description: patch.description !== undefined ? patch.description?.trim() : current.description,
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: state,
        }),
      },
    });

    return state.items[index];
  }

  async syncActionPlanIdForResolution(
    tripId: string,
    resolutionId: string,
    actionPlanId: string,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const state = this.read(meta);
    let changed = false;

    for (const item of state.items) {
      if (item.resolutionId === resolutionId && item.actionPlanId !== actionPlanId) {
        item.actionPlanId = actionPlanId;
        changed = true;
      }
    }

    if (!changed) return;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: state,
        }),
      },
    });
  }

  async create(
    tripId: string,
    input: Omit<StoredDecisionCollaborativeSubTask, 'id' | 'createdAt' | 'tripId'>,
  ): Promise<StoredDecisionCollaborativeSubTask> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const state = this.read(meta);

    const item: StoredDecisionCollaborativeSubTask = {
      id: `csub_${randomUUID().slice(0, 12)}`,
      tripId,
      createdAt: new Date().toISOString(),
      ...input,
    };

    state.items.push(item);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: state,
        }),
      },
    });

    return item;
  }

  async remove(tripId: string, subTaskId: string): Promise<boolean> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const state = this.read(meta);
    const index = state.items.findIndex((item) => item.id === subTaskId);
    if (index < 0) return false;

    state.items.splice(index, 1);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: state,
        }),
      },
    });

    return true;
  }
}
