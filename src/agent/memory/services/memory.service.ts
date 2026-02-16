// src/agent/memory/services/memory.service.ts

/**
 * Memory Service: 统一的内存读写接口
 * 
 * 提供 L1~L4 所有记忆层的读写能力
 * 
 * 注意：这是接口层，实际存储可以是数据库、Redis 等
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlywheelOutcomeService } from '../../../trips/decision/flywheel/flywheel-outcome.service';
import {
  UserTravelProfile,
  createDefaultUserTravelProfile,
  CompanionsInfo,
  DeviceInfo,
  TimeWindowConstraint,
  EmotionalState,
} from '../interfaces/user-travel-profile.interface';
import { RouteDirectionDecisionMemory } from '../interfaces/route-direction-decision-memory.interface';
import { RouteDirectionHealth } from '../interfaces/route-direction-health.interface';
import { TripOutcomeFeedback } from '../interfaces/trip-outcome-feedback.interface';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly useDatabase: boolean;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly flywheelOutcome?: FlywheelOutcomeService,
  ) {
    this.useDatabase = !!prisma && prisma.isDbConnected();
    if (this.useDatabase) {
      this.logger.log('MemoryService: Using database storage');
    } else {
      this.logger.warn(
        'MemoryService: Database not available, using in-memory storage. ' +
        'Data will be lost on service restart. ' +
        'To enable database storage, ensure DATABASE_URL is configured and the database is accessible. ' +
        'For development/testing without database, set ALLOW_NO_DATABASE=true.'
      );
    }
  }

  // 临时内存存储（当数据库不可用时使用）
  private userProfiles: Map<string, UserTravelProfile> = new Map();
  private decisionMemories: RouteDirectionDecisionMemory[] = [];
  private routeHealths: Map<string, RouteDirectionHealth> = new Map();
  private tripFeedbacks: TripOutcomeFeedback[] = [];

  // ========== L1: UserTravelProfile ==========

  /**
   * 读取用户画像
   */
  async getUserTravelProfile(userId: string): Promise<UserTravelProfile | null> {
    if (this.useDatabase && this.prisma) {
      try {
        const dbProfile = await this.prisma.userTravelProfile.findUnique({
          where: { userId },
        });

        if (dbProfile) {
          const extended = (dbProfile as any).extendedProfile as Record<string, unknown> | null;
          return {
            userId: dbProfile.userId,
            pacePreference: dbProfile.pacePreference as any,
            altitudeTolerance: dbProfile.altitudeTolerance as any,
            riskTolerance: dbProfile.riskTolerance as any,
            travelPhilosophy: dbProfile.travelPhilosophy as any,
            preferredRouteTypes: dbProfile.preferredRouteTypes as any,
            companions: extended?.companions as CompanionsInfo | undefined,
            deviceInfo: extended?.deviceInfo as DeviceInfo | undefined,
            timeWindow: extended?.timeWindow as TimeWindowConstraint | undefined,
            emotionalState: extended?.emotionalState as EmotionalState | undefined,
            drivingFatiguePreferences: extended?.drivingFatiguePreferences as UserTravelProfile['drivingFatiguePreferences'],
            confidence: dbProfile.confidence,
            source: dbProfile.source as any,
            updatedAt: dbProfile.updatedAt,
          };
        }
      } catch (error) {
        this.logger.warn(`Failed to read user profile from database: ${error}`);
      }
    }

    // 内存存储或数据库查询失败
    const profile = this.userProfiles.get(userId);
    if (profile) {
      return profile;
    }

    // 如果不存在，返回默认值
    return createDefaultUserTravelProfile(userId);
  }

  /**
   * 写入用户画像
   */
  async saveUserTravelProfile(profile: UserTravelProfile): Promise<void> {
    profile.updatedAt = new Date();

    if (this.useDatabase && this.prisma) {
      try {
        const extendedProfile =
          profile.companions ||
          profile.deviceInfo ||
          profile.timeWindow ||
          profile.emotionalState ||
          profile.drivingFatiguePreferences
            ? {
                ...(profile.companions && { companions: profile.companions }),
                ...(profile.deviceInfo && { deviceInfo: profile.deviceInfo }),
                ...(profile.timeWindow && { timeWindow: profile.timeWindow }),
                ...(profile.emotionalState && { emotionalState: profile.emotionalState }),
                ...(profile.drivingFatiguePreferences && {
                  drivingFatiguePreferences: profile.drivingFatiguePreferences,
                }),
              }
            : undefined;

        await this.prisma.userTravelProfile.upsert({
          where: { userId: profile.userId },
          create: {
            userId: profile.userId,
            pacePreference: profile.pacePreference,
            altitudeTolerance: profile.altitudeTolerance,
            riskTolerance: profile.riskTolerance,
            travelPhilosophy: profile.travelPhilosophy,
            preferredRouteTypes: profile.preferredRouteTypes || [],
            confidence: profile.confidence,
            source: profile.source,
            extendedProfile: extendedProfile as any,
            updatedAt: profile.updatedAt,
          },
          update: {
            pacePreference: profile.pacePreference,
            altitudeTolerance: profile.altitudeTolerance,
            riskTolerance: profile.riskTolerance,
            travelPhilosophy: profile.travelPhilosophy,
            preferredRouteTypes: profile.preferredRouteTypes || [],
            confidence: profile.confidence,
            source: profile.source,
            extendedProfile: extendedProfile as any,
            updatedAt: profile.updatedAt,
          },
        });
        this.logger.debug(`Saved user travel profile to database for user: ${profile.userId}`);
        return;
      } catch (error) {
        this.logger.warn(`Failed to save user profile to database: ${error}, falling back to memory`);
      }
    }

    // 内存存储
    this.userProfiles.set(profile.userId, profile);
    this.logger.debug(`Saved user travel profile to memory for user: ${profile.userId}`);
  }

  /**
   * 更新用户画像（增量更新）
   */
  async updateUserTravelProfile(
    userId: string,
    updates: Partial<UserTravelProfile>
  ): Promise<UserTravelProfile> {
    const existing = await this.getUserTravelProfile(userId);
    if (!existing) {
      throw new Error(`User profile not found: ${userId}`);
    }

    const updated: UserTravelProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    await this.saveUserTravelProfile(updated);
    return updated;
  }

  // ========== L2: RouteDirectionDecisionMemory ==========

  /**
   * 保存路线决策记忆
   */
  async saveRouteDirectionDecision(memory: RouteDirectionDecisionMemory): Promise<void> {
    if (this.useDatabase && this.prisma) {
      try {
        await this.prisma.routeDirectionDecision.create({
          data: {
            id: memory.id,
            userId: memory.userId,
            tripId: memory.tripId,
            countryCode: memory.countryCode,
            month: memory.month,
            selectedRouteDirectionId: memory.selectedRouteDirectionId,
            rejectedRouteDirectionIds: memory.rejectedRouteDirectionIds,
            keyConstraints: memory.keyConstraints as any,
            scoreBreakdown: memory.scoreBreakdown as any,
            explanation: memory.explanation as any,
            createdAt: memory.createdAt,
          },
        });
        this.logger.debug(
          `Saved route direction decision to database: ${memory.selectedRouteDirectionId} for user: ${memory.userId}`
        );
        return;
      } catch (error) {
        this.logger.warn(`Failed to save decision memory to database: ${error}, falling back to memory`);
      }
    }

    // 内存存储
    this.decisionMemories.push(memory);
    this.logger.debug(
      `Saved route direction decision to memory: ${memory.selectedRouteDirectionId} for user: ${memory.userId}`
    );
  }

  /**
   * 查询用户的路线决策历史
   */
  async getUserRouteDirectionDecisions(
    userId: string,
    countryCode?: string
  ): Promise<RouteDirectionDecisionMemory[]> {
    if (this.useDatabase && this.prisma) {
      try {
        const where: any = { userId };
        if (countryCode) {
          where.countryCode = countryCode;
        }

        const dbMemories = await this.prisma.routeDirectionDecision.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 100, // 限制返回数量
        });

        return dbMemories.map(m => ({
          id: m.id,
          userId: m.userId,
          tripId: m.tripId || undefined,
          countryCode: m.countryCode,
          month: m.month,
          selectedRouteDirectionId: m.selectedRouteDirectionId,
          rejectedRouteDirectionIds: m.rejectedRouteDirectionIds,
          keyConstraints: m.keyConstraints as any,
          scoreBreakdown: m.scoreBreakdown as any,
          explanation: m.explanation as any,
          createdAt: m.createdAt,
        }));
      } catch (error) {
        this.logger.warn(`Failed to query decision memories from database: ${error}, falling back to memory`);
      }
    }

    // 内存存储
    return this.decisionMemories.filter(m => {
      if (m.userId !== userId) return false;
      if (countryCode && m.countryCode !== countryCode) return false;
      return true;
    });
  }

  // ========== L3: RouteDirectionHealth ==========

  /**
   * 读取路线健康度
   */
  async getRouteDirectionHealth(
    routeDirectionId: number,
    countryCode: string
  ): Promise<RouteDirectionHealth | null> {
    if (this.useDatabase && this.prisma) {
      try {
        const dbHealth = await this.prisma.routeDirectionHealth.findUnique({
          where: {
            routeDirectionId_countryCode: {
              routeDirectionId,
              countryCode,
            },
          },
        });

        if (dbHealth) {
          return {
            routeDirectionId: dbHealth.routeDirectionId,
            countryCode: dbHealth.countryCode,
            totalRuns: dbHealth.totalRuns,
            successRuns: dbHealth.successRuns,
            failureRuns: dbHealth.failureRuns,
            commonFailureReasons: dbHealth.commonFailureReasons,
            commonRepairs: dbHealth.commonRepairs,
            lastUpdated: dbHealth.lastUpdated,
          };
        }
      } catch (error) {
        this.logger.warn(`Failed to read route health from database: ${error}`);
      }
    }

    // 内存存储
    const key = `${routeDirectionId}_${countryCode}`;
    return this.routeHealths.get(key) || null;
  }

  /**
   * 更新路线健康度
   */
  async updateRouteDirectionHealth(
    routeDirectionId: number,
    countryCode: string,
    success: boolean,
    failureReason?: string,
    repair?: string
  ): Promise<RouteDirectionHealth> {
    if (this.useDatabase && this.prisma) {
      try {
        // 先读取现有数据
        const existing = await this.prisma.routeDirectionHealth.findUnique({
          where: {
            routeDirectionId_countryCode: {
              routeDirectionId,
              countryCode,
            },
          },
        });

        const currentTotalRuns = existing?.totalRuns || 0;
        const currentSuccessRuns = existing?.successRuns || 0;
        const currentFailureRuns = existing?.failureRuns || 0;
        const currentFailureReasons = existing?.commonFailureReasons || [];
        const currentRepairs = existing?.commonRepairs || [];

        // 更新数据
        const newFailureReasons = failureReason && !currentFailureReasons.includes(failureReason)
          ? [...currentFailureReasons, failureReason]
          : currentFailureReasons;
        const newRepairs = repair && !currentRepairs.includes(repair)
          ? [...currentRepairs, repair]
          : currentRepairs;

        const updated = await this.prisma.routeDirectionHealth.upsert({
          where: {
            routeDirectionId_countryCode: {
              routeDirectionId,
              countryCode,
            },
          },
          create: {
            routeDirectionId,
            countryCode,
            totalRuns: 1,
            successRuns: success ? 1 : 0,
            failureRuns: success ? 0 : 1,
            commonFailureReasons: newFailureReasons,
            commonRepairs: newRepairs,
            lastUpdated: new Date(),
          },
          update: {
            totalRuns: currentTotalRuns + 1,
            successRuns: success ? currentSuccessRuns + 1 : currentSuccessRuns,
            failureRuns: success ? currentFailureRuns : currentFailureRuns + 1,
            commonFailureReasons: newFailureReasons,
            commonRepairs: newRepairs,
            lastUpdated: new Date(),
          },
        });

        this.logger.debug(
          `Updated route direction health in database: ${routeDirectionId} (${countryCode}) - ` +
          `success: ${success}, total: ${updated.totalRuns}`
        );

        return {
          routeDirectionId: updated.routeDirectionId,
          countryCode: updated.countryCode,
          totalRuns: updated.totalRuns,
          successRuns: updated.successRuns,
          failureRuns: updated.failureRuns,
          commonFailureReasons: updated.commonFailureReasons,
          commonRepairs: updated.commonRepairs,
          lastUpdated: updated.lastUpdated,
        };
      } catch (error) {
        this.logger.warn(`Failed to update route health in database: ${error}, falling back to memory`);
      }
    }

    // 内存存储
    const key = `${routeDirectionId}_${countryCode}`;
    const existing = this.routeHealths.get(key);

    const health: RouteDirectionHealth = existing || {
      routeDirectionId,
      countryCode,
      totalRuns: 0,
      successRuns: 0,
      failureRuns: 0,
      commonFailureReasons: [],
      commonRepairs: [],
      lastUpdated: new Date(),
    };

    health.totalRuns += 1;
    if (success) {
      health.successRuns += 1;
    } else {
      health.failureRuns += 1;
      if (failureReason && !health.commonFailureReasons.includes(failureReason)) {
        health.commonFailureReasons.push(failureReason);
      }
    }

    if (repair && !health.commonRepairs.includes(repair)) {
      health.commonRepairs.push(repair);
    }

    health.lastUpdated = new Date();
    this.routeHealths.set(key, health);

    this.logger.debug(
      `Updated route direction health in memory: ${routeDirectionId} (${countryCode}) - ` +
      `success: ${success}, total: ${health.totalRuns}`
    );

    return health;
  }

  // ========== L4: TripOutcomeFeedback ==========

  /**
   * 保存行程反馈
   */
  async saveTripOutcomeFeedback(feedback: TripOutcomeFeedback): Promise<void> {
    if (this.useDatabase && this.prisma) {
      try {
        await this.prisma.tripOutcomeFeedback.upsert({
          where: { tripId: feedback.tripId },
          create: {
            tripId: feedback.tripId,
            userId: feedback.userId,
            overallSuccess: feedback.overallSuccess,
            fatigueLevel: feedback.fatigueLevel,
            satisfaction: feedback.satisfaction,
            abandoned: feedback.abandoned,
            failurePoints: feedback.failurePoints,
            notes: feedback.notes,
            createdAt: feedback.createdAt,
          },
          update: {
            overallSuccess: feedback.overallSuccess,
            fatigueLevel: feedback.fatigueLevel,
            satisfaction: feedback.satisfaction,
            abandoned: feedback.abandoned,
            failurePoints: feedback.failurePoints,
            notes: feedback.notes,
          },
        });
        this.logger.debug(`Saved trip outcome feedback to database for trip: ${feedback.tripId}`);
      } catch (error) {
        this.logger.warn(`Failed to save feedback to database: ${error}, falling back to memory`);
        // 继续执行内存存储和学习
      }
    }

    // 内存存储
    this.tripFeedbacks.push(feedback);
    this.logger.debug(`Saved trip outcome feedback to memory for trip: ${feedback.tripId}`);

    // Phase 2：数据飞轮 Layer 3
    if (this.flywheelOutcome) {
      this.flywheelOutcome
        .upsertOutcome({
          tripId: feedback.tripId,
          userId: feedback.userId,
          subjectiveFeedback: {
            fatigueLevel: feedback.fatigueLevel,
            satisfaction: feedback.satisfaction,
          },
          failureSignals: {
            planAbandoned: feedback.abandoned,
            earlyReturn: feedback.abandoned || !feedback.overallSuccess,
            daySkipped: feedback.failurePoints,
          },
        })
        .catch(() => {});
    }

    // 自动触发学习更新
    await this.learnFromFeedback(feedback);
  }

  /**
   * 从反馈中学习
   */
  private async learnFromFeedback(feedback: TripOutcomeFeedback): Promise<void> {
    // 更新用户画像
    const profile = await this.getUserTravelProfile(feedback.userId);
    if (profile) {
      // 如果疲劳度高，降低 pace
      if (feedback.fatigueLevel && feedback.fatigueLevel >= 4) {
        if (profile.pacePreference === 'FAST') {
          await this.updateUserTravelProfile(feedback.userId, {
            pacePreference: 'MODERATE',
            confidence: Math.min(1.0, profile.confidence + 0.05),
          });
        } else if (profile.pacePreference === 'MODERATE') {
          await this.updateUserTravelProfile(feedback.userId, {
            pacePreference: 'SLOW',
            confidence: Math.min(1.0, profile.confidence + 0.05),
          });
        }
      }

      // 如果成功，提高置信度
      if (feedback.overallSuccess && feedback.satisfaction && feedback.satisfaction >= 4) {
        await this.updateUserTravelProfile(feedback.userId, {
          confidence: Math.min(1.0, profile.confidence + 0.05),
        });
      }
    }
  }

  /**
   * 查询用户的行程反馈历史
   */
  async getUserTripFeedbacks(userId: string): Promise<TripOutcomeFeedback[]> {
    if (this.useDatabase && this.prisma) {
      try {
        const dbFeedbacks = await this.prisma.tripOutcomeFeedback.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 100, // 限制返回数量
        });

        return dbFeedbacks.map(f => ({
          tripId: f.tripId,
          userId: f.userId,
          overallSuccess: f.overallSuccess,
          fatigueLevel: f.fatigueLevel || undefined,
          satisfaction: f.satisfaction || undefined,
          abandoned: f.abandoned,
          failurePoints: f.failurePoints,
          notes: f.notes || undefined,
          createdAt: f.createdAt,
        }));
      } catch (error) {
        this.logger.warn(`Failed to query feedbacks from database: ${error}, falling back to memory`);
      }
    }

    // 内存存储
    return this.tripFeedbacks.filter(f => f.userId === userId);
  }
}

