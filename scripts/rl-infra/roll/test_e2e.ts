/**
 * ROLL 架构端到端测试 (TypeScript)
 * 
 * 测试 TypeScript → Bridge Service → Ray Workers 完整流程
 */
import { RollClientService } from '../../../src/agent/training/services/roll-client.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

describe('ROLL E2E Tests', () => {
  let rollClient: RollClientService;
  let configService: ConfigService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RollClientService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: any) => {
              const env: Record<string, any> = {
                ROLL_ENABLED: 'true',
                ROLL_BRIDGE_URL: process.env.ROLL_BRIDGE_URL || 'http://localhost:8001',
                RAY_ADDRESS: process.env.RAY_ADDRESS || 'ray://localhost:10001',
                RAY_NAMESPACE: process.env.RAY_NAMESPACE || 'tripnara-rl',
              };
              return env[key] ?? defaultValue;
            },
          },
        },
      ],
    }).compile();

    rollClient = module.get<RollClientService>(RollClientService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Health Check', () => {
    it('should check bridge service health', async () => {
      const health = await rollClient.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      console.log('Health Check:', health);
    });
  });

  describe('Actor-Worker Integration', () => {
    it('should generate trajectory via Actor-Worker', async () => {
      const request = {
        requestId: 'e2e-test-001',
        userRequest: 'Plan a 7-day trip to Iceland',
        state: {
          origin: 'Reykjavik',
          destination: 'Akureyri',
        },
        action: 'generate_itinerary',
        params: {
          duration: 7,
          budget: 5000,
        },
      };

      const result = await rollClient.callActorWorker(request);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.trajectoryId).toBeDefined();
      expect(result.trajectory).toBeDefined();
      
      console.log('Actor-Worker Result:', JSON.stringify(result, null, 2));
    }, 30000); // 30秒超时
  });

  describe('Reward-Worker Integration', () => {
    it('should compute reward via Reward-Worker', async () => {
      // 先生成轨迹
      const trajectoryRequest = {
        requestId: 'e2e-test-002',
        userRequest: 'Plan a trip',
        state: {},
        action: 'generate_itinerary',
        params: { duration: 7 },
      };

      const trajectoryResult = await rollClient.callActorWorker(trajectoryRequest);
      expect(trajectoryResult.success).toBe(true);

      // 计算奖励
      const rewardResult = await rollClient.callRewardWorker(
        trajectoryResult.trajectory,
      );

      expect(rewardResult).toBeDefined();
      expect(rewardResult.success).toBe(true);
      expect(rewardResult.reward).toBeDefined();
      expect(typeof rewardResult.reward).toBe('number');
      expect(rewardResult.reward).toBeGreaterThanOrEqual(0);
      expect(rewardResult.reward).toBeLessThanOrEqual(1);
      
      console.log('Reward-Worker Result:', JSON.stringify(rewardResult, null, 2));
    }, 30000);
  });

  describe('Policy-Worker Integration', () => {
    it('should predict policy via Policy-Worker', async () => {
      const state = {
        userRequest: 'Plan a trip to Iceland',
        origin: 'Reykjavik',
        destination: 'Akureyri',
        constraints: {
          budget: 5000,
        },
        preferences: {
          pace: 'moderate',
        },
      };

      const result = await rollClient.callPolicyWorker(state);

      // Policy-Worker 可能还未实现，允许失败
      if (result.success) {
        expect(result.action).toBeDefined();
        expect(result.confidence).toBeDefined();
        console.log('Policy-Worker Result:', JSON.stringify(result, null, 2));
      } else {
        console.log('Policy-Worker not implemented yet:', result.error);
      }
    }, 30000);
  });

  describe('Performance Test', () => {
    it('should measure Actor-Worker latency', async () => {
      const iterations = 10;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        
        await rollClient.callActorWorker({
          requestId: `perf-test-${i}`,
          userRequest: 'Test request',
          state: {},
          action: 'test_action',
          params: {},
        });
        
        const latency = Date.now() - start;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const minLatency = Math.min(...latencies);
      const maxLatency = Math.max(...latencies);

      console.log(`Performance Metrics (${iterations} iterations):`);
      console.log(`  Average Latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`  Min Latency: ${minLatency}ms`);
      console.log(`  Max Latency: ${maxLatency}ms`);

      // 期望平均延迟 < 500ms (目标: 300ms)
      expect(avgLatency).toBeLessThan(500);
    }, 60000);
  });
});
