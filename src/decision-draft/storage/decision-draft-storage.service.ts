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
      
      const savedDraft = await this.prisma.decisionDraft.upsert({
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
}
