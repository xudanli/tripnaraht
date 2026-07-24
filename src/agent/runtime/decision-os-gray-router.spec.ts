import { ConfigService } from '@nestjs/config';
import {
  DecisionOsGrayRouterService,
  computeDosGrayHashBucket,
} from './decision-os-gray-router.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('Decision OS Step 4: Gray Router', () => {
  let router: DecisionOsGrayRouterService;
  let mockConfigService: ConfigService;

  beforeEach(() => {
    mockConfigService = { get: jest.fn() } as unknown as ConfigService;
    router = new DecisionOsGrayRouterService(mockConfigService);
  });

  it('当 options 显式指定 enable_llm_intent_compiler 为 true 时，应当无视全局开关强制放行', () => {
    (mockConfigService.get as jest.Mock).mockReturnValue('false');
    const req = { options: { enable_llm_intent_compiler: true } } as RouteAndRunRequestDto;

    const decision = router.evaluate(req);
    expect(decision.llm_compiler_path).toBe(true);
    expect(decision.reason).toBe('option_force_on');
  });

  it('当 options 显式指定 enable_llm_intent_compiler 为 false 时，应当强制走 Legacy', () => {
    (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'INTENT_COMPILER_LLM_ENABLED') return 'true';
      if (key === 'DOS_GRAY_PERCENTAGE') return '100';
      return '';
    });
    const req = { options: { enable_llm_intent_compiler: false } } as RouteAndRunRequestDto;

    expect(router.shouldRouteToLlmCompiler(req, 'user-1')).toBe(false);
    expect(router.evaluate(req, 'user-1').reason).toBe('option_force_off');
  });

  it('当全局开关关闭时，未命中白名单/百分比的用户不应进入 LLM 路径', () => {
    (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'INTENT_COMPILER_LLM_ENABLED') return 'false';
      return '';
    });
    const req = { trip_id: 'trip-abc', options: {} } as RouteAndRunRequestDto;

    expect(router.shouldRouteToLlmCompiler(req, 'user-1')).toBe(false);
    expect(router.evaluate(req, 'user-1').reason).toBe('global_off');
  });

  it('当 trip_id 命中白名单时应当放行', () => {
    (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'INTENT_COMPILER_LLM_ENABLED') return 'true';
      if (key === 'DOS_GRAY_TRIP_WHITELIST') return 'trip-alpha,trip-beta';
      if (key === 'DOS_GRAY_PERCENTAGE') return '0';
      return '';
    });
    const req = { trip_id: 'trip-beta', options: {} } as RouteAndRunRequestDto;

    const decision = router.evaluate(req, 'user-1');
    expect(decision.llm_compiler_path).toBe(true);
    expect(decision.reason).toBe('trip_whitelist');
  });

  it('当命中百分比灰度时，不同用户应当走向不同分流结果', () => {
    (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'INTENT_COMPILER_LLM_ENABLED') return 'true';
      if (key === 'DOS_GRAY_PERCENTAGE') return '10';
      return '';
    });
    const req = { options: {} } as RouteAndRunRequestDto;

    let lucky: string | undefined;
    let unlucky: string | undefined;
    for (let i = 0; i < 200; i++) {
      const uid = `gray-user-${i}`;
      if (router.shouldRouteToLlmCompiler(req, uid)) {
        lucky = uid;
      } else if (unlucky === undefined) {
        unlucky = uid;
      }
      if (lucky && unlucky) break;
    }

    expect(lucky).toBeDefined();
    expect(unlucky).toBeDefined();
    expect(router.shouldRouteToLlmCompiler(req, lucky!)).toBe(true);
    expect(router.shouldRouteToLlmCompiler(req, unlucky!)).toBe(false);
  });

  it('computeDosGrayHashBucket 对同一用户 ID 应稳定分桶', () => {
    expect(computeDosGrayHashBucket('user-stable')).toBe(computeDosGrayHashBucket('user-stable'));
    expect(computeDosGrayHashBucket('user-stable')).toBeGreaterThanOrEqual(0);
    expect(computeDosGrayHashBucket('user-stable')).toBeLessThan(100);
  });

  it('百分比边界：bucket 小于灰度阈值时放行，否则拒绝', () => {
    (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'INTENT_COMPILER_LLM_ENABLED') return 'true';
      if (key === 'DOS_GRAY_PERCENTAGE') return '50';
      return '';
    });
    const req = { options: {} } as RouteAndRunRequestDto;
    const uid = 'bucket-probe-user';
    const bucket = computeDosGrayHashBucket(uid);
    const decision = router.evaluate(req, uid);

    expect(decision.user_bucket).toBe(bucket);
    expect(decision.llm_compiler_path).toBe(bucket < 50);
    expect(decision.reason).toBe('user_percentage');
  });
});
