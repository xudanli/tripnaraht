/**
 * PR-C — Decision Workspace persistence (short-lived, trip.metadata).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';

const METADATA_KEY = 'rfc001DecisionWorkspaces';
const MAX_WORKSPACES = 50;

export interface StoredDecisionWorkspaces {
  items: DecisionWorkspace[];
  lastUpdatedAt?: string;
}

@Injectable()
export class DecisionWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromProblem(
    problem: Rfc001DecisionProblem,
    preferenceSnapshotId?: string,
  ): Promise<DecisionWorkspace> {
    const workspace: DecisionWorkspace = {
      workspaceId: `ws_${problem.problemId}`,
      problemId: problem.problemId,
      basePlanVersionId: problem.planVersionId,
      worldStateSnapshotId: problem.worldStateSnapshotId,
      preferenceSnapshotId: preferenceSnapshotId ?? `pref_${problem.tripId}_default`,
      constraintAssertions: [],
      loadAssessments: [],
      repairCandidates: [],
      createdAt: new Date().toISOString(),
      revision: 1,
      status: 'COLLECTING',
    };
    await this.save(problem.tripId, workspace);
    return workspace;
  }

  async get(tripId: string, workspaceId: string): Promise<DecisionWorkspace | undefined> {
    const block = await this.readBlock(tripId);
    return block.items.find((w) => w.workspaceId === workspaceId);
  }

  async getByProblemId(
    tripId: string,
    problemId: string,
  ): Promise<DecisionWorkspace | undefined> {
    const block = await this.readBlock(tripId);
    return block.items.find((w) => w.problemId === problemId);
  }

  async save(tripId: string, workspace: DecisionWorkspace): Promise<DecisionWorkspace> {
    const block = await this.readBlock(tripId);
    const idx = block.items.findIndex((w) => w.workspaceId === workspace.workspaceId);
    const items =
      idx >= 0
        ? block.items.map((w, i) => (i === idx ? workspace : w))
        : [...block.items, workspace].slice(-MAX_WORKSPACES);
    await this.writeBlock(tripId, { items });
    return workspace;
  }

  async markReady(tripId: string, workspaceId: string): Promise<DecisionWorkspace> {
    const ws = await this.get(tripId, workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    return this.save(tripId, {
      ...ws,
      status: 'READY_FOR_FINALIZE',
      revision: ws.revision + 1,
    });
  }

  async markFinalized(tripId: string, workspaceId: string): Promise<DecisionWorkspace> {
    const ws = await this.get(tripId, workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    return this.save(tripId, {
      ...ws,
      status: 'FINALIZED',
      revision: ws.revision + 1,
    });
  }

  async list(tripId: string): Promise<DecisionWorkspace[]> {
    return (await this.readBlock(tripId)).items;
  }

  private async readBlock(tripId: string): Promise<StoredDecisionWorkspaces> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as StoredDecisionWorkspaces | undefined;
    return { items: block?.items ?? [], lastUpdatedAt: block?.lastUpdatedAt };
  }

  private async writeBlock(
    tripId: string,
    block: StoredDecisionWorkspaces,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: {
            ...block,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });
  }
}
