import { EventEmitter } from 'events';

export type ExecutionRiskPlanAppliedPayload = {
  tripId: string;
  contextVersion: number;
  changedSections: Array<'plan' | 'itinerary' | 'execution' | 'risks' | 'decisions'>;
  planVersion?: number;
};

/**
 * Cross-module bus: Execution Risk Center emits after Active Plan write;
 * Mobile WS notifier subscribes without creating Nest circular imports.
 */
class ExecutionRiskPlanAppliedBus extends EventEmitter {
  emitApplied(payload: ExecutionRiskPlanAppliedPayload): boolean {
    return this.emit('applied', payload);
  }

  onApplied(listener: (payload: ExecutionRiskPlanAppliedPayload) => void): void {
    this.on('applied', listener);
  }
}

export const executionRiskPlanAppliedBus = new ExecutionRiskPlanAppliedBus();
