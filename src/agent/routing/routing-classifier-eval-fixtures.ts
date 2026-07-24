import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export interface RoutingClassifierEvalFixture {
  id: string;
  note: string;
  source: 'manual' | 'e2e';
  request: RouteAndRunRequestDto;
}

/** 确定性路由评估 fixture（与 build-routing-classifier-eval-corpus 共享） */
export const ROUTING_CLASSIFIER_EVAL_FIXTURES: RoutingClassifierEvalFixture[] = [
  {
    id: 'iceland-trip-planning',
    source: 'manual',
    note: '多日冰岛规划 → SYSTEM2',
    request: {
      request_id: 'fixture-iceland-plan',
      user_id: 'eval-user',
      message: '规划7天冰岛环岛，包含西峡湾和南岸',
      options: { max_seconds: 90, use_claude_orchestration: true },
    },
  },
  {
    id: 'bound-trip-data-lookup',
    source: 'manual',
    note: '已绑定 trip 的开放时间咨询',
    request: {
      request_id: 'fixture-opening-hours',
      user_id: 'eval-user',
      trip_id: '00000000-0000-4000-8000-000000000001',
      message: 'Dynjandi 瀑布周二开放吗',
    },
  },
  {
    id: 'itinerary-adjust',
    source: 'manual',
    note: '节奏调整 → TRIP_PLANNING',
    request: {
      request_id: 'fixture-adjust',
      user_id: 'eval-user',
      trip_id: '00000000-0000-4000-8000-000000000002',
      message: '第三天轻松一点，少排两个点',
    },
  },
  {
    id: 'generic-qa-no-trip',
    source: 'manual',
    note: '无 trip 泛问',
    request: {
      request_id: 'fixture-generic',
      user_id: 'eval-user',
      message: '新宿有什么好吃的拉面',
    },
  },
  {
    id: 'high-risk-consent',
    source: 'manual',
    note: '支付+PII → consent tier',
    request: {
      request_id: 'fixture-consent',
      user_id: 'eval-user',
      message: '帮我用信用卡支付并填写护照号码完成预订',
    },
  },
  {
    id: 'e2e-iceland-reykjavik-plan',
    source: 'e2e',
    note: 'eval-route-and-run-trace 风格短规划',
    request: {
      request_id: 'fixture-e2e-reykjavik',
      user_id: 'eval-trace-user',
      message:
        'Plan a minimal 2-day trip to Reykjavik for one traveler. Keep the answer short; focus on having a valid itinerary structure.',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        max_seconds: 120,
        max_steps: 8,
      },
    },
  },
  {
    id: 'e2e-westfjords-consult',
    source: 'e2e',
    note: 'orchestration-signals 西峡湾接驳咨询',
    request: {
      request_id: 'fixture-e2e-westfjords',
      user_id: 'eval-user',
      trip_id: '00000000-0000-4000-8000-000000000003',
      message: '西峡湾这段不想开车了，想坐小飞机，后面再租车',
    },
  },
  {
    id: 'e2e-itinerary-adjust-pace',
    source: 'e2e',
    note: 'bound trip 节奏改排',
    request: {
      request_id: 'fixture-e2e-pace',
      user_id: 'eval-user',
      trip_id: '00000000-0000-4000-8000-000000000004',
      message: '第三天轻松点，少安排两个景点',
    },
  },
];
