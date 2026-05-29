// src/skills/detail/detail-understand-status.skill.ts
/**
 * skill.detail.understandStatus
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripStatusUnderstanding } from './shared/detail-state.types';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import {
  extractOpportunitiesFromTripData,
  extractRisksFromDecisionLogs,
  loadDecisionLogsForTrip,
  loadDetailTripData,
} from './utils/detail-data.util';

export interface DetailUnderstandStatusInput extends SkillInput {
  tripId: string;
  tripData?: any;
}

export interface DetailUnderstandStatusOutput extends SkillOutput {
  statusUnderstanding: TripStatusUnderstanding;
  degraded?: boolean;
  degradedReason?: string;
}

@Injectable()
export class DetailUnderstandStatusSkill implements Skill<DetailUnderstandStatusInput, DetailUnderstandStatusOutput> {
  private readonly logger = new Logger(DetailUnderstandStatusSkill.name);
  private decisionLogStorage?: DecisionLogStorageService;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private getDecisionLogStorage(): DecisionLogStorageService | null {
    if (!this.decisionLogStorage) {
      try {
        this.decisionLogStorage = this.moduleRef.get(DecisionLogStorageService, { strict: false });
      } catch {
        return null;
      }
    }
    return this.decisionLogStorage ?? null;
  }

  metadata = {
    name: 'detail.understandStatus',
    description: 'detail.understandStatus：理解当前行程状态（规划中/进行中/已完成），识别下一步行动和风险',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: DetailUnderstandStatusInput): Promise<DetailUnderstandStatusOutput> {
    this.logger.debug(`执行 detail.understandStatus: tripId=${input.tripId}`);

    let tripData = input.tripData;
    let degraded = false;
    let degradedReason: string | undefined;

    if (!tripData && this.prisma) {
      const loaded = await loadDetailTripData(this.prisma, input.tripId);
      if (loaded) {
        tripData = loaded;
      } else {
        degraded = true;
        degradedReason = `Trip ${input.tripId} not found`;
        tripData = {};
      }
    } else if (!tripData) {
      degraded = true;
      degradedReason = 'PrismaService unavailable and tripData not provided';
      tripData = {};
    }

    const now = new Date();
    const startDate = tripData.startDate ? new Date(tripData.startDate) : null;
    const endDate = tripData.endDate ? new Date(tripData.endDate) : null;

    let currentPhase: TripStatusUnderstanding['currentPhase'] = 'PLANNING';
    if (tripData.status === 'CANCELLED') {
      currentPhase = 'CANCELLED';
    } else if (startDate && endDate) {
      if (now < startDate) {
        currentPhase = 'PLANNING';
      } else if (now >= startDate && now <= endDate) {
        currentPhase = 'IN_PROGRESS';
      } else {
        currentPhase = 'COMPLETED';
      }
    }

    const totalItems =
      tripData.days?.reduce((sum: number, day: any) => sum + (day.items?.length || 0), 0) || 0;
    const completedItems =
      tripData.days?.reduce((sum: number, day: any) => {
        return sum + (day.items?.filter((item: any) => item.completed).length || 0);
      }, 0) || 0;

    const progress = {
      completed: completedItems,
      total: totalItems,
      percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
    };

    const nextSteps: TripStatusUnderstanding['nextSteps'] = [];
    if (currentPhase === 'PLANNING') {
      nextSteps.push({ step: '确认行程细节', priority: 'high' });
      nextSteps.push({ step: '准备行前清单', priority: 'medium' });
    } else if (currentPhase === 'IN_PROGRESS') {
      nextSteps.push({ step: '查看今日行程', priority: 'high' });
      nextSteps.push({ step: '确认交通安排', priority: 'medium' });
    }

    let risks: TripStatusUnderstanding['risks'] = [];
    const storage = this.getDecisionLogStorage();
    if (storage) {
      try {
        const logs = await loadDecisionLogsForTrip(storage, input.tripId);
        risks = extractRisksFromDecisionLogs(logs);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`加载决策日志失败: ${msg}`);
      }
    }

    const opportunities = tripData.days ? extractOpportunitiesFromTripData(tripData) : [];

    return {
      statusUnderstanding: {
        currentPhase,
        progress,
        nextSteps,
        risks,
        opportunities,
      },
      ...(degraded ? { degraded, degradedReason } : {}),
    };
  }
}
