// src/route-directions/__tests__/route-direction-regression.test-data.ts
/**
 * RouteDirection 回归测试用例库
 * 
 * 30 条用例，覆盖 NZ/NP/XZ 三个国家
 */

export interface RegressionTestCase {
  id: string;
  name: string;
  input: {
    country: string;
    month: number;
    preferences: string[];
    pace: 'relaxed' | 'moderate' | 'intense';
    riskTolerance: 'low' | 'medium' | 'high';
    durationDays: number;
  };
  expected: {
    top1RouteDirectionId?: string; // 期望的 Top 1 路线方向 ID（可选，因为可能变化）
    top1RouteDirectionName: string; // 期望的 Top 1 路线方向名称
    riskFlags: string[]; // 期望的风险标志
    shouldInsertAcclimatizationDays: boolean; // 是否应该插入适应日
    shouldSplitDays: boolean; // 是否应该拆天
    minScore: number; // 最低分数阈值
  };
  tolerance: {
    ascentErrorM?: number; // 爬升误差允许范围（米）
    maxElevationErrorM?: number; // 最大海拔误差允许范围（米）
  };
}

export const regressionTestCases: RegressionTestCase[] = [
  // ========== 新西兰 (NZ) - 10 条用例 ==========
  {
    id: 'NZ_001',
    name: 'NZ 南岛湖区 - 徒步+摄影 - 1月',
    input: {
      country: 'NZ',
      month: 1,
      preferences: ['徒步', '摄影', '湖区'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 7,
    },
    expected: {
      top1RouteDirectionName: 'NZ_SOUTH_ISLAND_LAKES_AND_PASSES',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 70,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'NZ_002',
    name: 'NZ 峡湾出海 - 出海+摄影 - 2月',
    input: {
      country: 'NZ',
      month: 2,
      preferences: ['出海', '摄影'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'NZ_FIORDLAND_MILFORD',
      riskFlags: ['ferryDependent'],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 75,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NZ_003',
    name: 'NZ 北岛火山 - 火山+地热 - 3月',
    input: {
      country: 'NZ',
      month: 3,
      preferences: ['火山', '地热'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'NZ_NORTH_ISLAND_VOLCANIC',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 70,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 300,
    },
  },
  {
    id: 'NZ_004',
    name: 'NZ 南岛湖区 - 徒步 - 7月（冬季，应避免）',
    input: {
      country: 'NZ',
      month: 7,
      preferences: ['徒步'],
      pace: 'intense',
      riskTolerance: 'high',
      durationDays: 7,
    },
    expected: {
      top1RouteDirectionName: 'NZ_SOUTH_ISLAND_LAKES_AND_PASSES',
      riskFlags: ['roadClosure', 'weatherWindow'],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 50, // 冬季分数会降低
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'NZ_005',
    name: 'NZ 峡湾 - 出海 - 12月（夏季最佳）',
    input: {
      country: 'NZ',
      month: 12,
      preferences: ['出海'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 3,
    },
    expected: {
      top1RouteDirectionName: 'NZ_FIORDLAND_MILFORD',
      riskFlags: ['ferryDependent'],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 80,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NZ_006',
    name: 'NZ 南岛 - 摄影 - 无偏好',
    input: {
      country: 'NZ',
      month: 1,
      preferences: ['摄影'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'NZ_SOUTH_ISLAND_LAKES_AND_PASSES',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 60,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'NZ_007',
    name: 'NZ 北岛 - 地热 - 轻松节奏',
    input: {
      country: 'NZ',
      month: 2,
      preferences: ['地热'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 3,
    },
    expected: {
      top1RouteDirectionName: 'NZ_NORTH_ISLAND_VOLCANIC',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 65,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'NZ_008',
    name: 'NZ 南岛 - 徒步+摄影 - 紧凑节奏',
    input: {
      country: 'NZ',
      month: 1,
      preferences: ['徒步', '摄影'],
      pace: 'intense',
      riskTolerance: 'high',
      durationDays: 10,
    },
    expected: {
      top1RouteDirectionName: 'NZ_SOUTH_ISLAND_LAKES_AND_PASSES',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: true, // 紧凑节奏可能需要拆天
      minScore: 70,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'NZ_009',
    name: 'NZ 峡湾 - 出海 - 低风险承受度',
    input: {
      country: 'NZ',
      month: 1,
      preferences: ['出海'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'NZ_FIORDLAND_MILFORD',
      riskFlags: ['ferryDependent'],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 75,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NZ_010',
    name: 'NZ 南岛 - 湖区 - 高风险承受度',
    input: {
      country: 'NZ',
      month: 1,
      preferences: ['湖区', '徒步'],
      pace: 'intense',
      riskTolerance: 'high',
      durationDays: 7,
    },
    expected: {
      top1RouteDirectionName: 'NZ_SOUTH_ISLAND_LAKES_AND_PASSES',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 70,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },

  // ========== 尼泊尔 (NP) - 10 条用例 ==========
  {
    id: 'NP_001',
    name: 'NP EBC - 徒步+高海拔 - 10月',
    input: {
      country: 'NP',
      month: 10,
      preferences: ['徒步', '高海拔'],
      pace: 'moderate',
      riskTolerance: 'high',
      durationDays: 10,
    },
    expected: {
      top1RouteDirectionName: 'NP_EBC_CLASSIC',
      riskFlags: ['altitudeSickness', 'rapidAscentForbidden'],
      shouldInsertAcclimatizationDays: true, // EBC 必须插入适应日
      shouldSplitDays: true,
      minScore: 80,
    },
    tolerance: {
      ascentErrorM: 50, // EBC 对爬升要求严格
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NP_002',
    name: 'NP ABC - 徒步 - 11月',
    input: {
      country: 'NP',
      month: 11,
      preferences: ['徒步'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 7,
    },
    expected: {
      top1RouteDirectionName: 'NP_ANNAPURNA_BASE_CAMP',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 75,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'NP_003',
    name: 'NP 奇特旺 - 野生动物 - 1月',
    input: {
      country: 'NP',
      month: 1,
      preferences: ['野生动物', '丛林'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'NP_CHITWAN_WILDLIFE',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 80,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NP_004',
    name: 'NP EBC - 徒步 - 6月（雨季，应避免）',
    input: {
      country: 'NP',
      month: 6,
      preferences: ['徒步'],
      pace: 'moderate',
      riskTolerance: 'high',
      durationDays: 10,
    },
    expected: {
      top1RouteDirectionName: 'NP_EBC_CLASSIC',
      riskFlags: ['altitudeSickness', 'weatherWindow'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: true,
      minScore: 50, // 雨季分数会降低
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NP_005',
    name: 'NP ABC - 徒步 - 4月（最佳季节）',
    input: {
      country: 'NP',
      month: 4,
      preferences: ['徒步'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 7,
    },
    expected: {
      top1RouteDirectionName: 'NP_ANNAPURNA_BASE_CAMP',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 85,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'NP_006',
    name: 'NP EBC - 低风险承受度（应降级或警告）',
    input: {
      country: 'NP',
      month: 10,
      preferences: ['徒步'],
      pace: 'moderate',
      riskTolerance: 'low',
      durationDays: 10,
    },
    expected: {
      top1RouteDirectionName: 'NP_EBC_CLASSIC',
      riskFlags: ['altitudeSickness', 'rapidAscentForbidden'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: true,
      minScore: 60, // 低风险承受度会降低分数
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NP_007',
    name: 'NP 奇特旺 - 野生动物 - 轻松节奏',
    input: {
      country: 'NP',
      month: 12,
      preferences: ['野生动物'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 3,
    },
    expected: {
      top1RouteDirectionName: 'NP_CHITWAN_WILDLIFE',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 80,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NP_008',
    name: 'NP EBC - 紧凑节奏（应拆天）',
    input: {
      country: 'NP',
      month: 10,
      preferences: ['徒步'],
      pace: 'intense',
      riskTolerance: 'high',
      durationDays: 7,
    },
    expected: {
      top1RouteDirectionName: 'NP_EBC_CLASSIC',
      riskFlags: ['altitudeSickness', 'rapidAscentForbidden'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: true,
      minScore: 70,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'NP_009',
    name: 'NP ABC - 徒步 - 3月',
    input: {
      country: 'NP',
      month: 3,
      preferences: ['徒步'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'NP_ANNAPURNA_BASE_CAMP',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 80,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'NP_010',
    name: 'NP 奇特旺 - 摄影 - 2月',
    input: {
      country: 'NP',
      month: 2,
      preferences: ['摄影', '野生动物'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 4,
    },
    expected: {
      top1RouteDirectionName: 'NP_CHITWAN_WILDLIFE',
      riskFlags: [],
      shouldInsertAcclimatizationDays: false,
      shouldSplitDays: false,
      minScore: 75,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },

  // ========== 西藏 (CN_XZ) - 10 条用例 ==========
  {
    id: 'XZ_001',
    name: 'XZ 拉萨适应环 - 适应+文化 - 6月',
    input: {
      country: 'CN_XZ',
      month: 6,
      preferences: ['适应', '文化'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 3,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_LHASA_RING',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 80,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'XZ_002',
    name: 'XZ 拉萨-日喀则 - 文化+摄影 - 7月',
    input: {
      country: 'CN_XZ',
      month: 7,
      preferences: ['文化', '摄影'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_SHIGATSE_CORRIDOR',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 75,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'XZ_003',
    name: 'XZ 珠峰入口 - 高海拔+极地 - 5月',
    input: {
      country: 'CN_XZ',
      month: 5,
      preferences: ['高海拔', '极地'],
      pace: 'moderate',
      riskTolerance: 'high',
      durationDays: 7,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_EBC_GATE',
      riskFlags: ['altitudeSickness', 'requiresPermit', 'requiresGuide'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: true,
      minScore: 70,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'XZ_004',
    name: 'XZ 拉萨适应环 - 适应 - 12月（冬季，应避免）',
    input: {
      country: 'CN_XZ',
      month: 12,
      preferences: ['适应'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 3,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_LHASA_RING',
      riskFlags: ['altitudeSickness', 'roadClosure'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 50, // 冬季分数会降低
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'XZ_005',
    name: 'XZ 拉萨-日喀则 - 文化 - 9月（最佳季节）',
    input: {
      country: 'CN_XZ',
      month: 9,
      preferences: ['文化'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_SHIGATSE_CORRIDOR',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 85,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'XZ_006',
    name: 'XZ 珠峰入口 - 低风险承受度（应警告）',
    input: {
      country: 'CN_XZ',
      month: 5,
      preferences: ['高海拔'],
      pace: 'moderate',
      riskTolerance: 'low',
      durationDays: 7,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_EBC_GATE',
      riskFlags: ['altitudeSickness', 'requiresPermit', 'requiresGuide'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: true,
      minScore: 55, // 低风险承受度会大幅降低分数
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'XZ_007',
    name: 'XZ 拉萨适应环 - 轻松节奏',
    input: {
      country: 'CN_XZ',
      month: 6,
      preferences: ['适应'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 3,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_LHASA_RING',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 80,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
  {
    id: 'XZ_008',
    name: 'XZ 拉萨-日喀则 - 摄影 - 8月',
    input: {
      country: 'CN_XZ',
      month: 8,
      preferences: ['摄影', '文化'],
      pace: 'moderate',
      riskTolerance: 'medium',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_SHIGATSE_CORRIDOR',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 75,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'XZ_009',
    name: 'XZ 珠峰入口 - 紧凑节奏',
    input: {
      country: 'CN_XZ',
      month: 5,
      preferences: ['高海拔'],
      pace: 'intense',
      riskTolerance: 'high',
      durationDays: 5,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_EBC_GATE',
      riskFlags: ['altitudeSickness', 'requiresPermit', 'requiresGuide'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: true,
      minScore: 65,
    },
    tolerance: {
      ascentErrorM: 100,
      maxElevationErrorM: 200,
    },
  },
  {
    id: 'XZ_010',
    name: 'XZ 拉萨适应环 - 文化 - 10月',
    input: {
      country: 'CN_XZ',
      month: 10,
      preferences: ['文化'],
      pace: 'relaxed',
      riskTolerance: 'low',
      durationDays: 3,
    },
    expected: {
      top1RouteDirectionName: 'CN_XZ_LHASA_RING',
      riskFlags: ['altitudeSickness'],
      shouldInsertAcclimatizationDays: true,
      shouldSplitDays: false,
      minScore: 80,
    },
    tolerance: {
      ascentErrorM: 50,
      maxElevationErrorM: 100,
    },
  },
];

