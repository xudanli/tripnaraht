/**
 * TeamBus：Executor publish + Member 订阅 + Scoped Patch / 串行缝合。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ResearchPipelineService } from '../teams/research/research-pipeline.service';
import { WorldModelCollectorService } from './shared/world-model-collector.service';
import { PredictionCollectorService } from './shared/prediction-collector.service';
import { ContextHydrationService } from './shared/context-hydration.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { ResearchMemberRegistry } from '../teams/research/research-member.registry';
import { TransportResearchMember } from '../teams/research/transport-research.member';
import { ComplianceResearchMember } from '../teams/research/compliance-research.member';
import { DestinationResearchMember } from '../teams/research/destination-research.member';
import { HotelResearchMember } from '../teams/research/hotel-research.member';
import { FlightResearchMember } from '../teams/research/flight-research.member';
import { ResearchTeamBusService } from '../teams/research/research-team-bus.service';

describe('ResearchPipelineService runTopologyPlanOnWorkspace (TeamBus parallel)', () => {
  let moduleRef: TestingModule;
  let service: ResearchPipelineService;
  let mockWorldModel: { collect: jest.Mock };
  let mockPrediction: { collect: jest.Mock };
  let mockSkillsRegistry: { getSkill: jest.Mock };

  beforeEach(async () => {
    mockWorldModel = { collect: jest.fn().mockResolvedValue(undefined) };
    mockPrediction = { collect: jest.fn().mockResolvedValue(undefined) };
    mockSkillsRegistry = { getSkill: jest.fn().mockReturnValue(null) };
    moduleRef = await Test.createTestingModule({
      providers: [
        ResearchTeamBusService,
        ResearchPipelineService,
        ContextHydrationService,
        DestinationResearchMember,
        HotelResearchMember,
        FlightResearchMember,
        TransportResearchMember,
        ComplianceResearchMember,
        ResearchMemberRegistry,
        { provide: WorldModelCollectorService, useValue: mockWorldModel },
        { provide: PredictionCollectorService, useValue: mockPrediction },
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
      ],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(ResearchPipelineService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('runs parallel hotel via TeamBus and records parallel merge', async () => {
    const ws = {
      researchData: { prior: 1 },
      evidenceRefs: ['e0'],
      effectiveTrip: { destination: 'Reykjavik' },
      effectiveMode: 'scoped_partial' as const,
      scopesForTopology: ['hotel'] as const,
    };
    const ctx = {
      requestId: 'bus-topo-1',
      tripPlanRequest: ws.effectiveTrip,
    } as any;
    const dso = { requestId: 'd-bus-1' } as any;
    const plan = { parallel: [{ id: 'HotelResearchMember', kind: 'hotel' as const }], sequential: [] };
    await service.runTopologyPlanOnWorkspace(dso, ctx, ws as any, plan);
    const log = ws.researchContextMergeLog ?? [];
    expect(log.some((m) => m.source === 'HotelResearchMember' && m.phase === 'parallel')).toBe(true);
  });

  it('runs sequential transport via TeamBus and records sequential merge', async () => {
    mockSkillsRegistry.getSkill.mockImplementation((name: string) => {
      if (name === 'transport.search') {
        return { execute: jest.fn().mockResolvedValue({ options: [], evidence_id: 't-ev-seq' }) };
      }
      return null;
    });
    const ws = {
      researchData: {},
      evidenceRefs: [] as string[],
      effectiveTrip: {
        destination: 'Reykjavik',
        origin: 'Keflavik',
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
      },
      effectiveMode: 'scoped_partial' as const,
      scopesForTopology: ['transport'] as const,
    };
    const ctx = {
      requestId: 'bus-seq-1',
      tripPlanRequest: ws.effectiveTrip,
    } as any;
    const dso = { requestId: 'd-seq' } as any;
    const plan = {
      parallel: [] as const,
      sequential: [{ id: 'TransportResearchMember', kind: 'transport' as const }],
    };
    await service.runTopologyPlanOnWorkspace(dso, ctx, ws as any, plan);
    const log = ws.researchContextMergeLog ?? [];
    expect(log.some((m) => m.source === 'TransportResearchMember' && m.phase === 'sequential')).toBe(true);
  });
});
