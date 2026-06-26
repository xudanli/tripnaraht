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
});
