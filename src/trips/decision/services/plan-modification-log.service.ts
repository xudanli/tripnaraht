/**
 * Plan Modification Log Service
 *
 * Phase 3：记录用户修改行为，为反向学习、用户修改热力图提供数据
 * Phase 2：同步写入数据飞轮 Layer 2（FlywheelBehaviorLog）
 */

import { Injectable, Optional } from '@nestjs/common';
import { DecisionLogStorageService } from './decision-log-storage.service';
import { PlanModificationType } from '../dto/plan-modification.dto';
import { FlywheelPipelineService } from '../flywheel/flywheel-pipeline.service';

const MODIFICATION_TO_FLYWHEEL: Partial<Record<PlanModificationType, 'PLAN_EDIT' | 'DAY_DELETE' | 'DAY_SHORTEN' | 'POI_REMOVE' | 'ROUTE_CHANGE'>> = {
  day_removed: 'DAY_DELETE',
  day_added: 'PLAN_EDIT',
  poi_removed: 'POI_REMOVE',
  poi_replaced: 'PLAN_EDIT',
  poi_added: 'PLAN_EDIT',
  order_changed: 'ROUTE_CHANGE',
  time_adjusted: 'DAY_SHORTEN',
};

export interface PlanModificationEvent {
  planId: string;
  tripId?: string;
  userId?: string;
  modificationType: PlanModificationType;
  affectedDate?: string;
  affectedSlotId?: string;
  beforeSummary?: string;
  afterSummary?: string;
  context?: Record<string, any>;
}

@Injectable()
export class PlanModificationLogService {
  constructor(
    @Optional() private readonly decisionLogStorage?: DecisionLogStorageService,
    @Optional() private readonly flywheelPipeline?: FlywheelPipelineService,
  ) {}

  /**
   * 记录用户修改事件
   */
  async logModification(event: PlanModificationEvent): Promise<void> {
    if (!this.decisionLogStorage) return;

    try {
      await this.decisionLogStorage.saveLogEntry(
        {
          persona: 'USER_ACTION',
          action: 'MODIFY',
          decisionSource: 'USER',
          decisionStage: 'PLAN_EDIT',
          explanation: `用户修改: ${event.modificationType}${event.affectedDate ? ` (${event.affectedDate})` : ''}`,
          reasonCodes: [event.modificationType],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
        },
        {
          tripId: event.tripId,
          metadata: {
            planId: event.planId,
            modificationType: event.modificationType,
            affectedDate: event.affectedDate,
            affectedSlotId: event.affectedSlotId,
            beforeSummary: event.beforeSummary,
            afterSummary: event.afterSummary,
            context: event.context,
          },
        }
      );
      // Phase 2：数据飞轮 Layer 2
      if (
        this.flywheelPipeline &&
        event.userId &&
        event.tripId
      ) {
        const eventType = MODIFICATION_TO_FLYWHEEL[event.modificationType] ?? 'PLAN_EDIT';
        this.flywheelPipeline
          .recordBehavior({
            userId: event.userId,
            tripId: event.tripId,
            planId: event.planId,
            eventType,
            beforeState: event.beforeSummary ? { summary: event.beforeSummary } : undefined,
            afterState: event.afterSummary ? { summary: event.afterSummary } : undefined,
            metadata: event.context,
          })
          .catch(() => {});
      }
    } catch (error) {
      console.warn('Plan modification log failed:', error);
    }
  }
}
