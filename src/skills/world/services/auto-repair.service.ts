/**
 * AutoRepairService — fix broken comment block and wire monitoring auto-trigger.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import { StateConsistencyGuardService } from '../../../trips/dem/services/state-consistency-guard.service';
import { RealtimeRoadStatusService } from './realtime-road-status.service';
import { RealtimeWeatherService } from './realtime-weather.service';
import type { MonitoringAutoTriggerService } from '../../../decision-runtime/monitoring/monitoring-auto-trigger.service';
import {
  detectAffectedTripIds,
  type RealtimeChangeLike,
} from '../../../decision-runtime/monitoring/utils/affected-trip-lookup.util';
import { evaluateDecisionAutomation } from '../../../decision-runtime/authorization/utils/decision-automation-policy.util';
import { evaluateAutomationExecutionConditions } from '../../../decision-runtime/authorization/utils/automation-execution-conditions.util';
import { resolveAutomationPolicyFromTripMetadata } from '../../../trips/trip-constraint-solver/utils/travel-decision-contract-runtime.util';
import { readStoredTravelDecisionContract } from '../../../trips/trip-constraint-solver/utils/travel-decision-contract.builder';
import type { AutomationPolicy } from '../../../trips/trip-constraint-solver/types/travel-decision-contract.types';

export interface RealtimeChange extends RealtimeChangeLike {
  poiId?: string;
  oldStatus?: string;
  newStatus: string;
  impact: string;
  dayIndex?: number;
}

export interface RepairResult {
  success: boolean;
  repairedPlan?: unknown;
  changes: RealtimeChange[];
  warnings?: string[];
  automationBlocked?: boolean;
  automationReasonCodes?: string[];
}

export interface RepairAutomationEvaluation {
  allowed: boolean;
  reasonCodes: string[];
  semanticKey?: string;
}

@Injectable()
export class AutoRepairService {
  private readonly logger = new Logger(AutoRepairService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeRoadStatusService: RealtimeRoadStatusService,
    private realtimeWeatherService: RealtimeWeatherService,
    @Optional() private readonly terrainAudit?: StateConsistencyGuardService,
    @Optional() private readonly monitoringAutoTrigger?: MonitoringAutoTriggerService,
  ) {}

  async detectAffectedTrips(changes: RealtimeChange[]): Promise<string[]> {
    this.logger.log(`[AutoRepair] 检测受影响行程: changes=${changes.length}`);
    return detectAffectedTripIds(this.prisma, changes);
  }

  /**
   * Detect affected trips and trigger S3 monitoring scan for each.
   */
  async notifyChangesAndTriggerMonitoring(changes: RealtimeChange[]) {
    const affectedTripIds = await this.detectAffectedTrips(changes);
    if (!this.monitoringAutoTrigger) {
      this.logger.warn('[AutoRepair] MonitoringAutoTriggerService not wired; scan skipped');
      return { affectedTripIds, results: [] };
    }
    return this.monitoringAutoTrigger.scanForChanges(changes);
  }

  evaluateRepairAutomation(input: {
    change: RealtimeChange;
    automation: AutomationPolicy;
    automationPaused?: boolean;
  }): RepairAutomationEvaluation {
    const semanticKey = semanticKeyForChange(input.change);
    const evaluation = evaluateDecisionAutomation({
      automation: input.automation,
      automationPaused: input.automationPaused,
      semanticKey,
      semanticCapability: semanticKey.split(':')[0],
      enforcement: input.change.type === 'ROAD_STATUS_CHANGE' && input.change.newStatus === 'CLOSED'
        ? 'BLOCK'
        : 'REQUIRE_ADJUSTMENT',
    });

    if (!evaluation.autoApplyEligible || evaluation.outcome !== 'ALLOW') {
      return {
        allowed: false,
        reasonCodes: evaluation.reasonCodes,
        semanticKey,
      };
    }

    const conditions = evaluateAutomationExecutionConditions({
      matchedActionKeys: evaluation.matchedActionKeys ?? [],
      automation: input.automation,
      context: {
        action: {
          actionId: 'repair_plan',
          summary: input.change.impact,
          type: input.change.type,
        },
        problem: {
          semanticKey,
          affectedDayNumbers:
            input.change.dayIndex != null ? [input.change.dayIndex + 1] : undefined,
        },
      },
    });

    return {
      allowed: conditions.allowed,
      reasonCodes: [...evaluation.reasonCodes, ...conditions.reasonCodes],
      semanticKey,
    };
  }

  async repairPlan(
    plan: unknown,
    changes: RealtimeChange[],
    opts?: { tripId?: string },
  ): Promise<RepairResult> {
    this.logger.log(`[AutoRepair] 修复计划: changes=${changes.length}`);

    let automationPolicy: AutomationPolicy | undefined;
    let automationPaused = false;
    if (opts?.tripId) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: opts.tripId },
        select: { metadata: true, budgetConfig: true },
      });
      if (trip) {
        const metadata = (trip.metadata ?? {}) as Record<string, unknown>;
        automationPolicy = resolveAutomationPolicyFromTripMetadata(
          metadata,
          (trip.budgetConfig ?? {}) as Record<string, unknown>,
        );
        automationPaused = readStoredTravelDecisionContract(metadata)?.automationPaused === true;
      }
    }

    let basePlan = plan;
    if (this.terrainAudit && this.isRoutePlanDraft(basePlan)) {
      const { plan: audited, patched } = await this.terrainAudit.runTerrainAudit(basePlan);
      if (patched) {
        this.logger.log('[AutoRepair] TerrainAudit applied (DEM ascent / slope before repair rules)');
      }
      basePlan = audited;
    }

    const repairedPlan = { ...(basePlan as object) };
    const warnings: string[] = [];
    const automationReasonCodes: string[] = [];
    let automationBlocked = false;

    for (const change of changes) {
      switch (change.type) {
        case 'ROAD_STATUS_CHANGE':
          if (change.newStatus === 'CLOSED') {
            warnings.push(`道路 ${change.roadId} 已封闭，需要替换路线`);
          } else if (change.newStatus === 'CONDITIONAL') {
            warnings.push(`道路 ${change.roadId} 有条件限制: ${change.impact}`);
          }
          break;
        case 'WEATHER_ALERT':
          warnings.push(`天气预警: ${change.impact}`);
          break;
        case 'POI_STATUS_CHANGE':
          if (change.newStatus === 'CLOSED') {
            warnings.push(`POI ${change.poiId} 已关闭，需要替换`);
          }
          break;
      }

      if (automationPolicy && warnings.length > 0) {
        const automation = this.evaluateRepairAutomation({
          change,
          automation: automationPolicy,
          automationPaused,
        });
        automationReasonCodes.push(...automation.reasonCodes);
        if (!automation.allowed) {
          automationBlocked = true;
        }
      }
    }

    const blockedByAutomation = automationBlocked && warnings.length > 0;

    return {
      success: warnings.length === 0,
      repairedPlan: warnings.length === 0 ? repairedPlan : undefined,
      changes,
      warnings: warnings.length > 0 ? warnings : undefined,
      automationBlocked: blockedByAutomation,
      automationReasonCodes: automationReasonCodes.length > 0 ? automationReasonCodes : undefined,
    };
  }

  async detectRealtimeChanges(_plan: unknown): Promise<RealtimeChange[]> {
    return [];
  }

  private isRoutePlanDraft(p: unknown): p is RoutePlanDraft {
    if (!p || typeof p !== 'object') return false;
    const o = p as Record<string, unknown>;
    return typeof o.tripId === 'string' && typeof o.routeDirectionId === 'string' && Array.isArray(o.segments);
  }
}

function semanticKeyForChange(change: RealtimeChange): string {
  switch (change.type) {
    case 'ROAD_STATUS_CHANGE':
      return `ROAD_SEGMENT_UNAVAILABLE:${change.roadId ?? 'unknown'}`;
    case 'WEATHER_ALERT':
      return `WEATHER_ACTIVITY_PROHIBITED:${change.dayIndex ?? 0}`;
    case 'POI_STATUS_CHANGE':
      return `POI_CLOSURE:${change.poiId ?? 'unknown'}`;
    default:
      return `FEASIBILITY_FAILURE:${change.type}`;
  }
}
