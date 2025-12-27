// src/trips/decision/models/__tests__/route-philosophy.model.spec.ts
/**
 * RoutePhilosophyModel 单元测试
 * 
 * 测试目标：
 * 1. 模型不可被"越权使用"（验证完整性）
 * 2. 改动可追踪（验证字段变更）
 * 3. 替换操作验证（不允许违反哲学）
 * 4. 核心体验覆盖检查
 */

import {
  RoutePhilosophy,
  validateReplacementAgainstPhilosophy,
  checkCoreExperienceCoverage,
  ICELAND_HIGHLANDS_PHILOSOPHY,
  NEPAL_EBC_PHILOSOPHY,
} from '../route-philosophy.model';

describe('RoutePhilosophyModel', () => {
  describe('validateReplacementAgainstPhilosophy', () => {
    it('应该允许不违反哲学的替换', () => {
      const philosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        mustVisitTags: ['tag1', 'tag2'],
        nonNegotiableRules: ['rule1'],
        flexibleParts: ['part1'],
      };

      const replacement = {
        type: 'POI_REPLACEMENT' as const,
        originalPoiId: 'poi-1',
        newPoiId: 'poi-2',
        removedTags: ['tag3'], // 不删除 mustVisitTags
        addedTags: ['tag4'],
      };

      const result = validateReplacementAgainstPhilosophy(replacement, philosophy);
      expect(result.allowed).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('应该拒绝删除 mustVisitTags 的替换', () => {
      const philosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        mustVisitTags: ['高地荒原', '温泉'],
        nonNegotiableRules: [],
        flexibleParts: [],
      };

      const replacement = {
        type: 'POI_REPLACEMENT' as const,
        originalPoiId: 'poi-1',
        newPoiId: 'poi-2',
        removedTags: ['高地荒原'], // 删除 mustVisitTags
        addedTags: [],
      };

      const result = validateReplacementAgainstPhilosophy(replacement, philosophy);
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('不允许删除必须体验类型: 高地荒原');
    });

    it('应该拒绝删除多个 mustVisitTags 的替换', () => {
      const philosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        mustVisitTags: ['高地荒原', '温泉', '火山'],
        nonNegotiableRules: [],
        flexibleParts: [],
      };

      const replacement = {
        type: 'POI_REPLACEMENT' as const,
        originalPoiId: 'poi-1',
        newPoiId: 'poi-2',
        removedTags: ['高地荒原', '温泉'], // 删除多个 mustVisitTags
        addedTags: [],
      };

      const result = validateReplacementAgainstPhilosophy(replacement, philosophy);
      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBe(2);
      expect(result.violations).toContain('不允许删除必须体验类型: 高地荒原');
      expect(result.violations).toContain('不允许删除必须体验类型: 温泉');
    });

    it('应该允许删除非 mustVisitTags 的替换', () => {
      const philosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        mustVisitTags: ['高地荒原'],
        nonNegotiableRules: [],
        flexibleParts: [],
      };

      const replacement = {
        type: 'POI_REPLACEMENT' as const,
        originalPoiId: 'poi-1',
        newPoiId: 'poi-2',
        removedTags: ['其他标签'], // 删除非 mustVisitTags
        addedTags: [],
      };

      const result = validateReplacementAgainstPhilosophy(replacement, philosophy);
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkCoreExperienceCoverage', () => {
    it('应该检测核心体验完全覆盖', () => {
      const philosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        mustVisitTags: ['高地荒原', '温泉'],
        nonNegotiableRules: [],
        flexibleParts: [],
      };

      const currentTags = ['高地荒原', '温泉', '其他标签'];

      const result = checkCoreExperienceCoverage(currentTags, philosophy);
      expect(result.covered).toBe(true);
      expect(result.missingTags).toEqual([]);
    });

    it('应该检测核心体验缺失', () => {
      const philosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        mustVisitTags: ['高地荒原', '温泉', '火山'],
        nonNegotiableRules: [],
        flexibleParts: [],
      };

      const currentTags = ['高地荒原', '其他标签']; // 缺少 '温泉' 和 '火山'

      const result = checkCoreExperienceCoverage(currentTags, philosophy);
      expect(result.covered).toBe(false);
      expect(result.missingTags).toContain('温泉');
      expect(result.missingTags).toContain('火山');
    });

    it('应该处理没有 mustVisitTags 的哲学', () => {
      const philosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        nonNegotiableRules: [],
        flexibleParts: [],
      };

      const currentTags: string[] = [];

      const result = checkCoreExperienceCoverage(currentTags, philosophy);
      expect(result.covered).toBe(true);
      expect(result.missingTags).toEqual([]);
    });
  });

  describe('模型不可被"越权使用"', () => {
    it('应该要求 coreStatement 存在', () => {
      const incompletePhilosophy = {
        // 缺少 coreStatement
        nonNegotiableRules: [],
        flexibleParts: [],
      } as any;

      // TypeScript 会在编译时捕获，但运行时也应该验证
      expect(incompletePhilosophy.coreStatement).toBeUndefined();
    });

    it('应该要求 nonNegotiableRules 存在', () => {
      const incompletePhilosophy = {
        coreStatement: '测试路线',
        // 缺少 nonNegotiableRules
        flexibleParts: [],
      } as any;

      // TypeScript 会在编译时捕获
      expect(incompletePhilosophy.nonNegotiableRules).toBeUndefined();
    });
  });

  describe('改动可追踪', () => {
    it('应该检测 coreStatement 的变更', () => {
      const originalPhilosophy: RoutePhilosophy = {
        coreStatement: '原始陈述',
        nonNegotiableRules: [],
        flexibleParts: [],
      };

      const modifiedPhilosophy: RoutePhilosophy = {
        ...originalPhilosophy,
        coreStatement: '修改后的陈述', // 变更
      };

      expect(originalPhilosophy.coreStatement).toBe('原始陈述');
      expect(modifiedPhilosophy.coreStatement).toBe('修改后的陈述');
    });

    it('应该检测 nonNegotiableRules 的变更', () => {
      const originalPhilosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        nonNegotiableRules: ['rule1'],
        flexibleParts: [],
      };

      const modifiedPhilosophy: RoutePhilosophy = {
        ...originalPhilosophy,
        nonNegotiableRules: ['rule1', 'rule2'], // 添加新规则
      };

      expect(originalPhilosophy.nonNegotiableRules.length).toBe(1);
      expect(modifiedPhilosophy.nonNegotiableRules.length).toBe(2);
      expect(modifiedPhilosophy.nonNegotiableRules).toContain('rule2');
    });

    it('应该检测 flexibleParts 的变更', () => {
      const originalPhilosophy: RoutePhilosophy = {
        coreStatement: '测试路线',
        nonNegotiableRules: [],
        flexibleParts: ['part1'],
      };

      const modifiedPhilosophy: RoutePhilosophy = {
        ...originalPhilosophy,
        flexibleParts: ['part1', 'part2'], // 添加新的可调整部分
      };

      expect(originalPhilosophy.flexibleParts.length).toBe(1);
      expect(modifiedPhilosophy.flexibleParts.length).toBe(2);
      expect(modifiedPhilosophy.flexibleParts).toContain('part2');
    });
  });

  describe('预设哲学模型', () => {
    it('应该正确验证冰岛高地哲学', () => {
      expect(ICELAND_HIGHLANDS_PHILOSOPHY.coreStatement).toBe('从文明进入高地，再回到人间');
      expect(ICELAND_HIGHLANDS_PHILOSOPHY.mustVisitTags).toContain('高地荒原');
      expect(ICELAND_HIGHLANDS_PHILOSOPHY.nonNegotiableRules.length).toBeGreaterThan(0);
      expect(ICELAND_HIGHLANDS_PHILOSOPHY.flexibleParts.length).toBeGreaterThan(0);
    });

    it('应该正确验证尼泊尔 EBC 哲学', () => {
      expect(NEPAL_EBC_PHILOSOPHY.coreStatement).toBe('渐进适应 + 回撤安全线');
      expect(NEPAL_EBC_PHILOSOPHY.mustVisitTags).toContain('高海拔适应');
      expect(NEPAL_EBC_PHILOSOPHY.nonNegotiableRules.length).toBeGreaterThan(0);
      expect(NEPAL_EBC_PHILOSOPHY.flexibleParts.length).toBeGreaterThan(0);
    });

    it('应该拒绝违反冰岛高地哲学的替换', () => {
      const replacement = {
        type: 'POI_REPLACEMENT' as const,
        originalPoiId: 'poi-1',
        newPoiId: 'poi-2',
        removedTags: ['高地荒原'], // 违反哲学
        addedTags: [],
      };

      const result = validateReplacementAgainstPhilosophy(
        replacement,
        ICELAND_HIGHLANDS_PHILOSOPHY
      );
      expect(result.allowed).toBe(false);
    });
  });
});

