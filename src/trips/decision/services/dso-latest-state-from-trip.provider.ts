/**
 * 从 Trip.metadata 读取最新 DSO 的提供者
 *
 * 用于多代理并发提交：当 StateCommitConflictError 发生时，
 * 从 Trip.metadata.dso 读取最新状态后重试 commit。
 *
 * 约定：Kernel DSO 存储在 Trip.metadata.dso
 * 主流程完成时需将 decisionState 写入该字段（由 route-and-run 或规划助手负责）
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { IDsoLatestStateProvider } from '../../../decision/kernel/dso-latest-state-provider.interface';

const METADATA_DSO_KEY = 'dso';

@Injectable()
export class DsoLatestStateFromTripProvider implements IDsoLatestStateProvider {
  constructor(private readonly prisma: PrismaService) {}

  async getLatest(requestId: string): Promise<DecisionState | undefined> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: requestId },
        select: { metadata: true },
      });
      if (!trip?.metadata) return undefined;

      const meta = trip.metadata as Record<string, unknown>;
      const dso = meta[METADATA_DSO_KEY] as unknown;
      if (!dso || typeof dso !== 'object') return undefined;

      return this.normalizeToKernelDecisionState(dso as Record<string, unknown>, requestId);
    } catch {
      return undefined;
    }
  }

  private normalizeToKernelDecisionState(raw: Record<string, unknown>, requestId: string): DecisionState {
    return {
      userIntent: (raw.userIntent as DecisionState['userIntent']) ?? {},
      tripState: (raw.tripState as DecisionState['tripState']) ?? {},
      environmentState: (raw.environmentState as DecisionState['environmentState']) ?? {},
      systemState: {
        ...((raw.systemState as DecisionState['systemState']) ?? {}),
        requestId: (raw.systemState as any)?.requestId ?? requestId,
      },
      requestId,
      ...(raw.constraints !== undefined && { constraints: raw.constraints as DecisionState['constraints'] }),
      ...(raw.contextPackage !== undefined && { contextPackage: raw.contextPackage as DecisionState['contextPackage'] }),
      ...(raw.history !== undefined && { history: raw.history as DecisionState['history'] }),
      ...(raw.confidence !== undefined && { confidence: raw.confidence as number }),
      ...(raw.travelOntologyState !== undefined && { travelOntologyState: raw.travelOntologyState as DecisionState['travelOntologyState'] }),
    };
  }
}
