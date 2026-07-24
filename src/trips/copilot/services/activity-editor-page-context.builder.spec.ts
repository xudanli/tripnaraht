import { ActivityEditorPageContextBuilder } from './activity-editor-page-context.builder';
import type { ClientPageState } from '../contracts/page-insight.types';

describe('ActivityEditorPageContextBuilder', () => {
  const tripId = 'trip_1';

  function client(partial: Partial<ClientPageState> = {}): ClientPageState {
    return {
      pageId: 'ACTIVITY_EDITOR',
      pageMode: 'ACTIVITY_EDITOR',
      insightScope: 'ACTIVITY',
      lifecycle: 'PLANNING',
      selectedRefs: [
        { entityType: 'POI', entityId: '42' },
        { entityType: 'DAY', entityId: '3' },
      ],
      viewport: { selectedDayIndex: 3 },
      ...partial,
    };
  }

  it('returns CONTEXT_MISSING when activity or day missing', async () => {
    const prisma = {
      tripDay: { findMany: jest.fn(async () => [{ id: 'd1', date: new Date() }]) },
      place: { findUnique: jest.fn() },
      itineraryItem: { findMany: jest.fn(async () => []) },
    };
    const builder = new ActivityEditorPageContextBuilder(prisma as never);
    const built = await builder.build(
      tripId,
      client({ selectedRefs: [], viewport: {} }),
    );
    expect(built.gate.ok).toBe(false);
    expect(built.gate.missing).toEqual(
      expect.arrayContaining(['activity', 'targetDay']),
    );
  });

  it('returns CONTEXT_MISSING when pageMode/insightScope wrong', async () => {
    const prisma = {
      tripDay: { findMany: jest.fn(async () => [{ id: 'd1', date: new Date() }]) },
      place: {
        findUnique: jest.fn(async () => ({ nameCN: '黑沙滩', nameEN: null })),
      },
      itineraryItem: { findMany: jest.fn(async () => []) },
    };
    const builder = new ActivityEditorPageContextBuilder(prisma as never);
    const built = await builder.build(
      tripId,
      client({ pageMode: undefined, insightScope: undefined }),
    );
    expect(built.gate.missing).toEqual(
      expect.arrayContaining(['pageMode', 'insightScope']),
    );
  });

  it('calls proposal builder when refs complete', async () => {
    const prisma = {
      tripDay: {
        findMany: jest.fn(async () => [
          { id: 'd1', date: new Date() },
          { id: 'd2', date: new Date() },
          { id: 'd3', date: new Date() },
        ]),
      },
      place: {
        findUnique: jest.fn(async () => ({ nameCN: '黑沙滩', nameEN: null })),
      },
      itineraryItem: { findMany: jest.fn(async () => []) },
    };
    const proposalBuilder = {
      buildCreateItemProposal: jest.fn(async () => ({
        proposalId: 'prop_abc',
        validation: { status: 'PASS', warnings: [], conflicts: [] },
        diff: { timelineChanges: [], summary: 'ok' },
        tradeoffs: [],
      })),
    };
    const builder = new ActivityEditorPageContextBuilder(
      prisma as never,
      proposalBuilder as never,
    );
    const built = await builder.build(tripId, client());
    expect(built.gate.ok).toBe(true);
    expect(proposalBuilder.buildCreateItemProposal).toHaveBeenCalled();
    expect(built.proposal?.proposalId).toBe('prop_abc');
    expect(built.placeName).toBe('黑沙滩');
    expect(built.dayIndex).toBe(3);
  });
});
