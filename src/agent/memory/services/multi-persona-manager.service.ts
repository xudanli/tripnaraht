// src/agent/memory/services/multi-persona-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  UserPersona,
  MultiPersonaUserTravelProfile,
  PersonaContext,
  PersonaChangeSignals,
  PersonaChangeResult,
} from '../interfaces/multi-persona.interface';
import { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import { PersonaIdentificationService } from './persona-identification.service';

/**
 * 多persona管理服务
 * 
 * 管理用户的多persona存储和检索：
 * - 存储和检索多persona
 * - 激活和切换persona
 * - 同步到数据库
 */
@Injectable()
export class MultiPersonaManagerService {
  private readonly logger = new Logger(MultiPersonaManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly personaIdentification: PersonaIdentificationService,
  ) {}

  /**
   * 获取用户的多persona画像
   */
  async getMultiPersonaProfile(userId: string): Promise<MultiPersonaUserTravelProfile | null> {
    try {
      const profile = await this.prisma.userTravelProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        return null;
      }

      // 从metadata中提取personas
      const metadata = (profile as any).metadata || {};
      const personas: UserPersona[] = metadata.personas || [];
      const currentPersona = metadata.currentPersona || null;

      return {
        userId: profile.userId,
        personas: personas.map(p => this.deserializePersona(p)),
        currentPersona: currentPersona || undefined,
        baseProfile: {
          pacePreference: profile.pacePreference as any,
          altitudeTolerance: profile.altitudeTolerance as any,
          riskTolerance: profile.riskTolerance as any,
          travelPhilosophy: profile.travelPhilosophy as any,
          preferredRouteTypes: profile.preferredRouteTypes as any,
        },
        confidence: profile.confidence,
        source: profile.source as any,
        updatedAt: profile.updatedAt,
      };
    } catch (error) {
      this.logger.error(`获取多persona画像失败: ${error}`, error instanceof Error ? error.stack : undefined);
      return null;
    }
  }

  /**
   * 保存多persona画像
   */
  async saveMultiPersonaProfile(
    profile: MultiPersonaUserTravelProfile,
  ): Promise<void> {
    try {
      // 序列化personas到metadata
      const serializedPersonas = profile.personas.map(p => this.serializePersona(p));

      await this.prisma.userTravelProfile.upsert({
        where: { userId: profile.userId },
        create: {
          userId: profile.userId,
          pacePreference: profile.baseProfile.pacePreference,
          altitudeTolerance: profile.baseProfile.altitudeTolerance,
          riskTolerance: profile.baseProfile.riskTolerance,
          travelPhilosophy: profile.baseProfile.travelPhilosophy,
          preferredRouteTypes: profile.baseProfile.preferredRouteTypes,
          confidence: profile.confidence,
          source: profile.source,
          // Note: UserTravelProfile doesn't have metadata field in Prisma schema
          // Store personas data separately if needed
        },
        update: {
          pacePreference: profile.baseProfile.pacePreference,
          altitudeTolerance: profile.baseProfile.altitudeTolerance,
          riskTolerance: profile.baseProfile.riskTolerance,
          travelPhilosophy: profile.baseProfile.travelPhilosophy,
          preferredRouteTypes: profile.baseProfile.preferredRouteTypes,
          confidence: profile.confidence,
          source: profile.source,
          updatedAt: new Date(),
          // Note: UserTravelProfile doesn't have metadata field in Prisma schema
        },
      });

      this.logger.log(`保存多persona画像成功: ${profile.userId}`);
    } catch (error) {
      this.logger.error(`保存多persona画像失败: ${error}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * 添加或更新persona
   */
  async addOrUpdatePersona(
    userId: string,
    persona: UserPersona,
  ): Promise<void> {
    const profile = await this.getMultiPersonaProfile(userId);
    if (!profile) {
      throw new Error(`用户画像不存在: ${userId}`);
    }

    // 查找是否已存在同名persona
    const existingIndex = profile.personas.findIndex(p => p.personaName === persona.personaName);
    if (existingIndex >= 0) {
      // 更新现有persona
      profile.personas[existingIndex] = persona;
    } else {
      // 添加新persona
      profile.personas.push(persona);
    }

    await this.saveMultiPersonaProfile(profile);
  }

  /**
   * 激活persona
   */
  async activatePersona(userId: string, personaName: string): Promise<void> {
    const profile = await this.getMultiPersonaProfile(userId);
    if (!profile) {
      throw new Error(`用户画像不存在: ${userId}`);
    }

    const persona = profile.personas.find(p => p.personaName === personaName);
    if (!persona) {
      throw new Error(`Persona不存在: ${personaName}`);
    }

    profile.currentPersona = personaName;
    persona.usageCount += 1;
    persona.updatedAt = new Date();

    await this.saveMultiPersonaProfile(profile);
  }

  /**
   * 从基础画像创建多persona画像
   */
  async createMultiPersonaFromBaseProfile(
    baseProfile: UserTravelProfile,
    context: PersonaContext,
  ): Promise<MultiPersonaUserTravelProfile> {
    const { persona } = await this.personaIdentification.identifyCurrentPersona(baseProfile, context);

    return {
      userId: baseProfile.userId,
      personas: [persona],
      currentPersona: persona.personaName,
      baseProfile: {
        pacePreference: baseProfile.pacePreference,
        altitudeTolerance: baseProfile.altitudeTolerance,
        riskTolerance: baseProfile.riskTolerance,
        travelPhilosophy: baseProfile.travelPhilosophy,
        preferredRouteTypes: baseProfile.preferredRouteTypes,
      },
      confidence: baseProfile.confidence,
      source: baseProfile.source,
      updatedAt: new Date(),
    };
  }

  /**
   * 检测并更新persona变化
   */
  async detectAndUpdatePersonaChange(
    userId: string,
    signals: PersonaChangeSignals,
  ): Promise<PersonaChangeResult> {
    const profile = await this.getMultiPersonaProfile(userId);
    if (!profile || !profile.currentPersona) {
      return {
        hasChanged: false,
        changeReasons: [],
      };
    }

    const currentPersona = profile.personas.find(p => p.personaName === profile.currentPersona);
    if (!currentPersona) {
      return {
        hasChanged: false,
        changeReasons: [],
      };
    }

    const changeResult = this.personaIdentification.detectPersonaChange(currentPersona, signals);

    if (changeResult.hasChanged && changeResult.newPersona) {
      // 更新persona
      const index = profile.personas.findIndex(p => p.personaName === currentPersona.personaName);
      if (index >= 0) {
        profile.personas[index] = changeResult.newPersona;
        await this.saveMultiPersonaProfile(profile);
      }
    }

    return changeResult;
  }

  // ========== 序列化辅助方法 ==========

  /**
   * 序列化persona（用于存储到数据库）
   */
  private serializePersona(persona: UserPersona): any {
    return {
      ...persona,
      createdAt: persona.createdAt.toISOString(),
      updatedAt: persona.updatedAt.toISOString(),
      activityHistory: persona.activityHistory.map(activity => ({
        ...activity,
        timestamp: activity.timestamp.toISOString(),
      })),
    };
  }

  /**
   * 反序列化persona（从数据库读取）
   */
  private deserializePersona(data: any): UserPersona {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      activityHistory: (data.activityHistory || []).map((activity: any) => ({
        ...activity,
        timestamp: new Date(activity.timestamp),
      })),
    };
  }
}
