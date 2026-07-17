import { ItineraryDayEditorPageContextBuilder } from './itinerary-day-editor-page-context.builder';
import type { ClientPageState } from '../contracts/page-insight.types';

describe('ItineraryDayEditorPageContextBuilder', () => {
  const tripId = 'trip_1';

  function client(partial: Partial<ClientPageState> = {}): ClientPageState {
    return {
      pageId: 'ITINERARY_DAY_EDITOR',
      pageMode: 'ITINERARY_DAY_EDITOR',
      insightScope: 'ITINERARY_DAY',
      lifecycle: 'PLANNING',
      selectedRefs: [{ entityType: 'DAY', entityId: '3' }],
      viewport: { selectedDayIndex: 3 },
      ...partial,
    };
  }

  it('CONTEXT_MISSING without selected day', async () => {
    const prisma = {
      tripDay: { findMany: jest.fn(async () => [{ id: 'd1', date: new Date() }]) },
      itineraryItem: { findMany: jest.fn(async () => []) },
    };
    const builder = new ItineraryDayEditorPageContextBuilder(prisma as never);
    const built = await builder.build(
      tripId,
      client({ selectedRefs: [], viewport: {} }),
    );
    expect(built.gate.ok).toBe(false);
    expect(built.gate.missing).toEqual(expect.arrayContaining(['selectedDay']));
  });

  it('READY day when feasibility has no issues and plan is complete', async () => {
    const prisma = {
      tripDay: {
        findMany: jest.fn(async () => [
          { id: 'd1', date: new Date() },
          { id: 'd2', date: new Date() },
          { id: 'd3', date: new Date() },
        ]),
      },
      itineraryItem: {
        findMany: jest.fn(async () => [
          {
            id: 'i1',
            type: 'ACTIVITY',
            startTime: new Date('2026-07-01T09:00:00Z'),
            endTime: new Date('2026-07-01T11:00:00Z'),
            note: null,
            bookingStatus: 'CONFIRMED',
            Place: { nameCN: '瀑布', nameEN: null },
          },
          {
            id: 'i2',
            type: 'ACTIVITY',
            startTime: new Date('2026-07-01T12:00:00Z'),
            endTime: new Date('2026-07-01T14:00:00Z'),
            note: null,
            bookingStatus: 'CONFIRMED',
            Place: { nameCN: '午餐点', nameEN: null },
          },
        ]),
      },
    };
    const feasibility = {
      validateScope: jest.fn(async () => ({
        summary: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0, blockers: 0 },
        issues: [],
      })),
    };
    const builder = new ItineraryDayEditorPageContextBuilder(
      prisma as never,
      undefined,
      feasibility as never,
    );
    const built = await builder.build(tripId, client());
    expect(built.gate.ok).toBe(true);
    expect(built.dayPlanStatus).toBe('READY');
    expect(built.daySeverity).toBe('CLEAR');
    expect(built.proposal).toBeUndefined();
  });

  it('INCOMPLETE when only lodging', async () => {
    const prisma = {
      tripDay: {
        findMany: jest.fn(async () => [
          { id: 'd1', date: new Date() },
          { id: 'd2', date: new Date() },
          { id: 'd3', date: new Date() },
          { id: 'd4', date: new Date() },
        ]),
      },
      itineraryItem: {
        findMany: jest.fn(async () => [
          {
            id: 'h1',
            type: 'ACCOMMODATION',
            startTime: new Date('2026-07-01T20:00:00Z'),
            endTime: new Date('2026-07-02T08:00:00Z'),
            note: null,
            bookingStatus: 'NEED_BOOKING',
            Place: { nameCN: '维克旅馆', nameEN: null },
          },
        ]),
      },
    };
    const feasibility = {
      validateScope: jest.fn(async () => ({
        summary: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0, blockers: 0 },
        issues: [],
      })),
    };
    const builder = new ItineraryDayEditorPageContextBuilder(
      prisma as never,
      undefined,
      feasibility as never,
    );
    const built = await builder.build(
      tripId,
      client({
        selectedRefs: [{ entityType: 'DAY', entityId: '4' }],
        viewport: { selectedDayIndex: 4 },
      }),
    );
    expect(built.dayPlanStatus).toBe('INCOMPLETE');
    expect(built.proposal).toBeUndefined();
  });

  it('TIGHT soft conflict triggers repair proposal', async () => {
    const prisma = {
      tripDay: {
        findMany: jest.fn(async () => [
          { id: 'd1', date: new Date() },
          { id: 'd2', date: new Date() },
          { id: 'd3', date: new Date() },
        ]),
      },
      itineraryItem: {
        findMany: jest.fn(async () => [
          {
            id: 'i1',
            type: 'ACTIVITY',
            startTime: new Date('2026-07-01T09:00:00Z'),
            endTime: new Date('2026-07-01T12:30:00Z'),
            note: null,
            bookingStatus: 'CONFIRMED',
            Place: { nameCN: '瀑布', nameEN: null },
          },
          {
            id: 'i2',
            type: 'MEAL',
            startTime: new Date('2026-07-01T12:00:00Z'),
            endTime: new Date('2026-07-01T13:00:00Z'),
            note: null,
            bookingStatus: null,
            Place: { nameCN: '午餐', nameEN: null },
          },
        ]),
      },
    };
    const feasibility = {
      validateScope: jest.fn(async () => ({
        summary: { mustHandle: 0, suggestAdjust: 1, pendingConfirm: 0, blockers: 0 },
        issues: [
          {
            id: 'iss_lunch',
            priority: 'suggest_adjust',
            message: '午餐时间被占用，缓冲过紧',
            affectedDays: [3],
          },
        ],
      })),
    };
    const proposalBuilder = {
      buildAiActionProposal: jest.fn(async () => ({
        proposalId: 'prop_day',
        validation: { status: 'WARN', warnings: ['需调序'], conflicts: [] },
        diff: { timelineChanges: [], summary: 'ok' },
        tradeoffs: ['调整顺序影响最小'],
      })),
      buildCreateGapProposal: jest.fn(),
    };
    const builder = new ItineraryDayEditorPageContextBuilder(
      prisma as never,
      proposalBuilder as never,
      feasibility as never,
    );
    const built = await builder.build(tripId, client());
    expect(built.dayPlanStatus).toBe('TIGHT');
    expect(built.daySeverity).toBe('SOFT');
    expect(proposalBuilder.buildAiActionProposal).toHaveBeenCalled();
    expect(built.proposal?.proposalId).toBe('prop_day');
  });

  it('demotes system-maintenance feasibility as primary status', async () => {
    const prisma = {
      tripDay: {
        findMany: jest.fn(async () => [
          { id: 'd1', date: new Date() },
          { id: 'd2', date: new Date() },
          { id: 'd3', date: new Date() },
        ]),
      },
      itineraryItem: {
        findMany: jest.fn(async () => [
          {
            id: 'i1',
            type: 'ACTIVITY',
            startTime: new Date('2026-07-01T13:30:00Z'),
            endTime: new Date('2026-07-01T15:30:00Z'),
            note: null,
            bookingStatus: 'CONFIRMED',
            Place: { nameCN: '盖歇尔间歇泉', nameEN: null },
          },
          {
            id: 'i2',
            type: 'ACTIVITY',
            startTime: new Date('2026-07-01T15:44:00Z'),
            endTime: new Date('2026-07-01T17:14:00Z'),
            note: null,
            bookingStatus: 'CONFIRMED',
            Place: { nameCN: '黄金瀑布', nameEN: null },
          },
          {
            id: 'h1',
            type: 'ACCOMMODATION',
            startTime: new Date('2026-07-01T20:00:00Z'),
            endTime: new Date('2026-07-02T08:00:00Z'),
            note: null,
            bookingStatus: 'NEED_BOOKING',
            Place: { nameCN: '塞尔福斯宾馆', nameEN: null },
          },
        ]),
      },
    };
    const feasibility = {
      validateScope: jest.fn(async () => ({
        summary: { mustHandle: 0, suggestAdjust: 1, pendingConfirm: 0, blockers: 0 },
        issues: [
          {
            id: 'stale',
            priority: 'suggest_adjust',
            message: '辛格维利尔国家公园的规则已超14天未核验，可能影响入场。',
            affectedDays: [3],
          },
        ],
      })),
    };
    const builder = new ItineraryDayEditorPageContextBuilder(
      prisma as never,
      undefined,
      feasibility as never,
    );
    const built = await builder.build(tripId, client());
    expect(built.dayPlanStatus).toBe('OPTIMIZABLE');
    expect(built.pendingBookingLabels).toContain('塞尔福斯宾馆');
    expect(built.topIssue?.systemMaintenance).toBe(true);
  });
});
