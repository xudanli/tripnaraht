import { Injectable } from '@nestjs/common';
import { WorldStateStoreService } from '../../guardian-decision-core/evidence/world-state-store.service';
import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import {
  buildTepEvidenceFromWorldState,
  type TepWorldStateEvidence,
} from '../adapters/world-state-to-tep-evidence.adapter';

@Injectable()
export class WorldStateTepEvidenceService {
  constructor(private readonly worldStateStore: WorldStateStoreService) {}

  async resolveEvidenceForTrip(input: {
    tripId: string;
    dailyDrivePlans: DailyDrivePlan[];
    now?: Date;
  }): Promise<TepWorldStateEvidence> {
    const store = await this.worldStateStore.readStore(input.tripId);
    return buildTepEvidenceFromWorldState({
      store,
      dailyDrivePlans: input.dailyDrivePlans,
      now: input.now,
    });
  }
}
