/**
 * WorldModelCollectorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WorldModelCollectorService } from './world-model-collector.service';

describe('WorldModelCollectorService', () => {
  let service: WorldModelCollectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorldModelCollectorService],
    }).compile();
    service = module.get<WorldModelCollectorService>(WorldModelCollectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 Agent 时应立即完成且不修改 researchData', async () => {
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    await service.collect(
      { destination: 'Iceland', date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } },
      researchData,
      evidenceRefs,
    );
    expect(Object.keys(researchData)).toHaveLength(0);
    expect(evidenceRefs).toHaveLength(0);
  });

  it('字符串 destination 无 Geo/Weather 时应跳过（需 CostAgent 才可能执行）', async () => {
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    await service.collect(
      { destination: 'Iceland', date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } },
      researchData,
      evidenceRefs,
    );
    expect(researchData.geo_terrain).toBeUndefined();
    expect(researchData.weather_forecast).toBeUndefined();
  });
});
