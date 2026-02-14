"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTREME_COUNTRY_TEMPLATE = exports.ICELAND_EXTREME_PROFILE = void 0;
exports.ICELAND_EXTREME_PROFILE = {
    countryCode: 'IS',
    countryName: 'Iceland',
    coreNature: ['火山', '冰川', '峡谷', '高纬度气候'],
    decisionPriority: [
        'WEATHER',
        'TERRAIN',
        'ROAD_ACCESS',
        'VEHICLE',
        'USER_PERSONA',
    ],
    agentDuties: {
        mustWarn: true,
        mustReject: true,
        mustProvideFallback: true,
        mustExplicitRisk: true,
    },
    routeStratification: [
        'SAFE_BASELINE',
        'ICONIC_BUT_SENSITIVE',
        'HIGH_RISK_INTERIOR',
    ],
    unacceptablePlans: [
        'NO_WEATHER_BUFFER',
        'NO_DEM_EVIDENCE',
        'NO_ALTERNATIVE_CORRIDOR',
    ],
    nonNegotiableFacts: [
        '天气可在 30 分钟内反转',
        'F-road ≠ 普通道路',
        '很多"能去"不等于"该去"',
    ],
};
exports.EXTREME_COUNTRY_TEMPLATE = {
    name: 'ExtremeCountryTemplate',
    description: '从冰岛抽象出的极端国家模板，适用于高风险、极端环境的旅行目的地',
    baseProfile: {
        coreNature: ['极端气候', '复杂地形', '高风险道路'],
        decisionPriority: [
            'WEATHER',
            'TERRAIN',
            'ROAD_ACCESS',
            'VEHICLE',
            'USER_PERSONA',
        ],
        agentDuties: {
            mustWarn: true,
            mustReject: true,
            mustProvideFallback: true,
            mustExplicitRisk: true,
        },
        routeStratification: [
            'SAFE_BASELINE',
            'ICONIC_BUT_SENSITIVE',
            'HIGH_RISK_INTERIOR',
        ],
        unacceptablePlans: [
            'NO_WEATHER_BUFFER',
            'NO_DEM_EVIDENCE',
            'NO_ALTERNATIVE_CORRIDOR',
        ],
        nonNegotiableFacts: [
            '天气可在短时间内反转',
            '特殊道路 ≠ 普通道路',
            '能去 ≠ 应该去',
        ],
    },
    adaptationRules: {
        countryCodePattern: ['IS', 'NZ', 'CL', 'US-AK', 'NO-N'],
        adaptProfile: (countryCode) => {
            const adaptations = {
                'NZ': {
                    coreNature: ['火山', '地热', '峡湾', '极端天气'],
                    nonNegotiableFacts: [
                        '天气变化快',
                        '某些道路需要 4WD',
                        '能去 ≠ 应该去',
                    ],
                },
                'CL': {
                    coreNature: ['巴塔哥尼亚', '极端风', '冰川', '偏远'],
                    nonNegotiableFacts: [
                        '风是主要风险',
                        '偏远地区救援困难',
                        '能去 ≠ 应该去',
                    ],
                },
                'US-AK': {
                    coreNature: ['极地气候', '荒野', '野生动物', '极端天气'],
                    nonNegotiableFacts: [
                        '天气极端',
                        '野生动物风险',
                        '能去 ≠ 应该去',
                    ],
                },
                'NO-N': {
                    coreNature: ['极地', '极端天气', '偏远'],
                    nonNegotiableFacts: [
                        '天气极端',
                        '偏远地区',
                        '能去 ≠ 应该去',
                    ],
                },
            };
            return adaptations[countryCode] || {};
        },
    },
};
//# sourceMappingURL=extreme-country-template.interface.js.map