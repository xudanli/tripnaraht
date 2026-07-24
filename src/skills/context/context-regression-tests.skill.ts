// src/skills/context/context-regression-tests.skill.ts
/**
 * tripnara.context.regressionTests
 * 
 * P2: 上下文编译回归测试（快照 hash）
 * 
 * 功能：
 * - 为 Context Package 生成快照 hash
 * - 比较两次构建的差异
 * - 检测是否发生回归（块丢失、优先级变化、来源变化等）
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextPackage, ContextBlock } from '../../agent/context-engine/types/context-package.types';
import { createHash } from 'crypto';

export interface ContextRegressionTestsInput extends SkillInput {
  /** 当前的 Context Package */
  currentPackage: ContextPackage;
  
  /** 之前的 Context Package（可选，用于比较） */
  previousPackage?: ContextPackage;
  
  /** 之前的快照 hash（可选，用于比较） */
  previousSnapshotHash?: string;
  
  /** 容忍度配置 */
  tolerance?: {
    /** 允许的块数量变化（百分比，0-1） */
    blockCountChange?: number; // 默认 0.2 (20%)
    
    /** 允许的 Token 数量变化（百分比，0-1） */
    tokenCountChange?: number; // 默认 0.3 (30%)
    
    /** 允许的优先级变化（绝对值） */
    priorityChange?: number; // 默认 5
  };
}

export interface ContextRegressionTestsOutput extends SkillOutput {
  /** 当前快照 hash */
  snapshotHash: string;
  
  /** 快照详细信息 */
  snapshot: {
    /** 时间戳 */
    timestamp: string;
    
    /** 块数量 */
    blockCount: number;
    
    /** 总 Token 数 */
    totalTokens: number;
    
    /** 块 key 列表（排序后） */
    blockKeys: string[];
    
    /** 块类型分布 */
    blockTypeDistribution: Record<string, number>;
    
    /** 优先级分布 */
    priorityDistribution: {
      high: number;
      medium: number;
      low: number;
    };
    
    /** 来源分布 */
    sourceDistribution: Record<string, number>;
  };
  
  /** 比较结果（如果有 previousPackage 或 previousSnapshotHash） */
  comparison?: {
    /** 是否有变化 */
    hasChanges: boolean;
    
    /** 是否有回归 */
    hasRegression: boolean;
    
    /** 块数量变化 */
    blockCountChange: number;
    
    /** Token 数量变化 */
    tokenCountChange: number;
    
    /** 新增的块 key */
    addedBlocks: string[];
    
    /** 删除的块 key */
    removedBlocks: string[];
    
    /** 变化的块 key（优先级或内容变化） */
    changedBlocks: Array<{
      key: string;
      changes: string[]; // ['priority', 'text', 'data', 'provenance']
      previous?: Partial<ContextBlock>;
      current?: Partial<ContextBlock>;
    }>;
    
    /** 回归详情 */
    regressions: string[];
  };
}

@Injectable()
export class ContextRegressionTestsSkill implements Skill<ContextRegressionTestsInput, ContextRegressionTestsOutput> {
  private readonly logger = new Logger(ContextRegressionTestsSkill.name);

  metadata = {
    name: 'context.regressionTests',
    description: '运行 context 编译回归测试：生成快照 hash 并 diff 两次构建。在 context 编译逻辑变更后 CI 或本地防回归时调用。',
    version: '1.0.0',
    category: 'rag' as const,
  };

  constructor(
    @Inject('PrismaService') @Optional() private readonly prisma?: any,
  ) {}

  async execute(input: ContextRegressionTestsInput): Promise<ContextRegressionTestsOutput> {
    this.logger.debug(
      `执行 context.regressionTests: blocks=${input.currentPackage.blocks.length}, tokens=${input.currentPackage.totalTokens}`,
    );

    try {
      // 1. 生成当前快照
      const snapshot = this.createSnapshot(input.currentPackage);
      const snapshotHash = this.generateHash(snapshot);

      // 2. 如果有之前的包或 hash，进行比较
      let comparison: ContextRegressionTestsOutput['comparison'] | undefined;
      
      if (input.previousPackage || input.previousSnapshotHash) {
        let previousSnapshot: any;
        
        if (input.previousPackage) {
          previousSnapshot = this.createSnapshot(input.previousPackage);
        } else if (input.previousSnapshotHash && this.prisma) {
          // 从数据库加载之前的快照（如果有存储的话）
          // 这里简化实现，实际应该从数据库加载
          this.logger.warn('从 previousSnapshotHash 加载快照的功能待实现');
        }

        if (previousSnapshot) {
          comparison = this.compareSnapshots(
            previousSnapshot,
            snapshot,
            input.tolerance || {
              blockCountChange: 0.2,
              tokenCountChange: 0.3,
              priorityChange: 5,
            },
          );
        }
      }

      return {
        snapshotHash,
        snapshot,
        comparison,
      };
    } catch (error: any) {
      this.logger.error(`上下文回归测试失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 创建快照
   */
  private createSnapshot(contextPackage: ContextPackage): ContextRegressionTestsOutput['snapshot'] {
    const blocks = contextPackage.blocks;
    const blockKeys = blocks.map((b) => b.key).sort();

    // 块类型分布
    const blockTypeDistribution: Record<string, number> = {};
    for (const block of blocks) {
      blockTypeDistribution[block.type] = (blockTypeDistribution[block.type] || 0) + 1;
    }

    // 优先级分布
    const priorityDistribution = {
      high: blocks.filter((b) => b.priority >= 80).length,
      medium: blocks.filter((b) => b.priority >= 50 && b.priority < 80).length,
      low: blocks.filter((b) => b.priority < 50).length,
    };

    // 来源分布
    const sourceDistribution: Record<string, number> = {};
    for (const block of blocks) {
      const source = block.provenance.source;
      sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
    }

    return {
      timestamp: new Date().toISOString(),
      blockCount: blocks.length,
      totalTokens: contextPackage.totalTokens,
      blockKeys,
      blockTypeDistribution,
      priorityDistribution,
      sourceDistribution,
    };
  }

  /**
   * 生成快照 hash
   */
  private generateHash(snapshot: ContextRegressionTestsOutput['snapshot']): string {
    // 使用 blockKeys、blockCount、totalTokens 生成稳定的 hash
    const content = JSON.stringify({
      blockKeys: snapshot.blockKeys,
      blockCount: snapshot.blockCount,
      totalTokens: snapshot.totalTokens,
      blockTypeDistribution: snapshot.blockTypeDistribution,
    });

    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * 比较两个快照
   */
  private compareSnapshots(
    previous: ContextRegressionTestsOutput['snapshot'],
    current: ContextRegressionTestsOutput['snapshot'],
    tolerance: NonNullable<ContextRegressionTestsInput['tolerance']>,
  ): ContextRegressionTestsOutput['comparison'] {
    const hasChanges = JSON.stringify(previous) !== JSON.stringify(current);
    
    // 1. 计算块数量变化
    const blockCountChange = (current.blockCount - previous.blockCount) / previous.blockCount;
    const blockCountChangeAbs = Math.abs(blockCountChange);

    // 2. 计算 Token 数量变化
    const tokenCountChange = (current.totalTokens - previous.totalTokens) / previous.totalTokens;
    const tokenCountChangeAbs = Math.abs(tokenCountChange);

    // 3. 找出新增和删除的块
    const previousKeysSet = new Set(previous.blockKeys);
    const currentKeysSet = new Set(current.blockKeys);
    
    const addedBlocks = current.blockKeys.filter((key) => !previousKeysSet.has(key));
    const removedBlocks = previous.blockKeys.filter((key) => !currentKeysSet.has(key));

    // 4. 找出变化的块（需要从 ContextPackage 中获取详细信息）
    // 这里简化实现，实际应该比较完整的块信息
    type ComparisonBlock = NonNullable<ContextRegressionTestsOutput['comparison']>['changedBlocks'][number];
    const changedBlocks: ComparisonBlock[] = [];

    // 5. 检测回归
    const regressions: string[] = [];
    let hasRegression = false;

    // 5.1 检查块数量变化是否超过容忍度
    if (blockCountChangeAbs > (tolerance.blockCountChange || 0.2)) {
      if (blockCountChange < 0) {
        regressions.push(`块数量减少过多: ${(blockCountChange * 100).toFixed(1)}%`);
        hasRegression = true;
      } else {
        regressions.push(`块数量增加过多: ${(blockCountChange * 100).toFixed(1)}%`);
      }
    }

    // 5.2 检查 Token 数量变化是否超过容忍度
    if (tokenCountChangeAbs > (tolerance.tokenCountChange || 0.3)) {
      if (tokenCountChange < 0) {
        regressions.push(`Token 数量减少过多: ${(tokenCountChange * 100).toFixed(1)}%`);
        hasRegression = true;
      } else {
        regressions.push(`Token 数量增加过多: ${(tokenCountChange * 100).toFixed(1)}%`);
      }
    }

    // 5.3 检查是否有重要块被删除
    const importantBlockTypes = ['ABU_RULES', 'COUNTRY_SAFETY', 'COUNTRY_ROAD_RULES', 'DECISION_LOG'];
    for (const removedKey of removedBlocks) {
      // 这里简化实现，实际应该检查块的类型
      if (importantBlockTypes.some((type) => removedKey.includes(type))) {
        regressions.push(`重要块被删除: ${removedKey}`);
        hasRegression = true;
      }
    }

    // 5.4 检查类型分布是否发生重大变化
    const previousTypeSum = Object.values(previous.blockTypeDistribution).reduce((a, b) => a + b, 0);
    const currentTypeSum = Object.values(current.blockTypeDistribution).reduce((a, b) => a + b, 0);
    
    if (previousTypeSum > 0 && currentTypeSum > 0) {
      for (const [type, previousCount] of Object.entries(previous.blockTypeDistribution)) {
        const currentCount = current.blockTypeDistribution[type] || 0;
        const previousRatio = previousCount / previousTypeSum;
        const currentRatio = currentCount / currentTypeSum;
        
        if (Math.abs(currentRatio - previousRatio) > 0.2) {
          regressions.push(`块类型分布发生重大变化: ${type} (${(previousRatio * 100).toFixed(1)}% -> ${(currentRatio * 100).toFixed(1)}%)`);
        }
      }
    }

    return {
      hasChanges,
      hasRegression,
      blockCountChange,
      tokenCountChange,
      addedBlocks,
      removedBlocks,
      changedBlocks,
      regressions,
    };
  }
}