import { Test, TestingModule } from '@nestjs/testing';
import type { WorldBusEvent } from '../draft-synthesis/autonomous-world';
import type { WorldEvent } from '../draft-synthesis/world-simulation/world-event.types';
import { WorldKernelService } from './world-kernel.service';
import { WorldBusService } from './world-bus.service';
import { WorldOrchestratorService } from './world-orchestrator.service';
import { WorldSimulationService } from './world-simulation.service';
import { CityDigitalTwinService } from './city-digital-twin.service';

describe('WorldKernelService', () => {
  let kernel: WorldKernelService;
  let emit: jest.Mock;
  let getGlobal: jest.Mock;
  let getTripState: jest.Mock;
  let applyEvent: jest.Mock;
  let getTwin: jest.Mock;
  let evaluateFlow: jest.Mock;
  let ingestAnalyze: jest.Mock;

  beforeEach(async () => {
    emit = jest.fn().mockReturnValue({ time: 1 });
    getGlobal = jest.fn().mockReturnValue({ activeTrips: ['t1'] });
    getTripState = jest.fn().mockReturnValue({ hazards: [] });
    applyEvent = jest.fn().mockReturnValue({ hazards: [{ id: 'x' }] });
    getTwin = jest.fn().mockReturnValue(undefined);
    evaluateFlow = jest.fn().mockReturnValue({ score: 0.5 });
    ingestAnalyze = jest.fn().mockReturnValue({ worldState: {}, impact: { affectedSlots: [] } });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldKernelService,
        { provide: WorldBusService, useValue: { emit } },
        { provide: WorldOrchestratorService, useValue: { getGlobalState: getGlobal } },
        {
          provide: WorldSimulationService,
          useValue: {
            getWorldState: getTripState,
            applyEvent,
            ingestEventAndAnalyze: ingestAnalyze,
          },
        },
        {
          provide: CityDigitalTwinService,
          useValue: {
            getTwin,
            evaluateFlow,
          },
        },
      ],
    }).compile();

    kernel = module.get(WorldKernelService);
  });

  it('updateBus delegates to WorldBusService.emit', () => {
    const ev: WorldBusEvent = {
      kind: 'SYSTEM',
      subType: 'ping',
      timestamp: 1,
      payload: {},
    };
    kernel.updateBus(ev);
    expect(emit).toHaveBeenCalledWith(ev);
  });

  it('simulateTrip delegates to WorldSimulationService.applyEvent', () => {
    const we: WorldEvent = { type: 'WEATHER_CHANGE', timestamp: 2, payload: {} };
    kernel.simulateTrip('trip-a', we);
    expect(applyEvent).toHaveBeenCalledWith('trip-a', we);
  });

  it('query paths delegate to underlying services', () => {
    kernel.queryGlobal();
    expect(getGlobal).toHaveBeenCalled();
    kernel.queryTrip('x');
    expect(getTripState).toHaveBeenCalledWith('x');
    kernel.queryTwin('TYO');
    expect(getTwin).toHaveBeenCalledWith('TYO');
    kernel.evaluateTwinFlow('TYO');
    expect(evaluateFlow).toHaveBeenCalledWith('TYO');
  });
});
