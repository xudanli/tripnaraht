import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FitnessAssessmentService } from '../trips/decision/services/fitness-assessment.service';
import {
  mergeTrekkingFitnessBaselines,
  projectBaselineFromHumanCapability,
} from './engine/trekking-fitness-baseline.engine';
import type { TrekkingFitnessBaseline } from './types/physical-fitness-gate.types';
import { parseTrekkingFitnessBaseline } from './util/trekking-fitness-baseline.util';

const BASELINE_KEY = 'trekking_fitness_baseline';

@Injectable()
export class TrekkingFitnessBaselineService {
  private readonly logger = new Logger(TrekkingFitnessBaselineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly fitnessAssessment?: FitnessAssessmentService,
  ) {}

  /** Layer 0 SSOT：stored baseline ∪ HumanCapability 问卷投影 */
  async resolveForUser(userId: string): Promise<TrekkingFitnessBaseline> {
    const stored = await this.readStored(userId);
    const projected = await this.loadProjectedFromQuestionnaire(userId);
    return mergeTrekkingFitnessBaselines(stored, projected);
  }

  async upsert(userId: string, baseline: TrekkingFitnessBaseline): Promise<void> {
    const row = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
      select: { extendedProfile: true },
    });
    const ext = (row?.extendedProfile as Record<string, unknown> | null) ?? {};
    const extendedProfile = {
      ...ext,
      [BASELINE_KEY]: { ...baseline, updatedAt: new Date().toISOString() },
    } as unknown as Prisma.InputJsonValue;

    await this.prisma.userTravelProfile.upsert({
      where: { userId },
      update: { extendedProfile },
      create: {
        userId,
        preferredRouteTypes: [],
        extendedProfile,
        source: 'explicit',
        confidence: 0.85,
      },
    });
  }

  private async readStored(userId: string): Promise<TrekkingFitnessBaseline | null> {
    const row = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
      select: { extendedProfile: true },
    });
    const ext = (row?.extendedProfile as Record<string, unknown> | null) ?? null;
    const raw = ext?.[BASELINE_KEY];
    if (!raw || typeof raw !== 'object') return null;
    return parseTrekkingFitnessBaseline(ext);
  }

  private async loadProjectedFromQuestionnaire(
    userId: string,
  ): Promise<TrekkingFitnessBaseline | null> {
    if (!this.fitnessAssessment) return null;
    try {
      const model = await this.fitnessAssessment.loadUserModel(userId);
      if (!model) return null;
      return projectBaselineFromHumanCapability(model);
    } catch (e) {
      this.logger.warn(`问卷投影失败 user=${userId}: ${(e as Error).message}`);
      return null;
    }
  }
}
