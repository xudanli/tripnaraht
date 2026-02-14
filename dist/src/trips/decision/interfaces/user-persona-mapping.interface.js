"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserPersonaMappingService = void 0;
class UserPersonaMappingService {
    static mapPreferenceToParams(preference, baseParams) {
        var _a, _b, _c, _d;
        const base = {
            maxDailyAscentM: 1000,
            rollingAscent3DaysThreshold: 2500,
            weatherRiskWeight: 0.5,
            maxSlopeTolerance: 25,
            bufferDayBias: 0.3,
            sunriseSunsetWindowWeight: 0.2,
            corridorQualityWeight: 0.5,
            ...baseParams,
        };
        if (preference.pace === 'relaxed') {
            base.maxDailyAscentM *= 0.7;
            base.rollingAscent3DaysThreshold *= 0.8;
            base.bufferDayBias = 0.6;
            base.maxSlopeTolerance *= 0.8;
        }
        else if (preference.pace === 'intense') {
            base.maxDailyAscentM *= 1.2;
            base.rollingAscent3DaysThreshold *= 1.1;
            base.bufferDayBias = 0.1;
        }
        if (preference.riskTolerance === 'low') {
            base.weatherRiskWeight = 0.8;
            base.maxSlopeTolerance *= 0.7;
            base.bufferDayBias = 0.7;
        }
        else if (preference.riskTolerance === 'high') {
            base.weatherRiskWeight = 0.3;
            base.maxSlopeTolerance *= 1.2;
        }
        if ((_a = preference.interests) === null || _a === void 0 ? void 0 : _a.includes('摄影')) {
            base.sunriseSunsetWindowWeight = 0.7;
            base.corridorQualityWeight = 0.8;
        }
        if ((_b = preference.interests) === null || _b === void 0 ? void 0 : _b.includes('徒步')) {
            base.maxSlopeTolerance *= 1.1;
        }
        if ((_c = preference.specialNeeds) === null || _c === void 0 ? void 0 : _c.includes('轻松')) {
            base.maxDailyAscentM *= 0.6;
            base.maxSlopeTolerance *= 0.6;
            base.bufferDayBias = 0.8;
        }
        if ((_d = preference.specialNeeds) === null || _d === void 0 ? void 0 : _d.includes('挑战')) {
            base.maxDailyAscentM *= 1.3;
            base.rollingAscent3DaysThreshold *= 1.2;
            base.bufferDayBias = 0.1;
        }
        return base;
    }
    static getPreferenceDescription(preference) {
        const parts = [];
        if (preference.pace) {
            parts.push(`节奏: ${preference.pace === 'relaxed' ? '慢' : preference.pace === 'intense' ? '快' : '中等'}`);
        }
        if (preference.riskTolerance) {
            parts.push(`风险容忍: ${preference.riskTolerance === 'low' ? '低' : preference.riskTolerance === 'high' ? '高' : '中'}`);
        }
        if (preference.interests && preference.interests.length > 0) {
            parts.push(`兴趣: ${preference.interests.join(', ')}`);
        }
        return parts.join(' | ');
    }
}
exports.UserPersonaMappingService = UserPersonaMappingService;
//# sourceMappingURL=user-persona-mapping.interface.js.map