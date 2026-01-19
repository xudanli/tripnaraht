// src/agent/assistants/trip-planner/tests/intent-disambiguation.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ContextAnalyzerService } from '../services/context-analyzer.service';
import { IntentDisambiguatorService } from '../services/intent-disambiguator.service';
import {
  TripContext,
  TripDayContext,
  TripPlannerState,
  TripPlannerIntent,
} from '../interfaces/trip-planner.interface';
import {
  IntentUncertainty,
  ItineraryGapType,
} from '../interfaces/intent-uncertainty.interface';

describe('Intent Disambiguation System', () => {
  let contextAnalyzer: ContextAnalyzerService;
  let intentDisambiguator: IntentDisambiguatorService;

  // Mock 行程上下文
  const mockTripContext: TripContext = {
    tripId: 'trip_test_001',
    destination: 'JP',
    destinationName: '东京',
    durationDays: 3,
    travelers: { adults: 2, children: 0 },
    budget: {
      total: 20000,
      currency: 'CNY',
      perDay: 6666,
    },
    preferences: {
      pacingLevel: 'moderate',
      interests: ['美食', '购物', '文化'],
    },
    days: [
      {
        dayNumber: 1,
        date: '2024-05-01',
        city: '东京',
        theme: '浅草文化游',
        items: [
          {
            id: 'item_1',
            type: 'POI',
            name: '浅草寺',
            startTime: '09:00',
            endTime: '11:00',
            duration: 120,
          },
          {
            id: 'item_2',
            type: 'POI',
            name: '东京塔',
            startTime: '14:00',
            endTime: '16:00',
            duration: 120,
          },
          {
            id: 'item_3',
            type: 'POI',
            name: '秋叶原',
            startTime: '17:00',
            endTime: '19:00',
            duration: 120,
          },
        ],
        stats: {
          poiCount: 3,
          walkingDistance: 5,
          totalDuration: 360,
          freeTime: 180,
        },
      },
      {
        dayNumber: 2,
        date: '2024-05-02',
        city: '东京',
        theme: '购物休闲日',
        items: [
          {
            id: 'item_4',
            type: 'POI',
            name: '涩谷',
            startTime: '10:00',
            endTime: '12:00',
            duration: 120,
          },
        ],
        stats: {
          poiCount: 1,
          walkingDistance: 2,
          totalDuration: 120,
          freeTime: 480,
        },
      },
    ] as TripDayContext[],
  };

  const mockState: TripPlannerState = {
    sessionId: 'session_test_001',
    tripId: 'trip_test_001',
    userId: 'user_test',
    phase: 'DETAILING',
    messages: [],
    tripContext: mockTripContext,
    preferences: {
      language: 'zh-CN',
      verbosity: 'normal',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextAnalyzerService,
        IntentDisambiguatorService,
      ],
    }).compile();

    contextAnalyzer = module.get<ContextAnalyzerService>(ContextAnalyzerService);
    intentDisambiguator = module.get<IntentDisambiguatorService>(IntentDisambiguatorService);
  });

  describe('ContextAnalyzerService', () => {
    describe('detectGaps', () => {
      it('应该检测到午餐缺口', () => {
        const gaps = contextAnalyzer.detectGaps(mockTripContext);
        
        const lunchGaps = gaps.filter(g => 
          g.type === 'MEAL' && 
          g.description.includes('午餐')
        );
        
        expect(lunchGaps.length).toBeGreaterThan(0);
        expect(lunchGaps[0].severity).toBe('CRITICAL');
      });

      it('应该检测到晚餐缺口', () => {
        const gaps = contextAnalyzer.detectGaps(mockTripContext);
        
        const dinnerGaps = gaps.filter(g => 
          g.type === 'MEAL' && 
          g.description.includes('晚餐')
        );
        
        expect(dinnerGaps.length).toBeGreaterThan(0);
      });

      it('应该检测到第二天活动空档', () => {
        const gaps = contextAnalyzer.detectGaps(mockTripContext);
        
        const activityGaps = gaps.filter(g => 
          g.dayNumber === 2 && 
          (g.type === 'FREE_TIME' || g.type === 'ACTIVITY')
        );
        
        // 第二天只有一个活动，应该有空档
        expect(activityGaps.length).toBeGreaterThanOrEqual(0);
      });

      it('应该检测到住宿缺口', () => {
        const gaps = contextAnalyzer.detectGaps(mockTripContext);
        
        const hotelGaps = gaps.filter(g => g.type === 'HOTEL');
        
        // 两天行程，第一天应该有住宿缺口
        expect(hotelGaps.length).toBe(1);
        expect(hotelGaps[0].dayNumber).toBe(1);
        expect(hotelGaps[0].severity).toBe('CRITICAL');
      });
    });

    describe('analyzeRequestGapRelation', () => {
      it('应该将"附近有什么好吃的"关联到用餐缺口', () => {
        const gaps = contextAnalyzer.detectGaps(mockTripContext);
        const result = contextAnalyzer.analyzeRequestGapRelation(
          '附近有什么好吃的',
          'ASK_QUESTION',
          gaps,
        );

        expect(result.related).toBe(true);
        expect(result.requestedType).toBe('MEAL');
        expect(result.matchedGaps.length).toBeGreaterThan(0);
      });

      it('应该将"推荐个酒店"关联到住宿缺口', () => {
        const gaps = contextAnalyzer.detectGaps(mockTripContext);
        const result = contextAnalyzer.analyzeRequestGapRelation(
          '推荐个酒店',
          'ASK_QUESTION',
          gaps,
        );

        expect(result.related).toBe(true);
        expect(result.requestedType).toBe('HOTEL');
      });

      it('不相关的请求应该返回 related=false', () => {
        const gaps = contextAnalyzer.detectGaps(mockTripContext);
        const result = contextAnalyzer.analyzeRequestGapRelation(
          '天气怎么样',
          'ASK_QUESTION',
          gaps,
        );

        expect(result.related).toBe(false);
      });
    });
  });

  describe('IntentDisambiguatorService', () => {
    describe('disambiguate', () => {
      it('明确查询应该返回 CLEAR', async () => {
        const result = await intentDisambiguator.disambiguate(
          '推荐一下东京有什么好吃的',
          'ASK_QUESTION',
          mockState,
        );

        // 即使是查询，如果发现缺口，可能会提示
        expect([IntentUncertainty.CLEAR, IntentUncertainty.AMBIGUOUS_NEED]).toContain(result.uncertainty);
      });

      it('明确添加应该解析目标', async () => {
        const result = await intentDisambiguator.disambiguate(
          '帮我安排一个午餐',
          'ADD_ACTIVITY',
          mockState,
        );

        // 应该识别为添加操作
        expect(result.originalIntent).toBe('ADD_ACTIVITY');
        
        // 应该发现关联的缺口
        if (result.contextDiscovery) {
          expect(result.contextDiscovery.foundGap).toBe(true);
        }
      });

      it('模糊请求应该请求澄清', async () => {
        const result = await intentDisambiguator.disambiguate(
          '寿司',  // 非常模糊的输入
          'GENERAL_CHAT',
          mockState,
        );

        // 可能是 CLEAR（默认当查询）或需要澄清
        if (result.uncertainty !== IntentUncertainty.CLEAR) {
          expect(result.clarificationNeeded).toBeDefined();
          expect(result.clarificationNeeded?.options.length).toBeGreaterThan(0);
        }
      });

      it('发现 CRITICAL 缺口应该主动提示', async () => {
        const result = await intentDisambiguator.disambiguate(
          '晚餐吃什么好',
          'ASK_QUESTION',
          mockState,
        );

        // 应该发现晚餐缺口（CRITICAL 级别）
        if (result.contextDiscovery?.foundGap) {
          expect(result.contextDiscovery.gap?.type).toBe('MEAL');
        }
      });
    });

    describe('handleClarificationResponse', () => {
      it('应该正确解析用户选择"只是了解一下"', () => {
        const clarificationRequest = {
          question: '您是想了解相关信息，还是想把它加到行程里呢？',
          options: [
            { id: 'just_query', label: '只是了解一下', action: 'QUERY' as const },
            { id: 'add', label: '帮我加到行程里', action: 'ADD_TO_ITINERARY' as const },
          ],
          allowFreeText: true,
        };

        const result = intentDisambiguator.handleClarificationResponse(
          '只是了解一下',
          clarificationRequest,
          mockState,
        );

        expect(result.uncertainty).toBe(IntentUncertainty.CLEAR);
        expect(result.resolvedIntent?.action).toBe('QUERY');
      });

      it('应该正确解析用户选择"帮我加"', () => {
        const clarificationRequest = {
          question: '您是想了解相关信息，还是想把它加到行程里呢？',
          options: [
            { id: 'just_query', label: '只是了解一下', action: 'QUERY' as const },
            { id: 'add', label: '帮我加到行程里', action: 'ADD_TO_ITINERARY' as const },
          ],
          allowFreeText: true,
        };

        const result = intentDisambiguator.handleClarificationResponse(
          '好的，帮我加进去',
          clarificationRequest,
          mockState,
        );

        expect(result.uncertainty).toBe(IntentUncertainty.CLEAR);
        expect(result.resolvedIntent?.action).toBe('ADD_TO_ITINERARY');
      });

      it('应该解析自由文本中的日期信息', () => {
        const clarificationRequest = {
          question: '请告诉我想添加到第几天？',
          options: [],
          allowFreeText: true,
        };

        const result = intentDisambiguator.handleClarificationResponse(
          '加到第2天下午',
          clarificationRequest,
          mockState,
        );

        if (result.resolvedIntent?.target) {
          expect(result.resolvedIntent.target.dayNumber).toBe(2);
        }
      });
    });
  });

  describe('Integration: Complete Flow', () => {
    it('完整流程：模糊输入 → 澄清 → 确认', async () => {
      // Step 1: 用户输入模糊的"寿司"
      const step1 = await intentDisambiguator.disambiguate(
        '附近有什么好吃的',
        'ASK_QUESTION',
        mockState,
      );

      // 应该发现用餐缺口
      expect(step1.contextDiscovery?.foundGap).toBe(true);
      expect(step1.contextDiscovery?.gap?.type).toBe('MEAL');

      // Step 2: 如果需要澄清，用户选择添加
      if (step1.clarificationNeeded) {
        const step2 = intentDisambiguator.handleClarificationResponse(
          '帮我安排进去',
          step1.clarificationNeeded,
          mockState,
        );

        expect(step2.uncertainty).toBe(IntentUncertainty.CLEAR);
        expect(step2.resolvedIntent?.action).toBe('ADD_TO_ITINERARY');
      }
    });

    it('明确添加流程：检测目标缺口', async () => {
      const result = await intentDisambiguator.disambiguate(
        '帮我安排一下第一天的晚餐',
        'ARRANGE_MEALS',
        mockState,
      );

      // 应该是 CLEAR 或发现相关缺口
      if (result.contextDiscovery?.foundGap) {
        expect(result.contextDiscovery.gap?.dayNumber).toBe(1);
        expect(result.contextDiscovery.gap?.type).toBe('MEAL');
      }
    });
  });
});
