import { resolveItineraryAdjustNeighborContextForHost } from './itinerary-adjust-neighbor-corridor.runner';
import type { ItineraryAdjustNeighborCorridorHost } from './itinerary-adjust-neighbor-corridor.host';

describe('itinerary-adjust-neighbor-corridor.runner', () => {
  it('returns null without prisma', async () => {
    const host: ItineraryAdjustNeighborCorridorHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    };
    await expect(
      resolveItineraryAdjustNeighborContextForHost(host, 't1', '2026-07-01'),
    ).resolves.toBeNull();
  });
});
