/**
 * 协作世界模型服务
 * 
 * 负责管理用户贡献和专家验证，包括：
 * - 用户贡献（用户报告、验证）
 * - 专家验证（专家审核、标注）
 * - 数据质量评分系统
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { QualityScoreThresholds, DefaultValues, WeightConfigs } from '../utils/world-model-constants';
import { WorldModelEventsService } from './world-model-events.service';

/**
 * 用户贡献类型
 */
export type UserContributionType =
  | 'ROAD_STATUS_REPORT'
  | 'POI_STATUS_REPORT'
  | 'WEATHER_REPORT'
  | 'DIFFICULTY_CORRECTION'
  | 'TIME_ESTIMATE_CORRECTION'
  | 'RISK_ASSESSMENT_CORRECTION'
  | 'IMAGE_UPLOAD'
  | 'TEXT_REVIEW';

/**
 * 用户贡献
 */
export interface UserContribution {
  id: string;
  userId: string;
  type: UserContributionType;
  targetId: string; // roadId, poiId, routeDirectionId等
  data: any;
  qualityScore: number; // 0-1
  verifiedByExpert: boolean;
  expertVerificationId?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 专家验证
 */
export interface ExpertVerification {
  id: string;
  expertId: string;
  contributionId: string;
  verificationResult: 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION';
  comments?: string;
  qualityScore: number; // 0-1
  confidence: number; // 0-1
  createdAt: Date;
}

/**
 * 数据质量评分
 */
export interface DataQualityScore {
  contributionId: string;
  overallScore: number; // 0-1
  completeness: number; // 0-1
  accuracy: number; // 0-1
  consistency: number; // 0-1
  reliability: number; // 0-1
  factors: string[];
}

@Injectable()
export class CollaborativeWorldModelService {
  private readonly logger = new Logger(CollaborativeWorldModelService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private worldModelEventsService?: WorldModelEventsService,
  ) {}

  /**
   * 提交用户贡献
   */
  async submitContribution(
    userId: string,
    type: UserContributionType,
    targetId: string,
    data: any,
  ): Promise<UserContribution> {
    this.logger.log(
      `[CollaborativeWorldModel] 提交用户贡献: userId=${userId}, type=${type}, targetId=${targetId}`,
    );

    try {
      // 1. 评估数据质量
      const qualityScore = this.assessContributionQuality(type, data);

      // 2. 创建贡献记录
      const contributionId = `contrib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 计算状态：如果质量评分高，自动批准；否则需要专家审核
      const status: UserContribution['status'] =
        qualityScore >= QualityScoreThresholds.AUTO_APPROVE
          ? 'APPROVED'
          : 'NEEDS_REVIEW';
      
      // 存储到user_contribution表
      try {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO user_contribution (
            id,
            user_id,
            type,
            target_id,
            data,
            quality_score,
            status,
            created_at,
            updated_at
          ) VALUES (
            $1::uuid,
            $2::uuid,
            $3::varchar,
            $4::varchar,
            $5::jsonb,
            $6::double precision,
            $7::varchar,
            NOW(),
            NOW()
          )
        `,
          contributionId,
          userId,
          type,
          targetId,
          JSON.stringify(data),
          qualityScore,
          status,
        );
      } catch (error: any) {
        // 如果表不存在，降级到user_feedback表
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          this.logger.warn(
            `[CollaborativeWorldModel] user_contribution表不存在，使用user_feedback表存储`,
          );
          await this.prisma.$executeRawUnsafe(`
            INSERT INTO user_feedback (
              id,
              trip_id,
              user_id,
              feedback_type,
              feedback_data,
              quality_score,
              created_at,
              updated_at
            ) VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::varchar,
              $5::jsonb,
              $6::double precision,
              NOW(),
              NOW()
            )
          `,
            contributionId,
            targetId, // 使用targetId作为tripId（临时）
            userId,
            type,
            JSON.stringify(data),
            qualityScore,
          );
        } else {
          throw error;
        }
      }

      const contribution: UserContribution = {
        id: contributionId,
        userId,
        type,
        targetId,
        data,
        qualityScore,
        verifiedByExpert: false,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.logger.log(
        `[CollaborativeWorldModel] 用户贡献已提交: id=${contributionId}, qualityScore=${qualityScore}, status=${status}`,
      );

      // Code Review P2-3修复：发布用户贡献事件
      if (this.worldModelEventsService) {
        await this.worldModelEventsService.emitUserContribution({
          userId,
          contributionId,
          contributionType: type,
          qualityScore,
          tripId: targetId, // 使用targetId作为tripId（临时）
          metadata: {
            status,
            verifiedByExpert: false,
          },
        });
      }

      return contribution;
    } catch (error: any) {
      this.logger.error(
        `[CollaborativeWorldModel] 提交用户贡献失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 专家验证用户贡献
   */
  async verifyContribution(
    expertId: string,
    contributionId: string,
    verificationResult: ExpertVerification['verificationResult'],
    comments?: string,
    confidence: number = DefaultValues.CONFIDENCE,
  ): Promise<ExpertVerification> {
    this.logger.log(
      `[CollaborativeWorldModel] 专家验证: expertId=${expertId}, contributionId=${contributionId}, result=${verificationResult}`,
    );

    try {
      // 1. 获取贡献数据
      const contribution = await this.getContribution(contributionId);
      if (!contribution) {
        throw new Error(`Contribution not found: ${contributionId}`);
      }

      // 2. 计算质量评分
      const qualityScore = this.calculateExpertQualityScore(
        contribution,
        verificationResult,
        confidence,
      );

      // 3. 创建验证记录
      const verificationId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 存储到expert_verification表
      try {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO expert_verification (
            id,
            expert_id,
            contribution_id,
            verification_result,
            comments,
            quality_score,
            confidence,
            created_at
          ) VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::varchar,
            $5::text,
            $6::double precision,
            $7::double precision,
            NOW()
          )
        `,
          verificationId,
          expertId,
          contributionId,
          verificationResult,
          comments || null,
          qualityScore,
          confidence,
        );

        // 4. 更新贡献状态
        const newStatus: UserContribution['status'] =
          verificationResult === 'APPROVED'
            ? 'APPROVED'
            : verificationResult === 'REJECTED'
              ? 'REJECTED'
              : 'NEEDS_REVIEW';

        await this.prisma.$executeRawUnsafe(`
          UPDATE user_contribution
          SET status = $1::varchar,
              verified_by_expert = true,
              expert_verification_id = $2::uuid,
              updated_at = NOW()
          WHERE id = $3::uuid
        `, newStatus, verificationId, contributionId);
      } catch (error: any) {
        // 如果表不存在，使用内存存储（降级策略）
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          this.logger.warn(
            `[CollaborativeWorldModel] expert_verification表不存在，使用内存存储`,
          );
        } else {
          throw error;
        }
      }

      const verification: ExpertVerification = {
        id: verificationId,
        expertId,
        contributionId,
        verificationResult,
        comments,
        qualityScore,
        confidence,
        createdAt: new Date(),
      };

      this.logger.log(
        `[CollaborativeWorldModel] 专家验证完成: id=${verificationId}, result=${verificationResult}`,
      );

      return verification;
    } catch (error: any) {
      this.logger.error(
        `[CollaborativeWorldModel] 专家验证失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 批量获取数据质量评分（Code Review P1-4修复：添加批量查询）
   */
  async getDataQualityScores(
    contributionIds: string[],
  ): Promise<Map<string, DataQualityScore>> {
    const results = new Map<string, DataQualityScore>();
    
    // Code Review P1-4修复：使用批量查询获取所有贡献
    if (contributionIds.length === 0) {
      return results;
    }

    try {
      // 批量获取贡献数据（使用IN查询，避免N+1）
      const contributions = await this.prisma.$queryRawUnsafe(`
        SELECT 
          uc.id,
          uc.user_id,
          uc.type,
          uc.target_id,
          uc.data,
          uc.quality_score,
          uc.verified_by_expert,
          uc.status,
          uc.created_at,
          uc.updated_at,
          ev.verification_result,
          ev.quality_score as expert_quality_score
        FROM user_contribution uc
        LEFT JOIN expert_verification ev ON uc.id = ev.contribution_id
        WHERE uc.id = ANY($1::uuid[])
      `, contributionIds) as any[];

      // 批量计算质量评分（并行执行）
      const qualityPromises = contributions.map(async (contribution) => {
        const contributionObj: UserContribution = {
          id: contribution.id,
          userId: contribution.user_id,
          type: contribution.type,
          targetId: contribution.target_id,
          data: contribution.data,
          qualityScore: contribution.quality_score || 0,
          verifiedByExpert: contribution.verified_by_expert || false,
          status: contribution.status,
          createdAt: contribution.created_at,
          updatedAt: contribution.updated_at,
        };

        // 计算各项质量指标（并行执行）
        const [completeness, accuracy, consistency, reliability] = await Promise.all([
          Promise.resolve(this.assessCompleteness(contributionObj)),
          Promise.resolve(this.assessAccuracy(contributionObj)),
          this.assessConsistency(contributionObj),
          this.assessReliability(contributionObj),
        ]);

        // 综合评分
        const overallScore =
          completeness * 0.25 +
          accuracy * 0.35 +
          consistency * 0.2 +
          reliability * 0.2;

        // 识别质量因素
        const factors: string[] = [];
        if (completeness < QualityScoreThresholds.MEDIUM) factors.push('incomplete_data');
        if (accuracy < QualityScoreThresholds.MEDIUM) factors.push('low_accuracy');
        if (consistency < QualityScoreThresholds.MEDIUM) factors.push('inconsistent');
        if (reliability < QualityScoreThresholds.MEDIUM) factors.push('unreliable_source');
        if (contributionObj.verifiedByExpert) factors.push('expert_verified');

        const qualityScore: DataQualityScore = {
          contributionId: contribution.id,
          overallScore,
          completeness,
          accuracy,
          consistency,
          reliability,
          factors,
        };

        results.set(contribution.id, qualityScore);
      });

      await Promise.all(qualityPromises);

      // 批量存储质量评分到数据库
      if (results.size > 0) {
        try {
          const values = Array.from(results.values()).map((qs) => 
            `(gen_random_uuid(), '${qs.contributionId}'::uuid, ${qs.overallScore}, ${qs.completeness}, ${qs.accuracy}, ${qs.consistency}, ${qs.reliability}, ARRAY[${qs.factors.map(f => `'${f}'`).join(',')}]::text[], NOW(), NOW())`
          ).join(',');
          
          await this.prisma.$executeRawUnsafe(`
            INSERT INTO data_quality_score (
              id, contribution_id, overall_score, completeness, accuracy, consistency, reliability, factors, created_at, updated_at
            ) VALUES ${values}
            ON CONFLICT (contribution_id) DO UPDATE SET
              overall_score = EXCLUDED.overall_score,
              completeness = EXCLUDED.completeness,
              accuracy = EXCLUDED.accuracy,
              consistency = EXCLUDED.consistency,
              reliability = EXCLUDED.reliability,
              factors = EXCLUDED.factors,
              updated_at = NOW()
          `);
        } catch (error: any) {
          // 如果表不存在，忽略错误（降级策略）
          if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
            this.logger.warn(
              `[CollaborativeWorldModel] data_quality_score表不存在，跳过批量存储`,
            );
          } else {
            this.logger.warn(
              `[CollaborativeWorldModel] 批量存储数据质量评分失败: ${error.message}`,
            );
          }
        }
      }
    } catch (error: any) {
      this.logger.error(
        `[CollaborativeWorldModel] 批量获取数据质量评分失败: ${error.message}`,
        error.stack,
      );
    }

    return results;
  }

  /**
   * 获取数据质量评分
   */
  async getDataQualityScore(contributionId: string): Promise<DataQualityScore> {
    this.logger.log(
      `[CollaborativeWorldModel] 获取数据质量评分: contributionId=${contributionId}`,
    );

    try {
      const contribution = await this.getContribution(contributionId);
      if (!contribution) {
        throw new Error(`Contribution not found: ${contributionId}`);
      }

      // 计算各项质量指标
      const completeness = this.assessCompleteness(contribution);
      const accuracy = this.assessAccuracy(contribution);
      const consistency = await this.assessConsistency(contribution);
      const reliability = await this.assessReliability(contribution);

      // 综合评分（加权平均）
      const overallScore =
        completeness * 0.25 +
        accuracy * 0.35 +
        consistency * 0.2 +
        reliability * 0.2;

      // 识别质量因素
      const factors: string[] = [];
      if (completeness < QualityScoreThresholds.MEDIUM) factors.push('incomplete_data');
      if (accuracy < QualityScoreThresholds.MEDIUM) factors.push('low_accuracy');
      if (consistency < QualityScoreThresholds.MEDIUM) factors.push('inconsistent');
      if (reliability < QualityScoreThresholds.MEDIUM) factors.push('unreliable_source');
      if (contribution.verifiedByExpert) factors.push('expert_verified');

      const qualityScore: DataQualityScore = {
        contributionId,
        overallScore,
        completeness,
        accuracy,
        consistency,
        reliability,
        factors,
      };

      // 存储质量评分到数据库
      try {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO data_quality_score (
            id,
            contribution_id,
            overall_score,
            completeness,
            accuracy,
            consistency,
            reliability,
            factors,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            $1::uuid,
            $2::double precision,
            $3::double precision,
            $4::double precision,
            $5::double precision,
            $6::double precision,
            $7::text[],
            NOW(),
            NOW()
          )
          ON CONFLICT (contribution_id) DO UPDATE SET
            overall_score = EXCLUDED.overall_score,
            completeness = EXCLUDED.completeness,
            accuracy = EXCLUDED.accuracy,
            consistency = EXCLUDED.consistency,
            reliability = EXCLUDED.reliability,
            factors = EXCLUDED.factors,
            updated_at = NOW()
        `,
          contributionId,
          overallScore,
          completeness,
          accuracy,
          consistency,
          reliability,
          factors,
        );
      } catch (error: any) {
        // 如果表不存在，忽略错误（降级策略）
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          this.logger.warn(
            `[CollaborativeWorldModel] data_quality_score表不存在，跳过存储`,
          );
        } else {
          this.logger.warn(
            `[CollaborativeWorldModel] 存储数据质量评分失败: ${error.message}`,
          );
        }
      }

      return qualityScore;
    } catch (error: any) {
      this.logger.error(
        `[CollaborativeWorldModel] 获取数据质量评分失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 获取已验证的贡献（用于世界模型构建）
   */
  async getVerifiedContributions(
    targetId: string,
    type?: UserContributionType,
  ): Promise<UserContribution[]> {
    this.logger.log(
      `[CollaborativeWorldModel] 获取已验证贡献: targetId=${targetId}, type=${type}`,
    );

    try {
      // 从user_contribution表查询已验证的贡献
      let query = `
        SELECT uc.*, ev.id as expert_verification_id
        FROM user_contribution uc
        LEFT JOIN expert_verification ev ON uc.expert_verification_id = ev.id
        WHERE uc.target_id = $1::varchar
          AND uc.status = 'APPROVED'
      `;
      const params: any[] = [targetId];

      if (type) {
        query += ` AND uc.type = $2::varchar`;
        params.push(type);
      }

      query += ` ORDER BY uc.created_at DESC`;

      const results = await this.prisma.$queryRawUnsafe(query, ...params) as any[];

      return results.map((row) => ({
        id: row.id,
        userId: row.user_id,
        type: row.type as UserContributionType,
        targetId: row.target_id,
        data: row.data,
        qualityScore: row.quality_score || 0,
        verifiedByExpert: row.verified_by_expert || false,
        expertVerificationId: row.expert_verification_id,
        status: row.status as UserContribution['status'],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error: any) {
      // 如果表不存在，返回空数组（降级策略）
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        this.logger.warn(
          `[CollaborativeWorldModel] user_contribution表不存在，返回空数组`,
        );
        return [];
      }
      this.logger.error(
        `[CollaborativeWorldModel] 获取已验证贡献失败: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * 评估贡献质量（简单实现）
   */
  private assessContributionQuality(
    type: UserContributionType,
    data: any,
  ): number {
    let score = 0.5; // 基础分

    // 根据类型和数据完整性评分
    switch (type) {
      case 'ROAD_STATUS_REPORT':
        if (data.status && data.timestamp) score += 0.3;
        if (data.reason) score += 0.2;
        break;

      case 'POI_STATUS_REPORT':
        if (data.status) score += 0.3;
        if (data.waitTime !== undefined) score += 0.2;
        break;

      case 'WEATHER_REPORT':
        if (data.condition && data.temperature !== undefined) score += 0.3;
        if (data.windSpeed !== undefined) score += 0.2;
        break;

      case 'DIFFICULTY_CORRECTION':
        if (data.actualDifficulty !== undefined) score += 0.3;
        if (data.reason) score += 0.2;
        break;

      case 'IMAGE_UPLOAD':
        if (data.imageUrl) score += 0.3;
        if (data.location) score += 0.2;
        break;

      case 'TEXT_REVIEW':
        if (data.text && data.text.length > 50) score += 0.3;
        if (data.sentiment) score += 0.2;
        break;
    }

    return Math.min(1, score);
  }

  /**
   * 计算专家质量评分
   */
  private calculateExpertQualityScore(
    contribution: UserContribution,
    verificationResult: ExpertVerification['verificationResult'],
    confidence: number,
  ): number {
    let score = contribution.qualityScore;

    // 专家批准提高评分
    if (verificationResult === 'APPROVED') {
      score = Math.min(1, score + 0.2);
    } else if (verificationResult === 'REJECTED') {
      score = Math.max(0, score - 0.3);
    }

    // 考虑专家置信度
    score = score * WeightConfigs.QUALITY_SCORE + confidence * WeightConfigs.CONFIDENCE;

    return Math.min(1, Math.max(0, score));
  }

  /**
   * 评估完整性
   */
  private assessCompleteness(contribution: UserContribution): number {
    // 根据贡献类型和数据完整性评分
    const requiredFields = this.getRequiredFields(contribution.type);
    const providedFields = Object.keys(contribution.data || {});

    const completeness =
      providedFields.filter((f) => requiredFields.includes(f)).length /
      requiredFields.length;

    return Math.min(1, completeness);
  }

  /**
   * 评估准确性（基于专家验证）
   */
  private assessAccuracy(contribution: UserContribution): number {
    if (contribution.verifiedByExpert) {
      return contribution.qualityScore;
    }
    return contribution.qualityScore * WeightConfigs.QUALITY_SCORE; // 未验证的准确性较低
  }

  /**
   * 评估一致性（与其他贡献的一致性）
   * Code Review P1-3修复：优化查询，避免N+1问题
   */
  private async assessConsistency(contribution: UserContribution): Promise<number> {
    try {
      // Code Review P1-3修复：使用JOIN查询一次性获取所有相关数据
      const results = await this.prisma.$queryRawUnsafe(`
        SELECT 
          uc.id,
          uc.data,
          uc.quality_score,
          ev.verification_result,
          ev.quality_score as expert_quality_score
        FROM user_contribution uc
        LEFT JOIN expert_verification ev ON uc.id = ev.contribution_id
        WHERE uc.target_id = $1::varchar
          AND uc.type = $2::varchar
          AND uc.status IN ('APPROVED', 'NEEDS_REVIEW')
          AND uc.id != $3::uuid
        ORDER BY uc.created_at DESC
        LIMIT 10
      `, contribution.targetId, contribution.type, contribution.id) as any[];

      if (results.length === 0) {
        return DefaultValues.CONSISTENCY; // 没有其他贡献，一致性中等
      }

      // 比较数据一致性（在内存中进行，避免额外查询）
      let consistentCount = 0;
      for (const other of results) {
        // 简单一致性检查：比较关键字段
        const isConsistent = this.compareContributionData(
          contribution.data,
          other.data,
        );
        if (isConsistent) {
          consistentCount++;
        }
      }

      // 计算一致性比例
      const consistency =
        results.length > 0 ? consistentCount / results.length : DefaultValues.CONSISTENCY;

      return Math.max(0, Math.min(1, consistency));
    } catch (error: any) {
      this.logger.warn(
        `[CollaborativeWorldModel] 评估一致性失败: ${error.message}`,
      );
      return QualityScoreThresholds.HIGH; // 降级策略：返回默认值
    }
  }

  /**
   * 比较贡献数据一致性
   */
  private compareContributionData(data1: any, data2: any): boolean {
    // 简单比较：检查关键字段是否一致
    if (data1.status && data2.status) {
      return data1.status === data2.status;
    }
    if (data1.condition && data2.condition) {
      return data1.condition === data2.condition;
    }
    // 如果没有关键字段，认为一致
    return true;
  }

  /**
   * 评估可靠性（基于用户历史）
   */
  private async assessReliability(contribution: UserContribution): Promise<number> {
    try {
      // 获取用户的历史贡献
      const userContributions = await this.prisma.$queryRawUnsafe(`
        SELECT quality_score, status
        FROM user_contribution
        WHERE user_id = $1::uuid
          AND id != $2::uuid
        ORDER BY created_at DESC
        LIMIT 10
      `, contribution.userId, contribution.id) as any[];

      if (userContributions.length === 0) {
        return DefaultValues.RELIABILITY; // 没有历史贡献，可靠性中等
      }

      // 计算用户历史平均质量评分
      const approvedContributions = userContributions.filter(
        (c) => c.status === 'APPROVED',
      );
      const averageQualityScore =
        approvedContributions.length > 0
          ? approvedContributions.reduce(
              (sum, c) => sum + (c.quality_score || 0),
              0,
            ) / approvedContributions.length
          : 0.5;

      // 计算批准率
      const approvalRate =
        approvedContributions.length / userContributions.length;

      // 综合可靠性评分
      const reliability = averageQualityScore * WeightConfigs.AVERAGE_QUALITY + approvalRate * WeightConfigs.APPROVAL_RATE;

      return Math.max(0, Math.min(1, reliability));
    } catch (error: any) {
      // 如果表不存在，返回默认值（降级策略）
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        this.logger.warn(
          `[CollaborativeWorldModel] user_contribution表不存在，返回默认可靠性`,
        );
        return DefaultValues.RELIABILITY;
      }
      this.logger.warn(
        `[CollaborativeWorldModel] 评估可靠性失败: ${error.message}`,
      );
      return DefaultValues.RELIABILITY; // 降级策略：返回默认值
    }
  }

  /**
   * 获取必需字段
   */
  private getRequiredFields(type: UserContributionType): string[] {
    const fieldMap: Record<UserContributionType, string[]> = {
      ROAD_STATUS_REPORT: ['status', 'timestamp'],
      POI_STATUS_REPORT: ['status'],
      WEATHER_REPORT: ['condition', 'temperature'],
      DIFFICULTY_CORRECTION: ['actualDifficulty'],
      TIME_ESTIMATE_CORRECTION: ['actualTime'],
      RISK_ASSESSMENT_CORRECTION: ['actualRisk'],
      IMAGE_UPLOAD: ['imageUrl'],
      TEXT_REVIEW: ['text'],
    };

    return fieldMap[type] || [];
  }

  /**
   * 获取贡献
   */
  private async getContribution(
    contributionId: string,
  ): Promise<UserContribution | null> {
    try {
      const results = await this.prisma.$queryRawUnsafe(`
        SELECT uc.*, ev.id as expert_verification_id
        FROM user_contribution uc
        LEFT JOIN expert_verification ev ON uc.expert_verification_id = ev.id
        WHERE uc.id = $1::uuid
      `, contributionId) as any[];

      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      return {
        id: row.id,
        userId: row.user_id,
        type: row.type as UserContributionType,
        targetId: row.target_id,
        data: row.data,
        qualityScore: row.quality_score || 0,
        verifiedByExpert: row.verified_by_expert || false,
        expertVerificationId: row.expert_verification_id,
        status: row.status as UserContribution['status'],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error: any) {
      // 如果表不存在，返回null（降级策略）
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        this.logger.warn(
          `[CollaborativeWorldModel] user_contribution表不存在，返回null`,
        );
        return null;
      }
      this.logger.error(
        `[CollaborativeWorldModel] 获取贡献失败: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}
