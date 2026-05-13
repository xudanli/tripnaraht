import { Injectable } from '@nestjs/common';
import { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { buildGovernanceRuntimeGraph } from './build-governance-runtime-graph.util';
import type { GovernanceRuntimeGraph } from './governance-runtime-graph.types';
import { compactGovernanceSnapshot } from '../snapshot/compact-governance-snapshot.util';
import type { GovernanceSnapshot } from '../snapshot/compact-governance-snapshot.util';

@Injectable()
export class GovernanceRuntimeGraphService {
  constructor(private readonly ledger: GovernanceLedgerStoreService) {}

  async buildGraphForTrip(tripId: string): Promise<GovernanceRuntimeGraph> {
    const events = await this.ledger.replayGovernanceTimeline(tripId);
    return buildGovernanceRuntimeGraph(events);
  }

  async snapshotForTrip(tripId: string, maxSourceEvents?: number): Promise<GovernanceSnapshot> {
    const events = await this.ledger.replayGovernanceTimeline(tripId);
    return compactGovernanceSnapshot(events, { tripId, maxSourceEvents });
  }
}
