"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DEGRADATION_STRATEGY = void 0;
exports.assessDataQuality = assessDataQuality;
exports.assessPlanReliability = assessPlanReliability;
exports.DEFAULT_DEGRADATION_STRATEGY = {
    unknownOpeningHours: 'mark_verify',
    unreliableTravelTime: {
        bufferMultiplier: 1.5,
        reduceDensity: true,
    },
    uncertainWeather: {
        outdoorActivityPenalty: 0.3,
        preferIndoorAlternatives: true,
    },
};
function assessDataQuality(source, freshness) {
    if (source === 'api_verified' && (!freshness || freshness < 3600)) {
        return 'high';
    }
    if (source === 'database_cached' && freshness && freshness < 86400) {
        return 'medium';
    }
    if (source === 'inferred' || source === 'default') {
        return 'low';
    }
    if (source === 'unknown') {
        return 'unknown';
    }
    return 'medium';
}
function assessPlanReliability(qualityMap) {
    const reasons = [];
    const missingDataFields = [];
    const assumptions = [];
    let hasHighConfidence = false;
    let hasLowConfidence = false;
    for (const [field, quality] of Object.entries(qualityMap)) {
        if (quality.confidence === 'unknown') {
            missingDataFields.push(field);
            assumptions.push({
                field,
                assumption: getDefaultAssumption(field),
                impact: getFieldImpact(field),
            });
        }
        else if (quality.confidence === 'high') {
            hasHighConfidence = true;
        }
        else if (quality.confidence === 'low') {
            hasLowConfidence = true;
            reasons.push(`${field} 数据置信度较低 (${quality.source})`);
        }
    }
    let level;
    if (missingDataFields.length === 0 && hasHighConfidence && !hasLowConfidence) {
        level = 'A';
        reasons.push('所有关键数据均可用且可靠');
    }
    else if (missingDataFields.length <= 2 && hasHighConfidence) {
        level = 'B';
        reasons.push('大部分数据可用，部分字段需要推断');
    }
    else {
        level = 'C';
        reasons.push('关键数据缺失，计划基于假设生成');
    }
    return {
        level,
        reasons,
        missingDataFields,
        assumptions,
    };
}
function getDefaultAssumption(field) {
    const assumptions = {
        openingHours: '假设全天开放，需现场确认',
        duration: '使用平均停留时长估算',
        cost: '使用历史平均价格估算',
        travelTime: '使用距离估算，可能不准确',
        weatherSensitivity: '假设为中等敏感度',
    };
    return assumptions[field] || '使用默认值';
}
function getFieldImpact(field) {
    const highImpact = ['openingHours', 'travelTime'];
    const mediumImpact = ['duration', 'cost'];
    if (highImpact.includes(field))
        return 'high';
    if (mediumImpact.includes(field))
        return 'medium';
    return 'low';
}
//# sourceMappingURL=data-quality.model.js.map