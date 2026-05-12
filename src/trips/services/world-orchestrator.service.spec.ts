import { Test, TestingModule } from '@nestjs/testing';
import type { WorldBusEvent } from '../draft-synthesis/autonomous-world';
import { CityDigitalTwinService } from './city-digital-twin.service';
import { WorldOrchestratorService } from './world-orchestrator.service';

describe('WorldOrchestratorService', () => {
  let orchestrator: WorldOrchestratorService;
  let ingestWorldBus: jest.Mock;

  beforeEach(async () => {
    ingestWorldBus = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldOrchestratorService,
        {
          provide: CityDigitalTwinService,
          useValue: { ingestWorldBus },
        },
      ],
    }).compile();

    orchestrator = module.get<WorldOrchestratorService>(WorldOrchestratorService);
  });

  it('fans out ingestWorldBusEvent to CityDigitalTwinService using trimmed cityKey', () => {
    const event: WorldBusEvent = {
      kind: 'WEATHER',
      subType: 'CLEAR',
      timestamp: 1,
      cityKey: '  Tokyo  ',
      payload: { tempC: 22 },
    };
    orchestrator.ingestWorldBusEvent(event);
    expect(ingestWorldBus).toHaveBeenCalledTimes(1);
    expect(ingestWorldBus).toHaveBeenCalledWith('Tokyo', event);
  });

  it('uses GLOBAL twin bucket when cityKey is absent', () => {
    const event: WorldBusEvent = {
      kind: 'CROWD',
      subType: 'BUSY',
      timestamp: 2,
      placeId: 99,
      payload: { level: 0.8 },
    };
    orchestrator.ingestWorldBusEvent(event);
    expect(ingestWorldBus).toHaveBeenCalledWith('GLOBAL', event);
  });

  it('does not throw when CityDigitalTwinService is omitted (Optional)', async () => {
    const bare = await Test.createTestingModule({
      providers: [WorldOrchestratorService],
    }).compile();
    const svc = bare.get<WorldOrchestratorService>(WorldOrchestratorService);
    expect(() =>
      svc.ingestWorldBusEvent({
        kind: 'SYSTEM',
        subType: 'ping',
        timestamp: 0,
        payload: {},
      }),
    ).not.toThrow();
  });
});
