/**
 * Adapts Rfc001DecisionProblemStoreService → LookRfc001Writer.
 */

import { Injectable } from '@nestjs/common';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import { Rfc001DecisionProblemStoreService } from '../../guardian-decision-core/persistence/rfc001-decision-problem.store';
import type { LookRfc001Writer } from './look-decision-problem.port';

@Injectable()
export class Rfc001LookDecisionProblemWriterAdapter
  implements LookRfc001Writer
{
  constructor(private readonly store: Rfc001DecisionProblemStoreService) {}

  findOpenByTriggerEvent(
    tripId: string,
    triggerEventId: string,
  ): Promise<Rfc001DecisionProblem | undefined> {
    return this.store.findOpenByTriggerEvent(tripId, triggerEventId);
  }

  upsert(
    tripId: string,
    problem: Rfc001DecisionProblem,
  ): Promise<Rfc001DecisionProblem> {
    return this.store.upsert(tripId, problem);
  }
}
