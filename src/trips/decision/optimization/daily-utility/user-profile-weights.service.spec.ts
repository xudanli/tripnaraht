/**
 * UserProfileWeightsService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UserProfileWeightsService } from './user-profile-weights.service';
import { TripWorldState } from '../../world-model';
import { ConstraintDSL } from '../../constraints/constraint-dsl.types';

function createState(overrides: Partial<TripWorldState['context']> = {}): TripWorldState {
  return {
    context: {
      destination: 'Iceland',
      startDate: '2026-06-10',
      durationDays: 3,
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      ...overrides,
    },
    candidatesByDate: {},
    signals: { lastUpdatedAt: new Date().toISOString() },
  };
}

describe('UserProfileWeightsService', () => {
  let service: UserProfileWeightsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserProfileWeightsService],
    }).compile();
    service = module.get<UserProfileWeightsService>(UserProfileWeightsService);
  });

  it('应从 cost_sensitivity high 推断背包客', () => {
    const state = createState();
    const dsl: ConstraintDSL = {
      soft_constraints: {
        cost_sensitivity: { level: 'high', weight: 0.8 },
        comfort_level: { hotel_quality: 'low', weight: 0.5 },
      },
    };
    const { weights, userType } = service.inferWeights(state, dsl);
    expect(userType).toBe('backpacker');
    expect(weights.w_cost).toBeGreaterThan(weights.w_comfort);
  });

  it('应从 risk_tolerance low + comfort high 推断家庭', () => {
    const state = createState({
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
    });
    const dsl: ConstraintDSL = {
      soft_constraints: {
        comfort_level: { hotel_quality: 'high', weight: 0.8 },
      },
    };
    const { weights, userType } = service.inferWeights(state, dsl);
    expect(userType).toBe('family');
    expect(weights.w_safety).toBeGreaterThan(0.15);
    expect(weights.w_comfort).toBeGreaterThan(0.2);
  });

  it('应从 cost_sensitivity low 推断豪华', () => {
    const state = createState({
      preferences: { intents: {}, pace: 'relaxed', riskTolerance: 'medium' },
    });
    const dsl: ConstraintDSL = {
      soft_constraints: {
        cost_sensitivity: { level: 'low', weight: 0.3 },
      },
    };
    const { weights, userType } = service.inferWeights(state, dsl);
    expect(userType).toBe('luxury');
    expect(weights.w_exp).toBeGreaterThan(weights.w_cost);
  });

  it('无明确信号时应返回 balanced', () => {
    const state = createState();
    const { userType } = service.inferWeights(state, null);
    expect(userType).toBe('balanced');
  });

  it('getWeightsForUserType 应返回预设权重', () => {
    const weights = service.getWeightsForUserType('backpacker');
    expect(weights.w_cost).toBe(0.35);
    expect(weights.w_comfort).toBe(0.05);
  });
});
