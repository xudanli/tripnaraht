/**
 * In-memory RFC-001 writer for Look projection unit tests.
 */

import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { LookRfc001Writer } from './look-decision-problem.port';

export class InMemoryRfc001DecisionProblemWriter implements LookRfc001Writer {
  private readonly byTrip = new Map<string, Rfc001DecisionProblem[]>();

  async findOpenByTriggerEvent(
    tripId: string,
    triggerEventId: string,
  ): Promise<Rfc001DecisionProblem | undefined> {
    const items = this.byTrip.get(tripId) ?? [];
    return items.find(
      (p) =>
        p.triggerEventId === triggerEventId &&
        !['RESOLVED', 'FAILED'].includes(p.status),
    );
  }

  async upsert(
    tripId: string,
    problem: Rfc001DecisionProblem,
  ): Promise<Rfc001DecisionProblem> {
    const items = [...(this.byTrip.get(tripId) ?? [])];
    const idx = items.findIndex((p) => p.problemId === problem.problemId);
    if (idx >= 0) items[idx] = problem;
    else items.push(problem);
    this.byTrip.set(tripId, items);
    return problem;
  }

  list(tripId: string): Rfc001DecisionProblem[] {
    return [...(this.byTrip.get(tripId) ?? [])];
  }

  clear(): void {
    this.byTrip.clear();
  }
}
