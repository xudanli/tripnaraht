/**
 * TEP → Execution Risk Center BFF enrichment
 * @see internal-docs/frontend/EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md
 */

import { Injectable } from '@nestjs/common';
import type {
  ExecutionAdjustmentQueueDto,
  ExecutionInterventionDto,
} from '../../../mobile/dto/mobile-execution.types';
import {
  EXECUTION_INTERVENTION_SCHEMA_ID,
} from '../../execution-risk-center/utils/execution-intervention.projection.util';
import { enrichInterventionWithUserNarrative } from '../../execution-risk-center/utils/execution-user-narrative.projection.util';
import type { RecoveryOption } from '../contracts/tep-self-drive.types';
import { TepPlanMetadataService } from './tep-plan-metadata.service';
import { dedupeAdjustmentQueueForTepCanonical } from '../utils/tep-canonical-dedup.util';

@Injectable()
export class TepErcBridgeService {
  constructor(private readonly planMetadata: TepPlanMetadataService) {}

  /** 将 PlanVersion.metadata.tep 的 RecoveryGraph 并入 adjustment-queue */
  async enrichAdjustmentQueue(
    tripId: string,
    queue: ExecutionAdjustmentQueueDto,
  ): Promise<ExecutionAdjustmentQueueDto> {
    const loaded = await this.planMetadata.loadTepMetadata(tripId);
    const recoveryGraph = loaded.tep?.recoveryGraph;
    const basePlanVersionId = loaded.planVersionId;
    const decisionHooks = loaded.tep?.decisionHooks ?? [];

    const enrichedItems = queue.items.map((item) =>
      recoveryGraph?.fallbackOptions?.length
        ? this.attachTepRecoveryToItem(item, recoveryGraph.fallbackOptions, basePlanVersionId)
        : item,
    );

    const existingIds = new Set(enrichedItems.map((i) => i.id));
    const tepOnlyItems =
      recoveryGraph?.fallbackOptions?.length
        ? recoveryGraph.fallbackOptions
            .filter(
              (opt) =>
                opt.triggerRuleId === 'SDR-101' ||
                (opt.triggerRuleId === 'SDR-302' && opt.action === 'REPLACE'),
            )
            .filter((opt) => !existingIds.has(`intervention-tep-${opt.optionId}`))
            .map((opt) => this.projectTepFallbackIntervention(tripId, opt, basePlanVersionId))
        : [];

    let items = [...enrichedItems, ...tepOnlyItems].sort(
      (a, b) => priorityWeight(b.priority) - priorityWeight(a.priority),
    );

    if (decisionHooks.length > 0 && basePlanVersionId) {
      items = dedupeAdjustmentQueueForTepCanonical(items, {
        tripId,
        effectivePlanVersionId: basePlanVersionId,
        decisionHooks,
      });
    }

    const criticalCount = items.filter((i) => i.priority === 'CRITICAL').length;
    const highPriorityCount = items.filter(
      (i) => i.priority === 'HIGH' || i.priority === 'CRITICAL',
    ).length;
    const pendingCount = items.length;
    const blocking = items.filter(
      (i) =>
        i.priority === 'CRITICAL' ||
        (i.requiresConfirmation && i.type === 'SAFETY_INTERVENTION'),
    ).length;
    const headline =
      tepOnlyItems.length > 0
        ? `今天需要您决定 ${pendingCount} 件事（含 ${tepOnlyItems.length} 项行程修复建议）`
        : pendingCount > 0
          ? `今天需要您决定 ${pendingCount} 件事${blocking > 0 ? `，其中 ${blocking} 项可能影响行程执行` : ''}`
          : queue.headline;

    return {
      ...queue,
      items: items.map((item) => enrichInterventionWithUserNarrative(item)),
      pendingCount,
      criticalCount,
      highPriorityCount,
      countsByType: {
        ...queue.countsByType,
        DYNAMIC_REPLAN:
          queue.countsByType.DYNAMIC_REPLAN +
          tepOnlyItems.filter((i) => i.type === 'DYNAMIC_REPLAN').length,
      },
      headline,
    };
  }

  private attachTepRecoveryToItem(
    item: ExecutionInterventionDto,
    fallbacks: RecoveryOption[],
    basePlanVersionId?: string,
  ): ExecutionInterventionDto {
    if (!item.decisionProblemId) return item;

    const linked = fallbacks.filter((opt) => {
      if (opt.triggerRuleId === 'SDR-302' && opt.action === 'REPLACE') {
        return item.type === 'SAFETY_INTERVENTION' || item.type === 'DYNAMIC_REPLAN';
      }
      if (item.type === 'DYNAMIC_REPLAN' && opt.triggerRuleId === 'SDR-101') {
        return true;
      }
      return false;
    });

    if (linked.length === 0) return item;

    const alternativeActions = [
      ...(item.alternativeActions ?? []),
      ...linked.map((opt) => opt.description),
    ];

    const primaryFallback = linked[0]!;
    return this.applyRecoveryOptionToIntervention(
      {
        ...item,
        alternativeActions: [...new Set(alternativeActions)],
        requiresRevalidation: true,
        modifiesEffectivePlan: primaryFallback.action === 'REMOVE',
      },
      primaryFallback,
      basePlanVersionId,
    );
  }

  private applyRecoveryOptionToIntervention(
    item: ExecutionInterventionDto,
    option: RecoveryOption,
    basePlanVersionId?: string,
  ): ExecutionInterventionDto {
    return {
      ...item,
      recommendation: {
        ...(item.recommendation ?? {
          title: option.description,
          summary: option.description,
          recommendedActionId: option.optionId,
          keeps: ['保留核心行程目标'],
          costs: option.action === 'REMOVE' ? ['移除部分可选停靠'] : ['调整活动安排'],
        }),
        title: option.description,
        summary: option.description,
        recommendedActionId: option.optionId,
        basePlanVersionId,
      },
      actions: {
        ...item.actions,
        primary: {
          ...item.actions.primary,
          label: option.description,
          actionId: option.optionId,
        },
      },
      causalChain: item.causalChain
        ? {
            ...item.causalChain,
            recommendedOption: {
              optionId: option.optionId,
              summary: option.description,
              expectedImprovement: item.causalChain.recommendedOption?.expectedImprovement,
            },
          }
        : item.causalChain,
    };
  }

  private projectTepFallbackIntervention(
    tripId: string,
    option: RecoveryOption,
    basePlanVersionId?: string,
  ): ExecutionInterventionDto {
    return {
      schemaId: EXECUTION_INTERVENTION_SCHEMA_ID,
      id: `intervention-tep-${option.optionId}`,
      tripId,
      type: 'DYNAMIC_REPLAN',
      priority: 'HIGH',
      title: '驾驶负荷修复建议',
      reason: option.description,
      recommendedAction:
        option.action === 'REMOVE'
          ? '删除可选停靠以降低当日驾驶负荷'
          : '应用备选方案恢复可执行性',
      affectedMembers: [],
      affectedActivities: option.targetRefs.filter((r) => r.startsWith('activity_')),
      alternativeActions: [option.description],
      evidenceRefs: [],
      requiresConfirmation: true,
      autoExecutable: false,
      reversible: true,
      modifiesEffectivePlan: option.action === 'REMOVE',
      requiresRevalidation: true,
      status: 'OPEN',
      linkedRiskIds: [],
      causalChain: {
        headline: '驾驶负荷超出舒适区间',
        assessment: option.description,
        nodes: [
          {
            nodeId: 'world_change',
            type: 'WORLD_CHANGE',
            title: '计划负荷偏高',
            description: '单日等效驾驶时间超过建议阈值',
          },
          {
            nodeId: 'impact',
            type: 'IMPACT',
            title: '执行风险',
            description: '继续按原计划执行可能延误后续活动',
          },
          {
            nodeId: 'option',
            type: 'OPTION',
            title: '修复建议',
            description: option.description,
          },
        ],
        recommendedOption: {
          optionId: option.optionId,
          summary: option.description,
          expectedImprovement: '降低当日驾驶负荷等级',
        },
      },
      actions: {
        primary: {
          label: option.description,
          action: 'accept',
          actionId: option.optionId,
          enabled: true,
        },
        secondary: {
          label: '保留原计划',
          action: 'keep_original',
          enabled: true,
        },
        defer: {
          label: '稍后处理',
          action: 'defer',
          enabled: true,
        },
      },
      recommendation: {
        title: option.description,
        summary: option.description,
        recommendedActionId: option.optionId,
        keeps: ['保留主线路与住宿锚点'],
        costs: option.action === 'REMOVE' ? ['减少可选景点停留'] : ['替换部分活动'],
        basePlanVersionId,
      },
    };
  }
}

function priorityWeight(priority: ExecutionInterventionDto['priority']): number {
  switch (priority) {
    case 'CRITICAL':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    default:
      return 1;
  }
}
