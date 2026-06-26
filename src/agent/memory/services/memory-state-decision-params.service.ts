import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionParams } from '../interfaces/decision-params.interface';
import type { MemoryStateV1 } from '../schemas/memory-state.schema.v1';
import { MEMORY_STATE_SCHEMA_VERSION } from '../schemas/memory-state.schema.v1';
import {
  applyMemoryStateV1ToDecisionParams,
  type MemoryStateKnobAudit,
} from '../utils/memory-state-decision-params.mapper';

@Injectable()
export class MemoryStateDecisionParamsService {
  constructor(private readonly prisma: PrismaService) {}

  async loadMemoryState(userId: string): Promise<MemoryStateV1 | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const raw = (profile?.preferences as Record<string, unknown> | null)?.memory_state_v1;
    if (!raw || typeof raw !== 'object') return null;
    const ms = raw as MemoryStateV1;
    if (ms.schemaVersion !== MEMORY_STATE_SCHEMA_VERSION) return null;
    return ms;
  }

  applyOverlay(
    params: DecisionParams,
    memory: MemoryStateV1 | null,
    now = new Date(),
  ): { params: DecisionParams; audit: MemoryStateKnobAudit[] } {
    return applyMemoryStateV1ToDecisionParams(params, memory, now);
  }

  async overlayForUser(
    userId: string,
    params: DecisionParams,
  ): Promise<{ params: DecisionParams; audit: MemoryStateKnobAudit[] }> {
    const memory = await this.loadMemoryState(userId);
    return this.applyOverlay(params, memory);
  }
}
