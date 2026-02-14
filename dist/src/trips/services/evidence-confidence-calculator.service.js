"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EvidenceConfidenceCalculator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceConfidenceCalculator = void 0;
const common_1 = require("@nestjs/common");
const evidence_dto_1 = require("../dto/evidence.dto");
let EvidenceConfidenceCalculator = EvidenceConfidenceCalculator_1 = class EvidenceConfidenceCalculator {
    constructor() {
        this.logger = new common_1.Logger(EvidenceConfidenceCalculator_1.name);
        this.SOURCE_RELIABILITY_MAP = {
            'Google Places API': 0.9,
            'apis.is': 0.85,
            'road.is': 0.85,
            'WeatherAPI.com': 0.8,
            'OpenWeather': 0.75,
            '高德地图API': 0.8,
            'Gaode Maps API': 0.8,
            '决策日志': 0.7,
            'Decision Log': 0.7,
        };
    }
    calculateConfidence(item) {
        var _a;
        let confidence = 0.5;
        const factors = [];
        const sourceReliability = this.getSourceReliability(item.source);
        confidence += sourceReliability * 0.3;
        if (sourceReliability >= 0.8) {
            factors.push('数据来源可靠');
        }
        else if (sourceReliability < 0.5) {
            factors.push('数据来源可靠性较低');
        }
        if (item.freshness) {
            const freshnessScore = this.getFreshnessScore(item.freshness.freshnessStatus);
            confidence += freshnessScore * 0.3;
            if (item.freshness.freshnessStatus === evidence_dto_1.EvidenceFreshnessStatus.FRESH) {
                factors.push('数据新鲜');
            }
            else if (item.freshness.freshnessStatus === evidence_dto_1.EvidenceFreshnessStatus.EXPIRED) {
                factors.push('数据已过期');
            }
            else {
                factors.push('数据较旧');
            }
        }
        else {
            confidence += 0.1;
        }
        const crossValidationCount = ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.crossValidationCount) || 0;
        if (crossValidationCount > 0) {
            const multiSourceScore = Math.min(0.2, crossValidationCount * 0.05);
            confidence += multiSourceScore;
            if (crossValidationCount >= 2) {
                factors.push('多源验证');
            }
        }
        const completenessScore = this.getCompletenessScore(item);
        confidence += completenessScore * 0.1;
        if (completenessScore >= 0.8) {
            factors.push('数据完整');
        }
        else if (completenessScore < 0.5) {
            factors.push('数据不完整');
        }
        confidence = Math.max(0, Math.min(1, confidence));
        let level;
        if (confidence >= 0.75) {
            level = evidence_dto_1.EvidenceConfidenceLevel.HIGH;
        }
        else if (confidence >= 0.5) {
            level = evidence_dto_1.EvidenceConfidenceLevel.MEDIUM;
        }
        else {
            level = evidence_dto_1.EvidenceConfidenceLevel.LOW;
        }
        if (factors.length === 0) {
            factors.push('基础置信度');
        }
        return {
            score: confidence,
            level,
            factors,
        };
    }
    getSourceReliability(source) {
        if (!source) {
            return 0.5;
        }
        if (this.SOURCE_RELIABILITY_MAP[source]) {
            return this.SOURCE_RELIABILITY_MAP[source];
        }
        for (const [key, reliability] of Object.entries(this.SOURCE_RELIABILITY_MAP)) {
            if (source.toLowerCase().includes(key.toLowerCase())) {
                return reliability;
            }
        }
        return 0.5;
    }
    getFreshnessScore(status) {
        const scoreMap = {
            [evidence_dto_1.EvidenceFreshnessStatus.FRESH]: 0.3,
            [evidence_dto_1.EvidenceFreshnessStatus.STALE]: 0.1,
            [evidence_dto_1.EvidenceFreshnessStatus.EXPIRED]: -0.2,
        };
        return scoreMap[status] || 0;
    }
    getCompletenessScore(item) {
        var _a, _b, _c;
        let score = 0;
        let maxScore = 0;
        if (item.title) {
            score += 1;
            maxScore += 1;
        }
        if (item.description) {
            score += 1;
            maxScore += 1;
        }
        if (item.source) {
            score += 1;
            maxScore += 1;
        }
        if (item.timestamp) {
            score += 1;
            maxScore += 1;
        }
        if (item.type === evidence_dto_1.EvidenceType.OPENING_HOURS && ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.openingHours)) {
            score += 1;
            maxScore += 1;
        }
        if (item.type === evidence_dto_1.EvidenceType.WEATHER && ((_b = item.metadata) === null || _b === void 0 ? void 0 : _b.weatherInfo)) {
            score += 1;
            maxScore += 1;
        }
        if (item.type === evidence_dto_1.EvidenceType.ROAD_CLOSURE && ((_c = item.metadata) === null || _c === void 0 ? void 0 : _c.roadStatus)) {
            score += 1;
            maxScore += 1;
        }
        return maxScore > 0 ? score / maxScore : 0.5;
    }
};
exports.EvidenceConfidenceCalculator = EvidenceConfidenceCalculator;
exports.EvidenceConfidenceCalculator = EvidenceConfidenceCalculator = EvidenceConfidenceCalculator_1 = __decorate([
    (0, common_1.Injectable)()
], EvidenceConfidenceCalculator);
//# sourceMappingURL=evidence-confidence-calculator.service.js.map