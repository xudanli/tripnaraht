/**
 * BeliefUpdateService 单元测试
 *
 * Phase C：粒子滤波收敛性验证
 * 定理 2（粒子滤波一致性）：N→∞ 时粒子经验分布弱收敛到真实信念
 *
 * 本测试验证：在已知 T、Ω 的 2 状态 POMDP 下，粒子滤波结果与解析后验一致
 */

import { BeliefUpdateService } from './belief-update.service';
import { IObservationModel } from './observation-model.interface';
import type {
  BeliefState,
  BeliefUpdateInput,
  BeliefUpdateOutput,
} from './belief-update.service';
import type {
  WorldStateSample,
  WorldStateObservation,
  ProbabilisticWorldModelContext,
} from './probabilistic-world-model.interface';

/** 2 状态 POMDP 的 mock 观测模型：Ω(o1|s1)=0.9, Ω(o1|s2)=0.1 */
class MockObservationModel2State implements IObservationModel {
  computeLikelihood(
    sample: WorldStateSample,
    _obs: WorldStateObservation,
  ): number {
    return sample.sampleId === 's1' ? 0.9 : 0.1;
  }
}

/** 最小 WorldStateSample 工厂 */
function makeSample(id: string): WorldStateSample {
  return {
    sampleId: id,
    weather: {
      windSpeedMs: 0,
      precipitationMm: 0,
      visibilityM: 0,
      temperatureC: 0,
      condition: 'sunny',
    },
    roadStatuses: [],
    humanCapability: {
      maxDailyAscentM: 0,
      fatigueThreshold: 0,
      recoveryRate: 0,
    },
    hazardLevels: [],
    feasibilityScore: 0,
  };
}

describe('BeliefUpdateService', () => {
  let service: BeliefUpdateService;
  let mockWorldModel: {
    predictOutcome: jest.Mock;
  };

  const s1 = makeSample('s1');
  const s2 = makeSample('s2');

  const minimalContext = {} as ProbabilisticWorldModelContext;

  const observationO1: WorldStateObservation = {
    timestamp: new Date().toISOString(),
    type: 'WEATHER',
    observation: { variable: 'windSpeed', value: 0 },
    quality: 'HIGH',
  };

  beforeEach(() => {
    mockWorldModel = {
      predictOutcome: jest.fn().mockResolvedValue({
        nextState: minimalContext,
        feasibilityProbability: 1,
        constraintViolations: [],
        estimatedUtility: 0,
        nextStateSamples: [s1, s2],
      }),
    };

    service = new BeliefUpdateService(
      mockWorldModel as any,
      new MockObservationModel2State(),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('粒子滤波与解析后验一致性（定理 2 验证）', () => {
    /**
     * 解析解：b(s1)=0.5, b(s2)=0.5
     * Ω(o1|s1)=0.9, Ω(o1|s2)=0.1
     * 预测步（恒等转移）：p(s1')=0.5, p(s2')=0.5
     * 更新：b'(s1) ∝ 0.9×0.5=0.45, b'(s2) ∝ 0.1×0.5=0.05
     * 归一化：Z=0.5, b'(s1)=0.9, b'(s2)=0.1
     */
    it('2 状态 POMDP：粒子滤波结果应与解析后验 b\'(s1)=0.9, b\'(s2)=0.1 一致', async () => {
      const currentBelief: BeliefState[] = [
        { particleId: 'p0', sample: s1, weight: 0.5 },
        { particleId: 'p1', sample: s2, weight: 0.5 },
      ];

      const input: BeliefUpdateInput = {
        currentBelief,
        action: { type: 'test' },
        observation: observationO1,
      };

      const result: BeliefUpdateOutput = await service.updateBelief(
        minimalContext,
        input,
      );

      const w1 = result.updatedBelief.find((p) => p.sample.sampleId === 's1')
        ?.weight;
      const w2 = result.updatedBelief.find((p) => p.sample.sampleId === 's2')
        ?.weight;

      expect(w1).toBeDefined();
      expect(w2).toBeDefined();
      expect(w1).toBeCloseTo(0.9, 5);
      expect(w2).toBeCloseTo(0.1, 5);
      expect((w1 ?? 0) + (w2 ?? 0)).toBeCloseTo(1, 10);
    });

    it('应输出 logNormalizationConstant', async () => {
      const currentBelief: BeliefState[] = [
        { particleId: 'p0', sample: s1, weight: 0.5 },
        { particleId: 'p1', sample: s2, weight: 0.5 },
      ];

      const result = await service.updateBelief(minimalContext, {
        currentBelief,
        action: { type: 'test' },
        observation: observationO1,
      });

      expect(result.logNormalizationConstant).toBeDefined();
      // Z = 0.5*0.9 + 0.5*0.1 = 0.5, log(Z) = log(0.5)
      expect(result.logNormalizationConstant).toBeCloseTo(Math.log(0.5), 3);
    });
  });

  describe('无 WorldModel 时', () => {
    it('应返回未更新信念', async () => {
      const serviceNoWorld = new BeliefUpdateService(undefined);
      const currentBelief: BeliefState[] = [
        { particleId: 'p0', sample: s1, weight: 0.5 },
        { particleId: 'p1', sample: s2, weight: 0.5 },
      ];

      const result = await serviceNoWorld.updateBelief(minimalContext, {
        currentBelief,
        action: { type: 'test' },
        observation: observationO1,
      });

      expect(result.updatedBelief).toEqual(currentBelief);
      expect(result.effectiveParticleCount).toBe(2);
    });
  });
});
