import { buildIcelandPlanningContextFixture } from '../../harness/evals/fixtures/contexts/iceland-planning.fixture';
import {
  TravelContextSnapshotArchiveService,
  bindingsFingerprint,
} from './travel-context-snapshot-archive.service';

describe('TravelContextSnapshotArchiveService', () => {
  it('archives and loads snapshot from memory', async () => {
    const archive = new TravelContextSnapshotArchiveService();
    const snapshot = buildIcelandPlanningContextFixture();

    await archive.archive(snapshot, { archiveSource: 'ASSEMBLE' });

    const loaded = await archive.getByRevision(
      snapshot.identity.contextId,
      snapshot.meta.revision,
    );
    expect(loaded?.meta.snapshotId).toBe(snapshot.meta.snapshotId);
  });

  it('tryLoadCached respects TRAVEL_CONTEXT_SNAPSHOT_ARCHIVE_READ=0', async () => {
    const prev = process.env.TRAVEL_CONTEXT_SNAPSHOT_ARCHIVE_READ;
    process.env.TRAVEL_CONTEXT_SNAPSHOT_ARCHIVE_READ = '0';

    const archive = new TravelContextSnapshotArchiveService();
    const snapshot = buildIcelandPlanningContextFixture();
    await archive.archive(snapshot, { archiveSource: 'INTENT' });

    const cached = await archive.tryLoadCached(
      snapshot.identity.contextId,
      snapshot.meta.revision,
    );
    expect(cached).toBeNull();

    process.env.TRAVEL_CONTEXT_SNAPSHOT_ARCHIVE_READ = prev;
  });

  it('bindingsFingerprint is stable for same bindings', () => {
    const snapshot = buildIcelandPlanningContextFixture();
    expect(bindingsFingerprint(snapshot)).toBe(bindingsFingerprint(snapshot));
  });
});
