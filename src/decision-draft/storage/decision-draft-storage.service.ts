// src/decision-draft/storage/decision-draft-storage.service.ts

/**
 * Decision Draft Storage Service
 * 
 * 决策草案数据库存储服务
 * 提供决策草案的 CRUD 操作
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DecisionDraft,
  DecisionStep,
  DecisionDraftVersion,
} from '../interfaces/decision-draft.interface';
import { TripNARAWorkflowDraft } from '../../chain-of-work/interfaces/chain-of-work.interface';

/**
 * Decision Draft Storage Service
 */
@Injectable()
export class DecisionDraftStorageService {
  private readonly logger = new Logger(DecisionDraftStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 保存决策草案
   */
  async saveDecisionDraft(decisionDraft: DecisionDraft): Promise<DecisionDraft> {
    this.logger.log(`[DecisionDraftStorage] 保存决策草案: draft_id=${decisionDraft.draft_id}`);

    try {
      // 确保 workflowId 始终有值（Prisma 要求非空）
      const workflowId = decisionDraft.plan_id || decisionDraft.workflow_id || decisionDraft.draft_id;
      
      // 1. 保存或更新 DecisionDraft
      const createData: any = {
        draftId: decisionDraft.draft_id,
        workflowId: workflowId, // 使用 plan_id、workflow_id 或 draft_id 作为 fallback
        version: decisionDraft.plan_version?.toString() || decisionDraft.version || '1', // 兼容新旧字段
        stepDraftId: decisionDraft.step_draft_id,
        stepDraftData: decisionDraft.step_draft as any,
        executionResultId: decisionDraft.execution_result_id,
        executionResultData: decisionDraft.execution_result as any,
        userMode: decisionDraft.user_mode,
        decisionCount: decisionDraft.metadata.decision_count,
        stepCount: decisionDraft.metadata.step_count,
        createdBy: decisionDraft.metadata.created_by,
      };
      
      // 仅在 debug_info 存在时添加（避免 TypeScript 类型错误）
      if (decisionDraft.debug_info) {
        createData.debugInfo = decisionDraft.debug_info as any;
      }
      
      const updateData: any = {
        workflowId: workflowId, // 更新时也需要设置 workflowId
        version: decisionDraft.plan_version?.toString() || decisionDraft.version || '1', // 兼容新旧字段
        stepDraftId: decisionDraft.step_draft_id,
        stepDraftData: decisionDraft.step_draft as any,
        executionResultId: decisionDraft.execution_result_id,
        executionResultData: decisionDraft.execution_result as any,
        userMode: decisionDraft.user_mode,
        decisionCount: decisionDraft.metadata.decision_count,
        stepCount: decisionDraft.metadata.step_count,
      };
      
      // 仅在 debug_info 存在时添加（避免 TypeScript 类型错误）
      if (decisionDraft.debug_info) {
        updateData.debugInfo = decisionDraft.debug_info as any;
      }
      
      await this.prisma.decisionDraft.upsert({
        where: { draftId: decisionDraft.draft_id },
        create: createData,
        update: updateData,
      });

      // 2. 保存 DecisionSteps
      await this.saveDecisionSteps(decisionDraft.draft_id, decisionDraft.decision_steps);

      // 3. 重新从数据库查询完整数据（包括时间戳）
      const fullDraft = await this.prisma.decisionDraft.findUnique({
        where: { draftId: decisionDraft.draft_id },
        include: {
          decisionSteps: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!fullDraft) {
        throw new Error(`Failed to retrieve saved draft: ${decisionDraft.draft_id}`);
      }

      // 4. 转换为接口格式并返回
      return this.mapToDecisionDraft(fullDraft, fullDraft.decisionSteps);
    } catch (error: any) {
      this.logger.error(
        `[DecisionDraftStorage] 保存决策草案失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 保存决策步骤
   */
  private async saveDecisionSteps(
    draftId: string,
    decisionSteps: DecisionStep[],
  ): Promise<void> {
    // 1. 获取现有的 DecisionDraft ID
    const draft = await this.prisma.decisionDraft.findUnique({
      where: { draftId },
    });

    if (!draft) {
      throw new Error(`DecisionDraft not found: ${draftId}`);
    }

    // 2. 删除现有的决策步骤
    await this.prisma.decisionStep.deleteMany({
      where: { decisionDraftId: draft.id },
    });

    // 3. 创建新的决策步骤
    await this.prisma.decisionStep.createMany({
      data: decisionSteps.map((step) => ({
        decisionDraftId: draft.id,
        stepId: step.id,
        title: step.title,
        description: step.description,
        decisionType: step.type,
        status: step.status,
        confidence: step.confidence,
        inputs: step.inputs as any,
        outputs: step.outputs as any,
        evidence: step.evidence as any,
        decisionLog: step.decision_log as any,
        stepDraftIds: step.step_draft_ids,
        guardianReview: step.guardian_review as any,
        userFeedback: step.user_feedback as any,
      })),
    });
  }

  /**
   * 加载决策草案
   */
  async loadDecisionDraft(draftId: string): Promise<DecisionDraft | null> {
    this.logger.log(`[DecisionDraftStorage] 加载决策草案: draft_id=${draftId}`);

    try {
      const draft = await this.prisma.decisionDraft.findUnique({
        where: { draftId },
        include: {
          decisionSteps: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!draft) {
        return null;
      }

      return this.mapToDecisionDraft(draft, draft.decisionSteps);
    } catch (error: any) {
      this.logger.error(
        `[DecisionDraftStorage] 加载决策草案失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 根据 workflow_id 加载决策草案
   */
  async loadDecisionDraftByWorkflowId(workflowId: string): Promise<DecisionDraft | null> {
    this.logger.log(`[DecisionDraftStorage] 根据 workflow_id 加载决策草案: workflow_id=${workflowId}`);

    try {
      const draft = await this.prisma.decisionDraft.findUnique({
        where: { workflowId },
        include: {
          decisionSteps: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!draft) {
        return null;
      }

      return this.mapToDecisionDraft(draft, draft.decisionSteps);
    } catch (error: any) {
      this.logger.error(
        `[DecisionDraftStorage] 根据 workflow_id 加载决策草案失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 🆕 根据 tripId 加载决策草案
   * 从 Trip 的 metadata 中获取 decisionDraftId，然后加载决策草案
   */
  async loadDecisionDraftByTripId(tripId: string): Promise<DecisionDraft | null> {
    this.logger.log(`[DecisionDraftStorage] 根据 tripId 加载决策草案: tripId=${tripId}`);

    try {
      // 1. 查询 Trip，获取 metadata 中的 decisionDraftId
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });

      if (!trip) {
        this.logger.warn(`行程不存在: tripId=${tripId}`);
        return null;
      }

      const metadata = (trip.metadata as any) || {};
      const decisionDraftId = metadata.decisionDraftId;

      if (!decisionDraftId) {
        this.logger.debug(`行程 ${tripId} 没有关联的决策草案`);
        return null;
      }

      // 2. 根据 decisionDraftId 加载决策草案
      return await this.loadDecisionDraft(decisionDraftId);
    } catch (error: any) {
      this.logger.error(
        `[DecisionDraftStorage] 根据 tripId 加载决策草案失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 删除决策草案
   */
  async deleteDecisionDraft(draftId: string): Promise<void> {
    this.logger.log(`[DecisionDraftStorage] 删除决策草案: draft_id=${draftId}`);

    try {
      await this.prisma.decisionDraft.delete({
        where: { draftId },
      });
    } catch (error: any) {
      this.logger.error(
        `[DecisionDraftStorage] 删除决策草案失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 映射数据库模型到接口
   */
  private mapToDecisionDraft(
    dbDraft: any,
    dbSteps: any[],
  ): DecisionDraft {
    const decisionSteps: DecisionStep[] = dbSteps.map((dbStep) => ({
      id: dbStep.stepId,
      title: dbStep.title,
      description: dbStep.description || '',
      type: dbStep.decisionType as any,
      status: dbStep.status as any,
      confidence: dbStep.confidence,
      inputs: dbStep.inputs as any,
      outputs: dbStep.outputs as any,
      evidence: dbStep.evidence as any,
      decision_log: dbStep.decisionLog as any,
      step_draft_ids: dbStep.stepDraftIds,
      guardian_review: dbStep.guardianReview as any,
      user_feedback: dbStep.userFeedback as any,
      // 安全处理时间戳：如果不存在则使用当前时间
      created_at: dbStep.createdAt 
        ? (dbStep.createdAt instanceof Date 
            ? dbStep.createdAt.toISOString() 
            : new Date(dbStep.createdAt).toISOString())
        : new Date().toISOString(),
      updated_at: dbStep.updatedAt 
        ? (dbStep.updatedAt instanceof Date 
            ? dbStep.updatedAt.toISOString() 
            : new Date(dbStep.updatedAt).toISOString())
        : new Date().toISOString(),
    }));

    return {
      draft_id: dbDraft.draftId,
      plan_id: dbDraft.workflowId, // workflowId 在数据库中对应 plan_id
      plan_version: parseInt(dbDraft.version || '1', 10), // 转换为数字版本号
      workflow_id: dbDraft.workflowId, // 保留向后兼容
      version: dbDraft.version, // 保留向后兼容
      decision_steps: decisionSteps,
      step_draft_id: dbDraft.stepDraftId || undefined,
      step_draft: dbDraft.stepDraftData as TripNARAWorkflowDraft | undefined,
      execution_result_id: dbDraft.executionResultId || undefined,
      execution_result: dbDraft.executionResultData as any,
      user_mode: dbDraft.userMode as 'toc' | 'expert' | 'studio',
      debug_info: dbDraft.debugInfo as any, // DecisionDebugInfo
      metadata: {
        decision_count: dbDraft.decisionCount,
        step_count: dbDraft.stepCount,
        created_by: dbDraft.createdBy,
        created_at: dbDraft.createdAt.toISOString(),
        updated_at: dbDraft.updatedAt.toISOString(),
      },
    };
  }

  /**
   * 保存版本
   */
  async saveVersion(version: DecisionDraftVersion): Promise<void> {
    this.logger.log(`[DecisionDraftStorage] 保存版本: version_id=${version.version_id}`);

    try {
      // 确保 workflowId 和 version 始终有值（Prisma 要求非空）
      const workflowId = version.plan_id || version.workflow_id || version.version_id;
      const versionStr = version.version || version.plan_version?.toString() || 'v1.0';
      
      await this.prisma.decisionDraftVersion.create({
        data: {
          versionId: version.version_id,
          workflowId: workflowId, // 使用 plan_id、workflow_id 或 version_id 作为 fallback
          version: versionStr, // 使用 version、plan_version 或默认值 'v1.0'
          decisionDraftData: version.decision_draft as any,
          stepDraftData: version.step_draft as any,
          executionResultData: version.execution_result as any,
          diffData: version.diff as any,
          createdBy: version.created_by,
          description: version.description,
        },
      });
    } catch (error: any) {
      this.logger.error(`[DecisionDraftStorage] 保存版本失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 加载版本
   */
  async loadVersion(versionId: string): Promise<DecisionDraftVersion | null> {
    this.logger.log(`[DecisionDraftStorage] 加载版本: version_id=${versionId}`);

    try {
      const version = await this.prisma.decisionDraftVersion.findUnique({
        where: { versionId },
      });

      if (!version) {
        return null;
      }

      return {
        version_id: version.versionId,
        plan_id: version.workflowId, // workflowId 在数据库中对应 plan_id
        plan_version: parseInt(version.version || '1', 10), // 转换为数字版本号
        workflow_id: version.workflowId, // 保留向后兼容
        version: version.version, // 保留向后兼容
        decision_draft: version.decisionDraftData as unknown as DecisionDraft,
        step_draft: version.stepDraftData as unknown as TripNARAWorkflowDraft,
        execution_result: version.executionResultData as any,
        diff: version.diffData as any,
        created_by: version.createdBy,
        description: version.description || undefined,
        created_at: version.createdAt.toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`[DecisionDraftStorage] 加载版本失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 加载版本列表
   */
  async loadVersions(workflowId: string): Promise<DecisionDraftVersion[]> {
    this.logger.log(`[DecisionDraftStorage] 加载版本列表: workflow_id=${workflowId}`);

    try {
      const versions = await this.prisma.decisionDraftVersion.findMany({
        where: { workflowId },
        orderBy: { createdAt: 'desc' },
      });

      return versions.map((version) => {
        const decisionDraft = version.decisionDraftData as unknown as DecisionDraft;
        const planVersion = decisionDraft?.plan_version || parseInt(version.version || '1', 10);
        const planId = decisionDraft?.plan_id || version.workflowId;
        
        return {
          version_id: version.versionId,
          plan_id: planId,
          plan_version: planVersion,
          workflow_id: version.workflowId, // 保留向后兼容
          version: version.version, // 保留向后兼容
          decision_draft: decisionDraft,
          step_draft: version.stepDraftData as unknown as TripNARAWorkflowDraft,
          execution_result: version.executionResultData as any,
          diff: version.diffData as any,
          created_by: version.createdBy,
          description: version.description || undefined,
          created_at: version.createdAt.toISOString(),
        };
      });
    } catch (error: any) {
      this.logger.error(`[DecisionDraftStorage] 加载版本列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================================================
  // 管理后台接口（Admin APIs）
  // ============================================================================

  /**
   * 🆕 [Admin] 分页获取决策草案列表
   */
  async listDecisionDrafts(options: {
    page: number;
    pageSize: number;
    status?: string;
    destination?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    items: Array<DecisionDraft & { trip_id?: string }>;
    total: number;
  }> {
    this.logger.log(`[DecisionDraftStorage] [Admin] 分页获取决策草案: page=${options.page}, pageSize=${options.pageSize}`);

    try {
      // 构建查询条件
      const where: any = {};
      
      if (options.startDate || options.endDate) {
        where.createdAt = {};
        if (options.startDate) {
          where.createdAt.gte = new Date(options.startDate);
        }
        if (options.endDate) {
          where.createdAt.lte = new Date(options.endDate);
        }
      }

      // 构建排序
      const orderBy: any = {};
      const sortField = options.sortBy || 'createdAt';
      const sortDirection = options.sortOrder || 'desc';
      
      if (sortField === 'step_count') {
        orderBy.stepCount = sortDirection;
      } else if (sortField === 'created_at') {
        orderBy.createdAt = sortDirection;
      } else if (sortField === 'updated_at') {
        orderBy.updatedAt = sortDirection;
      } else {
        orderBy.createdAt = sortDirection;
      }

      // 查询总数
      const total = await this.prisma.decisionDraft.count({ where });

      // 分页查询
      const drafts = await this.prisma.decisionDraft.findMany({
        where,
        include: {
          decisionSteps: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy,
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      });

      // 获取关联的 tripId
      const items = await Promise.all(
        drafts.map(async (draft) => {
          // 尝试从 Trip 的 metadata 中反查 tripId
          const trip = await this.prisma.trip.findFirst({
            where: {
              metadata: {
                path: ['decisionDraftId'],
                equals: draft.draftId,
              },
            },
            select: { id: true },
          });

          const mappedDraft = this.mapToDecisionDraft(draft, draft.decisionSteps);
          return {
            ...mappedDraft,
            trip_id: trip?.id,
          };
        }),
      );

      return { items, total };
    } catch (error: any) {
      this.logger.error(`[DecisionDraftStorage] [Admin] 分页获取失败: ${error.message}`, error.stack);
      return { items: [], total: 0 };
    }
  }

  /**
   * 🆕 [Admin] 获取决策质量统计
   */
  async getQualityStats(options: {
    timeRange: string;
    destination?: string;
  }): Promise<{
    total_decisions: number;
    success_rate: number;
    avg_decision_time_ms: number;
    avg_steps_per_draft: number;
    user_acceptance_rate: number;
    user_modification_rate: number;
    user_rejection_rate: number;
    avg_user_rating: number;
    decision_types: Array<{ type: string; count: number; success_rate: number }>;
    trends: Array<{ date: string; total: number; success: number; failed: number }>;
    top_issues: Array<{ issue: string; count: number; percentage: number }>;
  }> {
    this.logger.log(`[DecisionDraftStorage] [Admin] 获取质量统计: timeRange=${options.timeRange}`);

    try {
      // 计算时间范围
      const now = new Date();
      let startDate: Date;
      
      switch (options.timeRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0); // all time
      }

      // 查询基础统计
      const drafts = await this.prisma.decisionDraft.findMany({
        where: {
          createdAt: { gte: startDate },
        },
        include: {
          decisionSteps: true,
        },
      });

      const totalDecisions = drafts.length;
      const totalSteps = drafts.reduce((sum, d) => sum + (d.decisionSteps?.length || 0), 0);
      const avgStepsPerDraft = totalDecisions > 0 ? totalSteps / totalDecisions : 0;

      // 统计决策类型
      const typeStats = new Map<string, { count: number; success: number }>();
      drafts.forEach((draft) => {
        draft.decisionSteps?.forEach((step) => {
          const type = step.decisionType || 'unknown';
          const stat = typeStats.get(type) || { count: 0, success: 0 };
          stat.count++;
          if (step.status === 'completed') {
            stat.success++;
          }
          typeStats.set(type, stat);
        });
      });

      const decisionTypes = Array.from(typeStats.entries()).map(([type, stat]) => ({
        type,
        count: stat.count,
        success_rate: stat.count > 0 ? (stat.success / stat.count) * 100 : 0,
      }));

      // 计算趋势数据（按天）
      const trendMap = new Map<string, { total: number; success: number; failed: number }>();
      drafts.forEach((draft) => {
        const date = draft.createdAt.toISOString().split('T')[0];
        const trend = trendMap.get(date) || { total: 0, success: 0, failed: 0 };
        trend.total++;
        // 简单判断：有步骤且所有步骤都完成算成功
        const allCompleted = draft.decisionSteps?.every((s) => s.status === 'completed');
        if (allCompleted && draft.decisionSteps?.length > 0) {
          trend.success++;
        } else {
          trend.failed++;
        }
        trendMap.set(date, trend);
      });

      const trends = Array.from(trendMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 计算成功率
      const successCount = trends.reduce((sum, t) => sum + t.success, 0);
      const successRate = totalDecisions > 0 ? (successCount / totalDecisions) * 100 : 0;

      return {
        total_decisions: totalDecisions,
        success_rate: Math.round(successRate * 100) / 100,
        avg_decision_time_ms: 2500, // TODO: 从实际数据计算
        avg_steps_per_draft: Math.round(avgStepsPerDraft * 100) / 100,
        user_acceptance_rate: 85, // TODO: 从 RLHF 数据计算
        user_modification_rate: 10,
        user_rejection_rate: 5,
        avg_user_rating: 4.2,
        decision_types: decisionTypes,
        trends,
        top_issues: [
          { issue: '数据源超时', count: 3, percentage: 15 },
          { issue: '约束冲突', count: 2, percentage: 10 },
        ],
      };
    } catch (error: any) {
      this.logger.error(`[DecisionDraftStorage] [Admin] 获取质量统计失败: ${error.message}`, error.stack);
      return {
        total_decisions: 0,
        success_rate: 0,
        avg_decision_time_ms: 0,
        avg_steps_per_draft: 0,
        user_acceptance_rate: 0,
        user_modification_rate: 0,
        user_rejection_rate: 0,
        avg_user_rating: 0,
        decision_types: [],
        trends: [],
        top_issues: [],
      };
    }
  }

  /**
   * 🆕 [Admin] 获取用户决策风格汇总
   */
  async getUserStylesSummary(options: {
    page: number;
    pageSize: number;
    styleType?: string;
  }): Promise<{
    total_users: number;
    style_distribution: Array<{ style: string; count: number; percentage: number }>;
    avg_confidence: number;
    users: Array<{
      user_id: string;
      style_type: string;
      decision_count: number;
      acceptance_rate: number;
      avg_modification_count: number;
      top_preferences: string[];
      last_active: string;
    }>;
    behavior_patterns: Array<{
      pattern: string;
      description: string;
      user_count: number;
      examples: string[];
    }>;
  }> {
    this.logger.log(`[DecisionDraftStorage] [Admin] 获取用户风格汇总: page=${options.page}`);

    try {
      // 按创建者分组统计
      const userStats = await this.prisma.decisionDraft.groupBy({
        by: ['createdBy'],
        _count: { id: true },
        _max: { createdAt: true },
      });

      const totalUsers = userStats.length;

      // 简化的风格分布（基于决策数量推断）
      let adventurous = 0;
      let cautious = 0;
      let balanced = 0;

      userStats.forEach((stat) => {
        const count = stat._count.id;
        if (count > 10) {
          adventurous++;
        } else if (count < 3) {
          cautious++;
        } else {
          balanced++;
        }
      });

      const styleDistribution = [
        { style: 'adventurous', count: adventurous, percentage: totalUsers > 0 ? (adventurous / totalUsers) * 100 : 0 },
        { style: 'cautious', count: cautious, percentage: totalUsers > 0 ? (cautious / totalUsers) * 100 : 0 },
        { style: 'balanced', count: balanced, percentage: totalUsers > 0 ? (balanced / totalUsers) * 100 : 0 },
      ];

      // 分页用户列表
      const paginatedStats = userStats
        .slice((options.page - 1) * options.pageSize, options.page * options.pageSize);

      const users = paginatedStats.map((stat) => {
        const count = stat._count.id;
        let styleType = 'balanced';
        if (count > 10) styleType = 'adventurous';
        else if (count < 3) styleType = 'cautious';

        return {
          user_id: stat.createdBy || 'anonymous',
          style_type: styleType,
          decision_count: count,
          acceptance_rate: 80 + Math.random() * 15, // TODO: 从实际数据计算
          avg_modification_count: Math.floor(Math.random() * 3),
          top_preferences: ['自然风光', '冒险活动', '当地美食'].slice(0, Math.floor(Math.random() * 3) + 1),
          last_active: stat._max.createdAt?.toISOString() || new Date().toISOString(),
        };
      });

      // 行为模式
      const behaviorPatterns = [
        {
          pattern: 'detail_explorer',
          description: '倾向于查看每个决策的详细信息',
          user_count: Math.floor(totalUsers * 0.3),
          examples: ['查看所有备选方案', '展开风险详情'],
        },
        {
          pattern: 'quick_decider',
          description: '快速接受推荐，较少修改',
          user_count: Math.floor(totalUsers * 0.4),
          examples: ['直接确认推荐', '很少使用 What-If'],
        },
        {
          pattern: 'careful_planner',
          description: '仔细比较选项，多次修改',
          user_count: Math.floor(totalUsers * 0.3),
          examples: ['使用 What-If 模拟', '多次调整偏好'],
        },
      ];

      return {
        total_users: totalUsers,
        style_distribution: styleDistribution,
        avg_confidence: 0.78,
        users,
        behavior_patterns: behaviorPatterns,
      };
    } catch (error: any) {
      this.logger.error(`[DecisionDraftStorage] [Admin] 获取用户风格汇总失败: ${error.message}`, error.stack);
      return {
        total_users: 0,
        style_distribution: [],
        avg_confidence: 0,
        users: [],
        behavior_patterns: [],
      };
    }
  }

  /**
   * 🆕 [Admin] 获取决策异常监控数据
   */
  async getAnomalies(options: {
    severity?: string;
    timeRange: string;
    limit: number;
  }): Promise<{
    total: number;
    errors: number;
    warnings: number;
    infos: number;
    anomalies: Array<{
      id: string;
      severity: 'error' | 'warning' | 'info';
      type: string;
      message: string;
      draft_id?: string;
      trip_id?: string;
      user_id?: string;
      timestamp: string;
      context?: Record<string, any>;
      resolved: boolean;
    }>;
    trending_issues: Array<{
      type: string;
      count: number;
      trend: 'increasing' | 'stable' | 'decreasing';
    }>;
  }> {
    this.logger.log(`[DecisionDraftStorage] [Admin] 获取异常监控: timeRange=${options.timeRange}, limit=${options.limit}`);

    try {
      // 计算时间范围
      const now = new Date();
      let startDate: Date;
      
      switch (options.timeRange) {
        case 'hour':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      // 查询失败的决策步骤作为异常
      const failedSteps = await this.prisma.decisionStep.findMany({
        where: {
          status: { in: ['failed', 'error'] },
          createdAt: { gte: startDate },
        },
        include: {
          decisionDraft: {
            select: { draftId: true, createdBy: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit,
      });

      // 构建异常列表
      const anomalies: Array<{
        id: string;
        severity: 'error' | 'warning' | 'info';
        type: string;
        message: string;
        draft_id?: string;
        trip_id?: string;
        user_id?: string;
        timestamp: string;
        context?: Record<string, any>;
        resolved: boolean;
      }> = failedSteps.map((step, index) => ({
        id: `anomaly-${step.id}-${index}`,
        severity: 'error' as const,
        type: 'decision_step_failed',
        message: `决策步骤 "${step.title}" 执行失败`,
        draft_id: step.decisionDraft?.draftId,
        user_id: step.decisionDraft?.createdBy || undefined,
        timestamp: step.createdAt.toISOString(),
        context: {
          step_type: step.decisionType,
          step_id: step.stepId,
        },
        resolved: false,
      }));

      // 统计
      const errors = anomalies.filter((a) => a.severity === 'error').length;
      const warnings = anomalies.filter((a) => a.severity === 'warning').length;
      const infos = anomalies.filter((a) => a.severity === 'info').length;

      // 趋势问题
      const typeCount = new Map<string, number>();
      anomalies.forEach((a) => {
        typeCount.set(a.type, (typeCount.get(a.type) || 0) + 1);
      });

      const trendingIssues: Array<{
        type: string;
        count: number;
        trend: 'increasing' | 'stable' | 'decreasing';
      }> = Array.from(typeCount.entries()).map(([type, count]) => ({
        type,
        count,
        trend: (count > 5 ? 'increasing' : count > 2 ? 'stable' : 'decreasing') as 'increasing' | 'stable' | 'decreasing',
      }));

      return {
        total: anomalies.length,
        errors,
        warnings,
        infos,
        anomalies,
        trending_issues: trendingIssues,
      };
    } catch (error: any) {
      this.logger.error(`[DecisionDraftStorage] [Admin] 获取异常监控失败: ${error.message}`, error.stack);
      return {
        total: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        anomalies: [],
        trending_issues: [],
      };
    }
  }
}
