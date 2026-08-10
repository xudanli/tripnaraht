import { Injectable } from '@nestjs/common';
import type {
  ObservationAssessment,
  TravelObservationEvent,
} from './observation.types';

/**
 * S1 in-memory store. Durable persistence is a follow-on; not sole production SSOT long-term.
 */
@Injectable()
export class ObservationRepository {
  private readonly events = new Map<string, TravelObservationEvent>();
  /** observationId → revision → assessment */
  private readonly assessments = new Map<
    string,
    Map<number, ObservationAssessment>
  >();
  private readonly mediaExpiresAt = new Map<string, string>();

  saveEvent(event: TravelObservationEvent): void {
    this.events.set(event.observationId, structuredClone(event));
  }

  getEvent(observationId: string): TravelObservationEvent | undefined {
    const e = this.events.get(observationId);
    return e ? structuredClone(e) : undefined;
  }

  listByTrip(tripId: string): TravelObservationEvent[] {
    return [...this.events.values()]
      .filter((e) => e.tripId === tripId && !e.deletedAt)
      .map((e) => structuredClone(e));
  }

  saveAssessment(assessment: ObservationAssessment): void {
    let map = this.assessments.get(assessment.observationId);
    if (!map) {
      map = new Map();
      this.assessments.set(assessment.observationId, map);
    }
    map.set(assessment.assessmentRevision, structuredClone(assessment));
  }

  getLatestAssessment(
    observationId: string,
  ): ObservationAssessment | undefined {
    const map = this.assessments.get(observationId);
    if (!map || map.size === 0) return undefined;
    const maxRev = Math.max(...map.keys());
    return structuredClone(map.get(maxRev));
  }

  listAssessments(observationId: string): ObservationAssessment[] {
    const map = this.assessments.get(observationId);
    if (!map) return [];
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, a]) => structuredClone(a));
  }

  setMediaExpiresAt(observationId: string, expiresAt: string): void {
    this.mediaExpiresAt.set(observationId, expiresAt);
  }

  getMediaExpiresAt(observationId: string): string | undefined {
    return this.mediaExpiresAt.get(observationId);
  }

  /** Test helper */
  clear(): void {
    this.events.clear();
    this.assessments.clear();
    this.mediaExpiresAt.clear();
  }
}
