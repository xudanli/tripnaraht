// src/agent/memory/services/decision-params-injector.service.ts

/**
 * DecisionParams Injector Service
 * 
 * 将 DecisionParams 注入到决策引擎的各个组件中
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionParams, normalizeDecisionParams } from '../interfaces/decision-params.interface';
import { MemoryService } from './memory.service';
import { AgentMemoryContextStore } from '../context/agent-memory-context.store';
import { UserProfileMapperService } from './user-profile-mapper.service';
import { DecisionParamsMappingV2Service } from './decision-params-mapping-v2.service';
import { ShadowModeDiffService } from './shadow-mode-diff.service';
import { MemoryStateDecisionParamsService } from './memory-state-decision-params.service';
import { calculateRouteDirectionHealthScore } from '../interfaces/route-direction-health.interface';
import { createDefaultUserTravelProfile } from '../interfaces/user-travel-profile.interface';
import { applyRoutePartyFitnessToDecisionParams } from '../utils/route-party-fitness-decision-overlay.util';
import { DecisionOsSloService } from '../../../decision/slo/decision-os-slo.service';

function cloneDecisionParams(params: DecisionParams): DecisionParams {
  return JSON.parse(JSON.stringify(params)) as DecisionParams;
}

@Injectable()
export class DecisionParamsInjectorService {
  private readonly logger = new Logger(DecisionParamsInjectorService.name);

  constructor(
    private readonly memoryService: MemoryService,
    private readonly profileMapper: UserProfileMapperService,
    private readonly mappingV2: DecisionParamsMappingV2Service,
    private readonly shadowDiff: ShadowModeDiffService,
    @Optional() private readonly memoryStateParams?: MemoryStateDecisionParamsService,
    @Optional() private readonly slo?: DecisionOsSloService,
    @Optional() private readonly memoryContextStore?: AgentMemoryContextStore,
  ) {}

  /**
   * Runtime 内优先读冻结 snapshot，避免同请求多阶段读到不一致 L1。
   * 无 ALS 上下文（脚本 / 单测）时回退 MemoryService。
   */
  async getUserTravelProfileForRuntime(userId: string) {
    const ctx = this.memoryContextStore?.get();
    if (ctx !== undefined && ctx.userId === userId) {
      if (ctx.userProfile !== null && ctx.userProfile !== undefined) {
        return ctx.userProfile;
      }
      return createDefaultUserTravelProfile(userId);
    }
    return this.memoryService.getUserTravelProfile(userId);
  }

  /**
   * 为指定用户获取决策参数
   */
  async getDecisionParamsForUser(userId: string): Promise<DecisionParams> {
    const profile = await this.getUserTravelProfileForRuntime(userId);
    
    const useLegacy = process.env.DECISION_PARAMS_MAPPING_LEGACY === '1';
    const shadowMode = process.env.DECISION_PARAMS_SHADOW_MODE === '1';

    if (!profile) {
      const defaultProfile = createDefaultUserTravelProfile(userId);
      const legacy = this.profileMapper.mapUserProfileToDecisionParams(defaultProfile);
      const v2 = this.mappingV2.map(defaultProfile).params;
      if (shadowMode) {
        const diff = this.shadowDiff.diff(legacy, v2);
        this.logger.debug(
          `[DecisionParamsInjector] SHADOW_MODE diff: user=${userId} changedKeys=${diff.changedKeys.length}`,
        );
      }
      const params = useLegacy ? legacy : v2;
      this.applyRoutePartyFitnessOverlay(userId, params);
      await this.applyMemoryStateV1Overlay(userId, params);
      this.logger.debug(`Generated default decision params for new user ${userId}`);
      return normalizeDecisionParams(params);
    }
    
    // 映射为决策参数
    const legacy = this.profileMapper.mapUserProfileToDecisionParams(profile);
    const v2 = this.mappingV2.map(profile).params;
    if (shadowMode) {
      const diff = this.shadowDiff.diff(legacy, v2);
      this.logger.debug(
        `[DecisionParamsInjector] SHADOW_MODE diff: user=${userId} changedKeys=${diff.changedKeys.length}`,
      );
    }
    const params = useLegacy ? legacy : v2;
    this.applyRoutePartyFitnessOverlay(userId, params);
    await this.applyMemoryStateV1Overlay(userId, params);

    this.logger.debug(
      `Generated decision params for user ${userId}: ` +
      `pace=${profile.pacePreference}, confidence=${profile.confidence.toFixed(2)}`
    );

    return normalizeDecisionParams(params);
  }

  private applyRoutePartyFitnessOverlay(userId: string, params: DecisionParams): void {
    const snap = this.memoryContextStore?.get();
    const fl = snap?.routePartyProfile?.fitness_level;
    if (!fl) return;
    if (snap.userId != null && snap.userId !== userId) return;
    applyRoutePartyFitnessToDecisionParams(params, fl);
    this.logger.debug(`[DecisionParamsInjector] route_party fitness=${fl} merged into decision constraints`);
  }

  /** MemoryState v1 overlay；V1=1 生效，SHADOW=1 仅记录 diff 到 SLO */
  private async applyMemoryStateV1Overlay(userId: string, params: DecisionParams): Promise<void> {
    if (!this.memoryStateParams) return;
    const apply = process.env.DECISION_PARAMS_MEMORY_STATE_V1 === '1';
    const shadow = process.env.DECISION_PARAMS_MEMORY_STATE_SHADOW === '1';
    if (!apply && !shadow) return;

    const before = cloneDecisionParams(params);
    const { audit } = await this.memoryStateParams.overlayForUser(userId, params);

    if (shadow && this.slo) {
      const diff = this.shadowDiff.diff(before, params);
      this.slo.recordMemoryStateShadow({
        userId,
        overlayApplied: apply,
        changedKeys: diff.changedKeys,
      });
    }

    if (!apply) {
      Object.assign(params, before);
    } else if (audit.length > 0) {
      this.logger.debug(
        `[DecisionParamsInjector] memory_state_v1 overlay user=${userId} knobs=${audit.map((a) => a.reason).join(',')}`,
      );
    }
  }

  /**
   * 调整 RouteDirection 评分（基于决策参数和路线健康度）
   */
  async adjustRouteDirectionScore(
    routeDirectionId: number,
    countryCode: string,
    baseScore: number,
    decisionParams: DecisionParams,
    routeDirection?: any // RouteDirection 对象（可选，用于提取 tags）
  ): Promise<number> {
    let adjustedScore = baseScore;

    // 1. 应用 RouteDirection 权重偏置
    // 从 RouteDirection 的 tags 和 metadata.archetype 中提取特征
    if (routeDirection) {
      const routeTags: string[] = routeDirection.tags || [];
      const archetype = (routeDirection as any).metadata?.archetype || '';
      
      // 基于 tags 判断
      const isScenic = routeTags.includes('摄影') || routeTags.includes('风景') || 
        archetype.includes('SCENIC') || archetype.includes('FJORD');
      const isAdventure = routeTags.includes('挑战') || routeTags.includes('冒险') || 
        archetype.includes('ADVENTURE') || archetype.includes('CHALLENGE');
      const isStable = routeTags.includes('轻松') || routeTags.includes('稳定') || 
        archetype.includes('RELAXED') || archetype.includes('URBAN');

      if (isScenic) {
        adjustedScore *= (1 + decisionParams.routeDirectionBias.sceneryWeight * 0.2);
      }
      if (isAdventure) {
        adjustedScore *= (1 + decisionParams.routeDirectionBias.adventureWeight * 0.2);
      }
      if (isStable) {
        adjustedScore *= (1 + decisionParams.routeDirectionBias.stabilityWeight * 0.2);
      }
    }

    // 2. 应用路线健康度
    const health = await this.memoryService.getRouteDirectionHealth(routeDirectionId, countryCode);
    if (health) {
      const healthScore = calculateRouteDirectionHealthScore(health);
      // 健康度影响：健康度低的路线下调分数
      adjustedScore *= (0.5 + healthScore * 0.5); // 健康度在 0.5~1.0 之间影响
    }

    return Math.max(0, Math.min(100, adjustedScore));
  }

  /**
   * 将决策参数的约束注入到 world model
   */
  injectConstraintsToWorldModel(
    worldModel: any,
    decisionParams: DecisionParams
  ): void {
    if (!worldModel.policies) {
      worldModel.policies = {};
    }

    const policies = worldModel.policies as any;

    // 注入硬约束
    if (decisionParams.constraints.maxElevationM) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.maxElevationM = decisionParams.constraints.maxElevationM;
    }
    if (decisionParams.constraints.avoidRapidAscent) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.rapidAscentForbidden = decisionParams.constraints.avoidRapidAscent;
    }

    // 注入软约束
    if (decisionParams.constraints.maxDailyAscentM) {
      policies.softConstraints = policies.softConstraints || {};
      policies.softConstraints.maxDailyAscentM = decisionParams.constraints.maxDailyAscentM;
    }
    if (decisionParams.constraints.bufferTimeMin) {
      policies.softConstraints = policies.softConstraints || {};
      policies.softConstraints.bufferTimeMin = decisionParams.constraints.bufferTimeMin;
    }
    if (decisionParams.constraints.maxSlopePct) {
      policies.softConstraints = policies.softConstraints || {};
      policies.softConstraints.maxSlopePct = decisionParams.constraints.maxSlopePct;
    }

    this.logger.debug(
      `Injected constraints: ` +
      `maxElevation=${decisionParams.constraints.maxElevationM}, ` +
      `maxAscent=${decisionParams.constraints.maxDailyAscentM}, ` +
      `buffer=${decisionParams.constraints.bufferTimeMin}`
    );
  }

  /**
   * 根据决策参数过滤 RouteDirection（基于 preferredRouteTypes）
   * 
   * 规则：如果不在偏好列表中，降权到 60%，但不直接禁止
   */
  filterRouteDirectionByPreference(
    routeDirection: any,
    preferredRouteTypes: string[]
  ): { shouldKeep: boolean; scoreMultiplier: number } {
    if (!preferredRouteTypes || preferredRouteTypes.length === 0) {
      return { shouldKeep: true, scoreMultiplier: 1.0 };
    }

    // 从 RouteDirection 中提取类型
    // 优先使用 metadata.archetype，其次尝试从 tags 推断
    let routeType = (routeDirection as any).metadata?.archetype || (routeDirection as any).metadata?.routeType;
    
    // 如果还没有，尝试从 tags 推断
    if (!routeType && routeDirection.tags) {
      const tags = routeDirection.tags as string[];
      if (tags.includes('徒步') || tags.includes('hiking') || tags.includes('trekking')) {
        routeType = 'HIKING';
      } else if (tags.includes('自驾') || tags.includes('driving') || tags.includes('coastline')) {
        routeType = 'ROAD_TRIP';
      } else if (tags.includes('出海') || tags.includes('sea') || tags.includes('fjord')) {
        routeType = 'SEA';
      } else if (tags.includes('城市') || tags.includes('urban') || tags.includes('city')) {
        routeType = 'URBAN';
      } else if (tags.includes('文化') || tags.includes('cultural') || tags.includes('culture')) {
        routeType = 'CULTURAL';
      } else if (tags.includes('自然') || tags.includes('nature') || tags.includes('scenic')) {
        routeType = 'NATURE';
      }
    }
    
    // 如果从 archetype 中提取（如 HIGH_ALTITUDE_CULTURAL_TREKKING -> HIKING）
    if (routeType && typeof routeType === 'string') {
      const archetypeUpper = routeType.toUpperCase();
      if (archetypeUpper.includes('TREKKING') || archetypeUpper.includes('HIKING')) {
        routeType = 'HIKING';
      } else if (archetypeUpper.includes('DRIVING') || archetypeUpper.includes('COASTLINE')) {
        routeType = 'ROAD_TRIP';
      } else if (archetypeUpper.includes('SEA') || archetypeUpper.includes('FJORD')) {
        routeType = 'SEA';
      } else if (archetypeUpper.includes('URBAN') || archetypeUpper.includes('CITY')) {
        routeType = 'URBAN';
      } else if (archetypeUpper.includes('CULTURAL') || archetypeUpper.includes('CULTURE')) {
        routeType = 'CULTURAL';
      } else if (archetypeUpper.includes('NATURE') || archetypeUpper.includes('SCENIC')) {
        routeType = 'NATURE';
      }
    }
    
    if (!routeType) {
      // 无法确定类型，不降权
      return { shouldKeep: true, scoreMultiplier: 1.0 };
    }

    // 检查是否在偏好列表中（支持部分匹配）
    const routeTypeUpper = routeType.toUpperCase();
    const isPreferred = preferredRouteTypes.some(pref => {
      const prefUpper = pref.toUpperCase();
      return routeTypeUpper === prefUpper ||
        routeTypeUpper.includes(prefUpper) ||
        prefUpper.includes(routeTypeUpper);
    });

    if (!isPreferred) {
      // 不在偏好列表中，降权到 60%，但不直接禁止
      return { shouldKeep: true, scoreMultiplier: 0.6 };
    }

    return { shouldKeep: true, scoreMultiplier: 1.0 };
  }
}

