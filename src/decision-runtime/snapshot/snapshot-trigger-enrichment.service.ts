/**
 * Auto-attach Trip Context Snapshot to Decision Trigger inputs when missing.
 */

import { Injectable, Optional } from '@nestjs/common';
import type { DecisionTriggerInput } from '../contracts/decision-run-request';
import { attachContextSnapshotToTriggerInput } from '../trigger/intent/attach-context-snapshot.util';
import { TripContextSnapshotAssemblerService } from './trip-context-snapshot.assembler.service';

@Injectable()
export class SnapshotTriggerEnrichmentService {
  constructor(
    @Optional()
    private readonly snapshotAssembler?: TripContextSnapshotAssemblerService,
  ) {}

  async enrichIfMissing(input: DecisionTriggerInput): Promise<DecisionTriggerInput> {
    if (!this.snapshotAssembler || !input.tripId?.trim()) {
      return input;
    }

    const existing = input.metadata?.contextSnapshotId;
    if (typeof existing === 'string' && existing.length > 0) {
      return input;
    }

    const ref = await this.snapshotAssembler.resolveSnapshotRef(input.tripId.trim());
    return attachContextSnapshotToTriggerInput(input, ref);
  }
}
