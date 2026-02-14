"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_PERSONA_MAPPING_CONFIG = void 0;
exports.mapUserPersonaToDecisionParams = mapUserPersonaToDecisionParams;
exports.extractPersonaKeywordsFromPreferences = extractPersonaKeywordsFromPreferences;
exports.USER_PERSONA_MAPPING_CONFIG = [
    {
        keywords: {
            pace: ['slow', 'relaxed'],
            preferences: ['photography'],
        },
        decisionParams: {
            maxDailyAscentM: 600,
            rollingAscent3DaysM: 1500,
            maxSlopePct: 20,
            weatherRiskWeight: 0.6,
            bufferDayBias: 'HIGH',
            riskTolerance: 'LOW',
        },
        description: '慢节奏+摄影：低爬升、高缓冲、天气敏感',
    },
    {
        keywords: {
            fitness: ['high', 'extreme'],
            preferences: ['hiking', 'adventure'],
        },
        decisionParams: {
            maxDailyAscentM: 1200,
            rollingAscent3DaysM: 3000,
            maxSlopePct: 30,
            weatherRiskWeight: 0.4,
            bufferDayBias: 'LOW',
            riskTolerance: 'HIGH',
        },
        description: '强体能徒步：高爬升、低缓冲、高风险容忍',
    },
    {
        keywords: {
            preferences: ['culture', 'comfort'],
            pace: ['relaxed', 'normal'],
        },
        decisionParams: {
            maxDailyAscentM: 400,
            rollingAscent3DaysM: 1000,
            maxSlopePct: 15,
            weatherRiskWeight: 0.5,
            bufferDayBias: 'MEDIUM',
            riskTolerance: 'LOW',
        },
        description: '文化探索+舒适：极低爬升、中等缓冲、低风险',
    },
    {
        keywords: {
            preferences: ['nature'],
            pace: ['normal'],
            fitness: ['medium'],
        },
        decisionParams: {
            maxDailyAscentM: 800,
            rollingAscent3DaysM: 2000,
            maxSlopePct: 25,
            weatherRiskWeight: 0.5,
            bufferDayBias: 'MEDIUM',
            riskTolerance: 'MEDIUM',
        },
        description: '自然探索+中等节奏：中等爬升、中等缓冲',
    },
    {
        keywords: {
            preferences: ['adventure'],
            pace: ['fast', 'intense'],
            riskTolerance: ['high'],
        },
        decisionParams: {
            maxDailyAscentM: 1000,
            rollingAscent3DaysM: 2500,
            maxSlopePct: 28,
            weatherRiskWeight: 0.3,
            bufferDayBias: 'LOW',
            riskTolerance: 'HIGH',
        },
        description: '冒险+快节奏：高爬升、低缓冲、高风险容忍',
    },
    {
        keywords: {},
        decisionParams: {
            maxDailyAscentM: 800,
            rollingAscent3DaysM: 2000,
            maxSlopePct: 25,
            weatherRiskWeight: 0.5,
            bufferDayBias: 'MEDIUM',
            riskTolerance: 'MEDIUM',
        },
        description: '默认配置：中等爬升、中等缓冲、中等风险容忍',
    },
];
function mapUserPersonaToDecisionParams(keywords) {
    let bestMatch = null;
    let bestScore = 0;
    for (const rule of exports.USER_PERSONA_MAPPING_CONFIG) {
        if (Object.keys(rule.keywords).length === 0) {
            if (!bestMatch) {
                bestMatch = rule;
            }
            continue;
        }
        let score = 0;
        let totalFields = 0;
        if (rule.keywords.pace && keywords.pace) {
            totalFields++;
            if (rule.keywords.pace.some(p => { var _a; return (_a = keywords.pace) === null || _a === void 0 ? void 0 : _a.includes(p); })) {
                score++;
            }
        }
        if (rule.keywords.preferences && keywords.preferences) {
            totalFields++;
            if (rule.keywords.preferences.some(p => { var _a; return (_a = keywords.preferences) === null || _a === void 0 ? void 0 : _a.includes(p); })) {
                score++;
            }
        }
        if (rule.keywords.riskTolerance && keywords.riskTolerance) {
            totalFields++;
            if (rule.keywords.riskTolerance.some(r => { var _a; return (_a = keywords.riskTolerance) === null || _a === void 0 ? void 0 : _a.includes(r); })) {
                score++;
            }
        }
        if (rule.keywords.fitness && keywords.fitness) {
            totalFields++;
            if (rule.keywords.fitness.some(f => { var _a; return (_a = keywords.fitness) === null || _a === void 0 ? void 0 : _a.includes(f); })) {
                score++;
            }
        }
        const matchRate = totalFields > 0 ? score / totalFields : 0;
        if (matchRate > bestScore) {
            bestScore = matchRate;
            bestMatch = rule;
        }
    }
    const defaultParams = {
        maxDailyAscentM: 800,
        rollingAscent3DaysM: 2000,
        maxSlopePct: 25,
        weatherRiskWeight: 0.5,
        bufferDayBias: 'MEDIUM',
        riskTolerance: 'MEDIUM',
    };
    return {
        ...defaultParams,
        ...((bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.decisionParams) || {}),
    };
}
function extractPersonaKeywordsFromPreferences(preferences) {
    const keywords = {};
    if (preferences.pace) {
        const paceLower = preferences.pace.toLowerCase();
        if (paceLower.includes('slow') || paceLower.includes('relaxed')) {
            keywords.pace = ['slow', 'relaxed'];
        }
        else if (paceLower.includes('fast') || paceLower.includes('intense')) {
            keywords.pace = ['fast', 'intense'];
        }
        else {
            keywords.pace = ['normal'];
        }
    }
    if (preferences.preferences && preferences.preferences.length > 0) {
        keywords.preferences = preferences.preferences.map(p => {
            const pLower = p.toLowerCase();
            if (pLower.includes('摄影') || pLower.includes('photo'))
                return 'photography';
            if (pLower.includes('徒步') || pLower.includes('hiking'))
                return 'hiking';
            if (pLower.includes('文化') || pLower.includes('culture'))
                return 'culture';
            if (pLower.includes('自然') || pLower.includes('nature'))
                return 'nature';
            if (pLower.includes('冒险') || pLower.includes('adventure'))
                return 'adventure';
            if (pLower.includes('舒适') || pLower.includes('comfort'))
                return 'comfort';
            return null;
        }).filter((p) => p !== null);
    }
    if (preferences.riskTolerance) {
        const rtLower = preferences.riskTolerance.toLowerCase();
        if (rtLower.includes('low')) {
            keywords.riskTolerance = ['low'];
        }
        else if (rtLower.includes('high')) {
            keywords.riskTolerance = ['high'];
        }
        else {
            keywords.riskTolerance = ['medium'];
        }
    }
    if (preferences.fitness) {
        const fitLower = preferences.fitness.toLowerCase();
        if (fitLower.includes('low')) {
            keywords.fitness = ['low'];
        }
        else if (fitLower.includes('high') || fitLower.includes('extreme')) {
            keywords.fitness = ['high', 'extreme'];
        }
        else {
            keywords.fitness = ['medium'];
        }
    }
    return keywords;
}
//# sourceMappingURL=user-persona-mapping.config.js.map