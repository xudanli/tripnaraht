import { Injectable, Optional, Inject, forwardRef } from '@nestjs/common';
import { ExecutionAdvisoryService } from '../../trips/trip-constraint-solver/services/execution-advisory.service';
import { EnvironmentRadarService } from '../../trips/in-trip-execution/services/environment-radar.service';
import type { TripExecutionAdvisoryDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { EnvironmentEventDetail } from '../../trips/in-trip-execution/types/environment-event.types';
import type { InTripRecoverySnapshot } from '../types/in-trip-recovery.types';

@Injectable()
export class ExecutionAdvisoryAdapter {
  constructor(
    @Optional()
    @Inject(forwardRef(() => ExecutionAdvisoryService))
    private readonly executionAdvisory?: ExecutionAdvisoryService,
    @Optional()
    @Inject(forwardRef(() => EnvironmentRadarService))
    private readonly environmentRadar?: EnvironmentRadarService,
  ) {}

  async getAdvisory(tripId: string, userId: string): Promise<TripExecutionAdvisoryDto> {
    if (!this.executionAdvisory) {
      throw new Error('ExecutionAdvisoryService 未可用');
    }
    return this.executionAdvisory.getAdvisory(tripId, userId);
  }

  async getEnvironmentEvent(
    tripId: string,
    eventId: string,
    userId: string,
  ): Promise<EnvironmentEventDetail> {
    if (!this.environmentRadar) {
      throw new Error('EnvironmentRadarService 未可用');
    }
    return this.environmentRadar.getEvent(tripId, eventId, userId);
  }

  async resolveEnvironmentPlan(
    tripId: string,
    eventId: string,
    userId: string,
    planId: string,
  ) {
    if (!this.environmentRadar) {
      throw new Error('EnvironmentRadarService 未可用');
    }
    return this.environmentRadar.resolveEvent(tripId, eventId, userId, { planId });
  }

  toSnapshot(advisory: TripExecutionAdvisoryDto, openEventCount: number, redCount: number): InTripRecoverySnapshot {
    const atRiskItems = advisory.impacts.affectedItems.filter((i) => i.status === 'at_risk').length;
    return {
      verdictStatus: advisory.verdict.status,
      openEnvironmentEvents: openEventCount,
      redEvents: redCount,
      delayMinutes: advisory.currentState.delayMinutes ?? 0,
      atRiskItems,
      onTrack: advisory.verdict.status === 'ON_TRACK',
    };
  }

  listActionableTriggers(advisory: TripExecutionAdvisoryDto): Array<{
    kind: 'ENVIRONMENT_EVENT' | 'LATE_DEPARTURE';
    eventId?: string;
    title: string;
    severity?: string;
    type?: string;
  }> {
    const triggers: Array<{
      kind: 'ENVIRONMENT_EVENT' | 'LATE_DEPARTURE';
      eventId?: string;
      title: string;
      severity?: string;
      type?: string;
    }> = [];

    if ((advisory.currentState.delayMinutes ?? 0) >= 15) {
      triggers.push({
        kind: 'LATE_DEPARTURE',
        title: `实际出发晚了 ${advisory.currentState.delayMinutes} 分钟`,
      });
    }

    for (const dev of advisory.deviations) {
      if (dev.id.startsWith('dev-env-')) {
        triggers.push({
          kind: 'ENVIRONMENT_EVENT',
          eventId: dev.id.replace('dev-env-', ''),
          title: dev.message,
        });
      }
    }

    return triggers;
  }

  mapTriggerKind(type?: string, title?: string): import('../types/in-trip-recovery.types').InTripTriggerKind {
    if (title?.includes('晚') || title?.includes('延迟')) return 'LATE_DEPARTURE';
    if (type === 'weather') return 'WEATHER_ALERT';
    if (type === 'traffic') return 'ROAD_CLOSED';
    return 'ENVIRONMENT_EVENT';
  }
}
