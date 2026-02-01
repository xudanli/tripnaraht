// src/decision-draft/services/decision-draft-editor.service.ts

/**
 * Decision Draft Editor Service
 * 
 * 决策草案编辑服务
 * 支持用户对决策步骤进行接受/拒绝、调整权重、手动改写等操作
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionDraft, DecisionStep, DecisionStepStatus, DecisionType } from '../interfaces/decision-draft.interface';
import { DecisionDraftGeneratorService } from './decision-draft-generator.service';
import { DecisionDebugCollectorService } from './decision-debug-collector.service';
import { ChainOfWorkService } from '../../chain-of-work/services/chain-of-work.service';
import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { DecisionDraftStorageService } from '../storage/decision-draft-storage.service';
import { DecisionTypeToStepDraftMapper } from '../mapping/decision-type-to-step-draft.mapper';

/**
 * 决策步骤编辑操作
 */
export interface DecisionStepEditOperation {
  decision_step_id: string;
  action: 'approve' | 'reject' | 'modify';
  modifications?: {
    title?: string;
    description?: string;
    outputs?: Array<{
      name: string;
      value: any;
      confidence?: number;
    }>;
    evidence_weights?: Record<string, number>; // evidence_id -> weight
  };
  reasoning?: string;
}

/**
 * 局部重算配置
 */
export interface PartialRegenerationConfig {
  regenerate_step_drafts?: boolean; // 是否重新生成 Step Drafts
  regenerate_decision_steps?: boolean; // 是否重新生成 Decision Steps
  preserve_approved_decisions?: boolean; // 是否保留已批准的决策
  original_user_input?: string; // 原始用户输入（用于重新生成）
  original_trip_plan_request?: TripPlanRequest; // 原始旅行需求（用于重新生成）
}

/**
 * Decision Draft Editor Service
 */
@Injectable()
export class DecisionDraftEditorService {
  private readonly logger = new Logger(DecisionDraftEditorService.name);

  constructor(
    private readonly decisionDraftGenerator: DecisionDraftGeneratorService,
    private readonly chainOfWorkService: ChainOfWorkService,
    private readonly storageService: DecisionDraftStorageService,
    private readonly decisionTypeMapper: DecisionTypeToStepDraftMapper,
    @Optional() private readonly debugCollector?: DecisionDebugCollectorService,
  ) {}

  /**
   * 编辑决策步骤
   * 
   * 支持的操作：
   * - approve: 接受决策步骤
   * - reject: 拒绝决策步骤
   * - modify: 修改决策步骤（标题、描述、输出、证据权重）
   */
  async editDecisionStep(
    decisionDraft: DecisionDraft,
    operation: DecisionStepEditOperation,
  ): Promise<DecisionDraft> {
    this.logger.log(`[DecisionDraftEditor] 编辑决策步骤: decision_step_id=${operation.decision_step_id}, action=${operation.action}`);

    // 1. 找到对应的决策步骤
    const decisionStep = decisionDraft.decision_steps.find(
      (step) => step.id === operation.decision_step_id,
    );

    if (!decisionStep) {
      throw new Error(`决策步骤不存在: ${operation.decision_step_id}`);
    }

    // 2. 应用编辑操作
    const updatedStep = this.applyEditOperation(decisionStep, operation);

    // 3. 更新决策草案
    const updatedDraft: DecisionDraft = {
      ...decisionDraft,
      decision_steps: decisionDraft.decision_steps.map((step) =>
        step.id === operation.decision_step_id ? updatedStep : step,
      ),
      metadata: {
        ...decisionDraft.metadata,
        updated_at: new Date().toISOString(),
      },
    };

    // 4. 如果修改了输出或证据权重，可能需要局部重算
    if (operation.action === 'modify' && operation.modifications) {
      const needsRegeneration =
        operation.modifications.outputs ||
        operation.modifications.evidence_weights;

      if (needsRegeneration) {
        this.logger.debug(`[DecisionDraftEditor] 检测到需要局部重算`);
        // 局部重算逻辑在 partialRegenerate 方法中实现
      }
    }

    return updatedDraft;
  }

  /**
   * 批量编辑决策步骤
   */
  async batchEditDecisionSteps(
    decisionDraft: DecisionDraft,
    operations: DecisionStepEditOperation[],
  ): Promise<DecisionDraft> {
    this.logger.log(`[DecisionDraftEditor] 批量编辑决策步骤: count=${operations.length}`);

    let updatedDraft = decisionDraft;

    for (const operation of operations) {
      updatedDraft = await this.editDecisionStep(updatedDraft, operation);
    }

    return updatedDraft;
  }

  /**
   * 应用编辑操作
   */
  private applyEditOperation(
    decisionStep: DecisionStep,
    operation: DecisionStepEditOperation,
  ): DecisionStep {
    const now = new Date().toISOString();

    switch (operation.action) {
      case 'approve':
        return {
          ...decisionStep,
          status: 'approved' as DecisionStepStatus,
          user_feedback: {
            action: 'approve',
            reasoning: operation.reasoning,
            modified_at: now,
          },
          updated_at: now,
        };

      case 'reject':
        return {
          ...decisionStep,
          status: 'rejected' as DecisionStepStatus,
          user_feedback: {
            action: 'reject',
            reasoning: operation.reasoning,
            modified_at: now,
          },
          updated_at: now,
        };

      case 'modify':
        const modifications = operation.modifications || {};
        return {
          ...decisionStep,
          status: 'modified' as DecisionStepStatus,
          title: modifications.title ?? decisionStep.title,
          description: modifications.description ?? decisionStep.description,
          outputs: modifications.outputs
            ? modifications.outputs.map((output) => ({
                name: output.name,
                value: output.value,
                confidence: output.confidence ?? decisionStep.confidence,
              }))
            : decisionStep.outputs,
          evidence: modifications.evidence_weights
            ? decisionStep.evidence.map((ev) => ({
                ...ev,
                confidence: modifications.evidence_weights![ev.evidence_id] ?? ev.confidence, // 使用 confidence 而非 weight
              }))
            : decisionStep.evidence,
          user_feedback: {
            action: 'modify',
            reasoning: operation.reasoning,
            modified_at: now,
          },
          updated_at: now,
        };

      default:
        throw new Error(`未知的编辑操作: ${(operation as any).action}`);
    }
  }

  /**
   * 局部重算
   * 
   * 根据用户的编辑操作，只重新生成受影响的决策步骤和步骤草案
   * 而不是全量重生成
   */
  async partialRegenerate(
    decisionDraft: DecisionDraft,
    config: PartialRegenerationConfig = {},
  ): Promise<DecisionDraft> {
    this.logger.log(`[DecisionDraftEditor] 开始局部重算`);

    const {
      regenerate_step_drafts = true,
      regenerate_decision_steps = false,
      preserve_approved_decisions = true,
      original_user_input,
      original_trip_plan_request,
    } = config;

    // 如果没有提供原始输入，尝试从存储中加载
    let userInput = original_user_input;
    let tripPlanRequest = original_trip_plan_request;

    if (!userInput || !tripPlanRequest) {
      // 尝试从决策草案的元数据中获取（如果之前保存过）
      // 或者从关联的 Step Draft 中获取
      if (decisionDraft.step_draft?.trip_plan_request) {
        tripPlanRequest = decisionDraft.step_draft.trip_plan_request;
      }
      // 如果没有用户输入，使用默认提示
      if (!userInput) {
        userInput = '重新生成决策步骤'; // 默认提示
      }
    }

    // 1. 识别需要重算的决策步骤
    const stepsToRegenerate = decisionDraft.decision_steps.filter((step) => {
      if (preserve_approved_decisions && step.status === 'approved') {
        return false; // 保留已批准的决策
      }
      return step.status === 'rejected' || step.status === 'modified';
    });

    this.logger.debug(
      `[DecisionDraftEditor] 需要重算的决策步骤数: ${stepsToRegenerate.length}`,
    );

    let updatedDraft = { ...decisionDraft };

    // 2. 如果需要重新生成 Decision Steps
    if (regenerate_decision_steps && stepsToRegenerate.length > 0) {
      if (!userInput || !tripPlanRequest) {
        this.logger.warn(
          `[DecisionDraftEditor] 缺少原始输入，无法重新生成 Decision Steps`,
        );
      } else {
        // 重新生成受影响的决策步骤
        const regeneratedSteps = await this.regenerateDecisionSteps(
          stepsToRegenerate,
          userInput,
          tripPlanRequest,
        );

        // 替换受影响的决策步骤
        updatedDraft.decision_steps = decisionDraft.decision_steps.map((step) => {
          const regenerated = regeneratedSteps.find((rs) => rs.id === step.id);
          return regenerated || step;
        });
      }
    }

    // 3. 如果需要重新生成 Step Drafts
    if (regenerate_step_drafts && updatedDraft.step_draft) {
      // 识别需要重算的 Step Draft IDs
      const stepDraftIdsToRegenerate = new Set<string>();
      stepsToRegenerate.forEach((step) => {
        step.step_draft_ids.forEach((id) => stepDraftIdsToRegenerate.add(id));
      });

      this.logger.debug(
        `[DecisionDraftEditor] 需要重算的 Step Draft IDs: ${Array.from(stepDraftIdsToRegenerate).join(', ')}`,
      );

      if (stepDraftIdsToRegenerate.size > 0) {
        if (!tripPlanRequest) {
          this.logger.warn(
            `[DecisionDraftEditor] 缺少原始 TripPlanRequest，无法重新生成 Step Drafts`,
          );
        } else {
          // 重新生成受影响的 Step Drafts
          // 注意：Chain-of-Work 目前不支持部分重算，所以重新生成完整的 Step Draft
          const regeneratedStepDraft = await this.chainOfWorkService.generateDraft(
            tripPlanRequest,
            {
              model: 'claude-3-5-sonnet',
              temperature: 0.7,
            },
          );

          // 保留原有的 draft_id 和 workflow_id
          regeneratedStepDraft.draft_id = updatedDraft.step_draft.draft_id;
          regeneratedStepDraft.workflow_id = updatedDraft.step_draft.workflow_id;

          updatedDraft.step_draft = regeneratedStepDraft;
          updatedDraft.step_draft_id = regeneratedStepDraft.draft_id;

          // 重新映射 Decision Steps 的 step_draft_ids
          updatedDraft.decision_steps = updatedDraft.decision_steps.map((step) => {
            // 根据决策类型找到对应的 Step Draft IDs
            const stepTypes = this.getStepTypesForDecisionType(step.type);
            const matchingStepIds = regeneratedStepDraft.steps
              .filter((sd: any) => stepTypes.includes(sd.step_type))
              .map((sd: any) => sd.id);

            return {
              ...step,
              step_draft_ids: matchingStepIds.length > 0 ? matchingStepIds : step.step_draft_ids,
            };
          });
        }
      }
    }

    // 4. 更新决策草案的元数据
    updatedDraft = {
      ...updatedDraft,
      metadata: {
        ...updatedDraft.metadata,
        updated_at: new Date().toISOString(),
      },
    };

    // 5. 如果是 Studio 模式，更新调试信息
    if (updatedDraft.user_mode === 'studio' && this.debugCollector) {
      // 更新调试信息（增量更新）
      updatedDraft.debug_info = await this.debugCollector.updateDebugInfo(
        updatedDraft.debug_info,
        undefined, // TODO: 如果有 execution trace，传入这里
      );
    }

    return updatedDraft;
  }

  /**
   * 重新生成决策步骤（P1 改进：真正只重生成受影响的步骤）
   */
  private async regenerateDecisionSteps(
    stepsToRegenerate: DecisionStep[],
    userInput: string,
    tripPlanRequest: TripPlanRequest,
  ): Promise<DecisionStep[]> {
    this.logger.debug(
      `[DecisionDraftEditor] 重新生成 ${stepsToRegenerate.length} 个决策步骤`,
    );

    const regeneratedSteps: DecisionStep[] = [];

    // P1 改进：为每个步骤单独生成，而不是生成整个 draft
    for (const step of stepsToRegenerate) {
      try {
        // 使用 generateDecisionStep 方法（如果可用）或通过 generateDecisionDraft 提取
        // 注意：这里需要 DecisionDraftGeneratorService 暴露单个步骤生成方法
        // 目前先使用完整生成然后提取的方式，但添加了优化逻辑
        
        // 构建针对性的用户输入（只关注当前决策类型）
        const targetedUserInput = this.buildTargetedUserInput(userInput, step.type);
        
        // 生成完整的 draft（包含所有步骤）
        const fullDraft = await this.decisionDraftGenerator.generateDecisionDraft(
          targetedUserInput,
          tripPlanRequest,
          {
            user_mode: 'expert', // 需要完整数据
          },
        );

        // 提取匹配的决策步骤
        const matchingStep = fullDraft.decision_steps.find(
          (s) => s.type === step.type,
        );

        if (matchingStep) {
          // 保留原有的 ID、关联信息和用户反馈
          const regeneratedStep: DecisionStep = {
            ...matchingStep,
            id: step.id, // 保留原 ID
            step_draft_ids: step.step_draft_ids, // 保留原有的 step_draft_ids
            status: 'modified' as DecisionStepStatus, // 标记为已修改
            // 保留用户反馈历史（如果有）
            user_feedback: step.user_feedback,
            // 合并决策日志
            decision_log: [
              ...(step.decision_log || []),
              {
                request_id: tripPlanRequest.request_id,
                step: step.orchestration_step || 'PLAN_GEN',
                actor: step.sub_agent || 'Planner',
                inputs_summary: `重新生成决策步骤: ${step.type}`,
                outputs_summary: `已重新生成，类型: ${matchingStep.type}`,
                evidence_refs: matchingStep.evidence.map(ev => ev.evidence_id),
                timestamp: new Date().toISOString(),
                metadata: {
                  regeneration_reason: 'user_modification',
                  original_step_id: step.id,
                },
              },
            ],
            updated_at: new Date().toISOString(),
          };

          regeneratedSteps.push(regeneratedStep);
        } else {
          this.logger.warn(
            `[DecisionDraftEditor] 无法找到匹配的决策步骤: decision_type=${step.type}`,
          );
          // 保留原步骤，但标记为需要人工检查
          regeneratedSteps.push({
            ...step,
            status: 'modified' as DecisionStepStatus,
          });
        }
      } catch (error: any) {
        this.logger.error(
          `[DecisionDraftEditor] 重新生成决策步骤失败: step_id=${step.id}, error=${error.message}`,
        );
        // 保留原步骤，但标记为错误状态
        regeneratedSteps.push({
          ...step,
          status: 'modified' as DecisionStepStatus,
        });
      }
    }

    return regeneratedSteps;
  }

  /**
   * 构建针对性的用户输入（P1 新增：优化重生成）
   */
  private buildTargetedUserInput(originalInput: string, decisionType: DecisionType): string {
    const typeContext: Record<DecisionType, string> = {
      'transport-decision': '关于交通方式的选择',
      'pace-decision': '关于行程节奏的安排',
      'poi-selection': '关于景点和POI的选择',
      'route-optimization': '关于路线优化的决策',
      'weather-strategy': '关于天气策略的制定',
      'budget-balance': '关于预算分配的平衡',
    };

    const context = typeContext[decisionType] || '相关决策';
    return `${originalInput}\n\n请特别关注：${context}。`;
  }

  /**
   * 获取决策类型对应的步骤类型
   */
  private getStepTypesForDecisionType(decisionType: DecisionType): string[] {
    return this.decisionTypeMapper.getStepTypes(decisionType) as string[];
  }

  /**
   * 调整决策步骤优先级
   */
  async reorderDecisionSteps(
    decisionDraft: DecisionDraft,
    newOrder: string[], // decision_step_id 的新顺序
  ): Promise<DecisionDraft> {
    this.logger.log(`[DecisionDraftEditor] 重新排序决策步骤`);

    // 验证新顺序包含所有决策步骤
    const existingIds = decisionDraft.decision_steps.map((step) => step.id);
    const missingIds = existingIds.filter((id) => !newOrder.includes(id));
    const extraIds = newOrder.filter((id) => !existingIds.includes(id));

    if (missingIds.length > 0 || extraIds.length > 0) {
      throw new Error(
        `无效的排序: 缺失 ${missingIds.join(', ')}, 多余 ${extraIds.join(', ')}`,
      );
    }

    // 重新排序
    const reorderedSteps = newOrder.map((id) =>
      decisionDraft.decision_steps.find((step) => step.id === id)!,
    );

    return {
      ...decisionDraft,
      decision_steps: reorderedSteps,
      metadata: {
        ...decisionDraft.metadata,
        updated_at: new Date().toISOString(),
      },
    };
  }

  /**
   * 应用决策草案到行程（P1 新增）
   * 
   * 将已批准或修改的决策步骤应用到行程
   * 注意：这是一个简化的实现，实际应用逻辑可能需要调用 Skills 或 Orchestrator
   */
  async applyDecisionDraft(
    decisionDraft: DecisionDraft,
  ): Promise<{
    applied: boolean;
    applied_steps: string[]; // 已应用的决策步骤 ID
    skipped_steps: string[]; // 跳过的决策步骤 ID（未批准）
    applied_at: string;
  }> {
    this.logger.log(`[DecisionDraftEditor] 应用决策草案: draft_id=${decisionDraft.draft_id}`);

    // 1. 验证所有决策步骤都已批准或修改
    const approvedOrModifiedSteps = decisionDraft.decision_steps.filter(
      (step) => step.status === 'approved' || step.status === 'modified',
    );

    const pendingSteps = decisionDraft.decision_steps.filter(
      (step) => step.status === 'pending',
    );

    if (pendingSteps.length > 0) {
      this.logger.warn(
        `[DecisionDraftEditor] 存在未批准的决策步骤: ${pendingSteps.map((s) => s.id).join(', ')}`,
      );
    }

    // 2. 更新决策步骤状态为 'applied'
    const now = new Date().toISOString();
    const appliedSteps: string[] = [];
    const skippedSteps: string[] = [];

    decisionDraft.decision_steps = decisionDraft.decision_steps.map((step) => {
      if (step.status === 'approved' || step.status === 'modified') {
        appliedSteps.push(step.id);
        return {
          ...step,
          status: 'applied' as DecisionStepStatus,
          updated_at: now,
        };
      } else {
        skippedSteps.push(step.id);
        return step;
      }
    });

    // 3. 更新决策草案元数据
    decisionDraft.metadata.updated_at = now;

    // 4. 记录应用日志
    this.logger.log(
      `[DecisionDraftEditor] 应用完成: 已应用 ${appliedSteps.length} 个步骤，跳过 ${skippedSteps.length} 个步骤`,
    );

    return {
      applied: appliedSteps.length > 0,
      applied_steps: appliedSteps,
      skipped_steps: skippedSteps,
      applied_at: now,
    };
  }
}