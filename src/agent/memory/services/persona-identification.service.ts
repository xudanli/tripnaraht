// src/agent/memory/services/persona-identification.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  UserPersona,
  PersonaContext,
  PersonaChangeSignals,
  PersonaChangeResult,
  MultiPersonaUserTravelProfile,
  PhysicalState,
  PsychologicalState,
  TimeState,
  PreferenceState,
} from '../interfaces/multi-persona.interface';
import { UserTravelProfile } from '../interfaces/user-travel-profile.interface';

/**
 * 人格识别服务
 * 
 * 实现多人格用户画像的核心功能：
 * - 识别用户当前人格
 * - 检测人格变化
 * - 管理多persona
 */
@Injectable()
export class PersonaIdentificationService {
  private readonly logger = new Logger(PersonaIdentificationService.name);

  /**
   * 识别用户当前人格
   */
  async identifyCurrentPersona(
    userProfile: UserTravelProfile | MultiPersonaUserTravelProfile,
    currentContext: PersonaContext,
  ): Promise<{ persona: UserPersona; confidence: number }> {
    // 如果是多persona画像，从personas中选择
    if ('personas' in userProfile && userProfile.personas.length > 0) {
      return this.selectBestMatchingPersona(userProfile.personas, currentContext);
    }

    // 否则，基于当前上下文和基础画像创建新persona
    return this.createPersonaFromProfile(userProfile, currentContext);
  }

  /**
   * 检测人格变化
   */
  detectPersonaChange(
    oldPersona: UserPersona,
    newSignals: PersonaChangeSignals,
  ): PersonaChangeResult {
    const changes: string[] = [];
    let changeMagnitude = 0;
    let changeType: 'GRADUAL' | 'ABRUPT' | 'TEMPORARY' = 'GRADUAL';

    // 检测物理状态变化
    if (newSignals.physical) {
      const physicalChanges = this.detectPhysicalChanges(
        oldPersona.currentState.physical,
        newSignals.physical,
      );
      if (physicalChanges.hasChanged) {
        changes.push(...physicalChanges.reasons);
        changeMagnitude = Math.max(changeMagnitude, physicalChanges.magnitude);
      }
    }

    // 检测心理状态变化
    if (newSignals.psychological) {
      const psychologicalChanges = this.detectPsychologicalChanges(
        oldPersona.currentState.psychological,
        newSignals.psychological,
      );
      if (psychologicalChanges.hasChanged) {
        changes.push(...psychologicalChanges.reasons);
        changeMagnitude = Math.max(changeMagnitude, psychologicalChanges.magnitude);
      }
    }

    // 检测时间状态变化
    if (newSignals.temporal) {
      const temporalChanges = this.detectTemporalChanges(
        oldPersona.currentState.temporal,
        newSignals.temporal,
      );
      if (temporalChanges.hasChanged) {
        changes.push(...temporalChanges.reasons);
        changeMagnitude = Math.max(changeMagnitude, temporalChanges.magnitude);
      }
    }

    // 检测偏好变化
    if (newSignals.preferences) {
      const preferenceChanges = this.detectPreferenceChanges(
        oldPersona.preferences,
        newSignals.preferences,
      );
      if (preferenceChanges.hasChanged) {
        changes.push(...preferenceChanges.reasons);
        changeMagnitude = Math.max(changeMagnitude, preferenceChanges.magnitude);
      }
    }

    // 判断变化类型
    if (changeMagnitude > 0.7) {
      changeType = 'ABRUPT';
    } else if (changeMagnitude > 0.3) {
      changeType = 'GRADUAL';
    } else {
      changeType = 'TEMPORARY';
    }

    const hasChanged = changes.length > 0 && changeMagnitude > 0.2;

    // 如果有显著变化，创建新persona
    let newPersona: UserPersona | undefined;
    if (hasChanged && changeMagnitude > 0.5) {
      newPersona = this.createUpdatedPersona(oldPersona, newSignals);
    }

    return {
      hasChanged,
      changeType,
      changeMagnitude,
      changeReasons: changes,
      newPersona,
    };
  }

  /**
   * 创建或更新persona
   */
  async createOrUpdatePersona(
    userProfile: MultiPersonaUserTravelProfile,
    personaName: string,
    context: PersonaContext,
    signals?: PersonaChangeSignals,
  ): Promise<UserPersona> {
    // 查找是否已存在同名persona
    const existingPersona = userProfile.personas.find(p => p.personaName === personaName);

    if (existingPersona && signals) {
      // 更新现有persona
      return this.updatePersona(existingPersona, signals);
    } else if (existingPersona) {
      // 返回现有persona
      return existingPersona;
    } else {
      // 创建新persona
      return this.createNewPersona(personaName, context, userProfile.baseProfile);
    }
  }

  /**
   * 获取最适合的persona
   */
  getBestMatchingPersona(
    userProfile: MultiPersonaUserTravelProfile,
    context: PersonaContext,
  ): UserPersona | null {
    if (userProfile.personas.length === 0) {
      return null;
    }

    const { persona } = this.selectBestMatchingPersona(userProfile.personas, context);
    return persona;
  }

  // ========== 私有辅助方法 ==========

  /**
   * 选择最佳匹配的persona
   */
  private selectBestMatchingPersona(
    personas: UserPersona[],
    context: PersonaContext,
  ): { persona: UserPersona; confidence: number } {
    let bestPersona = personas[0];
    let bestScore = 0;

    for (const persona of personas) {
      const score = this.calculatePersonaMatchScore(persona, context);
      if (score > bestScore) {
        bestScore = score;
        bestPersona = persona;
      }
    }

    return {
      persona: bestPersona,
      confidence: bestScore,
    };
  }

  /**
   * 计算persona匹配分数
   */
  private calculatePersonaMatchScore(persona: UserPersona, context: PersonaContext): number {
    let score = 0;
    let factors = 0;

    // 匹配旅行类型
    if (context.situation?.tripPurpose && persona.tripType.includes(context.situation.tripPurpose)) {
      score += 0.3;
    }
    factors += 0.3;

    // 匹配社交偏好
    if (context.social?.socialPreference) {
      const socialMatch = this.matchSocialPreference(persona, context.social.socialPreference);
      score += socialMatch * 0.2;
    }
    factors += 0.2;

    // 匹配时间状态
    if (context.situation?.constraints) {
      const timeMatch = this.matchTimeConstraints(persona, context.situation.constraints);
      score += timeMatch * 0.3;
    }
    factors += 0.3;

    // 使用频率（更常用的persona优先）
    score += Math.min(persona.usageCount / 10, 0.2);
    factors += 0.2;

    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * 从基础画像创建persona
   */
  private createPersonaFromProfile(
    userProfile: UserTravelProfile,
    context: PersonaContext,
  ): { persona: UserPersona; confidence: number } {
    const persona: UserPersona = {
      personaName: this.generatePersonaName(context),
      tripType: context.situation?.tripPurpose || 'GENERAL',
      currentState: {
        physical: {
          fitnessLevel: 5,
          fatigueLevel: 0.3,
          healthStatus: 'GOOD',
        },
        psychological: {
          stressLevel: 0.3,
          excitementLevel: 0.6,
          confidenceLevel: 0.5,
          mood: 'POSITIVE',
        },
        temporal: {
          availableDays: 7,
          timePressure: 0.3,
          timeFlexibility: 'MEDIUM',
          tripStage: 'PLANNING',
        },
      },
      preferences: {
        pacePreference: userProfile.pacePreference,
        altitudeTolerance: userProfile.altitudeTolerance,
        riskTolerance: userProfile.riskTolerance,
        travelPhilosophy: userProfile.travelPhilosophy,
        preferredRouteTypes: userProfile.preferredRouteTypes,
      },
      activityHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      confidence: userProfile.confidence,
    };

    return {
      persona,
      confidence: userProfile.confidence,
    };
  }

  /**
   * 创建新persona
   */
  private createNewPersona(
    personaName: string,
    context: PersonaContext,
    baseProfile: MultiPersonaUserTravelProfile['baseProfile'],
  ): UserPersona {
    return {
      personaName,
      tripType: context.situation?.tripPurpose || 'GENERAL',
      currentState: {
        physical: {
          fitnessLevel: 5,
          fatigueLevel: 0.3,
          healthStatus: 'GOOD',
        },
        psychological: {
          stressLevel: 0.3,
          excitementLevel: 0.6,
          confidenceLevel: 0.5,
          mood: 'POSITIVE',
        },
        temporal: {
          availableDays: 7,
          timePressure: 0.3,
          timeFlexibility: 'MEDIUM',
          tripStage: 'PLANNING',
        },
      },
      preferences: {
        pacePreference: baseProfile.pacePreference,
        altitudeTolerance: baseProfile.altitudeTolerance,
        riskTolerance: baseProfile.riskTolerance,
        travelPhilosophy: baseProfile.travelPhilosophy,
        preferredRouteTypes: baseProfile.preferredRouteTypes,
      },
      activityHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      confidence: 0.5,
    };
  }

  /**
   * 更新persona
   */
  private updatePersona(persona: UserPersona, signals: PersonaChangeSignals): UserPersona {
    const updated: UserPersona = {
      ...persona,
      currentState: {
        physical: {
          ...persona.currentState.physical,
          ...signals.physical,
        },
        psychological: {
          ...persona.currentState.psychological,
          ...signals.psychological,
        },
        temporal: {
          ...persona.currentState.temporal,
          ...signals.temporal,
        },
      },
      preferences: {
        ...persona.preferences,
        ...signals.preferences,
      },
      updatedAt: new Date(),
      usageCount: persona.usageCount + 1,
    };

    return updated;
  }

  /**
   * 创建更新的persona
   */
  private createUpdatedPersona(oldPersona: UserPersona, signals: PersonaChangeSignals): UserPersona {
    return this.updatePersona(oldPersona, signals);
  }

  /**
   * 检测物理状态变化
   */
  private detectPhysicalChanges(
    oldState: PhysicalState,
    newState: Partial<PhysicalState>,
  ): { hasChanged: boolean; magnitude: number; reasons: string[] } {
    const reasons: string[] = [];
    let magnitude = 0;

    if (newState.fitnessLevel !== undefined) {
      const diff = Math.abs(newState.fitnessLevel - oldState.fitnessLevel) / 10;
      if (diff > 0.2) {
        reasons.push('体力水平发生变化');
        magnitude = Math.max(magnitude, diff);
      }
    }

    if (newState.fatigueLevel !== undefined) {
      const diff = Math.abs(newState.fatigueLevel - oldState.fatigueLevel);
      if (diff > 0.2) {
        reasons.push('疲劳程度发生变化');
        magnitude = Math.max(magnitude, diff);
      }
    }

    if (newState.healthStatus && newState.healthStatus !== oldState.healthStatus) {
      reasons.push('健康状况发生变化');
      magnitude = Math.max(magnitude, 0.5);
    }

    return {
      hasChanged: reasons.length > 0,
      magnitude,
      reasons,
    };
  }

  /**
   * 检测心理状态变化
   */
  private detectPsychologicalChanges(
    oldState: PsychologicalState,
    newState: Partial<PsychologicalState>,
  ): { hasChanged: boolean; magnitude: number; reasons: string[] } {
    const reasons: string[] = [];
    let magnitude = 0;

    if (newState.stressLevel !== undefined) {
      const diff = Math.abs(newState.stressLevel - oldState.stressLevel);
      if (diff > 0.2) {
        reasons.push('压力水平发生变化');
        magnitude = Math.max(magnitude, diff);
      }
    }

    if (newState.confidenceLevel !== undefined) {
      const diff = Math.abs(newState.confidenceLevel - oldState.confidenceLevel);
      if (diff > 0.2) {
        reasons.push('信心度发生变化');
        magnitude = Math.max(magnitude, diff);
      }
    }

    if (newState.mood && newState.mood !== oldState.mood) {
      reasons.push('情绪状态发生变化');
      magnitude = Math.max(magnitude, 0.4);
    }

    return {
      hasChanged: reasons.length > 0,
      magnitude,
      reasons,
    };
  }

  /**
   * 检测时间状态变化
   */
  private detectTemporalChanges(
    oldState: TimeState,
    newState: Partial<TimeState>,
  ): { hasChanged: boolean; magnitude: number; reasons: string[] } {
    const reasons: string[] = [];
    let magnitude = 0;

    if (newState.availableDays !== undefined) {
      const diff = Math.abs(newState.availableDays - oldState.availableDays) / 30;
      if (diff > 0.2) {
        reasons.push('可用时间发生变化');
        magnitude = Math.max(magnitude, diff);
      }
    }

    if (newState.timePressure !== undefined) {
      const diff = Math.abs(newState.timePressure - oldState.timePressure);
      if (diff > 0.2) {
        reasons.push('时间紧迫度发生变化');
        magnitude = Math.max(magnitude, diff);
      }
    }

    if (newState.tripStage && newState.tripStage !== oldState.tripStage) {
      reasons.push('旅行阶段发生变化');
      magnitude = Math.max(magnitude, 0.3);
    }

    return {
      hasChanged: reasons.length > 0,
      magnitude,
      reasons,
    };
  }

  /**
   * 检测偏好变化
   */
  private detectPreferenceChanges(
    oldPreferences: PreferenceState,
    newPreferences: Partial<PreferenceState>,
  ): { hasChanged: boolean; magnitude: number; reasons: string[] } {
    const reasons: string[] = [];
    let magnitude = 0;

    if (newPreferences.pacePreference && newPreferences.pacePreference !== oldPreferences.pacePreference) {
      reasons.push('节奏偏好发生变化');
      magnitude = Math.max(magnitude, 0.3);
    }

    if (newPreferences.riskTolerance && newPreferences.riskTolerance !== oldPreferences.riskTolerance) {
      reasons.push('风险容忍度发生变化');
      magnitude = Math.max(magnitude, 0.4);
    }

    if (newPreferences.travelPhilosophy && newPreferences.travelPhilosophy !== oldPreferences.travelPhilosophy) {
      reasons.push('旅行哲学发生变化');
      magnitude = Math.max(magnitude, 0.5);
    }

    return {
      hasChanged: reasons.length > 0,
      magnitude,
      reasons,
    };
  }

  /**
   * 匹配社交偏好
   */
  private matchSocialPreference(persona: UserPersona, preference: string): number {
    // 简化实现：基于persona名称和活动历史判断
    if (persona.personaName.includes('独自') && preference === 'SOLO') {
      return 1.0;
    }
    if (persona.personaName.includes('团体') && preference !== 'SOLO') {
      return 1.0;
    }
    return 0.5;
  }

  /**
   * 匹配时间约束
   */
  private matchTimeConstraints(persona: UserPersona, constraints: string[]): number {
    // 简化实现：基于persona的时间状态判断
    if (constraints.includes('时间紧张') && persona.currentState.temporal.timePressure > 0.5) {
      return 1.0;
    }
    if (constraints.includes('时间充足') && persona.currentState.temporal.timePressure < 0.3) {
      return 1.0;
    }
    return 0.5;
  }

  /**
   * 生成persona名称
   */
  private generatePersonaName(context: PersonaContext): string {
    const tripType = context.situation?.tripPurpose || '旅行';
    const timeType = context.situation?.constraints?.includes('时间紧张') ? '紧凑' : '轻松';
    return `${timeType}${tripType}人格`;
  }
}
