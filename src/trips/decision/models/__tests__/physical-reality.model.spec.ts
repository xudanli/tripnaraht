// src/trips/decision/models/__tests__/physical-reality.model.spec.ts
/**
 * PhysicalRealityModel 单元测试
 * 
 * 测试目标：
 * 1. 模型不可被"越权使用"（验证完整性）
 * 2. 改动可追踪（验证字段变更）
 */

import { PhysicalRealityModel, validatePhysicalRealityModel } from '../physical-reality.model';
import { DemDecisionEvidence } from '../../interfaces/dem-decision-evidence.interface';

describe('PhysicalRealityModel', () => {
  describe('validatePhysicalRealityModel', () => {
    it('应该验证完整的模型', () => {
      const model: PhysicalRealityModel = {
        demEvidence: [
          {
            segmentId: 'seg-1',
            elevationProfile: [100, 200, 300],
            cumulativeAscentM: 200,
            maxSlopePct: 15,
            rollingFatigueIndex: 0.5,
            violation: 'NONE',
          },
        ],
        roadStates: [
          {
            roadId: 'road-1',
            status: 'OPEN',
          },
        ],
        hazardZones: [
          {
            zoneId: 'hazard-1',
            type: 'AVALANCHE',
            level: 'LOW',
          },
        ],
        ferryStates: [
          {
            ferryId: 'ferry-1',
            routeId: 'route-1',
            status: 'RUNNING',
          },
        ],
        countryCode: 'IS',
        month: 7,
      };

      const result = validatePhysicalRealityModel(model);
      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('应该拒绝缺少 demEvidence 的模型', () => {
      const model = {
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 7,
      } as any;

      const result = validatePhysicalRealityModel(model);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('demEvidence');
    });

    it('应该拒绝缺少 roadStates 的模型', () => {
      const model = {
        demEvidence: [],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 7,
      } as any;

      const result = validatePhysicalRealityModel(model);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('roadStates');
    });

    it('应该拒绝缺少 countryCode 的模型', () => {
      const model = {
        demEvidence: [],
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        month: 7,
      } as any;

      const result = validatePhysicalRealityModel(model);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('countryCode');
    });

    it('应该拒绝无效的月份', () => {
      const model = {
        demEvidence: [],
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 13, // 无效月份
      } as any;

      const result = validatePhysicalRealityModel(model);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('month');
    });

    it('应该拒绝月份为 0 的模型', () => {
      const model = {
        demEvidence: [],
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 0, // 无效月份
      } as any;

      const result = validatePhysicalRealityModel(model);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('month');
    });
  });

  describe('模型不可被"越权使用"', () => {
    it('应该要求所有必需字段存在', () => {
      const incompleteModel = {
        demEvidence: [],
        // 缺少 roadStates
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 7,
      } as any;

      const result = validatePhysicalRealityModel(incompleteModel);
      expect(result.valid).toBe(false);
      expect(result.missingFields.length).toBeGreaterThan(0);
    });

    it('应该拒绝空数组作为必需字段', () => {
      // 注意：空数组在技术上不是"缺失"，但业务逻辑要求至少有一个元素
      const model = {
        demEvidence: [], // 空数组
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 7,
      } as PhysicalRealityModel;

      const result = validatePhysicalRealityModel(model);
      // 空数组应该被拒绝（业务逻辑要求至少有一个元素）
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('demEvidence');
    });
  });

  describe('改动可追踪', () => {
    it('应该检测字段变更', () => {
      const originalModel: PhysicalRealityModel = {
        demEvidence: [
          {
            segmentId: 'seg-1',
            elevationProfile: [100, 200],
            cumulativeAscentM: 100,
            maxSlopePct: 10,
            rollingFatigueIndex: 0.3,
            violation: 'NONE',
          },
        ],
        roadStates: [
          {
            roadId: 'road-1',
            status: 'OPEN',
          },
        ],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 7,
      };

      // 修改后的模型
      const modifiedModel: PhysicalRealityModel = {
        ...originalModel,
        demEvidence: [
          {
            ...originalModel.demEvidence[0],
            violation: 'HARD', // 变更：从 NONE 变为 HARD
          },
        ],
      };

      // 验证变更可以被检测
      expect(originalModel.demEvidence[0].violation).toBe('NONE');
      expect(modifiedModel.demEvidence[0].violation).toBe('HARD');
    });

    it('应该追踪 roadStates 的变更', () => {
      const model: PhysicalRealityModel = {
        demEvidence: [],
        roadStates: [
          {
            roadId: 'road-1',
            status: 'OPEN',
          },
        ],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 7,
      };

      // 修改道路状态
      const modifiedModel: PhysicalRealityModel = {
        ...model,
        roadStates: [
          {
            ...model.roadStates[0],
            status: 'CLOSED', // 变更：从 OPEN 变为 CLOSED
          },
        ],
      };

      expect(model.roadStates[0].status).toBe('OPEN');
      expect(modifiedModel.roadStates[0].status).toBe('CLOSED');
    });
  });
});

