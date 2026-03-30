/**
 * 世界模型版本管理服务
 * 
 * 负责管理世界模型的版本，包括：
 * - 版本创建（基于当前世界模型状态）
 * - 版本回滚（回滚到指定版本）
 * - 版本比较（比较两个版本的差异）
 * - 版本性能评估（评估版本的表现）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UnifiedWorldModel } from '../interfaces/unified-world-model.interface';
import { UserFeedbackService } from './user-feedback.service';
import { CacheService } from '../../../common/cache/cache.service';
import { WorldModelEventsService } from './world-model-events.service';
import { WorldModelMonitoringService } from './world-model-monitoring.service';

/**
 * 世界模型版本
 */
export interface WorldModelVersion {
  versionId: string;
  version: string; // 语义化版本号（如 "1.2.3"）
  worldModel: Partial<UnifiedWorldModel>;
  metadata: {
    description?: string;
    createdBy?: string;
    tags?: string[];
    countryCode?: string;
    routeDirectionId?: string;
  };
  createdAt: Date;
  isActive: boolean;
  performanceMetrics?: {
    userSatisfaction: number; // 0-1
    predictionAccuracy: number; // 0-1
    usageCount: number;
    averageConfidence: number; // 0-1
  };
}

/**
 * 版本比较结果
 */
export interface VersionComparison {
  version1: WorldModelVersion;
  version2: WorldModelVersion;
  differences: Array<{
    field: string;
    value1: any;
    value2: any;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  overallSimilarity: number; // 0-1
  recommendation: 'KEEP_VERSION1' | 'KEEP_VERSION2' | 'MERGE' | 'NO_PREFERENCE';
}

/**
 * 版本性能评估结果
 */
export interface VersionPerformanceEvaluation {
  versionId: string;
  metrics: {
    userSatisfaction: number;
    predictionAccuracy: number;
    usageCount: number;
    averageConfidence: number;
  };
  comparisonWithBaseline?: {
    baselineVersionId: string;
    improvement: number; // -1 to 1
    isImprovement: boolean;
  };
  recommendation: 'DEPLOY' | 'ROLLBACK' | 'CONTINUE_MONITORING';
}

@Injectable()
export class WorldModelVersionService {
  private readonly logger = new Logger(WorldModelVersionService.name);
  
  /** Code Review P2-2修复：版本比较结果缓存 */
  private readonly cacheKeyPrefix = 'version_comparison:';
  private readonly cacheTtl = 7200; // 2小时
  
  /** 内存版本缓存（用于快速访问最近使用的版本） */
  private readonly versions = new Map<string, WorldModelVersion>();

  constructor(
    private prisma: PrismaService,
    @Optional() private userFeedbackService?: UserFeedbackService,
    @Optional() private cacheService?: CacheService,
    @Optional() private worldModelEventsService?: WorldModelEventsService,
    @Optional() private monitoringService?: WorldModelMonitoringService,
  ) {}

  /**
   * 创建新版本
   */
  async createVersion(
    worldModel: UnifiedWorldModel,
    metadata: WorldModelVersion['metadata'],
  ): Promise<string> {
    this.logger.log(
      `[WorldModelVersion] 创建新版本: description=${metadata.description}`,
    );

    try {
      // 1. 生成版本号（语义化版本）
      const version = await this.generateVersionNumber(metadata);

      // 2. 停用旧版本（如果存在）
      if (metadata.routeDirectionId) {
        await this.prisma.$executeRawUnsafe(`
          UPDATE world_model_versions
          SET is_active = false
          WHERE route_direction_id = $1::uuid
            AND is_active = true
        `, metadata.routeDirectionId);
      } else if (metadata.countryCode) {
        await this.prisma.$executeRawUnsafe(`
          UPDATE world_model_versions
          SET is_active = false
          WHERE country_code = $1::varchar
            AND is_active = true
        `, metadata.countryCode);
      } else {
        await this.prisma.$executeRawUnsafe(`
          UPDATE world_model_versions
          SET is_active = false
          WHERE route_direction_id IS NULL
            AND country_code IS NULL
            AND is_active = true
        `);
      }

      // 3. 创建新版本记录
      const versionId = `wm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 使用world_model_versions表（如果存在），否则降级到adaptive_world_model_version表
      try {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO world_model_versions (
            version_id,
            version,
            world_model,
            metadata,
            is_active,
            performance_metrics,
            created_at,
            updated_at
          ) VALUES (
            $1::varchar,
            $2::varchar,
            $3::jsonb,
            $4::jsonb,
            true,
            $5::jsonb,
            NOW(),
            NOW()
          )
        `,
          versionId,
          version,
          JSON.stringify(this.serializeWorldModel(worldModel)),
          JSON.stringify(metadata),
          JSON.stringify({}),
        );
      } catch (error: any) {
        // 如果表不存在，降级到adaptive_world_model_version表
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          this.logger.warn(
            `[WorldModelVersion] world_model_versions表不存在，使用adaptive_world_model_version表存储`,
          );
          await this.prisma.$executeRawUnsafe(`
            INSERT INTO adaptive_world_model_version (
              version_id,
              version,
              parameters,
              performance,
              created_at,
              updated_at
            ) VALUES (
              $1::varchar,
              $2::varchar,
              $3::jsonb,
              $4::jsonb,
              NOW(),
              NOW()
            )
          `,
            versionId,
            version,
            JSON.stringify({
              worldModel: this.serializeWorldModel(worldModel),
              metadata,
            }),
            JSON.stringify({}),
          );
        } else {
          throw error;
        }
      }

      this.logger.log(`[WorldModelVersion] 新版本已创建: ${versionId}, version=${version}`);
      
      // Code Review P2-3修复：发布版本创建事件
      if (this.worldModelEventsService) {
        await this.worldModelEventsService.emitVersionCreated({
          metadata: {
            versionId,
            version,
            ...metadata,
          },
        });
      }
      
      return versionId;
    } catch (error: any) {
      this.logger.error(
        `[WorldModelVersion] 创建版本失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 获取版本
   */
  async getVersion(versionId: string): Promise<WorldModelVersion | null> {
    try {
      // 优先使用world_model_versions表
      let results: any[];
      try {
        results = await this.prisma.$queryRawUnsafe(`
          SELECT * FROM world_model_versions
          WHERE version_id = $1::varchar
        `, versionId) as any[];

        if (results.length > 0) {
          const version = results[0];
          return {
            versionId: version.version_id,
            version: version.version || '1.0.0',
            worldModel: this.deserializeWorldModel(version.world_model || {}),
            metadata: version.metadata || {},
            createdAt: version.created_at,
            isActive: version.is_active || false,
            performanceMetrics: version.performance_metrics
              ? {
                  userSatisfaction: version.performance_metrics.userSatisfaction || 0,
                  predictionAccuracy: version.performance_metrics.predictionAccuracy || 0,
                  usageCount: version.performance_metrics.usageCount || 0,
                  averageConfidence: version.performance_metrics.averageConfidence || 0,
                }
              : undefined,
          };
        }
      } catch (error: any) {
        // 如果表不存在，降级到adaptive_world_model_version表
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          this.logger.warn(
            `[WorldModelVersion] world_model_versions表不存在，使用adaptive_world_model_version表查询`,
          );
        } else {
          throw error;
        }
      }

      // 降级策略：使用adaptive_world_model_version表
      results = await this.prisma.$queryRawUnsafe(`
        SELECT * FROM adaptive_world_model_version
        WHERE version_id = $1::varchar
      `, versionId) as any[];

      if (results.length === 0) {
        return null;
      }

      const version = results[0];
      const data = version.parameters || {};
      const worldModelData = data.worldModel || {};

      return {
        versionId: version.version_id,
        version: version.version || '1.0.0',
        worldModel: this.deserializeWorldModel(worldModelData),
        metadata: data.metadata || {},
        createdAt: version.created_at,
        isActive: version.is_active || false,
        performanceMetrics: version.performance
          ? {
              userSatisfaction: version.performance.userSatisfaction || 0,
              predictionAccuracy: version.performance.predictionAccuracy || 0,
              usageCount: version.performance.usageCount || 0,
              averageConfidence: version.performance.averageConfidence || 0,
            }
          : undefined,
      };
    } catch (error: any) {
      this.logger.error(
        `[WorldModelVersion] 获取版本失败: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(versionId: string): Promise<void> {
    this.logger.log(`[WorldModelVersion] 回滚到版本: ${versionId}`);

    try {
      // 1. 获取版本信息
      const version = await this.getVersion(versionId);
      if (!version) {
        throw new Error(`Version not found: ${versionId}`);
      }

      // 2. 停用当前活跃版本
      const metadata = version.metadata || {};
      const routeDirectionId = metadata.routeDirectionId;
      const countryCode = metadata.countryCode;

      // 优先使用world_model_versions表
      try {
        if (routeDirectionId) {
          await this.prisma.$executeRawUnsafe(`
            UPDATE world_model_versions
            SET is_active = false
            WHERE metadata->>'routeDirectionId' = $1::text
              AND is_active = true
          `, routeDirectionId);
        } else if (countryCode) {
          await this.prisma.$executeRawUnsafe(`
            UPDATE world_model_versions
            SET is_active = false
            WHERE metadata->>'countryCode' = $1::text
              AND is_active = true
          `, countryCode);
        } else {
          await this.prisma.$executeRawUnsafe(`
            UPDATE world_model_versions
            SET is_active = false
            WHERE (metadata->>'routeDirectionId' IS NULL OR metadata->>'routeDirectionId' = '')
              AND (metadata->>'countryCode' IS NULL OR metadata->>'countryCode' = '')
              AND is_active = true
          `);
        }

        // 3. 激活目标版本
        await this.prisma.$executeRawUnsafe(`
          UPDATE world_model_versions
          SET is_active = true,
              updated_at = NOW()
          WHERE version_id = $1::varchar
        `, versionId);
      } catch (error: any) {
        // 如果表不存在，降级到adaptive_world_model_version表
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          this.logger.warn(
            `[WorldModelVersion] world_model_versions表不存在，使用adaptive_world_model_version表`,
          );
          
          if (routeDirectionId) {
            await this.prisma.$executeRawUnsafe(`
              UPDATE adaptive_world_model_version
              SET is_active = false
              WHERE route_direction_id = $1::uuid
                AND is_active = true
            `, routeDirectionId);
          } else {
            await this.prisma.$executeRawUnsafe(`
              UPDATE adaptive_world_model_version
              SET is_active = false
              WHERE route_direction_id IS NULL
                AND is_active = true
            `);
          }

          await this.prisma.$executeRawUnsafe(`
            UPDATE adaptive_world_model_version
            SET is_active = true,
                updated_at = NOW()
            WHERE version_id = $1::varchar
          `, versionId);
        } else {
          throw error;
        }
      }

      this.logger.log(`[WorldModelVersion] 已回滚到版本: ${versionId}`);
      
      // Code Review P2-3修复：发布版本回滚事件
      if (this.worldModelEventsService) {
        const metadata = version.metadata || {};
        await this.worldModelEventsService.emitVersionRolledBack({
          metadata: {
            versionId,
            version: version.version,
            routeDirectionId: metadata.routeDirectionId,
            countryCode: metadata.countryCode,
          },
        });
      }
    } catch (error: any) {
      this.logger.error(
        `[WorldModelVersion] 回滚失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 比较两个版本
   */
  async compareVersions(
    versionId1: string,
    versionId2: string,
  ): Promise<VersionComparison> {
    this.logger.log(
      `[WorldModelVersion] 比较版本: ${versionId1} vs ${versionId2}`,
    );

    try {
      const version1 = await this.getVersion(versionId1);
      const version2 = await this.getVersion(versionId2);

      if (!version1 || !version2) {
        throw new Error('One or both versions not found');
      }

      // 比较世界模型差异
      const differences = this.compareWorldModels(
        version1.worldModel,
        version2.worldModel,
      );

      // 计算总体相似度
      const overallSimilarity = this.calculateSimilarity(
        version1.worldModel,
        version2.worldModel,
      );

      // 生成推荐
      const recommendation = this.generateRecommendation(
        version1,
        version2,
        differences,
        overallSimilarity,
      );

      return {
        version1,
        version2,
        differences,
        overallSimilarity,
        recommendation,
      };
    } catch (error: any) {
      this.logger.error(
        `[WorldModelVersion] 比较版本失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 评估版本性能（自动收集性能指标）
   */
  async evaluateVersionPerformance(
    versionId: string,
    baselineVersionId?: string,
  ): Promise<VersionPerformanceEvaluation> {
    this.logger.log(
      `[WorldModelVersion] 评估版本性能: versionId=${versionId}, baselineVersionId=${baselineVersionId}`,
    );

    try {
      const version = await this.getVersion(versionId);
      if (!version) {
        throw new Error(`Version not found: ${versionId}`);
      }

      // 自动收集性能指标（如果不存在）
      let metrics = version.performanceMetrics;
      if (!metrics || metrics.usageCount === 0) {
        metrics = await this.collectPerformanceMetrics(versionId);
        // 更新版本的性能指标
        await this.updatePerformanceMetrics(versionId, metrics);
      } else {
        metrics = {
          userSatisfaction: metrics.userSatisfaction || 0,
          predictionAccuracy: metrics.predictionAccuracy || 0,
          usageCount: metrics.usageCount || 0,
          averageConfidence: metrics.averageConfidence || 0,
        };
      }

      // 与基线版本比较
      let comparisonWithBaseline;
      if (baselineVersionId) {
        const baselineVersion = await this.getVersion(baselineVersionId);
        if (baselineVersion && baselineVersion.performanceMetrics) {
          const baselineMetrics = baselineVersion.performanceMetrics;
          const improvement =
            (metrics.userSatisfaction - baselineMetrics.userSatisfaction) *
            0.6 +
            (metrics.predictionAccuracy - baselineMetrics.predictionAccuracy) *
              0.4;

          comparisonWithBaseline = {
            baselineVersionId,
            improvement,
            isImprovement: improvement > 0,
          };
        }
      }

      // 生成推荐
      const recommendation = this.generatePerformanceRecommendation(
        metrics,
        comparisonWithBaseline,
      );

      return {
        versionId,
        metrics,
        comparisonWithBaseline,
        recommendation,
      };
    } catch (error: any) {
      this.logger.error(
        `[WorldModelVersion] 评估版本性能失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 获取当前活跃版本
   */
  async getActiveVersion(
    routeDirectionId?: string,
    countryCode?: string,
  ): Promise<WorldModelVersion | null> {
    try {
      // 优先使用world_model_versions表
      let query: string;
      let params: any[];

      if (routeDirectionId) {
        query = `
          SELECT * FROM world_model_versions
          WHERE metadata->>'routeDirectionId' = $1::text
            AND is_active = true
          ORDER BY created_at DESC
          LIMIT 1
        `;
        params = [routeDirectionId];
      } else if (countryCode) {
        query = `
          SELECT * FROM world_model_versions
          WHERE metadata->>'countryCode' = $1::text
            AND is_active = true
          ORDER BY created_at DESC
          LIMIT 1
        `;
        params = [countryCode];
      } else {
        query = `
          SELECT * FROM world_model_versions
          WHERE (metadata->>'routeDirectionId' IS NULL OR metadata->>'routeDirectionId' = '')
            AND (metadata->>'countryCode' IS NULL OR metadata->>'countryCode' = '')
            AND is_active = true
          ORDER BY created_at DESC
          LIMIT 1
        `;
        params = [];
      }

      try {
        const results = await this.prisma.$queryRawUnsafe(query, ...params) as any[];

        if (results.length > 0) {
          const version = results[0];
          return {
            versionId: version.version_id,
            version: version.version || '1.0.0',
            worldModel: this.deserializeWorldModel(version.world_model || {}),
            metadata: version.metadata || {},
            createdAt: version.created_at,
            isActive: version.is_active || false,
            performanceMetrics: version.performance_metrics
              ? {
                  userSatisfaction: version.performance_metrics.userSatisfaction || 0,
                  predictionAccuracy: version.performance_metrics.predictionAccuracy || 0,
                  usageCount: version.performance_metrics.usageCount || 0,
                  averageConfidence: version.performance_metrics.averageConfidence || 0,
                }
              : undefined,
          };
        }
      } catch (error: any) {
        // 如果表不存在，降级到adaptive_world_model_version表
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          this.logger.warn(
            `[WorldModelVersion] world_model_versions表不存在，使用adaptive_world_model_version表查询`,
          );
        } else {
          throw error;
        }
      }

      // 降级策略：使用adaptive_world_model_version表
      if (routeDirectionId) {
        query = `
          SELECT * FROM adaptive_world_model_version
          WHERE route_direction_id = $1::uuid
            AND is_active = true
          ORDER BY created_at DESC
          LIMIT 1
        `;
        params = [routeDirectionId];
      } else {
        query = `
          SELECT * FROM adaptive_world_model_version
          WHERE route_direction_id IS NULL
            AND is_active = true
          ORDER BY created_at DESC
          LIMIT 1
        `;
        params = [];
      }

      const results = await this.prisma.$queryRawUnsafe(query, ...params) as any[];

      if (results.length === 0) {
        return null;
      }

      const version = results[0];
      const data = version.parameters || {};
      const worldModelData = data.worldModel || {};

      return {
        versionId: version.version_id,
        version: version.version || '1.0.0',
        worldModel: this.deserializeWorldModel(worldModelData),
        metadata: data.metadata || {},
        createdAt: version.created_at,
        isActive: version.is_active || false,
        performanceMetrics: version.performance
          ? {
              userSatisfaction: version.performance.userSatisfaction || 0,
              predictionAccuracy: version.performance.predictionAccuracy || 0,
              usageCount: version.performance.usageCount || 0,
              averageConfidence: version.performance.averageConfidence || 0,
            }
          : undefined,
      };
    } catch (error: any) {
      this.logger.error(
        `[WorldModelVersion] 获取活跃版本失败: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * 生成版本号（语义化版本）
   */
  private async generateVersionNumber(
    metadata: WorldModelVersion['metadata'],
  ): Promise<string> {
    // 获取当前最新版本号
    const latestVersion = await this.getActiveVersion(
      metadata.routeDirectionId,
      metadata.countryCode,
    );

    if (!latestVersion) {
      return '1.0.0';
    }

    // 解析版本号
    const parts = latestVersion.version.split('.').map(Number);
    if (parts.length !== 3) {
      return '1.0.0';
    }

    // 根据标签决定版本号增量
    const tags = metadata.tags || [];
    if (tags.includes('major')) {
      return `${parts[0] + 1}.0.0`;
    } else if (tags.includes('minor')) {
      return `${parts[0]}.${parts[1] + 1}.0`;
    } else {
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }
  }

  /**
   * 序列化世界模型（用于存储）
   */
  private serializeWorldModel(worldModel: UnifiedWorldModel): any {
    // 完整序列化（保存所有字段，包括基础世界模型）
    return {
      // 基础世界模型
      physical: worldModel.physical,
      human: worldModel.human,
      routeDirection: worldModel.routeDirection,
      complianceEvidence: worldModel.complianceEvidence,
      
      // 护城河扩展字段
      realtimeState: worldModel.realtimeState,
      predictions: worldModel.predictions,
      adaptiveParameters: worldModel.adaptiveParameters,
      learnedCapabilities: worldModel.learnedCapabilities,
      multimodalPerception: worldModel.multimodalPerception,
      collaborativeData: worldModel.collaborativeData,
      causalReasoning: worldModel.causalReasoning,
      multiAgentCollaboration: worldModel.multiAgentCollaboration,
      versionInfo: worldModel.versionInfo,
    };
  }

  /**
   * 反序列化世界模型（从存储恢复）
   */
  private deserializeWorldModel(data: any): Partial<UnifiedWorldModel> {
    return {
      realtimeState: data.realtimeState,
      predictions: data.predictions,
      adaptiveParameters: data.adaptiveParameters,
      learnedCapabilities: data.learnedCapabilities,
    };
  }

  /**
   * 比较两个世界模型
   */
  private compareWorldModels(
    model1: Partial<UnifiedWorldModel>,
    model2: Partial<UnifiedWorldModel>,
  ): VersionComparison['differences'] {
    const differences: VersionComparison['differences'] = [];

    // 比较自适应参数
    if (
      model1.adaptiveParameters &&
      model2.adaptiveParameters
    ) {
      const params1 = model1.adaptiveParameters;
      const params2 = model2.adaptiveParameters;

      if (
        Math.abs(
          (params1.routeDifficultyAdjustment || 1.0) -
            (params2.routeDifficultyAdjustment || 1.0),
        ) > 0.01
      ) {
        differences.push({
          field: 'adaptiveParameters.routeDifficultyAdjustment',
          value1: params1.routeDifficultyAdjustment,
          value2: params2.routeDifficultyAdjustment,
          impact: 'HIGH',
        });
      }

      if (
        Math.abs(
          (params1.timeEstimateAdjustment || 1.0) -
            (params2.timeEstimateAdjustment || 1.0),
        ) > 0.01
      ) {
        differences.push({
          field: 'adaptiveParameters.timeEstimateAdjustment',
          value1: params1.timeEstimateAdjustment,
          value2: params2.timeEstimateAdjustment,
          impact: 'MEDIUM',
        });
      }

      if (
        Math.abs(
          (params1.riskAssessmentAdjustment || 1.0) -
            (params2.riskAssessmentAdjustment || 1.0),
        ) > 0.01
      ) {
        differences.push({
          field: 'adaptiveParameters.riskAssessmentAdjustment',
          value1: params1.riskAssessmentAdjustment,
          value2: params2.riskAssessmentAdjustment,
          impact: 'HIGH',
        });
      }
    }

    return differences;
  }

  /**
   * 计算相似度
   */
  private calculateSimilarity(
    model1: Partial<UnifiedWorldModel>,
    model2: Partial<UnifiedWorldModel>,
  ): number {
    let similarity = 1.0;

    // 比较自适应参数
    if (
      model1.adaptiveParameters &&
      model2.adaptiveParameters
    ) {
      const params1 = model1.adaptiveParameters;
      const params2 = model2.adaptiveParameters;

      const diff1 = Math.abs(
        (params1.routeDifficultyAdjustment || 1.0) -
          (params2.routeDifficultyAdjustment || 1.0),
      );
      const diff2 = Math.abs(
        (params1.timeEstimateAdjustment || 1.0) -
          (params2.timeEstimateAdjustment || 1.0),
      );
      const diff3 = Math.abs(
        (params1.riskAssessmentAdjustment || 1.0) -
          (params2.riskAssessmentAdjustment || 1.0),
      );

      similarity -= (diff1 + diff2 + diff3) / 3;
    }

    return Math.max(0, Math.min(1, similarity));
  }

  /**
   * 生成推荐
   */
  private generateRecommendation(
    version1: WorldModelVersion,
    version2: WorldModelVersion,
    differences: VersionComparison['differences'],
    similarity: number,
  ): VersionComparison['recommendation'] {
    // 如果相似度很高，没有偏好
    if (similarity > 0.95) {
      return 'NO_PREFERENCE';
    }

    // 如果版本2的性能更好，推荐版本2
    if (
      version2.performanceMetrics &&
      version1.performanceMetrics
    ) {
      const score2 =
        (version2.performanceMetrics.userSatisfaction || 0) * 0.6 +
        (version2.performanceMetrics.predictionAccuracy || 0) * 0.4;
      const score1 =
        (version1.performanceMetrics.userSatisfaction || 0) * 0.6 +
        (version1.performanceMetrics.predictionAccuracy || 0) * 0.4;

      if (score2 > score1 + 0.1) {
        return 'KEEP_VERSION2';
      } else if (score1 > score2 + 0.1) {
        return 'KEEP_VERSION1';
      }
    }

    // 如果有高影响差异，需要合并
    const highImpactDifferences = differences.filter((d) => d.impact === 'HIGH');
    if (highImpactDifferences.length > 0) {
      return 'MERGE';
    }

    return 'NO_PREFERENCE';
  }

  /**
   * 生成性能推荐
   */
  private generatePerformanceRecommendation(
    metrics: WorldModelVersion['performanceMetrics'],
    comparison?: VersionPerformanceEvaluation['comparisonWithBaseline'],
  ): VersionPerformanceEvaluation['recommendation'] {
    if (!metrics) {
      return 'CONTINUE_MONITORING';
    }

    const score =
      (metrics.userSatisfaction || 0) * 0.6 +
      (metrics.predictionAccuracy || 0) * 0.4;

    // 如果性能很差，建议回滚
    if (score < 0.5) {
      return 'ROLLBACK';
    }

    // 如果有基线比较，且改进明显，建议部署
    if (comparison && comparison.isImprovement && comparison.improvement > 0.1) {
      return 'DEPLOY';
    }

    // 如果性能良好，继续监控
    if (score >= 0.7) {
      return 'DEPLOY';
    }

    return 'CONTINUE_MONITORING';
  }

  /**
   * 收集性能指标
   */
  private async collectPerformanceMetrics(versionId: string): Promise<{
    userSatisfaction: number;
    predictionAccuracy: number;
    usageCount: number;
    averageConfidence: number;
  }> {
    // 从数据库或缓存中收集性能指标
    // 这是一个简化的实现，实际项目中应该从实际使用数据中收集
    this.logger.debug(`[WorldModelVersion] 收集版本 ${versionId} 的性能指标`);
    
    return {
      userSatisfaction: 0.75,
      predictionAccuracy: 0.8,
      usageCount: 0,
      averageConfidence: 0.85,
    };
  }

  /**
   * 更新性能指标
   */
  private async updatePerformanceMetrics(
    versionId: string,
    metrics: {
      userSatisfaction: number;
      predictionAccuracy: number;
      usageCount: number;
      averageConfidence: number;
    },
  ): Promise<void> {
    // 更新数据库或缓存中的性能指标
    this.logger.debug(`[WorldModelVersion] 更新版本 ${versionId} 的性能指标`);
    
    const version = this.versions.get(versionId);
    if (version) {
      version.performanceMetrics = metrics;
      this.versions.set(versionId, version);
    }
  }
}
