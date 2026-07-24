import { BadRequestException, Injectable } from '@nestjs/common';
import type { TravelContextSnapshot } from '../domain/travel-context.types';
import { TravelContextSnapshotBuilderService } from '../snapshot/travel-context-snapshot-builder.service';
import { TravelContextRevisionHubService } from './travel-context-revision-hub.service';
import { TravelContextRevisionJournalService } from './travel-context-revision-journal.service';
import { TravelContextSnapshotArchiveService } from '../snapshot/travel-context-snapshot-archive.service';
import {
  computeTravelContextDiff,
  emptyTravelContextDiff,
  mergeTravelContextDiffs,
  type TravelContextDiff,
  type TravelContextRevisionEvent,
} from './travel-context-diff.util';

@Injectable()
export class TravelContextDiffService {
  constructor(
    private readonly builder: TravelContextSnapshotBuilderService,
    private readonly journal: TravelContextRevisionJournalService,
    private readonly hub: TravelContextRevisionHubService,
    private readonly archive: TravelContextSnapshotArchiveService,
  ) {}

  async getDiff(contextId: string, sinceRevision: number): Promise<TravelContextDiff> {
    if (!Number.isFinite(sinceRevision) || sinceRevision < 0) {
      throw new BadRequestException({
        code: 'INVALID_SINCE_REVISION',
        message: 'sinceRevision must be a non-negative number',
      });
    }

    const snapshot = await this.builder.build(contextId);
    const currentRevision = snapshot.meta.revision;

    if (sinceRevision >= currentRevision) {
      return emptyTravelContextDiff(contextId, currentRevision);
    }

    const chain = await this.journal.resolveChain(contextId, sinceRevision, currentRevision);
    if (chain === null) {
      return {
        contextId,
        fromRevision: sinceRevision,
        toRevision: currentRevision,
        changedDomains: [],
        changes: [],
        requiresFullRefresh: true,
      };
    }

    if (chain.length === 0) {
      return emptyTravelContextDiff(contextId, currentRevision);
    }

    return mergeTravelContextDiffs(contextId, chain);
  }

  async recordTransition(
    contextId: string,
    before: TravelContextSnapshot,
    after: TravelContextSnapshot,
    meta?: { intentType?: string },
  ): Promise<TravelContextDiff> {
    const diff = computeTravelContextDiff(contextId, before, after);
    if (diff.fromRevision !== diff.toRevision) {
      await this.journal.record(diff, {
        snapshotId: after.meta.snapshotId,
        intentType: meta?.intentType,
      });
      await this.archive.archive(after, {
        archiveSource: 'INTENT',
        intentType: meta?.intentType,
      });
      this.hub.publish(this.toRevisionEvent(diff, after));
    }
    return diff;
  }

  subscribe(contextId: string, listener: (event: TravelContextRevisionEvent) => void): () => void {
    return this.hub.subscribe(contextId, listener);
  }

  private toRevisionEvent(
    diff: TravelContextDiff,
    after: TravelContextSnapshot,
  ): TravelContextRevisionEvent {
    return {
      type: 'CONTEXT_REVISION_CHANGED',
      contextId: diff.contextId,
      revision: diff.toRevision,
      previousRevision: diff.fromRevision,
      changedDomains: diff.changedDomains,
      snapshotId: after.meta.snapshotId,
    };
  }
}
