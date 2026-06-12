import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlanningAssistantV2Service } from './planning-assistant-v2.service';
import { PlanningAssistantService } from './planning-assistant.service';
import { SmartRouterService } from './smart-router.service';
import { AgentService } from '../../../services/agent.service';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('PlanningAssistantV2Service — workbench trip review', () => {
  let service: PlanningAssistantV2Service;
  let agentService: { routeAndRun: jest.Mock };
  let planningAssistantService: {
    getSessionState: jest.Mock;
    saveSession: jest.Mock;
  };

  beforeEach(async () => {
    agentService = {
      routeAndRun: jest.fn().mockResolvedValue({
        result: {
          status: 'OK',
          answer_text:
            '- **当前摘要**：冰岛南岸 + 雷克雅未克\n- **行程健康度**：65/100，存在 1 个时间冲突\n- **准备度小结**：偏低，需补签证与保险',
          payload: {
            consultation_dashboard: { headline: '行程体检摘要' },
          },
        },
        ui_state: { phase: 'DONE', ui_status: 'done', progress_percent: 100 },
      }),
    };

    planningAssistantService = {
      getSessionState: jest.fn().mockResolvedValue({
        phase: 'RECOMMENDING',
        messageHistory: [],
      }),
      saveSession: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningAssistantV2Service,
        { provide: PlanningAssistantService, useValue: planningAssistantService },
        { provide: AgentService, useValue: agentService },
        {
          provide: PrismaService,
          useValue: {
            trip: {
              findUnique: jest.fn().mockResolvedValue({ destination: 'IS_ICE' }),
            },
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: SmartRouterService,
          useValue: {
            routeWithTools: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PlanningAssistantV2Service);
  });

  it('routes 全面分析当前行程 to route_and_run DATA_LOOKUP before smart router', async () => {
    const msg = '帮我全面分析当前行程，看看还有什么问题或可以优化的地方';
    const res = await service.chat({
      sessionId: 'sess-1',
      userId: 'user-1',
      message: msg,
      language: 'zh',
      context: { tripId: 'trip-1', countryCode: 'IS' },
      options: { autoRoute: true },
    });

    expect(agentService.routeAndRun).toHaveBeenCalledTimes(1);
    const req = agentService.routeAndRun.mock.calls[0][0];
    expect(req.trip_id).toBe('trip-1');
    expect(req.options?.intent_mode).toBe('DATA_LOOKUP');
    expect(req.options?.entry_point).toBe('planning_workbench');
    expect(req.options?.async_mode).toBe('OFF');
    expect(res.replyCN).toContain('行程健康度');
    expect(res.routing?.params?.intent_mode).toBe('DATA_LOOKUP');
  });
});
