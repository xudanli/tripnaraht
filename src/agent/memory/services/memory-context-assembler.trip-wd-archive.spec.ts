import { Test, TestingModule } from '@nestjs/testing';
import { MemoryContextAssemblerService } from './memory-context-assembler.service';
import { MemoryService } from './memory.service';
import { WORLD_DECISION_MEMORY_ARCHIVE } from '../decision-memory/world-decision-memory-archive.port';
import { buildDecisionMemory } from '../decision-memory/decision-memory.types';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';

describe('MemoryContextAssemblerService (trip WDMA archive)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        MemoryContextAssemblerService,
        {
          provide: MemoryService,
          useValue: {
            getUserTravelProfile: jest.fn().mockResolvedValue(null),
            getUserRouteDirectionDecisions: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: WORLD_DECISION_MEMORY_ARCHIVE,
          useValue: {
            isEnabled: () => true,
            persist: jest.fn(),
            listRecentForTrip: jest.fn().mockResolvedValue([
              buildDecisionMemory({
                decisionType: 'vehicle',
                inputs: { x: 1 },
                outputs: {},
                outcome: 'rejected',
                rationale: ['F-road'],
                causedBy: ['strat:STRAT_ICE_002'],
              }),
            ]),
          },
        },
      ],
    }).compile();
  });

  it('loadForRouteAndRun fills recentWorldDecisions when trip_id set and archive enabled', async () => {
    const asm = moduleRef.get(MemoryContextAssemblerService);
    const archive = moduleRef.get(WORLD_DECISION_MEMORY_ARCHIVE);
    const req = {
      request_id: 'req-wd-arch',
      trip_id: 'trip-wd-arch-1',
    } as RouteAndRunRequestDto;
    const ctx = await asm.loadForRouteAndRun(req);
    expect(ctx.recentWorldDecisions).toHaveLength(1);
    expect(ctx.recentWorldDecisions[0].causedBy).toContain('strat:STRAT_ICE_002');
    expect(archive.listRecentForTrip).toHaveBeenCalledWith('trip-wd-arch-1', 32);
    expect(ctx.observability.layers).toContain('trip_world_decision_archive');
    expect(ctx.decisionLedger).not.toBeNull();
    expect(ctx.decisionLedger?.revision).toBe('v1');
    expect(ctx.decisionLedger?.worldSlices?.length).toBeGreaterThanOrEqual(3);
    expect(ctx.decisionLedger?.anchors.worldLayered.coarseDigest.length).toBeGreaterThan(0);
    expect(ctx.ledgerRecomputePlan).not.toBeNull();
    expect(ctx.ledgerRecomputePlan?.revision).toBe('v1');
  });
});
