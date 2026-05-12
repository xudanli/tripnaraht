import { Injectable } from '@nestjs/common';
import type { TripReward } from '../draft-synthesis/global-optimization/trip-reward.types';
import {
  createDefaultSystemPolicyWeights,
  updateSystemPolicyWeightsFromTripReward,
} from '../draft-synthesis/global-optimization/global-optimization.engine';
import type { SystemPolicyWeights } from '../draft-synthesis/global-optimization/system-policy-weights.types';
import type { TravelPersonaType } from '../draft-synthesis/persona-policy/travel-persona.types';

/**
 * 全局策略权重存储（内存骨架；生产可换 Redis / DB + 版本发布）。
 */
@Injectable()
export class GlobalPolicyWeightsService {
  private state: SystemPolicyWeights = createDefaultSystemPolicyWeights();

  get(): SystemPolicyWeights {
    return JSON.parse(JSON.stringify(this.state)) as SystemPolicyWeights;
  }

  reset(): void {
    this.state = createDefaultSystemPolicyWeights();
  }

  /** 覆盖（例如从持久化加载） */
  replace(next: SystemPolicyWeights): void {
    this.state = JSON.parse(JSON.stringify(next)) as SystemPolicyWeights;
  }

  /**
   * Trip 完成后摄入奖励信号，更新系统参数。
   */
  ingestTripReward(reward: TripReward, personaType: TravelPersonaType, alpha?: number): SystemPolicyWeights {
    this.state = updateSystemPolicyWeightsFromTripReward(this.state, {
      reward,
      personaType,
      alpha,
    });
    return this.get();
  }
}
