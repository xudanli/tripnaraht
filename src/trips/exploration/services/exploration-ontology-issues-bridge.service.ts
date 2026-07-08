import { Injectable, Optional } from '@nestjs/common';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import {
  projectOntologyIssuesFromTripView,
  type OntologyConsumerIssue,
} from '../../../travel-ontology/projections/ontology-issues.projection';

/**
 * Exploration BFF — 只读 Trip Context Snapshot 上的 Ontology 问题投影。
 * 不自行实现 BLOCK 规则。
 */
@Injectable()
export class ExplorationOntologyIssuesBridgeService {
  constructor(
    @Optional()
    private readonly tripSnapshotAssembler?: TripContextSnapshotAssemblerService,
  ) {}

  async projectUnresolvedOntologyIssues(tripId: string): Promise<OntologyConsumerIssue[]> {
    if (!this.tripSnapshotAssembler) return [];
    const view = await this.tripSnapshotAssembler.assemble(tripId);
    return projectOntologyIssuesFromTripView(view);
  }
}
