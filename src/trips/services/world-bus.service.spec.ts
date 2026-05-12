import { Test, TestingModule } from '@nestjs/testing';
import type { WorldBusEvent } from '../draft-synthesis/autonomous-world';
import { WorldOrchestratorService } from './world-orchestrator.service';
import { WorldBusService } from './world-bus.service';

describe('WorldBusService', () => {
  let bus: WorldBusService;
  let ingest: jest.Mock;

  beforeEach(async () => {
    ingest = jest.fn().mockReturnValue({ time: 1, activeTrips: [], cities: {}, poiNetwork: {}, transportGraph: { edges: [], congestionMap: {} } });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldBusService,
        {
          provide: WorldOrchestratorService,
          useValue: { ingestWorldBusEvent: ingest },
        },
      ],
    }).compile();

    bus = module.get(WorldBusService);
  });

  it('emit delegates to WorldOrchestratorService.ingestWorldBusEvent', () => {
    const ev: WorldBusEvent = {
      kind: 'SYSTEM',
      subType: 'ping',
      timestamp: 3,
      payload: {},
    };
    bus.emit(ev);
    expect(ingest).toHaveBeenCalledWith(ev);
  });
});
