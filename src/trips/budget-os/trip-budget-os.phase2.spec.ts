import { MoneyDnaService } from './services/money-dna.service';
import { TripValueFeedbackService } from './services/trip-value-feedback.service';
import { deriveMoneyDnaFromFeedbacks } from './utils/value-score.util';

describe('Trip Budget OS Phase 2 (L4)', () => {
  const tripId = 'trip-l4';
  const userId = 'user-l4-uuid';

  let feedbackStore: Array<Record<string, unknown>>;

  const prisma = {
    trip: {
      findUnique: jest.fn(async () => ({ id: tripId })),
    },
    itineraryItem: {
      findFirst: jest.fn(async () => ({
        id: 'item-aurora',
        actualCost: 3000,
        estimatedCost: 3000,
        costCategory: 'ACTIVITIES',
        currency: 'CNY',
      })),
    },
    tripWalletLedgerEntry: {
      findFirst: jest.fn(async () => null),
    },
    tripValueFeedback: {
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = feedbackStore.find(
          (f) =>
            f.tripId === create.tripId &&
            f.sourceId === create.sourceId &&
            f.createdBy === create.createdBy,
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return { ...existing, id: existing.id ?? 'fb-1' };
        }
        const row = { id: `fb-${feedbackStore.length + 1}`, ...create, createdAt: new Date(), updatedAt: new Date() };
        feedbackStore.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: { where: { tripId?: string; createdBy?: string } }) => {
        return feedbackStore.filter((f) => {
          if (where.tripId && f.tripId !== where.tripId) return false;
          if (where.createdBy && f.createdBy !== where.createdBy) return false;
          return true;
        });
      }),
    },
    userMoneyDna: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
        return feedbackStore.length > 0
          ? {
              userId: where.userId,
              experienceSensitivity: 0.8,
              accommodationSensitivity: 0.4,
              efficiencySensitivity: 0.5,
              frugalityIndex: 0.5,
              dominantPersona: 'experience',
              tripCount: 1,
              confidence: 0.5,
              lastUpdatedAt: new Date(),
            }
          : null;
      }),
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        lastUpdatedAt: new Date(create.lastUpdatedAt as string),
      })),
    },
  };

  let valueFeedbackService: TripValueFeedbackService;
  let moneyDnaService: MoneyDnaService;

  beforeEach(() => {
    feedbackStore = [];
    jest.clearAllMocks();
    valueFeedbackService = new TripValueFeedbackService(prisma as never);
    moneyDnaService = new MoneyDnaService(prisma as never, valueFeedbackService);
  });

  it('scenario 8: satisfaction=5 on experience item scores higher than low satisfaction', async () => {
    prisma.itineraryItem.findFirst
      .mockResolvedValueOnce({
        id: 'item-aurora',
        actualCost: 3000,
        estimatedCost: 3000,
        costCategory: 'ACTIVITIES',
        currency: 'CNY',
      })
      .mockResolvedValueOnce({
        id: 'item-hotel',
        actualCost: 3000,
        estimatedCost: 3000,
        costCategory: 'ACCOMMODATION',
        currency: 'CNY',
      });

    await valueFeedbackService.submitFeedback(tripId, userId, {
      sourceType: 'itinerary_item',
      sourceId: 'item-aurora',
      satisfaction: 5,
      note: '极光超值',
    });
    await valueFeedbackService.submitFeedback(tripId, userId, {
      sourceType: 'itinerary_item',
      sourceId: 'item-hotel',
      satisfaction: 2,
      note: '酒店不值',
    });

    const summary = await valueFeedbackService.getValueSummary(tripId);
    expect(summary.byCategory.experience.valueScore).toBeGreaterThan(
      summary.byCategory.accommodation.valueScore,
    );
  });

  it('scenario 9: 3 trips feedback yields money dna confidence > 0.5', async () => {
    const rows = [
      { tripId: 't1', amount: 3000, category: 'experience', satisfaction: 5 },
      { tripId: 't2', amount: 2800, category: 'experience', satisfaction: 5 },
      { tripId: 't3', amount: 3200, category: 'experience', satisfaction: 4 },
    ];

    for (const r of rows) {
      feedbackStore.push({
        id: `fb-${r.tripId}`,
        tripId: r.tripId,
        sourceType: 'itinerary_item',
        sourceId: `item-${r.tripId}`,
        amount: r.amount,
        category: r.category,
        satisfaction: r.satisfaction,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const tripIds = ['t1', 't2', 't3'];
    const { profile } = deriveMoneyDnaFromFeedbacks(
      userId,
      feedbackStore.map((f) => ({
        tripId: f.tripId as string,
        sourceType: f.sourceType as string,
        sourceId: f.sourceId as string,
        amount: f.amount as number,
        category: f.category as string,
        satisfaction: f.satisfaction as number,
        createdBy: f.createdBy as string,
      })),
      tripIds,
    );

    expect(profile.tripCount).toBe(3);
    expect(profile.confidence).toBeGreaterThan(0.5);
  });
});
