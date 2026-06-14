import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { GuardianDebateService } from '../../decision/optimization/learning/guardian-debate.service';
import { DEFAULT_NEGOTIATION_CONFIG } from '../../decision/optimization/learning/guardian-persona.interface';
import { NegotiateContextLoaderService } from '../../decision/optimization/collaboration/negotiate-context-loader.service';
import type {
  ReadinessGuardianNegotiationSnapshot,
  ReadinessGuardianNegotiationSummary,
} from '../types/coverage-map.types';
import {
  extractGuardianNegotiationSnapshot,
  isReadinessGuardianNegotiationEnabled,
  mapNegotiationResultToSummary,
  mergeGuardianNegotiationSnapshot,
} from '../utils/readiness-guardian-negotiation.util';

@Injectable()
export class ReadinessGuardianNegotiationService {
  private readonly logger = new Logger(ReadinessGuardianNegotiationService.name);
  private guardianDebate?: GuardianDebateService;
  private negotiateLoader?: NegotiateContextLoaderService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  isEnabled(): boolean {
    return isReadinessGuardianNegotiationEnabled() && Boolean(this.getGuardianDebate());
  }

  loadSnapshot(tripId: string): Promise<ReadinessGuardianNegotiationSnapshot | undefined> {
    return this.prisma.trip
      .findUnique({
        where: { id: tripId },
        select: { metadata: true },
      })
      .then((trip) => (trip ? extractGuardianNegotiationSnapshot(trip.metadata) : undefined));
  }

  async negotiateForTrip(
    tripId: string,
    phase: ReadinessGuardianNegotiationSummary['phase'],
    context?: { repairActionType?: string; blockerId?: string },
  ): Promise<ReadinessGuardianNegotiationSummary | undefined> {
    const debate = this.getGuardianDebate();
    const loader = this.getNegotiateLoader();
    if (!debate || !loader) {
      this.logger.debug('GuardianDebateService 或 NegotiateContextLoaderService 不可用，跳过博弈');
      return undefined;
    }

    try {
      const { plan, world } = await loader.loadPlanAndWorld(tripId);
      const result = await debate.negotiate(plan, world, DEFAULT_NEGOTIATION_CONFIG);
      return mapNegotiationResultToSummary(result, {
        phase,
        tripId,
        repairActionType: context?.repairActionType,
        blockerId: context?.blockerId,
      });
    } catch (error) {
      this.logger.warn(
        `三人格博弈失败 trip=${tripId} phase=${phase}: ${(error as Error).message}`,
      );
      return undefined;
    }
  }

  async persistSnapshot(
    tripId: string,
    snapshot: ReadinessGuardianNegotiationSnapshot,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) return;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: mergeGuardianNegotiationSnapshot(trip.metadata, snapshot),
      },
    });
  }

  async runRepairNegotiation(input: {
    tripId: string;
    repairActionType: string;
    blockerId?: string;
    runPreRepair?: boolean;
  }): Promise<ReadinessGuardianNegotiationSnapshot | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    const snapshot: ReadinessGuardianNegotiationSnapshot = {};
    if (input.runPreRepair !== false) {
      snapshot.preRepair = await this.negotiateForTrip(input.tripId, 'pre_repair', input);
    }
    snapshot.postRepair = await this.negotiateForTrip(input.tripId, 'post_repair', input);
    snapshot.latest = snapshot.postRepair ?? snapshot.preRepair;

    if (!snapshot.latest) {
      return undefined;
    }

    await this.persistSnapshot(input.tripId, snapshot);
    return snapshot;
  }

  private getGuardianDebate(): GuardianDebateService | null {
    if (this.guardianDebate) return this.guardianDebate;
    try {
      this.guardianDebate = this.moduleRef.get(GuardianDebateService, { strict: false });
      return this.guardianDebate;
    } catch {
      return null;
    }
  }

  private getNegotiateLoader(): NegotiateContextLoaderService | null {
    if (this.negotiateLoader) return this.negotiateLoader;
    try {
      this.negotiateLoader = this.moduleRef.get(NegotiateContextLoaderService, { strict: false });
      return this.negotiateLoader;
    } catch {
      return null;
    }
  }
}
