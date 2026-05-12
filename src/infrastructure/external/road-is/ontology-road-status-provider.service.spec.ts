import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { OntologyRoadStatusProviderService } from './ontology-road-status-provider.service';
import { RoadIsProviderService } from './road-is-provider.service';

describe('OntologyRoadStatusProviderService', () => {
  it('聚合多条路段取最坏 accessState（mock road.is）', async () => {
    const roadIs = {
      fetchCondition: jest.fn().mockResolvedValue({
        condition: 'OPEN',
        accessState: 'OPEN',
        condition_text: 'ok',
        observed_at: '2026-01-01T00:00:00.000Z',
        synced_at: '2026-01-01T00:00:00.000Z',
        provider: 'mock',
      }),
    };
    const prisma = {
      isDbConnected: () => false,
      spatialDomainSegment: { findFirst: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [
        OntologyRoadStatusProviderService,
        { provide: PrismaService, useValue: prisma },
        { provide: RoadIsProviderService, useValue: roadIs },
      ],
    }).compile();
    const svc = mod.get(OntologyRoadStatusProviderService);
    const map = await svc.summarizeForOntologyNodeIds(['ontology:region:IS:SNAEFELLSNES']);
    const p = map.get('ontology:region:IS:SNAEFELLSNES');
    expect(p?.segments.length).toBe(3);
    expect(p?.aggregateAccessState).toBe('OPEN');
    expect(roadIs.fetchCondition).toHaveBeenCalled();
  });

  it('任一路段 CLOSED → aggregate IMPASSABLE', async () => {
    const roadIs = {
      fetchCondition: jest
        .fn()
        .mockResolvedValueOnce({
          condition: 'CLOSED',
          condition_text: 'closed',
          observed_at: '2026-01-01T00:00:00.000Z',
          synced_at: '2026-01-01T00:00:00.000Z',
          provider: 'mock',
        })
        .mockResolvedValue({
          condition: 'OPEN',
          observed_at: '2026-01-01T00:00:00.000Z',
          synced_at: '2026-01-01T00:00:00.000Z',
          provider: 'mock',
        }),
    };
    const prisma = { isDbConnected: () => false, spatialDomainSegment: { findFirst: jest.fn() } };
    const mod = await Test.createTestingModule({
      providers: [
        OntologyRoadStatusProviderService,
        { provide: PrismaService, useValue: prisma },
        { provide: RoadIsProviderService, useValue: roadIs },
      ],
    }).compile();
    const svc = mod.get(OntologyRoadStatusProviderService);
    const p = (await svc.summarizeForOntologyNodeIds(['ontology:region:IS:SNAEFELLSNES'])).get(
      'ontology:region:IS:SNAEFELLSNES',
    );
    expect(p?.aggregateAccessState).toBe('IMPASSABLE');
  });
});
