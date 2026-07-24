import { ShadowRouteClassEvaluatorService } from './shadow-route-class-evaluator.service';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';

describe('ShadowRouteClassEvaluatorService', () => {
  const prevEnv = process.env.ROUTE_CLASS_SHADOW_EVAL;

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.ROUTE_CLASS_SHADOW_EVAL;
    } else {
      process.env.ROUTE_CLASS_SHADOW_EVAL = prevEnv;
    }
  });

  it('is enabled by default', () => {
    delete process.env.ROUTE_CLASS_SHADOW_EVAL;
    expect(new ShadowRouteClassEvaluatorService().isEnabled()).toBe(true);
  });

  it('evaluateSync returns route_class_eval envelope', () => {
    process.env.ROUTE_CLASS_SHADOW_EVAL = '1';
    const svc = new ShadowRouteClassEvaluatorService();
    const request = {
      request_id: 'trace-route-class-1',
      user_id: 'u1',
      trip_id: '00000000-0000-4000-8000-000000000001',
      message: '第3天傍晚还能徒步吗',
    } as any;
    const signals = signalsFromRequest(request);
    const decision = routePolicy(process.env, request.options, signals);
    const out = svc.evaluateSync({ traceId: request.request_id, request, signals, decision });
    expect(out.schemaId).toBe('tripnara.route_class_eval@v1');
    expect(out.protocolRouteClass).toBe('QUICK_ANSWER');
    expect(typeof out.isMatch).toBe('boolean');
    expect(out.mismatchType).toBeDefined();
  });
});
