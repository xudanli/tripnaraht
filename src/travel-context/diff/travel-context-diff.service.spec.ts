import { buildIcelandPlanningContextFixture } from '../../harness/evals/fixtures/contexts/iceland-planning.fixture';
import { simulateIntentTransition } from '../../harness/evals/intents/intent-transition.util';
import { TravelContextDiffService } from './travel-context-diff.service';
import { TravelContextRevisionHubService } from './travel-context-revision-hub.service';
import { TravelContextRevisionJournalService } from './travel-context-revision-journal.service';
import { TravelContextSnapshotArchiveService } from '../snapshot/travel-context-snapshot-archive.service';
import type { TravelContextSnapshotBuilderService } from '../snapshot/travel-context-snapshot-builder.service';

describe('TravelContextDiffService', () => {
  const before = buildIcelandPlanningContextFixture();
  let builder: jest.Mocked<Pick<TravelContextSnapshotBuilderService, 'build'>>;
  let journal: TravelContextRevisionJournalService;
  let hub: TravelContextRevisionHubService;
  let service: TravelContextDiffService;

  beforeEach(() => {
    builder = { build: jest.fn() };
    journal = new TravelContextRevisionJournalService();
    hub = new TravelContextRevisionHubService();
    service = new TravelContextDiffService(
      builder as unknown as TravelContextSnapshotBuilderService,
      journal,
      hub,
      new TravelContextSnapshotArchiveService(),
    );
  });

  it('getDiff returns empty when sinceRevision equals current', async () => {
    builder.build.mockResolvedValue(before);
    const diff = await service.getDiff(before.identity.contextId, before.meta.revision);
    expect(diff.changes).toHaveLength(0);
    expect(diff.toRevision).toBe(before.meta.revision);
  });

  it('recordTransition + getDiff returns journal chain', async () => {
    const transition = simulateIntentTransition({
      snapshot: before,
      intent: {
        type: 'SELECT_ROUTE',
        basedOnRevision: before.meta.revision,
        payload: { routeId: 'route_journal' },
      },
      runtimeAuthority: 'CANONICAL',
      authorityRunId: 'journal-1',
    });

    await service.recordTransition(
      before.identity.contextId,
      before,
      transition.outputSnapshot,
    );
    builder.build.mockResolvedValue(transition.outputSnapshot);

    const diff = await service.getDiff(
      before.identity.contextId,
      before.meta.revision,
    );

    expect(diff.requiresFullRefresh).toBeUndefined();
    expect(diff.toRevision).toBe(transition.outputSnapshot.meta.revision);
    expect(diff.changedDomains).toContain('plan');
  });

  it('getDiff sets requiresFullRefresh when journal gap', async () => {
    const after = buildIcelandPlanningContextFixture();
    after.meta.revision = before.meta.revision + 5;
    builder.build.mockResolvedValue(after);

    const diff = await service.getDiff(before.identity.contextId, before.meta.revision);
    expect(diff.requiresFullRefresh).toBe(true);
    expect(diff.toRevision).toBe(after.meta.revision);
  });

  it('subscribe receives CONTEXT_REVISION_CHANGED on recordTransition', async () => {
    const transition = simulateIntentTransition({
      snapshot: before,
      intent: {
        type: 'SELECT_ROUTE',
        basedOnRevision: before.meta.revision,
        payload: { routeId: 'route_sse' },
      },
      runtimeAuthority: 'CANONICAL',
      authorityRunId: 'sse-1',
    });

    const events: unknown[] = [];
    service.subscribe(before.identity.contextId, (e) => events.push(e));

    await service.recordTransition(
      before.identity.contextId,
      before,
      transition.outputSnapshot,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'CONTEXT_REVISION_CHANGED',
      revision: transition.outputSnapshot.meta.revision,
    });
  });
});
