// src/trips/decision/evaluation/e2e-cases/iceland-highlands.example.ts
/**
 * 冰岛高地 E2E Case 示例
 * 
 * 这是一个示例 E2E Case，用于测试冰岛高地路线的决策流程
 */

import { E2ECase } from '../e2e-case.types';

export const icelandHighlandsCase: E2ECase = {
  id: 'iceland-highlands-001',
  name: '冰岛高地路线 - 中等强度用户',
  description: '测试中等强度用户在夏季（7月）选择冰岛高地路线的决策流程',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      travelPhilosophy: 'adventure',
      preferredRouteTypes: ['highlands', 'nature', 'hiking'],
    },
    season: 7, // 7月
    countryCode: 'IS',
    userQuery: '我想在7月去冰岛高地，中等强度，7天行程',
  },
  expected: {
    routeDirectionId: undefined, // 不指定具体路线，让系统选择
    routeDirectionTags: ['highlands', 'nature'],
    abuExpected: {
      action: 'ALLOW', // 预期通过安全检查
      reasonCodes: [],
    },
    drdreExpected: {
      mustAdjust: false, // 中等强度用户，预期不需要调整
    },
    neptuneExpected: {
      mustRepair: false, // 预期不需要空间修复
    },
    finalState: {
      allowed: true,
      planDays: 7,
    },
  },
  metadata: {
    tags: ['iceland', 'highlands', 'summer'],
    priority: 'P1',
    source: 'iceland-highlands',
    description: '冰岛高地路线 E2E 测试用例',
  },
};

/**
 * 冰岛高地 - DEM 缺失场景
 */
export const icelandHighlandsDemMissingCase: E2ECase = {
  id: 'iceland-highlands-dem-missing-001',
  name: '冰岛高地路线 - DEM 缺失场景',
  description: '测试当 DEM Evidence 缺失时，Abu 必须 REJECT',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'MEDIUM',
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '我想在7月去冰岛高地',
  },
  expected: {
    abuExpected: {
      action: 'REJECT',
      reasonCodes: ['E_DEM_MISSING'], // 必须包含 DEM 缺失错误码
      violations: ['DEM Evidence'],
    },
    finalState: {
      allowed: false,
    },
  },
  metadata: {
    tags: ['iceland', 'highlands', 'dem-missing'],
    priority: 'P0',
    source: 'iceland-highlands',
  },
};

/**
 * 冰岛高地 - 需要节奏调整场景
 */
export const icelandHighlandsPaceAdjustCase: E2ECase = {
  id: 'iceland-highlands-pace-adjust-001',
  name: '冰岛高地路线 - 需要节奏调整',
  description: '测试高强度用户在连续高爬升场景下，Dr.Dre 必须插入缓冲日',
  input: {
    userProfile: {
      pacePreference: 'FAST',
      altitudeTolerance: 'HIGH',
      riskTolerance: 'HIGH',
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '我想在7月去冰岛高地，高强度，10天行程',
  },
  expected: {
    abuExpected: {
      action: 'ALLOW',
    },
    drdreExpected: {
      mustAdjust: true, // 预期需要调整
      adjustmentTypes: ['BUFFER_DAY'], // 预期插入缓冲日
    },
    finalState: {
      allowed: true,
      planDays: 10,
    },
  },
  metadata: {
    tags: ['iceland', 'highlands', 'pace-adjust'],
    priority: 'P1',
    source: 'iceland-highlands',
  },
};
