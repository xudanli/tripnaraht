/**
 * In-memory trigger lineage for observability (per trip, capped).
 */

import { Injectable } from '@nestjs/common';
import type { DecisionRunRequest } from '../contracts/decision-run-request';

export interface DecisionTriggerLineageEntry {
  runId: string;
  request: DecisionRunRequest;
  recordedAt: string;
}

const MAX_ENTRIES_PER_TRIP = 200;

@Injectable()
export class DecisionTriggerLineageStore {
  private readonly byTrip = new Map<string, DecisionTriggerLineageEntry[]>();

  append(tripId: string, request: DecisionRunRequest): void {
    const list = this.byTrip.get(tripId) ?? [];
    list.push({
      runId: request.runId,
      request,
      recordedAt: new Date().toISOString(),
    });
    if (list.length > MAX_ENTRIES_PER_TRIP) {
      list.splice(0, list.length - MAX_ENTRIES_PER_TRIP);
    }
    this.byTrip.set(tripId, list);
  }

  list(tripId: string): DecisionTriggerLineageEntry[] {
    return [...(this.byTrip.get(tripId) ?? [])];
  }

  get(tripId: string, runId: string): DecisionTriggerLineageEntry | undefined {
    return this.byTrip.get(tripId)?.find((e) => e.runId === runId);
  }

  clearForTests(): void {
    this.byTrip.clear();
  }
}
