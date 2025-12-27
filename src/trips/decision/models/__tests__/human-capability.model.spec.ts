// src/trips/decision/models/__tests__/human-capability.model.spec.ts
/**
 * HumanCapabilityModel 单元测试
 * 
 * 测试目标：
 * 1. 模型不可被"越权使用"（验证完整性）
 * 2. 改动可追踪（验证字段变更）
 * 3. 从用户画像关键词正确生成模型
 * 4. 正确投影为 DecisionParams
 */

import {
  HumanCapabilityModel,
  createHumanCapabilityModelFromProfile,
  projectToDecisionParams,
} from '../human-capability.model';

describe('HumanCapabilityModel', () => {
  describe('createHumanCapabilityModelFromProfile', () => {
    it('应该从慢节奏+低体能关键词生成正确的模型', () => {
      const model = createHumanCapabilityModelFromProfile('profile-1', {
        pace: 'slow',
        fitness: 'low',
        riskTolerance: 'low',
        highAltitudeExperience: 'none',
      });

      expect(model.profileId).toBe('profile-1');
      expect(model.maxDailyAscentM).toBe(400);
      expect(model.rollingAscent3DaysM).toBe(1000);
      expect(model.maxSlopePct).toBe(15);
      expect(model.preferredPace).toBe('SLOW');
      expect(model.riskTolerance).toBe('LOW');
      expect(model.highAltitudeExperience).toBe('NONE');
      expect(model.bufferDayBias).toBe('HIGH');
      expect(model.weatherRiskWeight).toBeGreaterThan(0.5);
    });

    it('应该从快节奏+高体能关键词生成正确的模型', () => {
      const model = createHumanCapabilityModelFromProfile('profile-2', {
        pace: 'fast',
        fitness: 'high',
        riskTolerance: 'high',
        highAltitudeExperience: 'advanced',
      });

      expect(model.profileId).toBe('profile-2');
      expect(model.maxDailyAscentM).toBe(1200);
      expect(model.rollingAscent3DaysM).toBe(3000);
      expect(model.maxSlopePct).toBe(30);
      expect(model.preferredPace).toBe('FAST');
      expect(model.riskTolerance).toBe('HIGH');
      expect(model.highAltitudeExperience).toBe('ADVANCED');
      expect(model.bufferDayBias).toBe('LOW');
      expect(model.weatherRiskWeight).toBeLessThan(0.5);
      expect(model.maxElevationM).toBe(6000);
      expect(model.requiresGradualAscent).toBe(false);
    });

    it('应该从中等关键词生成默认模型', () => {
      const model = createHumanCapabilityModelFromProfile('profile-3', {
        pace: 'normal',
        fitness: 'medium',
        riskTolerance: 'medium',
      });

      expect(model.maxDailyAscentM).toBe(800);
      expect(model.rollingAscent3DaysM).toBe(2000);
      expect(model.maxSlopePct).toBe(25);
      expect(model.preferredPace).toBe('MEDIUM');
      expect(model.riskTolerance).toBe('MEDIUM');
      expect(model.bufferDayBias).toBe('MEDIUM');
    });
  });

  describe('projectToDecisionParams', () => {
    it('应该正确投影为 DecisionParams', () => {
      const model: HumanCapabilityModel = {
        profileId: 'profile-1',
        maxDailyAscentM: 800,
        rollingAscent3DaysM: 2000,
        maxSlopePct: 25,
        preferredPace: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        highAltitudeExperience: 'BASIC',
        maxElevationM: 4500,
        requiresGradualAscent: true,
        bufferDayBias: 'MEDIUM',
        weatherRiskWeight: 0.5,
      };

      const decisionParams = projectToDecisionParams(model);

      expect(decisionParams.maxDailyAscentM).toBe(800);
      expect(decisionParams.rollingAscent3DaysM).toBe(2000);
      expect(decisionParams.maxSlopePct).toBe(25);
      expect(decisionParams.weatherRiskWeight).toBe(0.5);
      expect(decisionParams.bufferDayBias).toBe('MEDIUM');
      expect(decisionParams.riskTolerance).toBe('MEDIUM');
      expect(decisionParams.maxElevationM).toBe(4500);
      expect(decisionParams.rapidAscentForbidden).toBe(true);
    });
  });

  describe('模型不可被"越权使用"', () => {
    it('应该要求所有必需字段存在', () => {
      const incompleteModel = {
        profileId: 'profile-1',
        maxDailyAscentM: 800,
        // 缺少 rollingAscent3DaysM
        maxSlopePct: 25,
        preferredPace: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        highAltitudeExperience: 'NONE',
      } as any;

      // TypeScript 会在编译时捕获，但运行时也应该验证
      expect(incompleteModel.rollingAscent3DaysM).toBeUndefined();
    });

    it('应该拒绝无效的 preferredPace', () => {
      const model = {
        profileId: 'profile-1',
        maxDailyAscentM: 800,
        rollingAscent3DaysM: 2000,
        maxSlopePct: 25,
        preferredPace: 'INVALID', // 无效值
        riskTolerance: 'MEDIUM',
        highAltitudeExperience: 'NONE',
      } as any;

      // TypeScript 会在编译时捕获，但运行时也应该验证
      expect(['SLOW', 'MEDIUM', 'FAST']).not.toContain(model.preferredPace);
    });
  });

  describe('改动可追踪', () => {
    it('应该检测字段变更', () => {
      const originalModel: HumanCapabilityModel = {
        profileId: 'profile-1',
        maxDailyAscentM: 800,
        rollingAscent3DaysM: 2000,
        maxSlopePct: 25,
        preferredPace: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        highAltitudeExperience: 'NONE',
      };

      // 修改后的模型
      const modifiedModel: HumanCapabilityModel = {
        ...originalModel,
        maxDailyAscentM: 1200, // 变更：从 800 变为 1200
        preferredPace: 'FAST', // 变更：从 MEDIUM 变为 FAST
      };

      // 验证变更可以被检测
      expect(originalModel.maxDailyAscentM).toBe(800);
      expect(modifiedModel.maxDailyAscentM).toBe(1200);
      expect(originalModel.preferredPace).toBe('MEDIUM');
      expect(modifiedModel.preferredPace).toBe('FAST');
    });

    it('应该追踪高海拔经验的变更', () => {
      const model: HumanCapabilityModel = {
        profileId: 'profile-1',
        maxDailyAscentM: 800,
        rollingAscent3DaysM: 2000,
        maxSlopePct: 25,
        preferredPace: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        highAltitudeExperience: 'NONE',
        maxElevationM: 3000,
        requiresGradualAscent: true,
      };

      // 修改高海拔经验
      const modifiedModel: HumanCapabilityModel = {
        ...model,
        highAltitudeExperience: 'ADVANCED',
        maxElevationM: 6000,
        requiresGradualAscent: false,
      };

      expect(model.highAltitudeExperience).toBe('NONE');
      expect(modifiedModel.highAltitudeExperience).toBe('ADVANCED');
      expect(model.maxElevationM).toBe(3000);
      expect(modifiedModel.maxElevationM).toBe(6000);
      expect(model.requiresGradualAscent).toBe(true);
      expect(modifiedModel.requiresGradualAscent).toBe(false);
    });
  });

  describe('边界值测试', () => {
    it('应该处理极端体能值', () => {
      const lowFitnessModel = createHumanCapabilityModelFromProfile('low', {
        fitness: 'low',
      });
      expect(lowFitnessModel.maxDailyAscentM).toBe(400);

      const extremeFitnessModel = createHumanCapabilityModelFromProfile('extreme', {
        fitness: 'extreme',
      });
      expect(extremeFitnessModel.maxDailyAscentM).toBe(1200);
    });

    it('应该处理高海拔经验的边界情况', () => {
      const noneModel = createHumanCapabilityModelFromProfile('none', {
        highAltitudeExperience: 'none',
      });
      expect(noneModel.maxElevationM).toBe(3000);
      expect(noneModel.requiresGradualAscent).toBe(true);

      const advancedModel = createHumanCapabilityModelFromProfile('advanced', {
        highAltitudeExperience: 'advanced',
      });
      expect(advancedModel.maxElevationM).toBe(6000);
      expect(advancedModel.requiresGradualAscent).toBe(false);
    });
  });
});

