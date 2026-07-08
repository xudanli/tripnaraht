/**
 * PR-B — persist RFC-001 DecisionProblem records on trip.metadata.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import {
  resolveExcessiveDailyLoadDayIndex,
} from '../detection/excessive-daily-load-problem.util';

const METADATA_KEY = 'rfc001DecisionProblems';
const MAX_PROBLEMS = 100;

export interface StoredRfc001DecisionProblems {
  items: Rfc001DecisionProblem[];
  lastUpdatedAt?: string;
}

@Injectable()
export class Rfc001DecisionProblemStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tripId: string): Promise<Rfc001DecisionProblem[]> {
    const block = await this.readBlock(tripId);
    return block.items;
  }

  async get(
    tripId: string,
    problemId: string,
  ): Promise<Rfc001DecisionProblem | undefined> {
    const items = await this.list(tripId);
    return items.find((p) => p.problemId === problemId);
  }

  async upsert(
    tripId: string,
    problem: Rfc001DecisionProblem,
  ): Promise<Rfc001DecisionProblem> {
    const block = await this.readBlock(tripId);
    const idx = block.items.findIndex((p) => p.problemId === problem.problemId);
    const items =
      idx >= 0
        ? block.items.map((p, i) => (i === idx ? problem : p))
        : [...block.items, problem].slice(-MAX_PROBLEMS);

    await this.writeBlock(tripId, { items });
    return problem;
  }

  async findOpenByTriggerEvent(
    tripId: string,
    triggerEventId: string,
  ): Promise<Rfc001DecisionProblem | undefined> {
    const items = await this.list(tripId);
    return items.find(
      (p) =>
        p.triggerEventId === triggerEventId &&
        !['RESOLVED', 'FAILED'].includes(p.status),
    );
  }

  async findOpenExcessiveDailyLoadByDay(
    tripId: string,
    dayIndex: number,
  ): Promise<Rfc001DecisionProblem | undefined> {
    const items = await this.list(tripId);
    const matches = items.filter((p) => {
      if (['RESOLVED', 'FAILED'].includes(p.status)) return false;
      if (
        p.semanticCapability !== 'EXCESSIVE_DAILY_LOAD' &&
        p.type !== 'EXCESSIVE_LOAD'
      ) {
        return false;
      }
      return resolveExcessiveDailyLoadDayIndex(p) === dayIndex;
    });
    if (!matches.length) return undefined;
    return matches.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))[0];
  }

  /** Mark duplicate open load problems on the same day as FAILED (keep one). */
  async supersedeDuplicateOpenLoadProblems(
    tripId: string,
    dayIndex: number,
    keepProblemId: string,
  ): Promise<void> {
    const block = await this.readBlock(tripId);
    let changed = false;
    const items = block.items.map((p) => {
      if (p.problemId === keepProblemId) return p;
      if (['RESOLVED', 'FAILED'].includes(p.status)) return p;
      if (
        p.semanticCapability !== 'EXCESSIVE_DAILY_LOAD' &&
        p.type !== 'EXCESSIVE_LOAD'
      ) {
        return p;
      }
      if (resolveExcessiveDailyLoadDayIndex(p) !== dayIndex) return p;
      changed = true;
      return { ...p, status: 'FAILED' as const };
    });
    if (changed) {
      await this.writeBlock(tripId, { items });
    }
  }

  private async readBlock(tripId: string): Promise<StoredRfc001DecisionProblems> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as StoredRfc001DecisionProblems | undefined;
    return { items: block?.items ?? [], lastUpdatedAt: block?.lastUpdatedAt };
  }

  private async writeBlock(
    tripId: string,
    block: StoredRfc001DecisionProblems,
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
