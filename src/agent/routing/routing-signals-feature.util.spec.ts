import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';
import {
  analyzeRoutingTierMismatch,
  predictExperimentalRoutingTier,
  projectProductionRoutingTier,
} from './routing-tier-projection.util';
import { buildRoutingSignalsFeatureVector, complexityLevelToScore } from './routing-signals-feature.util';

describe('routing-signals-feature.util', () => {
  it('maps complexity levels to numeric scores', () => {
    expect(complexityLevelToScore('SIMPLE')).toBe(0.25);
    expect(complexityLevelToScore('MODERATE')).toBe(0.55);
    expect(complexityLevelToScore('COMPLEX')).toBe(0.85);
  });

  it('builds feature vector from request + decision', () => {
    const request = {
      request_id: 'req-1',
      user_id: 'u1',
      trip_id: 'trip-1',
      message: '规划5天冰岛行程',
      options: { max_seconds: 60 },
    } as any;
    const signals = signalsFromRequest(request);
    const decision = routePolicy(process.env, request.options, signals);
    const features = buildRoutingSignalsFeatureVector({
      request,
      signals,
      decision,
      modeLockActive: false,
    });
    expect(features.taskType).toBe('TRIP_PLANNING');
    expect(features.matchedRuleCount).toBeGreaterThan(0);
    expect(features.hasTripId).toBe(true);
  });
});

describe('routing-tier-projection.util', () => {
  it('projects lightweight lookup to SYSTEM1_API', () => {
    const request = {
      request_id: 'req-2',
      user_id: 'u1',
      message: '今天东京天气怎么样',
    } as any;
    const signals = signalsFromRequest(request);
    const decision = routePolicy(process.env, request.options, signals);
    expect(projectProductionRoutingTier(signals, decision)).toBe('SYSTEM1_API');
  });

  it('flags under-routing when shadow is heavier than production', () => {
    expect(
      analyzeRoutingTierMismatch('SYSTEM1_API', 'SYSTEM2_REASONING'),
    ).toBe('UNDER_ROUTING');
    expect(analyzeRoutingTierMismatch('SYSTEM2_REASONING', 'SYSTEM1_API')).toBe('OVER_ROUTING');
    expect(analyzeRoutingTierMismatch('SYSTEM1_RAG', 'SYSTEM1_RAG')).toBe('NONE');
  });

  it('experimental predictor escalates HIGH risk to consent tier', () => {
    const request = {
      request_id: 'req-3',
      user_id: 'u1',
      message: '帮我用信用卡支付并填写护照号码',
    } as any;
    const signals = signalsFromRequest(request);
    expect(predictExperimentalRoutingTier(signals)).toBe('SYSTEM2_CONSENT');
  });
});
