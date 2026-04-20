// src/chain-of-work/storage/chain-of-work-storage.service.ts

/**
 * Chain-of-Work 存储服务
 * 
 * 提供数据持久化功能，基于 Prisma 操作 DecisionDraft 相关表
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripNARAWorkflowDraft, ExecutionResult } from '../interfaces/chain-of-work.interface';

export interface DraftListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  userId?: string;
  workflowId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface ExecutionListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  draftId?: string;
  startDate?: string;
  endDate?: string;
}

export interface StatsQuery {
  startDate?: string;
  endDate?: string;
}

export interface DraftListItem {
  draft_id: string;
  workflow_id: string;
  user_id?: string;
  version: string;
  step_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutionListItem {
  execution_id: string;
  draft_id: string;
  user_id?: string;
  status: string;
  duration_ms: number;
  executed_at: string;
}

export interface ChainOfWorkStats {
  total_drafts: number;
  total_executions: number;
  success_rate: number;
  avg_generation_time_ms: number;
  avg_execution_time_ms: number;
  drafts_by_status: Record<string, number>;
  drafts_by_step_type: Record<string, number>;
  top_skills: Array<{ skill_name: string; usage_count: number; avg_confidence: number }>;
  top_sub_agents: Array<{ sub_agent: string; usage_count: number }>;
}

@Injectable()
export class ChainOfWorkStorageService {
  private readonly logger = new Logger(ChainOfWorkStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取统计信息
   */
  async getStats(query: StatsQuery): Promise<ChainOfWorkStats> {
    this.logger.log(`[ChainOfWorkStorage] 获取统计信息`);

    const dateFilter: any = {};
    if (query.startDate) {
      dateFilter.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      dateFilter.lte = new Date(query.endDate);
    }

    const whereClause: any = {};
    if (Object.keys(dateFilter).length > 0) {
      whereClause.createdAt = dateFilter;
    }

    // 1. 总草案数
    const totalDrafts = await this.prisma.decisionDraft.count({ where: whereClause });

    // 2. 总执行数（基于有 executionResultData 的草案）
    const totalExecutions = await this.prisma.decisionDraft.count({
      where: {
        ...whereClause,
        executionResultData: { not: null },
      },
    });

    // 3. 成功率（基于执行结果中的 success 字段）
    const successfulExecutions = await this.prisma.decisionDraft.count({
      where: {
        ...whereClause,
        executionResultData: {
          path: ['success'],
          equals: true,
        },
      },
    });
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    // 4. 按状态分组统计
    const drafts = await this.prisma.decisionDraft.findMany({
      where: whereClause,
      select: {
        userMode: true,
        stepCount: true,
        decisionSteps: {
          select: {
            decisionType: true,
            status: true,
            confidence: true,
          },
        },
      },
    });

    const draftsByStatus: Record<string, number> = {};
    const draftsByStepType: Record<string, number> = {};
    const skillUsage: Record<string, { count: number; totalConfidence: number }> = {};
    const subAgentUsage: Record<string, number> = {};

    for (const draft of drafts) {
      // 按用户模式统计
      const mode = draft.userMode || 'toc';
      draftsByStatus[mode] = (draftsByStatus[mode] || 0) + 1;

      // 按步骤类型统计
      for (const step of draft.decisionSteps) {
        const stepType = step.decisionType || 'unknown';
        draftsByStepType[stepType] = (draftsByStepType[stepType] || 0) + 1;

        // 状态统计
        const status = step.status || 'pending';
        draftsByStatus[status] = (draftsByStatus[status] || 0) + 1;
      }
    }

    // 5. Top Skills 和 Sub-Agents（从 DecisionStep 的 evidence 中提取）
    const steps = await this.prisma.decisionStep.findMany({
      where: whereClause.createdAt ? { createdAt: whereClause.createdAt } : {},
      select: {
        evidence: true,
        confidence: true,
        decisionType: true,
        stepId: true,
      },
      take: 1000,
    });

    for (const step of steps) {
      const evidence = step.evidence as any;
      
      // 处理 evidence 是对象的情况（执行后的新格式）
      if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
        if (evidence.skill_name) {
          if (!skillUsage[evidence.skill_name]) {
            skillUsage[evidence.skill_name] = { count: 0, totalConfidence: 0 };
          }
          skillUsage[evidence.skill_name].count++;
          skillUsage[evidence.skill_name].totalConfidence += step.confidence || 0.7;
        }
        if (evidence.sub_agent) {
          subAgentUsage[evidence.sub_agent] = (subAgentUsage[evidence.sub_agent] || 0) + 1;
        }
      }
      
      // 处理 evidence 是数组的情况（旧格式）
      if (Array.isArray(evidence)) {
        for (const e of evidence) {
          if (e.skill_name) {
            if (!skillUsage[e.skill_name]) {
              skillUsage[e.skill_name] = { count: 0, totalConfidence: 0 };
            }
            skillUsage[e.skill_name].count++;
            skillUsage[e.skill_name].totalConfidence += step.confidence || 0.7;
          }
          if (e.sub_agent) {
            subAgentUsage[e.sub_agent] = (subAgentUsage[e.sub_agent] || 0) + 1;
          }
        }
      }

      // 按 decisionType 推断 sub_agent（如果 evidence 中没有）
      if (!evidence?.sub_agent) {
        const agentMapping: Record<string, string> = {
          'transport-decision': 'GeoAgent',
          'pace-decision': 'GeoAgent',
          'weather-decision': 'WeatherAgent',
          'cost-decision': 'CostAgent',
          'experience-decision': 'ExperienceAgent',
        };
        const agent = agentMapping[step.decisionType] || 'CoreDecision';
        subAgentUsage[agent] = (subAgentUsage[agent] || 0) + 1;
      }
      
      // 从 stepId 推断技能（如果 evidence 中没有）
      if (!evidence?.skill_name) {
        const inferredSkill = this.inferSkillName(step.stepId);
        if (inferredSkill) {
          if (!skillUsage[inferredSkill]) {
            skillUsage[inferredSkill] = { count: 0, totalConfidence: 0 };
          }
          skillUsage[inferredSkill].count++;
          skillUsage[inferredSkill].totalConfidence += step.confidence || 0.7;
        }
      }
    }

    const topSkills = Object.entries(skillUsage)
      .map(([name, data]) => ({
        skill_name: name,
        usage_count: data.count,
        avg_confidence: data.count > 0 ? data.totalConfidence / data.count : 0,
      }))
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 10);

    const topSubAgents = Object.entries(subAgentUsage)
      .map(([name, count]) => ({ sub_agent: name, usage_count: count }))
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 10);

    return {
      total_drafts: totalDrafts,
      total_executions: totalExecutions,
      success_rate: Math.round(successRate * 100) / 100,
      avg_generation_time_ms: 1500, // TODO: 从实际数据计算
      avg_execution_time_ms: 3000, // TODO: 从实际数据计算
      drafts_by_status: draftsByStatus,
      drafts_by_step_type: draftsByStepType,
      top_skills: topSkills,
      top_sub_agents: topSubAgents,
    };
  }

  /**
   * 获取草案列表
   */
  async getDraftList(query: DraftListQuery): Promise<{
    drafts: DraftListItem[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }> {
    this.logger.log(`[ChainOfWorkStorage] 获取草案列表`);

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const whereClause: any = {};

    if (query.workflowId) {
      whereClause.workflowId = query.workflowId;
    }

    if (query.userId) {
      whereClause.createdBy = query.userId;
    }

    if (query.status) {
      whereClause.userMode = query.status;
    }

    if (query.startDate || query.endDate) {
      whereClause.createdAt = {};
      if (query.startDate) {
        whereClause.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        whereClause.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      whereClause.OR = [
        { draftId: { contains: query.search, mode: 'insensitive' } },
        { workflowId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, drafts] = await Promise.all([
      this.prisma.decisionDraft.count({ where: whereClause }),
      this.prisma.decisionDraft.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          draftId: true,
          workflowId: true,
          version: true,
          stepCount: true,
          userMode: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const draftItems: DraftListItem[] = drafts.map(d => ({
      draft_id: d.draftId,
      workflow_id: d.workflowId,
      user_id: d.createdBy,
      version: d.version,
      step_count: d.stepCount,
      status: d.userMode || 'toc',
      created_at: d.createdAt.toISOString(),
      updated_at: d.updatedAt.toISOString(),
    }));

    return {
      drafts: draftItems,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取草案详情
   */
  async getDraftDetail(draftId: string): Promise<{
    draft: TripNARAWorkflowDraft | null;
    user?: { id: string; email: string };
    execution_history?: Array<{ execution_id: string; status: string; executed_at: string }>;
  }> {
    this.logger.log(`[ChainOfWorkStorage] 获取草案详情: ${draftId}`);

    const decisionDraft = await this.prisma.decisionDraft.findFirst({
      where: {
        OR: [
          { draftId: draftId },
          { workflowId: draftId },
        ],
      },
      include: {
        decisionSteps: true,
      },
    });

    if (!decisionDraft) {
      return { draft: null };
    }

    // 转换为 TripNARAWorkflowDraft 格式
    const stepDraftData = decisionDraft.stepDraftData as any;

    // 说明：
    // - `stepDraftData.steps` 是“草案生成时”的快照（通常 status= draft）
    // - 执行后我们会更新 `decisionSteps` 的 status/evidence 等字段
    // 为了让管理端详情页能反映“执行后的真实状态”，这里把 DB 的状态合并回草案快照。
    const decisionStepsById = new Map(
      (decisionDraft.decisionSteps || []).map(s => [s.stepId, s]),
    );

    const mergedSteps =
      stepDraftData?.steps && Array.isArray(stepDraftData.steps)
        ? stepDraftData.steps.map((step: any) => {
            const dbStep = decisionStepsById.get(step.id);
            if (!dbStep) return step;
            return {
              ...step,
              title: step.title ?? dbStep.title,
              description: step.description ?? dbStep.description ?? '',
              status: (dbStep.status as any) ?? step.status,
              confidence: dbStep.confidence ?? step.confidence,
              inputs: (dbStep.inputs as any[]) ?? step.inputs,
              outputs: (dbStep.outputs as any[]) ?? step.outputs,
              evidence: (dbStep.evidence as any) ?? step.evidence,
              updated_at: dbStep.updatedAt?.toISOString?.() ?? step.updated_at,
            };
          })
        : null;

    const draft: TripNARAWorkflowDraft = {
      draft_id: decisionDraft.draftId,
      workflow_id: decisionDraft.workflowId,
      version: decisionDraft.version,
      orchestration_mode: 'CLAUDE_SM',
      steps:
        mergedSteps ||
        decisionDraft.decisionSteps.map(step => ({
          id: step.stepId,
          step_type: this.mapDecisionTypeToStepType(step.decisionType),
          title: step.title,
          description: step.description || '',
          status: step.status as any,
          confidence: step.confidence,
          inputs: step.inputs as any[],
          outputs: step.outputs as any[],
          evidence: step.evidence as any[],
        })),
      metadata: {
        step_count: decisionDraft.stepCount,
        skills_count: 0,
        sub_agents_count: 0,
        last_modified: decisionDraft.updatedAt.toISOString(),
        created_by: decisionDraft.createdBy,
      },
      created_at: decisionDraft.createdAt.toISOString(),
      updated_at: decisionDraft.updatedAt.toISOString(),
    };

    // 获取执行历史（从版本表）
    const versions = await this.prisma.decisionDraftVersion.findMany({
      where: { workflowId: decisionDraft.workflowId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        versionId: true,
        version: true,
        createdAt: true,
        executionResultData: true,
      },
    });

    const executionHistory = versions
      .filter(v => v.executionResultData)
      .map(v => {
        const result = v.executionResultData as any;
        return {
          execution_id: v.versionId,
          status: result?.success ? 'completed' : 'failed',
          executed_at: v.createdAt.toISOString(),
        };
      });

    return {
      draft,
      user: {
        id: decisionDraft.createdBy,
        email: `${decisionDraft.createdBy}@tripnara.com`,
      },
      execution_history: executionHistory,
    };
  }

  /**
   * 批量操作草案
   */
  async batchOperation(
    action: string,
    draftIds: string[],
    _params?: any,
  ): Promise<{
    success_count: number;
    failed_count: number;
    results: Array<{ draft_id: string; success: boolean; error?: string }>;
  }> {
    this.logger.log(`[ChainOfWorkStorage] 批量操作: action=${action}, count=${draftIds.length}`);

    const results: Array<{ draft_id: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const draftId of draftIds) {
      try {
        switch (action) {
          case 'delete':
            await this.prisma.decisionDraft.deleteMany({
              where: { draftId },
            });
            results.push({ draft_id: draftId, success: true });
            successCount++;
            break;

          case 'export':
            // 导出只返回数据，不做实际操作
            const draft = await this.prisma.decisionDraft.findFirst({
              where: { draftId },
              include: { decisionSteps: true },
            });
            results.push({
              draft_id: draftId,
              success: !!draft,
              error: draft ? undefined : '草案不存在',
            });
            if (draft) successCount++;
            else failedCount++;
            break;

          case 'validate':
            // 验证草案完整性
            const toValidate = await this.prisma.decisionDraft.findFirst({
              where: { draftId },
              include: { decisionSteps: true },
            });
            if (toValidate && toValidate.decisionSteps.length > 0) {
              results.push({ draft_id: draftId, success: true });
              successCount++;
            } else {
              results.push({
                draft_id: draftId,
                success: false,
                error: toValidate ? '草案缺少步骤' : '草案不存在',
              });
              failedCount++;
            }
            break;

          case 'archive':
            await this.prisma.decisionDraft.updateMany({
              where: { draftId },
              data: { userMode: 'archived' },
            });
            results.push({ draft_id: draftId, success: true });
            successCount++;
            break;

          default:
            results.push({ draft_id: draftId, success: false, error: `不支持的操作: ${action}` });
            failedCount++;
        }
      } catch (error: any) {
        results.push({ draft_id: draftId, success: false, error: error.message });
        failedCount++;
      }
    }

    return {
      success_count: successCount,
      failed_count: failedCount,
      results,
    };
  }

  /**
   * 获取执行历史
   */
  async getExecutionHistory(query: ExecutionListQuery): Promise<{
    executions: ExecutionListItem[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }> {
    this.logger.log(`[ChainOfWorkStorage] 获取执行历史`);

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const whereClause: any = {
      executionResultData: { not: null },
    };

    if (query.draftId) {
      whereClause.draftId = query.draftId;
    }

    if (query.startDate || query.endDate) {
      whereClause.createdAt = {};
      if (query.startDate) {
        whereClause.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        whereClause.createdAt.lte = new Date(query.endDate);
      }
    }

    const [total, drafts] = await Promise.all([
      this.prisma.decisionDraft.count({ where: whereClause }),
      this.prisma.decisionDraft.findMany({
        where: whereClause,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        select: {
          draftId: true,
          executionResultId: true,
          executionResultData: true,
          createdBy: true,
          updatedAt: true,
        },
      }),
    ]);

    const executions: ExecutionListItem[] = drafts.map(d => {
      const result = d.executionResultData as any;
      return {
        execution_id: d.executionResultId || `exec-${d.draftId}`,
        draft_id: d.draftId,
        user_id: d.createdBy,
        status: result?.success ? 'completed' : 'failed',
        duration_ms: result?.duration_ms || 0,
        executed_at: d.updatedAt.toISOString(),
      };
    });

    // 如果有状态筛选
    const filteredExecutions = query.status
      ? executions.filter(e => e.status === query.status)
      : executions;

    return {
      executions: filteredExecutions,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取执行详情
   */
  async getExecutionDetail(executionId: string): Promise<{
    execution: {
      execution_id: string;
      draft_id: string;
      user_id?: string;
      status: string;
      result?: ExecutionResult;
      trace?: {
        total_duration_ms: number;
        steps_executed: number;
        llm_calls: number;
        skills_called: number;
        errors: any[];
      };
      executed_at: string;
    } | null;
  }> {
    this.logger.log(`[ChainOfWorkStorage] 获取执行详情: ${executionId}`);

    // 尝试从 DecisionDraft 找
    const draft = await this.prisma.decisionDraft.findFirst({
      where: {
        OR: [
          { executionResultId: executionId },
          { draftId: executionId },
        ],
      },
      include: { decisionSteps: true },
    });

    if (!draft || !draft.executionResultData) {
      // 尝试从版本表找
      const version = await this.prisma.decisionDraftVersion.findFirst({
        where: { versionId: executionId },
      });

      if (!version || !version.executionResultData) {
        return { execution: null };
      }

      const result = version.executionResultData as any;
      return {
        execution: {
          execution_id: version.versionId,
          draft_id: version.workflowId,
          status: result?.success ? 'completed' : 'failed',
          result: result as ExecutionResult,
          trace: {
            total_duration_ms: result?.duration_ms || 0,
            steps_executed: result?.steps_executed || 0,
            llm_calls: result?.llm_calls || 0,
            skills_called: result?.skills_called || 0,
            errors: result?.errors || [],
          },
          executed_at: version.createdAt.toISOString(),
        },
      };
    }

    const result = draft.executionResultData as any;
    return {
      execution: {
        execution_id: draft.executionResultId || executionId,
        draft_id: draft.draftId,
        user_id: draft.createdBy,
        status: result?.success ? 'completed' : 'failed',
        result: result as ExecutionResult,
        trace: {
          total_duration_ms: result?.duration_ms || 0,
          steps_executed: draft.decisionSteps.length,
          llm_calls: result?.llm_calls || 0,
          skills_called: result?.skills_called || 0,
          errors: result?.errors || [],
        },
        executed_at: draft.updatedAt.toISOString(),
      },
    };
  }

  /**
   * 保存执行结果
   */
  async saveExecutionResult(
    draftId: string,
    executionResult: any,
  ): Promise<void> {
    this.logger.log(`[ChainOfWorkStorage] 保存执行结果: ${draftId}`);

    const draft = await this.prisma.decisionDraft.findFirst({
      where: {
        OR: [{ draftId }, { workflowId: draftId }],
      },
    });

    if (!draft) {
      throw new Error(`草案不存在: ${draftId}`);
    }

    // 更新草案的执行结果
    await this.prisma.decisionDraft.update({
      where: { id: draft.id },
      data: {
        executionResultId: executionResult.execution_id,
        executionResultData: executionResult as any,
        updatedAt: new Date(),
      },
    });

    // 更新每个步骤的状态和 evidence
    if (executionResult.steps && Array.isArray(executionResult.steps)) {
      let totalUpdatedDecisionSteps = 0;

      for (const stepResult of executionResult.steps) {
        const res = await this.prisma.decisionStep.updateMany({
          where: {
            decisionDraftId: draft.id,
            stepId: stepResult.step_id,
          },
          data: {
            status: stepResult.status === 'completed' ? 'approved' : 
                    stepResult.status === 'failed' ? 'rejected' : 'pending',
            evidence: {
              execution_id: executionResult.execution_id,
              executed_at: new Date().toISOString(),
              duration_ms: stepResult.duration_ms,
              status: stepResult.status,
              output: stepResult.output,
              error: stepResult.error,
              skill_name: stepResult.skill_name || this.inferSkillName(stepResult.step_id),
              sub_agent: stepResult.sub_agent || this.inferSubAgent(stepResult.step_id),
            },
            updatedAt: new Date(),
          },
        });
        totalUpdatedDecisionSteps += res.count || 0;
      }

      // 如果该草案没有持久化到 DecisionStep（仅有 stepDraftData 快照），
      // 仍然需要把执行后的状态写回 stepDraftData，避免管理端看到永远是 draft。
      if (totalUpdatedDecisionSteps === 0) {
        // 注意：不要依赖 prisma.update() 的返回体里一定包含 JSON 字段（在某些配置/生成器下可能不稳定）。
        // 这里重新读取一次最新的 stepDraftData，再做合并写回。
        const fresh = await this.prisma.decisionDraft.findUnique({
          where: { id: draft.id },
          select: { stepDraftData: true },
        });
        const stepDraftData = (fresh as any)?.stepDraftData as any;
        if (stepDraftData?.steps && Array.isArray(stepDraftData.steps)) {
          const resultByStepId: Map<string, any> = new Map(
            executionResult.steps.map((s: any) => [s.step_id, s]),
          );
          const merged = stepDraftData.steps.map((step: any) => {
            const r: any = resultByStepId.get(step.id);
            if (!r) return step;
            return {
              ...step,
              status: r.status === 'completed' ? 'approved' : r.status === 'failed' ? 'rejected' : 'pending',
              evidence: {
                execution_id: executionResult.execution_id,
                executed_at: new Date().toISOString(),
                duration_ms: r.duration_ms,
                status: r.status,
                output: r.output,
                error: r.error,
                skill_name: r.skill_name || this.inferSkillName(r.step_id),
                sub_agent: r.sub_agent || this.inferSubAgent(r.step_id),
              },
              updated_at: new Date().toISOString(),
            };
          });

          await this.prisma.decisionDraft.update({
            where: { id: draft.id },
            data: {
              stepDraftData: {
                ...(stepDraftData || {}),
                steps: merged,
              } as any,
              updatedAt: new Date(),
            },
          });
        }
      }
    }

    this.logger.log(`[ChainOfWorkStorage] 执行结果保存完成`);
  }

  /**
   * 推断技能名称
   */
  private inferSkillName(stepId: string): string | undefined {
    const skillMapping: Record<string, string> = {
      'step-research': '信息收集',
      'step-weather': '天气预报查询',
      'step-route': '路线规划',
      'step-poi': 'POI搜索',
      'step-hotel': '酒店预定查询',
      'step-cost': '费用估算',
    };
    
    for (const [key, skill] of Object.entries(skillMapping)) {
      if (stepId.toLowerCase().includes(key.replace('step-', ''))) {
        return skill;
      }
    }
    return undefined;
  }

  /**
   * 推断 Sub-Agent
   */
  private inferSubAgent(stepId: string): string {
    const agentMapping: Record<string, string> = {
      'intake': 'Planner',
      'gate': 'Gatekeeper',
      'research': 'LocalInsight',
      'plan': 'Planner',
      'verify': 'Compliance',
      'repair': 'Execution',
      'narrate': 'Narrator',
    };
    
    for (const [key, agent] of Object.entries(agentMapping)) {
      if (stepId.toLowerCase().includes(key)) {
        return agent;
      }
    }
    return 'CoreDecision';
  }

  /**
   * 辅助方法：映射决策类型到步骤类型
   */
  private mapDecisionTypeToStepType(decisionType: string): string {
    const mapping: Record<string, string> = {
      'transport-decision': 'RESEARCH',
      'pace-decision': 'PLAN_GEN',
      'weather-decision': 'RESEARCH',
      'cost-decision': 'RESEARCH',
      'experience-decision': 'RESEARCH',
      'intake': 'INTAKE',
      'gate-eval': 'GATE_EVAL',
      'plan-gen': 'PLAN_GEN',
      'verify': 'VERIFY',
      'repair': 'REPAIR',
      'narrate': 'NARRATE',
    };
    return mapping[decisionType] || 'RESEARCH';
  }
}
