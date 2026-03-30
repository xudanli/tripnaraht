/**
 * DSO 反馈持久化服务
 *
 * 专利实施例 6.1.5：用户反馈通过 STATE_UPDATE 原子写入 DSO
 * 实现 IDsoFeedbackPersistence，从 Trip/TripRun 加载 DSO、持久化回 Trip.metadata
 * 当 TripRun.tripId 为 null 时，使用 TripRun.metadata 作为回退存储
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StateCommitConflictError, type DecisionState } from '../../../decision/kernel/decision-state.types';
import type { IDsoFeedbackPersistence } from '../../../decision/kernel/dso-feedback-persistence.interface';

const METADATA_DSO_KEY = 'dso';

/** 解析结果：tripId 存在时用 Trip；否则用 TripRun（tripRunId 有值表示 tripId 为 null） */
interface ResolveResult {
  tripId?: string;
  tripRunId?: string;
}

@Injectable()
export class DsoFeedbackPersistenceService implements IDsoFeedbackPersistence {
  constructor(private readonly prisma: PrismaService) {}

  async getDso(tripRunIdOrTripId: string): Promise<DecisionState | undefined> {
    const resolved = await this.resolve(tripRunIdOrTripId);
    const requestId = resolved.tripId ?? resolved.tripRunId ?? tripRunIdOrTripId;

    if (resolved.tripId) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: resolved.tripId },
        select: { metadata: true },
      });
      if (!trip?.metadata || typeof trip.metadata !== 'object') return undefined;
      const dso = (trip.metadata as Record<string, unknown>)[METADATA_DSO_KEY];
      if (!dso || typeof dso !== 'object') return undefined;
      return this.normalizeDso(dso as Record<string, unknown>, requestId);
    }

    if (resolved.tripRunId) {
      const run = await this.prisma.tripRun.findUnique({
        where: { id: resolved.tripRunId },
        select: { metadata: true },
      });
      if (!run?.metadata || typeof run.metadata !== 'object') return undefined;
      const dso = (run.metadata as Record<string, unknown>)[METADATA_DSO_KEY];
      if (!dso || typeof dso !== 'object') return undefined;
      return this.normalizeDso(dso as Record<string, unknown>, requestId);
    }

    return undefined;
  }

  async persistDso(
    tripRunIdOrTripId: string,
    dso: DecisionState,
    options?: { expectedVersion?: number },
  ): Promise<void> {
    const resolved = await this.resolve(tripRunIdOrTripId);
    const payload = JSON.parse(JSON.stringify(dso));

    if (resolved.tripId) {
      const existing = (await this.prisma.trip.findUnique({
        where: { id: resolved.tripId },
        select: { metadata: true },
      }))?.metadata;
      const actualVersion = this.extractDsoVersion(existing);
      if (
        typeof options?.expectedVersion === 'number' &&
        typeof actualVersion === 'number' &&
        actualVersion !== options.expectedVersion
      ) {
        throw new StateCommitConflictError(options.expectedVersion, actualVersion);
      }
      const metadata = {
        ...(typeof existing === 'object' && existing ? (existing as Record<string, unknown>) : {}),
        [METADATA_DSO_KEY]: payload,
      };
      await this.prisma.trip.update({
        where: { id: resolved.tripId },
        data: { metadata },
      });
      return;
    }

    if (resolved.tripRunId) {
      const existing = (await this.prisma.tripRun.findUnique({
        where: { id: resolved.tripRunId },
        select: { metadata: true },
      }))?.metadata;
      const actualVersion = this.extractDsoVersion(existing);
      if (
        typeof options?.expectedVersion === 'number' &&
        typeof actualVersion === 'number' &&
        actualVersion !== options.expectedVersion
      ) {
        throw new StateCommitConflictError(options.expectedVersion, actualVersion);
      }
      const metadata = {
        ...(typeof existing === 'object' && existing ? (existing as Record<string, unknown>) : {}),
        [METADATA_DSO_KEY]: payload,
      };
      await this.prisma.tripRun.update({
        where: { id: resolved.tripRunId },
        data: { metadata },
      });
    }
  }

  /** trip_id 或 trip_run_id → { tripId?, tripRunId? }；tripId 优先；tripRunId 仅当 TripRun 存在且 tripId 为 null 时设置 */
  private async resolve(tripRunIdOrTripId: string): Promise<ResolveResult> {
    const byTrip = await this.prisma.trip.findUnique({
      where: { id: tripRunIdOrTripId },
      select: { id: true },
    });
    if (byTrip) return { tripId: byTrip.id };

    const byRun = await this.prisma.tripRun.findUnique({
      where: { id: tripRunIdOrTripId },
      select: { tripId: true },
    });
    if (byRun) {
      if (byRun.tripId) return { tripId: byRun.tripId };
      return { tripRunId: tripRunIdOrTripId };
    }
    return {};
  }

  private extractDsoVersion(metadata: unknown): number | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const dso = (metadata as Record<string, unknown>)[METADATA_DSO_KEY];
    if (!dso || typeof dso !== 'object') return undefined;
    const version = (dso as Record<string, unknown>)?.systemState as Record<string, unknown> | undefined;
    const n = version?.version;
    return typeof n === 'number' ? n : undefined;
  }

  private normalizeDso(raw: Record<string, unknown>, requestId: string): DecisionState {
    return {
      userIntent: (raw.userIntent as DecisionState['userIntent']) ?? {},
      tripState: (raw.tripState as DecisionState['tripState']) ?? {},
      environmentState: (raw.environmentState as DecisionState['environmentState']) ?? {},
      systemState: {
        ...((raw.systemState as DecisionState['systemState']) ?? {}),
        requestId: String((raw.systemState as Record<string, unknown>)?.requestId ?? requestId),
      },
      requestId,
      ...(raw.constraints !== undefined && { constraints: raw.constraints as DecisionState['constraints'] }),
      ...(raw.contextPackage !== undefined && { contextPackage: raw.contextPackage as DecisionState['contextPackage'] }),
      ...(raw.history !== undefined && { history: raw.history as DecisionState['history'] }),
      ...(raw.confidence !== undefined && { confidence: raw.confidence as number }),
      ...(raw.feedback !== undefined && { feedback: raw.feedback as DecisionState['feedback'] }),
      ...(raw.travelOntologyState !== undefined && { travelOntologyState: raw.travelOntologyState as DecisionState['travelOntologyState'] }),
    };
  }
}
