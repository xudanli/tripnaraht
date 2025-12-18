// src/agent/services/router.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RouterService } from './router.service';
import { EventTelemetryService } from './event-telemetry.service';
import { RouteType, RouterReason } from '../interfaces/router.interface';

describe('RouterService', () => {
  let service: RouterService;
  let eventTelemetry: EventTelemetryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouterService,
        {
          provide: EventTelemetryService,
          useValue: {
            recordRouterDecision: jest.fn(),
            recordFallbackTriggered: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RouterService>(RouterService);
    eventTelemetry = module.get<EventTelemetryService>(EventTelemetryService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('路由决策', () => {
    it('应该将支付相关请求路由到 SYSTEM2_REASONING', async () => {
      const result = await service.route('我要支付订单', undefined, 'test-request-id');
      expect(result.route).toBe(RouteType.SYSTEM2_REASONING);
      expect(result.consent_required).toBe(true);
    });

    it('应该将浏览器相关请求路由到 SYSTEM2_WEBBROWSE', async () => {
      const result = await service.route('用浏览器查一下官网', undefined, 'test-request-id');
      expect(result.route).toBe(RouteType.SYSTEM2_WEBBROWSE);
      expect(result.consent_required).toBe(true);
    });

    it('应该将明确的删除操作路由到 SYSTEM1_API', async () => {
      const result = await service.route('删除故宫', undefined, 'test-request-id');
      expect(result.route).toBe(RouteType.SYSTEM1_API);
      expect(result.consent_required).toBe(false);
    });

    it('应该将单纯的事实查询路由到 SYSTEM1_RAG', async () => {
      const result = await service.route('故宫在哪里', undefined, 'test-request-id');
      expect(result.route).toBe(RouteType.SYSTEM1_RAG);
      expect(result.consent_required).toBe(false);
    });

    it('应该将规划请求路由到 SYSTEM2_REASONING', async () => {
      const result = await service.route('帮我规划一个3天的北京行程', undefined, 'test-request-id');
      expect(result.route).toBe(RouteType.SYSTEM2_REASONING);
    });
  });

  describe('事件记录', () => {
    it('应该记录路由决策事件', async () => {
      await service.route('测试', undefined, 'test-request-id');
      expect(eventTelemetry.recordRouterDecision).toHaveBeenCalled();
    });
  });
});

