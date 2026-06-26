/**
 * 功能开关配置服务
 * 用于控制新功能的启用状态，支持灰度发布
 */

import { Injectable, Logger } from '@nestjs/common';
import type { PlanningWorkbenchKernelMode } from './planning-workbench-kernel-bridge.types';

export interface FeatureFlags {
  // P0: 性能止血
  enableLLMTrace: boolean;
  enableLLMCache: boolean;
  enableGateCoordinator: boolean;
  // P0: 智能默认值
  enableSmartInference: boolean;
  // P1: 快速规划
  enableQuickPlan: boolean;
  // P2: 零澄清模式
  enableZeroClarification: boolean;
  // Narrative Engine V1: 叙事主题
  enableNarrativeThemeV1: boolean;
  /** 规划工作台 Decision Kernel 接入：legacy | shadow | native */
  planningWorkbenchKernelMode: PlanningWorkbenchKernelMode;
}

/** 仅布尔型开关（排除 planningWorkbenchKernelMode 等枚举配置） */
export type BooleanFeatureFlag = {
  [K in keyof FeatureFlags]: FeatureFlags[K] extends boolean ? K : never;
}[keyof FeatureFlags];

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);
  private flags: FeatureFlags;

  constructor() {
    this.flags = this.loadFlags();
  }

  /**
   * 从环境变量加载功能开关
   */
  private loadFlags(): FeatureFlags {
    return {
      // P0: 性能止血
      enableLLMTrace: process.env.ENABLE_LLM_TRACE === 'true',
      enableLLMCache: process.env.ENABLE_LLM_CACHE === 'true',
      enableGateCoordinator: process.env.ENABLE_GATE_COORDINATOR === 'true',
      // P0: 智能默认值
      enableSmartInference: process.env.ENABLE_SMART_INFERENCE === 'true',
      // P1: 快速规划
      enableQuickPlan: process.env.ENABLE_QUICK_PLAN === 'true',
      // P2: 零澄清模式
      enableZeroClarification: process.env.ENABLE_ZERO_CLARIFICATION === 'true',
      // Narrative Engine V1
      enableNarrativeThemeV1: process.env.NARRATIVE_THEME_V1 === 'true',
      // 规划工作台 Kernel 桥接（默认 legacy，与现有行为一致）
      planningWorkbenchKernelMode: this.parsePlanningWorkbenchKernelMode(
        process.env.PLANNING_WORKBENCH_KERNEL_MODE,
      ),
    };
  }

  private parsePlanningWorkbenchKernelMode(
    raw: string | undefined,
  ): PlanningWorkbenchKernelMode {
    const normalized = (raw ?? 'legacy').trim().toLowerCase();
    if (normalized === 'shadow' || normalized === 'native') {
      return normalized;
    }
    return 'legacy';
  }

  /**
   * 获取所有功能开关
   */
  getFlags(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * 检查功能是否启用（仅布尔开关）
   */
  isEnabled(flag: BooleanFeatureFlag): boolean {
    return this.flags[flag];
  }

  /**
   * 动态更新功能开关（用于运行时控制，仅布尔开关）
   */
  updateFlag(flag: BooleanFeatureFlag, value: boolean): void {
    this.flags[flag] = value;
    this.logger.log(`功能开关更新: ${flag} = ${value}`);
  }

  /**
   * 批量更新功能开关
   */
  updateFlags(flags: Partial<FeatureFlags>): void {
    Object.assign(this.flags, flags);
    this.logger.log(`批量更新功能开关: ${JSON.stringify(flags)}`);
  }

  /**
   * 重置为默认值
   */
  reset(): void {
    this.flags = this.loadFlags();
    this.logger.log('功能开关已重置为默认值');
  }

  /**
   * 获取功能开关状态（用于监控）
   */
  getStatus(): FeatureFlags {
    return this.flags;
  }
}
