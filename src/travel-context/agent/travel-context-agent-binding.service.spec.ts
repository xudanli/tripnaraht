import { BadRequestException } from '@nestjs/common';
import { buildIcelandPlanningContextFixture } from '../../harness/evals/fixtures/contexts/iceland-planning.fixture';
import { TravelContextAgentBindingService } from './travel-context-agent-binding.service';
import type { TravelContextResolverService } from '../snapshot/travel-context-resolver.service';
import type { TravelContextSnapshotBuilderService } from '../snapshot/travel-context-snapshot-builder.service';

describe('TravelContextAgentBindingService', () => {
  const snapshot = buildIcelandPlanningContextFixture();
  let resolver: jest.Mocked<Pick<TravelContextResolverService, 'resolveByTripId' | 'resolve'>>;
  let builder: jest.Mocked<Pick<TravelContextSnapshotBuilderService, 'build'>>;
  let service: TravelContextAgentBindingService;

  beforeEach(() => {
    resolver = {
      resolveByTripId: jest.fn(),
      resolve: jest.fn(),
    };
    builder = { build: jest.fn() };
    service = new TravelContextAgentBindingService(
      resolver as unknown as TravelContextResolverService,
      builder as unknown as TravelContextSnapshotBuilderService,
    );
  });

  it('binds ABU with world + contract domains from contextId', async () => {
    builder.build.mockResolvedValue(snapshot);
    resolver.resolve.mockResolvedValue({
      contextId: snapshot.identity.contextId,
      ownerUserId: 'user-1',
      source: 'exploration',
    });

    const result = await service.bind({
      contextId: snapshot.identity.contextId,
      userId: 'user-1',
      agent: 'ABU',
      revision: snapshot.meta.revision,
    });

    expect(result).not.toBeNull();
    expect(result!.grounding.contextId).toBe(snapshot.identity.contextId);
    expect(result!.grounding.snapshotId).toBe(snapshot.meta.snapshotId);
    expect(result!.grounding.revision).toBe(snapshot.meta.revision);
    expect(result!.grounding.includedDomains).toContain('world');
    expect(result!.block.type).toBe('TRAVEL_CONTEXT');
  });

  it('resolves contextId from tripId', async () => {
    builder.build.mockResolvedValue(snapshot);
    resolver.resolveByTripId.mockResolvedValue({
      contextId: snapshot.identity.contextId,
      tripId: 'trip-1',
      ownerUserId: 'user-1',
      source: 'trip_metadata',
    });

    const result = await service.bind({
      tripId: 'trip-1',
      agent: 'PLANNER',
    });

    expect(result!.grounding.contextId).toBe(snapshot.identity.contextId);
    expect(builder.build).toHaveBeenCalledWith(snapshot.identity.contextId);
  });

  it('rejects stale revision', async () => {
    builder.build.mockResolvedValue(snapshot);

    await expect(
      service.bind({
        contextId: snapshot.identity.contextId,
        agent: 'ABU',
        revision: snapshot.meta.revision - 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns null when neither contextId nor tripId provided', async () => {
    const result = await service.bind({ agent: 'ABU' });
    expect(result).toBeNull();
  });
});
