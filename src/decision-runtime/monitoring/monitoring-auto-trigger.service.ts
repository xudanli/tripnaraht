/**
 * Auto-trigger monitoring scan for trips affected by realtime world changes.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripMonitoringMvpService } from './trip-monitoring-mvp.service';
import {
  DecisionAutomationChainService,
  type DecisionAutomationChainResult,
} from './decision-automation-chain.service';
import type { TripMonitoringScanResult } from './trip-monitoring-mvp.types';
import {
  detectAffectedTripIds,
  type RealtimeChangeLike,
} from './utils/affected-trip-lookup.util';

export interface MonitoringAutoTriggerResult {
  tripId: string;
  scan: TripMonitoringScanResult;
  automation?: DecisionAutomationChainResult;
}

export interface MonitoringAutoTriggerResponse {
  affectedTripIds: string[];
  results: MonitoringAutoTriggerResult[];
}

@Injectable()
export class MonitoringAutoTriggerService {
  private readonly logger = new Logger(MonitoringAutoTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly monitoring?: TripMonitoringMvpService,
    @Optional() private readonly automationChain?: DecisionAutomationChainService,
  ) {}

  async scanForChanges(
    changes: RealtimeChangeLike[],
    opts?: { dayIndex?: number; autoApply?: boolean },
  ): Promise<MonitoringAutoTriggerResponse> {
    const affectedTripIds = await detectAffectedTripIds(this.prisma, changes);
    if (!this.monitoring || affectedTripIds.length === 0) {
      return { affectedTripIds, results: [] };
    }

    const results: MonitoringAutoTriggerResult[] = [];
    for (const tripId of affectedTripIds) {
      const weatherChange = changes.find((c) => c.type === 'WEATHER_ALERT');
      const dayIndex = opts?.dayIndex ?? weatherChange?.dayIndex;

      try {
        const scan = await this.monitoring.scanTrip(tripId, { dayIndex });
        const result: MonitoringAutoTriggerResult = { tripId, scan };
        if (opts?.autoApply !== false && this.automationChain?.isEnabled()) {
          result.automation = await this.automationChain.tryAutoApplyAfterScan(
            tripId,
            scan,
          );
        }
        results.push(result);
        this.logger.log(
          `[MonitoringAutoTrigger] scanned trip=${tripId} alerts=${scan.activeAlertCount}`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[MonitoringAutoTrigger] scan failed trip=${tripId}: ${message}`);
      }
    }

    return { affectedTripIds, results };
  }

  async scanForTripIds(
    tripIds: string[],
    opts?: { dayIndex?: number },
  ): Promise<MonitoringAutoTriggerResponse> {
    const unique = Array.from(new Set(tripIds.filter(Boolean)));
    if (!this.monitoring || unique.length === 0) {
      return { affectedTripIds: unique, results: [] };
    }

    const results: MonitoringAutoTriggerResult[] = [];
    for (const tripId of unique) {
      const scan = await this.monitoring.scanTrip(tripId, opts);
      results.push({ tripId, scan });
    }
    return { affectedTripIds: unique, results };
  }
}
