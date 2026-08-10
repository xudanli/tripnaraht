import { Injectable } from '@nestjs/common';
import type { TravelObservationEvent } from '../observation.types';
import type { GroundingHints, GroundingResult } from './grounding.types';
import { reconcileObservationState } from './state-reconciliation';

@Injectable()
export class ObservationGroundingService {
  ground(
    event: TravelObservationEvent,
    hints: GroundingHints = {},
  ): GroundingResult {
    return reconcileObservationState(event, hints);
  }
}
