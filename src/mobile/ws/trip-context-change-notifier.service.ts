import { Injectable, OnModuleInit } from '@nestjs/common';
import { TripContextWebSocketService } from './trip-context-ws.service';
import type { IntercomMessageEvent, TripContextChangedSection } from './trip-context-ws.types';
import { executionRiskPlanAppliedBus } from '../../trips/execution-risk-center/ports/execution-risk-plan-applied.bus';
import { teamTasksChangedBus } from '../../trips/team-tasks/ports/team-tasks-changed.bus';

@Injectable()
export class TripContextChangeNotifierService implements OnModuleInit {
  constructor(private readonly ws: TripContextWebSocketService) {}

  onModuleInit() {
    executionRiskPlanAppliedBus.onApplied((payload) => {
      this.notifyTripContextChanged({
        tripId: payload.tripId,
        contextVersion: payload.contextVersion,
        changedSections: payload.changedSections as TripContextChangedSection[],
        planVersion: payload.planVersion,
      });
    });

    teamTasksChangedBus.onChanged((payload) => {
      this.notifyTripContextChanged({
        tripId: payload.tripId,
        contextVersion: payload.contextVersion ?? Date.now(),
        changedSections: ['teamTasks'],
      });
    });
  }

  notifyTripContextChanged(input: {
    tripId: string;
    contextVersion: number;
    changedSections: TripContextChangedSection[];
    planVersion?: number;
  }) {
    this.ws.broadcastTripContextChanged(input);
  }

  notifyIntercomMessage(input: Omit<IntercomMessageEvent, 'type' | 'serverTime'>) {
    this.ws.broadcastIntercomMessage(input);
  }
}
