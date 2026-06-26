// Recruiting Runtime Service
// 招募运行时编排服务 - 协调归因和结果评估

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RecruitingAttributionService } from './recruiting-attribution.service';
import { RecruitingOutcomeService } from './recruiting-outcome.service';
import {
  RecruitingAttributionRequest,
  RecruitingAttributionResult,
  RecruitingOutcomeRequest,
  RecruitingOutcomeResult,
  RecruitingInsights,
  RecruitingOptimization,
  RecruitingRuntimeContext,
} from '../types/recruiting-runtime.types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RecruitingRuntimeService {
  private readonly logger = new Logger(RecruitingRuntimeService.name);

  constructor(
    @Optional() private readonly attributionService?: RecruitingAttributionService,
    @Optional() private readonly outcomeService?: RecruitingOutcomeService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * 审核申请（带归因）
   */
  async reviewApplication(
    applicationId: string,
    decision: 'approved' | 'rejected',
    context: {
      captainUserId: string;
      applicantUserId: string;
      compatibilityScore?: number;
      mbtiCompatibility?: 'high' | 'medium' | 'low';
      requiredSkills?: string[];
      applicantSkills?: string[];
      scheduleConflict?: boolean;
      timeAvailability?: 'excellent' | 'good' | 'poor';
      budgetFit?: 'perfect' | 'acceptable' | 'poor';
      captainPreference?: string;
      slotRequirement?: string;
      teamBalance?: {
        genderBalance?: number;
        ageBalance?: number;
        roleBalance?: number;
      };
      pastCollaboration?: boolean;
      governanceFlags?: string[];
    },
  ): Promise<RecruitingAttributionResult | null> {
    if (!this.attributionService) {
      this.logger.warn('RecruitingAttributionService not available, skipping attribution');
      return null;
    }

    try {
      const request: RecruitingAttributionRequest = {
        eventType: decision === 'approved' ? 'recruiting.application_approved' : 'recruiting.application_rejected',
        payload: {
          applicationId,
          decision,
          captainUserId: context.captainUserId,
          applicantUserId: context.applicantUserId,
          compatibilityScore: context.compatibilityScore,
          mbtiCompatibility: context.mbtiCompatibility,
          requiredSkills: context.requiredSkills,
          applicantSkills: context.applicantSkills,
          scheduleConflict: context.scheduleConflict,
          timeAvailability: context.timeAvailability,
          budgetFit: context.budgetFit,
          captainPreference: context.captainPreference,
          slotRequirement: context.slotRequirement,
          teamBalance: context.teamBalance,
          pastCollaboration: context.pastCollaboration,
          governanceFlags: context.governanceFlags,
        },
      };

      const result = await this.attributionService.analyze(request);

      // 保存归因到数据库
      if (this.prisma) {
        try {
          await this.prisma.matchSquareApplication.update({
            where: { id: applicationId },
            data: { attribution: result.attribution as any },
          });
        } catch (dbError) {
          this.logger.error(`Failed to save attribution for application ${applicationId}: ${dbError}`);
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to analyze attribution for application ${applicationId}: ${error}`);
      return null;
    }
  }

  /**
   * 评估招募结果
   */
  async evaluateRecruitment(
    postId: string,
    tripId?: string,
  ): Promise<RecruitingOutcomeResult | null> {
    if (!this.outcomeService || !this.prisma) {
      this.logger.warn('RecruitingOutcomeService or PrismaService not available, skipping outcome evaluation');
      return null;
    }

    try {
      // 获取招募帖信息
      const post = await this.prisma.matchSquarePost.findUnique({
        where: { id: postId },
      });

      if (!post) {
        this.logger.warn(`Post ${postId} not found`);
        return null;
      }

      // 获取所有申请
      const applications = await this.prisma.matchSquareApplication.findMany({
        where: { postId },
      });

      // 获取 Trip Outcome（如果有）
      let tripOutcome;
      if (tripId) {
        const outcomeRecord = await this.prisma.travelOutcome.findFirst({
          where: { tripId },
        });
        if (outcomeRecord) {
          tripOutcome = {
            successLevel: outcomeRecord.success as any,
            overallScore: outcomeRecord.overallScore,
            companionSatisfaction: outcomeRecord.companionSatisfaction,
            companionMatchScore: outcomeRecord.companionMatchScore,
          };
        }
      }

      const request: RecruitingOutcomeRequest = {
        postId,
        tripId,
        tripOutcome,
        applications: applications.map(app => ({
          id: app.id,
          status: app.status,
          decidedAt: app.decidedAt ? new Date(app.decidedAt) : undefined,
          attribution: app.attribution as any,
        })),
        post: {
          slotsNeeded: post.slotsNeeded,
          publishedAt: post.publishedAt ? new Date(post.publishedAt) : undefined,
          closedAt: post.closedAt ? new Date(post.closedAt) : undefined,
        },
      };

      const result = await this.outcomeService.calculate(request);

      // 保存结果到数据库
      try {
        await this.prisma.matchSquarePost.update({
          where: { id: postId },
          data: { outcome: result.outcome as any, tripId },
        });
      } catch (dbError) {
        this.logger.error(`Failed to save outcome for post ${postId}: ${dbError}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to evaluate recruitment for post ${postId}: ${error}`);
      return null;
    }
  }

  /**
   * 获取招募洞察
   */
  async getRecruitmentInsights(postId: string): Promise<RecruitingInsights | null> {
    if (!this.prisma) {
      this.logger.warn('PrismaService not available');
      return null;
    }

    try {
      // 获取所有申请
      const applications = await this.prisma.matchSquareApplication.findMany({
        where: { postId },
      });

      // 统计归因
      const primaryReasons: Record<string, number> = {};
      const signalDistribution: Record<string, number> = {};
      const confidenceDistribution: Record<string, number> = {};

      applications.forEach(app => {
        if (app.attribution) {
          const attr = app.attribution as any;
          const reason = attr.primaryReason || 'unknown';
          primaryReasons[reason] = (primaryReasons[reason] || 0) + 1;

          if (attr.signalScores) {
            Object.entries(attr.signalScores).forEach(([signal, score]) => {
              signalDistribution[signal] = (signalDistribution[signal] || 0) + (score as number);
            });
          }

          const confidence = attr.confidence || 'LOW';
          confidenceDistribution[confidence] = (confidenceDistribution[confidence] || 0) + 1;
        }
      });

      // 获取招募结果
      const post = await this.prisma.matchSquarePost.findUnique({
        where: { id: postId },
      });

      const outcomeSummary = post?.outcome as any;

      // 生成推荐
      const recommendations = this.generateInsightRecommendations(
        primaryReasons,
        signalDistribution,
        outcomeSummary,
      );

      return {
        postId,
        attributionSummary: {
          primaryReasons,
          signalDistribution,
          confidenceDistribution,
        },
        outcomeSummary,
        recommendations,
      };
    } catch (error) {
      this.logger.error(`Failed to get insights for post ${postId}: ${error}`);
      return null;
    }
  }

  /**
   * 推荐优化策略
   */
  async recommendOptimizations(postId: string): Promise<RecruitingOptimization[]> {
    const insights = await this.getRecruitmentInsights(postId);
    if (!insights) return [];

    const optimizations: RecruitingOptimization[] = [];

    // 基于归因分析的优化
    const signalDistribution = insights.attributionSummary.signalDistribution;
    const lowSignals = Object.entries(signalDistribution)
      .filter(([_, score]) => (score as number) < 0.5)
      .map(([signal]) => signal);

    if (lowSignals.includes('MBTI_COMPATIBILITY') || lowSignals.includes('INTERACTION_MODE')) {
      optimizations.push({
        type: 'compatibility',
        priority: 'high',
        description: '个性兼容性匹配效果不佳',
        actionItems: [
          '增加 MBTI 详细信息展示',
          '添加交互模式偏好问卷',
          '提供兼容性预测预览',
        ],
        expectedImpact: '提高匹配成功率 15-20%',
      });
    }

    if (lowSignals.includes('SKILL_MATCH')) {
      optimizations.push({
        type: 'screening',
        priority: 'high',
        description: '技能匹配度较低',
        actionItems: [
          '明确岗位技能要求',
          '添加技能认证验证',
          '提供技能自评工具',
        ],
        expectedImpact: '提高岗位填充率 10-15%',
      });
    }

    if (lowSignals.includes('TIME_AVAILABILITY')) {
      optimizations.push({
        type: 'communication',
        priority: 'medium',
        description: '时间协调问题较多',
        actionItems: [
          '添加日历同步功能',
          '提供时间冲突检测',
          '增加灵活时间选项',
        ],
        expectedImpact: '减少时间相关拒绝 20-30%',
      });
    }

    // 基于招募结果的优化
    if (insights.outcomeSummary) {
      const outcome = insights.outcomeSummary;
      if (outcome.successLevel === 'POOR' || outcome.successLevel === 'FAILED') {
        optimizations.push({
          type: 'exposure',
          priority: 'high',
          description: '招募成功率低',
          actionItems: [
            '增加付费推广',
            '优化招募帖文案',
            '降低初始筛选标准',
          ],
          expectedImpact: '提高申请量 30-50%',
        });
      }

      if (outcome.metrics?.timeToFill > 14) {
        optimizations.push({
          type: 'exposure',
          priority: 'medium',
          description: '招募耗时过长',
          actionItems: [
            '增加曝光渠道',
            '缩短招募周期',
            '提供快速匹配功能',
          ],
          expectedImpact: '缩短招募时间 40-50%',
        });
      }
    }

    // 基于归因分布的优化
    const primaryReasons = insights.attributionSummary.primaryReasons;
    const governanceCount = primaryReasons['GOVERNANCE'] || 0;
    if (governanceCount > 0) {
      optimizations.push({
        type: 'screening',
        priority: 'high',
        description: '存在治理规则拒绝',
          actionItems: [
            '提前展示治理规则说明',
            '添加黑名单提示',
            '提供申诉流程',
          ],
        expectedImpact: '减少无效申请 10-15%',
      });
    }

    return optimizations.length > 0 ? optimizations : [
      {
        type: 'compatibility',
        priority: 'low',
        description: '招募表现良好',
        actionItems: ['保持当前策略'],
        expectedImpact: '维持当前水平',
      },
    ];
  }

  /**
   * 构建归因上下文
   */
  async buildAttributionContext(
    applicationId: string,
  ): Promise<{
    post?: {
      captainMbtiType?: string;
      captainInteractionMode?: string;
      planningStyle?: string;
      slotsNeeded: number;
      budgetMinCents?: number;
      budgetMaxCents?: number;
    };
    applicant?: {
      mbtiType?: string;
      cardTitle?: string;
      interactionMode?: string;
      skills?: string[];
      experienceLevel?: 'beginner' | 'intermediate' | 'expert';
    };
    existingTeam?: {
      memberCount: number;
      genderDistribution?: Record<string, number>;
      ageRange?: { min: number; max: number };
      roles?: string[];
    };
  } | null> {
    if (!this.prisma) return null;

    try {
      const application = await this.prisma.matchSquareApplication.findUnique({
        where: { id: applicationId },
        include: {
          post: true,
        },
      });

      if (!application) return null;

      // 获取申请人信息（简化，实际需要从 UserProfile 获取）
      const applicantInfo = {
        mbtiType: application.applicantMbtiType || undefined,
        cardTitle: application.applicantCardTitle || undefined,
        interactionMode: application.applicantInteractionMode || undefined,
      };

      return {
        post: {
          captainMbtiType: application.post.captainMbtiType || undefined,
          captainInteractionMode: application.post.captainInteractionMode || undefined,
          planningStyle: application.post.planningStyle || undefined,
          slotsNeeded: application.post.slotsNeeded,
          budgetMinCents: application.post.budgetMinCents || undefined,
          budgetMaxCents: application.post.budgetMaxCents || undefined,
        },
        applicant: applicantInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to build attribution context for application ${applicationId}: ${error}`);
      return null;
    }
  }

  /**
   * 生成洞察推荐
   */
  private generateInsightRecommendations(
    primaryReasons: Record<string, number>,
    signalDistribution: Record<string, number>,
    outcomeSummary?: any,
  ): string[] {
    const recommendations: string[] = [];

    // 基于主要归因原因
    const topReasons = Object.entries(primaryReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topReasons.some(([reason]) => reason === 'COMPATIBILITY_MATCH')) {
      recommendations.push('兼容性匹配是主要决策因素，建议优化 MBTI 和交互模式展示');
    }

    if (topReasons.some(([reason]) => reason === 'SKILL_REQUIREMENT')) {
      recommendations.push('技能需求是关键因素，建议明确岗位要求和技能认证');
    }

    if (topReasons.some(([reason]) => reason === 'SCHEDULE_ALIGNMENT')) {
      recommendations.push('时间协调问题较多，建议增加日历同步和冲突检测');
    }

    // 基于信号分布
    const lowSignals = Object.entries(signalDistribution)
      .filter(([_, score]) => (score as number) < 0.5)
      .map(([signal]) => signal);

    if (lowSignals.length > 2) {
      recommendations.push('多个匹配信号较弱，建议重新评估筛选标准');
    }

    // 基于招募结果
    if (outcomeSummary) {
      if (outcomeSummary.successLevel === 'EXCELLENT') {
        recommendations.push('招募表现优秀，建议复制当前策略到其他招募');
      } else if (outcomeSummary.successLevel === 'FAILED') {
        recommendations.push('招募失败，建议全面审查招募流程和标准');
      }
    }

    return recommendations.length > 0 ? recommendations : ['招募数据正常，继续监控'];
  }
}
