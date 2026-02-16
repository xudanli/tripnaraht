// src/agent/context-engine/services/dynamic-context-selector.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { DynamicContextSelectorService } from './dynamic-context-selector.service';

describe('DynamicContextSelectorService', () => {
  let service: DynamicContextSelectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DynamicContextSelectorService],
    }).compile();

    service = module.get<DynamicContextSelectorService>(DynamicContextSelectorService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('select', () => {
    it('冰岛自驾安全吗 -> 应包含 SAFETY, ROAD_RULES, WEATHER_WINDOWS', () => {
      const result = service.select('冰岛自驾安全吗？', 'planning');
      expect(result.requiredTopics).toContain('SAFETY');
      expect(result.requiredTopics).toContain('ROAD_RULES');
      expect(result.requiredTopics).toContain('WEATHER_WINDOWS');
      expect(result.excludeBlockTypes).toContain('PLAN_DAY');
      expect(result.excludeBlockTypes).toContain('COUNTRY_BOOKING');
    });

    it('签证要求 -> 应包含 VISA，排除 PLAN_DAY', () => {
      const result = service.select('冰岛签证要求是什么', 'planning');
      expect(result.requiredTopics).toContain('VISA');
      expect(result.excludeBlockTypes).toContain('PLAN_DAY');
    });

    it('无匹配 query -> 应返回 phase 默认主题', () => {
      const result = service.select('随便问问', 'planning');
      expect(result.requiredTopics.length).toBeGreaterThan(0);
      expect(result.requiredTopics).toContain('VISA');
      expect(result.requiredTopics).toContain('SAFETY');
    });
  });
});
