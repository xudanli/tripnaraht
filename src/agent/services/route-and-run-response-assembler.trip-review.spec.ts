import { isBoundTripLightConsultQuery } from '../utils/orchestration-signals.util';

describe('RouteAndRunResponseAssembler — trip review prose guard', () => {
  it('isBoundTripLightConsultQuery keeps prose even when routingTaskType is TRIP_PLANNING', () => {
    const msg = '帮我全面分析当前行程，看看还有什么问题或可以优化的地方';
    expect(isBoundTripLightConsultQuery(msg, msg.toLowerCase())).toBe(true);
    const routingTaskType = 'TRIP_PLANNING';
    const proseFriendlyTaskTypes = ['DATA_LOOKUP', 'RAG_QA', 'GENERIC_QA'] as const;
    const keepAnswerProse =
      isBoundTripLightConsultQuery(msg, msg.toLowerCase()) ||
      (proseFriendlyTaskTypes as readonly string[]).includes(routingTaskType);
    expect(keepAnswerProse).toBe(true);
  });

  it('lodging+dining plan query keeps prose when misrouted as TRIP_PLANNING', () => {
    const msg =
      '详细6天住宿和餐饮方案，黄金圈南岸到冰河湖，酒店推荐和每日用餐策略';
    expect(isBoundTripLightConsultQuery(msg, msg.toLowerCase())).toBe(true);
    const keepAnswerProse =
      isBoundTripLightConsultQuery(msg, msg.toLowerCase()) ||
      (['DATA_LOOKUP'] as readonly string[]).includes('TRIP_PLANNING');
    expect(keepAnswerProse).toBe(true);
  });
});
