// src/trips/decision/models/route-philosophy.model.ts
/**
 * Route Philosophy Model（路线哲学模型）
 * 
 * 第一性原理：不可背叛的哲学（philosophy invariants）vs 可调整的自由度
 * 
 * 约束 Neptune：只在 flexibleParts 动刀，不动 coreStatement 对应的结构
 */

/**
 * 路线哲学
 * 
 * 区分：
 * - 不可背叛的哲学（philosophy invariants）
 * - 可调整的自由度
 */
export interface RoutePhilosophy {
  /** 核心陈述（一句话描述路线的本质） */
  coreStatement: string;

  /** 必须涵盖的体验类型（Neptune 不允许删除） */
  mustVisitTags?: string[];

  /** 不可协商的规则（Neptune 不允许打破的红线） */
  nonNegotiableRules: string[];

  /** 可灵活调整的部分（Neptune 可以动手脚的局部） */
  flexibleParts: string[];

  /** 天数弹性区间（如 7–10 天） */
  durationFlexibility?: {
    minDays: number;
    maxDays: number;
    preferredDays?: number;
  };

  /** 元数据（用于扩展） */
  metadata?: Record<string, any>;
}

/**
 * 示例：冰岛高地 F-Road 哲学
 */
export const ICELAND_HIGHLANDS_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '从文明进入高地，再回到人间',
  mustVisitTags: ['高地荒原', '温泉', '火山'],
  nonNegotiableRules: [
    '必须有一晚住高地 hut 或营地',
    '必须经过至少一个 F-road 路段',
    '必须从 Ring Road 进入高地，再回到 Ring Road',
  ],
  flexibleParts: [
    '具体 F-road 选择（F26 / F35 / F208）',
    '中间停留点（POI 可替换）',
    '天数（7-10 天范围内）',
  ],
  durationFlexibility: {
    minDays: 7,
    maxDays: 10,
    preferredDays: 8,
  },
};

/**
 * 示例：尼泊尔 EBC 哲学
 */
export const NEPAL_EBC_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '渐进适应 + 回撤安全线',
  mustVisitTags: ['高海拔适应', '珠峰大本营', '夏尔巴文化'],
  nonNegotiableRules: [
    '必须保证渐进适应（每天海拔上升不超过 500m）',
    '必须包含至少 2 个适应日',
    '必须保证回撤安全线（任何时候都能在 2 天内回到低海拔）',
  ],
  flexibleParts: [
    '具体适应点选择（Namche / Dingboche）',
    '侧线探索（Gokyo / Chhukung）',
    '天数（12-16 天范围内）',
  ],
  durationFlexibility: {
    minDays: 12,
    maxDays: 16,
    preferredDays: 14,
  },
};

/**
 * 验证替换操作是否违反路线哲学
 */
export function validateReplacementAgainstPhilosophy(
  replacement: {
    type: 'POI_REPLACEMENT' | 'SEGMENT_REPLACEMENT' | 'ENTRY_REPLACEMENT';
    originalPoiId?: string;
    newPoiId?: string;
    originalSegmentId?: string;
    newSegmentIds?: string[];
    removedTags?: string[];
    addedTags?: string[];
  },
  philosophy: RoutePhilosophy
): {
  allowed: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // 检查是否删除了 mustVisitTags
  if (replacement.removedTags && philosophy.mustVisitTags) {
    for (const removedTag of replacement.removedTags) {
      if (philosophy.mustVisitTags.includes(removedTag)) {
        violations.push(`不允许删除必须体验类型: ${removedTag}`);
      }
    }
  }

  // 检查是否违反了 nonNegotiableRules
  // 这里简化处理，实际应该更详细地检查替换操作
  // 例如：如果替换导致"必须有一晚住高地 hut"变成不可能，则违反

  return {
    allowed: violations.length === 0,
    violations,
  };
}

/**
 * 检查替换后的路线是否仍然覆盖核心体验
 */
export function checkCoreExperienceCoverage(
  currentTags: string[],
  philosophy: RoutePhilosophy
): {
  covered: boolean;
  missingTags: string[];
} {
  if (!philosophy.mustVisitTags || philosophy.mustVisitTags.length === 0) {
    return { covered: true, missingTags: [] };
  }

  const missingTags = philosophy.mustVisitTags.filter(
    tag => !currentTags.includes(tag)
  );

  return {
    covered: missingTags.length === 0,
    missingTags,
  };
}

