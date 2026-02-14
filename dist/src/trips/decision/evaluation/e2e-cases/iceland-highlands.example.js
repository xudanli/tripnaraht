"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.icelandHighlandsPaceAdjustCase = exports.icelandHighlandsDemMissingCase = exports.icelandHighlandsCase = void 0;
exports.icelandHighlandsCase = {
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
        season: 7,
        countryCode: 'IS',
        userQuery: '我想在7月去冰岛高地，中等强度，7天行程',
    },
    expected: {
        routeDirectionId: undefined,
        routeDirectionTags: ['highlands', 'nature'],
        abuExpected: {
            action: 'ALLOW',
            reasonCodes: [],
        },
        drdreExpected: {
            mustAdjust: false,
        },
        neptuneExpected: {
            mustRepair: false,
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
exports.icelandHighlandsDemMissingCase = {
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
            reasonCodes: ['E_DEM_MISSING'],
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
exports.icelandHighlandsPaceAdjustCase = {
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
            mustAdjust: true,
            adjustmentTypes: ['BUFFER_DAY'],
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
//# sourceMappingURL=iceland-highlands.example.js.map