import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { PlanningRequestClassifierService } from './planning-request-classifier.service';

function req(overrides: Partial<RouteAndRunRequestDto>): RouteAndRunRequestDto {
  return {
    request_id: 'req-test',
    user_id: 'user-test',
    message: '查一下东京天气',
    ...overrides,
  } as RouteAndRunRequestDto;
}

describe('PlanningRequestClassifierService', () => {
  const service = new PlanningRequestClassifierService();

  it('treats explicit TRIP_PLANNING without trip_id as a planning request', () => {
    expect(
      service.isPlanningRequest(
        req({
          message: '去东京五天',
          options: { intent_mode: 'TRIP_PLANNING' },
        }),
      ),
    ).toBe(true);
  });

  it('does not redirect trip review even when intent_mode is TRIP_PLANNING', () => {
    expect(
      service.isPlanningRequest(
        req({
          message: '分析当前行程的整体可行性，有什么需要改进的吗？',
          options: { intent_mode: 'TRIP_PLANNING' },
        }),
      ),
    ).toBe(false);
    expect(
      service.isPlanningRequest(
        req({
          message: '帮我全面分析当前行程，看看还有什么问题或可以优化的地方',
          options: { intent_mode: 'TRIP_PLANNING' },
        }),
      ),
    ).toBe(false);
  });

  it('does not redirect trip review without intent_mode override', () => {
    expect(
      service.isPlanningRequest(
        req({
          message: '分析当前行程的整体可行性，有什么需要改进的吗？',
        }),
      ),
    ).toBe(false);
  });

  it('does not redirect explicit lookup or generic QA without trip_id', () => {
    expect(
      service.isPlanningRequest(
        req({
          message: '帮我规划一下东京天气风险',
          options: { intent_mode: 'DATA_LOOKUP' },
        }),
      ),
    ).toBe(false);
    expect(
      service.isPlanningRequest(
        req({
          message: '帮我规划一下这句话怎么写',
          options: { intent_mode: 'GENERIC_QA' },
        }),
      ),
    ).toBe(false);
  });

  it('still redirects real from-scratch planning keywords without trip_id', () => {
    expect(
      service.isPlanningRequest(
        req({
          message: '规划一个5天冰岛行程',
        }),
      ),
    ).toBe(true);
  });
});
