// src/agent/memory/services/persona-state-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  PersonaState,
  PersonaSwitchStrategy,
  PersonaStateInfo,
  PersonaSwitchRequest,
  PersonaSwitchResult,
  PersonaStateMachineConfig,
  PersonaStateSnapshot,
} from '../interfaces/persona-state-management.interface';
import {
  PersonaContext,
  MultiPersonaUserTravelProfile,
} from '../interfaces/multi-persona.interface';
import { MultiPersonaManagerService } from './multi-persona-manager.service';
import { PersonaIdentificationService } from './persona-identification.service';

/**
 * Persona状态管理服务
 * 
 * 实现完整的persona状态管理和动态切换机制：
 * - Persona状态机管理
 * - 自动切换机制
 * - 状态持久化
 * - 切换冲突检测
 */
@Injectable()
export class PersonaStateManagerService {
  private readonly logger = new Logger(PersonaStateManagerService.name);
  
  // 内存中的状态缓存
  private readonly personaStates = new Map<string, Map<string, PersonaStateInfo>>();
  
  // 状态机配置
  private readonly defaultConfig: Required<PersonaStateMachineConfig> = {
    enableAutoSwitch: true,
    autoSwitchThreshold: 0.7,
    stateTransitionRules: [
      {
        from: 'INACTIVE',
        to: 'ACTIVE',
        conditions: [],
      },
      {
        from: 'ACTIVE',
        to: 'SUSPENDED',
        conditions: [],
      },
      {
        from: 'SUSPENDED',
        to: 'ACTIVE',
        conditions: [],
      },
      {
        from: 'ACTIVE',
        to: 'ARCHIVED',
        conditions: [],
      },
    ],
    statePersistence: {
      enabled: true,
      persistenceInterval: 60000, // 1分钟
    },
  };

  constructor(
    private readonly multiPersonaManager: MultiPersonaManagerService,
    private readonly personaIdentification: PersonaIdentificationService,
  ) {
    // 启动状态持久化定时器
    if (this.defaultConfig.statePersistence.enabled) {
      setInterval(() => {
        this.persistStates().catch(err => {
          this.logger.error(`状态持久化失败: ${err.message}`, err.stack);
        });
      }, this.defaultConfig.statePersistence.persistenceInterval);
    }
  }

  /**
   * 初始化用户persona状态
   */
  async initializePersonaStates(
    userId: string,
    profile: MultiPersonaUserTravelProfile,
  ): Promise<void> {
    const userStates = new Map<string, PersonaStateInfo>();

    for (const persona of profile.personas) {
      const state: PersonaState = persona.personaName === profile.currentPersona
        ? 'ACTIVE'
        : 'INACTIVE';

      userStates.set(persona.personaName, {
        personaName: persona.personaName,
        state,
        activatedAt: state === 'ACTIVE' ? persona.updatedAt : undefined,
        lastUsedAt: persona.updatedAt,
        switchCount: 0,
        totalUsageTime: 0,
        contextHistory: [],
      });
    }

    this.personaStates.set(userId, userStates);
    this.logger.debug(`初始化用户 ${userId} 的persona状态: ${userStates.size} 个persona`);
  }

  /**
   * 切换persona
   */
  async switchPersona(request: PersonaSwitchRequest): Promise<PersonaSwitchResult> {
    const startTime = Date.now();
    this.logger.log(`切换persona: ${request.userId} ${request.fromPersona} -> ${request.toPersona}`);

    try {
      // 获取用户profile
      const profile = await this.multiPersonaManager.getMultiPersonaProfile(request.userId);
      if (!profile) {
        throw new Error(`用户画像不存在: ${request.userId}`);
      }

      // 检查目标persona是否存在
      const targetPersona = profile.personas.find(p => p.personaName === request.toPersona);
      if (!targetPersona) {
        throw new Error(`Persona不存在: ${request.toPersona}`);
      }

      // 获取当前状态
      const userStates = this.personaStates.get(request.userId) || new Map();
      const fromStateInfo = request.fromPersona
        ? userStates.get(request.fromPersona)
        : undefined;
      const toStateInfo = userStates.get(request.toPersona);

      // 检查切换冲突
      const conflicts = await this.checkSwitchConflicts(
        request,
        profile,
        fromStateInfo,
        toStateInfo,
      );

      if (conflicts.length > 0 && !request.force) {
        return {
          success: false,
          fromPersona: request.fromPersona,
          toPersona: request.toPersona,
          switchTime: new Date(),
          strategy: request.strategy,
          reason: request.reason,
          conflicts,
        };
      }

      // 执行切换
      const transitionSteps: string[] = [];

      // 1. 停用旧persona
      if (request.fromPersona && fromStateInfo) {
        fromStateInfo.state = 'INACTIVE';
        transitionSteps.push(`停用persona: ${request.fromPersona}`);
      }

      // 2. 激活新persona
      if (toStateInfo) {
        toStateInfo.state = 'ACTIVE';
        toStateInfo.activatedAt = new Date();
        toStateInfo.switchCount += 1;
        if (fromStateInfo) {
          const usageTime = Date.now() - (fromStateInfo.activatedAt?.getTime() || Date.now());
          fromStateInfo.totalUsageTime += Math.max(0, usageTime);
        }
        transitionSteps.push(`激活persona: ${request.toPersona}`);
      } else {
        // 创建新状态
        const newStateInfo: PersonaStateInfo = {
          personaName: request.toPersona,
          state: 'ACTIVE',
          activatedAt: new Date(),
          lastUsedAt: new Date(),
          switchCount: 1,
          totalUsageTime: 0,
          contextHistory: [],
        };
        userStates.set(request.toPersona, newStateInfo);
        transitionSteps.push(`创建并激活persona: ${request.toPersona}`);
      }

      // 3. 更新context历史
      if (toStateInfo && request.context) {
        toStateInfo.contextHistory.push({
          timestamp: new Date(),
          context: request.context,
          state: 'ACTIVE',
        });
        // 限制历史记录数量
        if (toStateInfo.contextHistory.length > 100) {
          toStateInfo.contextHistory = toStateInfo.contextHistory.slice(-100);
        }
      }

      // 4. 更新profile
      profile.currentPersona = request.toPersona;
      targetPersona.usageCount += 1;
      targetPersona.updatedAt = new Date();

      await this.multiPersonaManager.saveMultiPersonaProfile(profile);

      // 5. 更新状态缓存
      this.personaStates.set(request.userId, userStates);

      const transitionDuration = Date.now() - startTime;

      this.logger.log(`Persona切换成功: ${request.userId} -> ${request.toPersona} (${transitionDuration}ms)`);

      return {
        success: true,
        fromPersona: request.fromPersona,
        toPersona: request.toPersona,
        switchTime: new Date(),
        strategy: request.strategy,
        reason: request.reason || `自动切换: ${request.strategy}`,
        transition: {
          duration: transitionDuration,
          steps: transitionSteps,
        },
      };
    } catch (error: any) {
      this.logger.error(`Persona切换失败: ${error.message}`, error.stack);
      return {
        success: false,
        fromPersona: request.fromPersona,
        toPersona: request.toPersona,
        switchTime: new Date(),
        strategy: request.strategy,
        conflicts: [{
          type: 'PRECONDITION_FAILED',
          message: error.message,
        }],
      };
    }
  }

  /**
   * 自动切换persona（基于上下文）
   */
  async autoSwitchPersona(
    userId: string,
    context: PersonaContext,
    strategy: PersonaSwitchStrategy = 'AUTO_CONTEXT',
  ): Promise<PersonaSwitchResult | null> {
    this.logger.debug(`自动切换persona: ${userId}, 策略: ${strategy}`);

    const profile = await this.multiPersonaManager.getMultiPersonaProfile(userId);
    if (!profile) {
      return null;
    }

    // 识别最适合的persona
    const { persona: bestPersona, confidence } = await this.personaIdentification.identifyCurrentPersona(
      profile,
      context,
    );

    // 检查是否需要切换
    const currentPersona = profile.currentPersona;
    if (currentPersona === bestPersona.personaName) {
      this.logger.debug(`当前persona已是最佳匹配: ${bestPersona.personaName}`);
      return null;
    }

    // 检查置信度是否达到阈值
    if (confidence < this.defaultConfig.autoSwitchThreshold) {
      this.logger.debug(`置信度不足，不切换: ${confidence} < ${this.defaultConfig.autoSwitchThreshold}`);
      return null;
    }

    // 执行切换
    return await this.switchPersona({
      userId,
      fromPersona: currentPersona,
      toPersona: bestPersona.personaName,
      strategy,
      context,
      reason: `自动切换: 置信度 ${confidence.toFixed(2)}, 策略 ${strategy}`,
    });
  }

  /**
   * 获取persona状态
   */
  getPersonaState(userId: string, personaName: string): PersonaStateInfo | null {
    const userStates = this.personaStates.get(userId);
    if (!userStates) {
      return null;
    }
    return userStates.get(personaName) || null;
  }

  /**
   * 获取所有persona状态
   */
  getAllPersonaStates(userId: string): Map<string, PersonaStateInfo> {
    return this.personaStates.get(userId) || new Map();
  }

  /**
   * 创建状态快照
   */
  async createStateSnapshot(userId: string, context?: PersonaContext): Promise<PersonaStateSnapshot> {
    const profile = await this.multiPersonaManager.getMultiPersonaProfile(userId);
    const userStates = this.personaStates.get(userId) || new Map();

    const activePersonas = Array.from(userStates.values())
      .filter(state => state.state === 'ACTIVE')
      .map(state => state.personaName);

    return {
      userId,
      timestamp: new Date(),
      activePersona: profile?.currentPersona,
      personaStates: userStates,
      context: context || {},
      metadata: {
        totalPersonas: profile?.personas.length || 0,
        activePersonas: activePersonas.length,
        lastSwitchTime: Array.from(userStates.values())
          .map(s => s.lastUsedAt)
          .filter((d): d is Date => d !== undefined)
          .sort((a, b) => b.getTime() - a.getTime())[0],
      },
    };
  }

  /**
   * 检查切换冲突
   */
  private async checkSwitchConflicts(
    request: PersonaSwitchRequest,
    profile: MultiPersonaUserTravelProfile,
    fromStateInfo?: PersonaStateInfo,
    toStateInfo?: PersonaStateInfo,
  ): Promise<PersonaSwitchResult['conflicts']> {
    const conflicts: PersonaSwitchResult['conflicts'] = [];

    // 检查状态冲突
    if (toStateInfo && toStateInfo.state === 'ARCHIVED') {
      conflicts.push({
        type: 'STATE_CONFLICT',
        message: `目标persona已归档: ${request.toPersona}`,
      });
    }

    // 检查上下文匹配
    if (request.context && toStateInfo) {
      const contextMatch = this.evaluateContextMatch(
        toStateInfo.contextHistory,
        request.context,
      );
      if (contextMatch < 0.5) {
        conflicts.push({
          type: 'CONTEXT_MISMATCH',
          message: `上下文匹配度低: ${(contextMatch * 100).toFixed(1)}%`,
        });
      }
    }

    return conflicts;
  }

  /**
   * 评估上下文匹配度
   */
  private evaluateContextMatch(
    contextHistory: PersonaStateInfo['contextHistory'],
    currentContext: PersonaContext,
  ): number {
    if (contextHistory.length === 0) {
      return 0.5; // 默认中等匹配度
    }

    // 计算历史上下文与当前上下文的相似度
    let totalSimilarity = 0;
    let count = 0;

    for (const history of contextHistory.slice(-10)) { // 只看最近10条
      const similarity = this.calculateContextSimilarity(history.context, currentContext);
      totalSimilarity += similarity;
      count += 1;
    }

    return count > 0 ? totalSimilarity / count : 0.5;
  }

  /**
   * 计算上下文相似度
   */
  private calculateContextSimilarity(
    context1: PersonaContext,
    context2: PersonaContext,
  ): number {
    let matches = 0;
    let total = 0;

    // 比较环境因素
    if (context1.environment && context2.environment) {
      if (context1.environment.location === context2.environment.location) matches++;
      if (context1.environment.season === context2.environment.season) matches++;
      total += 2;
    }

    // 比较社交因素
    if (context1.social && context2.social) {
      if (context1.social.socialPreference === context2.social.socialPreference) matches++;
      total += 1;
    }

    // 比较情境因素
    if (context1.situation && context2.situation) {
      if (context1.situation.tripPurpose === context2.situation.tripPurpose) matches++;
      total += 1;
    }

    return total > 0 ? matches / total : 0.5;
  }

  /**
   * 持久化状态
   */
  private async persistStates(): Promise<void> {
    // 这里可以将状态持久化到数据库
    // 简化实现：只记录日志
    this.logger.debug(`持久化persona状态: ${this.personaStates.size} 个用户`);
  }

  /**
   * 更新persona状态
   */
  async updatePersonaState(
    userId: string,
    personaName: string,
    newState: PersonaState,
  ): Promise<void> {
    const userStates = this.personaStates.get(userId);
    if (!userStates) {
      throw new Error(`用户状态不存在: ${userId}`);
    }

    const stateInfo = userStates.get(personaName);
    if (!stateInfo) {
      throw new Error(`Persona状态不存在: ${personaName}`);
    }

    stateInfo.state = newState;
    if (newState === 'ACTIVE') {
      stateInfo.activatedAt = new Date();
    }
    stateInfo.lastUsedAt = new Date();

    this.logger.debug(`更新persona状态: ${userId}/${personaName} -> ${newState}`);
  }
}
