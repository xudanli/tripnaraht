/**
 * PredictionCollectorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PredictionCollectorService } from './prediction-collector.service';

describe('PredictionCollectorService', () => {
  let service: PredictionCollectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PredictionCollectorService],
    }).compile();
    service = module.get<PredictionCollectorService>(PredictionCollectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无预测服务时应立即完成且不写入 weather_risk', async () => {
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    await service.collect(
      { date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } },
      researchData,
      evidenceRefs,
    );
    expect(researchData.weather_predictions).toBeUndefined();
    expect(researchData.failure_risk_prediction).toBeUndefined();
    expect(evidenceRefs).toHaveLength(0);
  });

  it('空 researchData 时 aggregateWeatherRisk 不写入', async () => {
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    await service.collect({}, researchData, evidenceRefs);
    expect(researchData.weather_risk).toBeUndefined();
  });
});
