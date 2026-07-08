import type { TravelContextDiff } from './travel-context-diff.util';
import { TravelContextRevisionJournalService } from './travel-context-revision-journal.service';

describe('TravelContextRevisionJournalService', () => {
  const diff: TravelContextDiff = {
    contextId: 'ctx-journal-test',
    fromRevision: 100,
    toRevision: 200,
    changedDomains: ['plan'],
    changes: [{ path: 'plan.selectedRouteId', operation: 'UPDATE', domain: 'plan' }],
  };

  it('records and resolves chain in memory when prisma is absent', async () => {
    const journal = new TravelContextRevisionJournalService();
    await journal.record(diff);

    const chain = await journal.resolveChain('ctx-journal-test', 100, 200);
    expect(chain).toHaveLength(1);
    expect(chain![0].toRevision).toBe(200);
  });

  it('returns null when journal gap exists', async () => {
    const journal = new TravelContextRevisionJournalService();
    await journal.record(diff);

    const chain = await journal.resolveChain('ctx-journal-test', 100, 300);
    expect(chain).toBeNull();
  });

  it('dedupes identical from/to revision in memory', async () => {
    const journal = new TravelContextRevisionJournalService();
    await journal.record(diff);
    await journal.record(diff);

    const chain = await journal.resolveChain('ctx-journal-test', 100, 200);
    expect(chain).toHaveLength(1);
  });
});
