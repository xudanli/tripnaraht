"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EvidenceQualityScorer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceQualityScorer = void 0;
const common_1 = require("@nestjs/common");
const evidence_dto_1 = require("../dto/evidence.dto");
let EvidenceQualityScorer = EvidenceQualityScorer_1 = class EvidenceQualityScorer {
    constructor() {
        this.logger = new common_1.Logger(EvidenceQualityScorer_1.name);
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
    async calculateQualityScore(item) {
        var _a;
        const sourceReliability = this.getSourceReliability(item.source);
        const timeliness = item.freshness
            ? this.calculateTimelinessScore(item.freshness.freshnessStatus)
            : 0.5;
        const completeness = this.calculateCompletenessScore(item);
        const multiSourceVerification = ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.crossValidationCount)
            ? Math.min(1, item.metadata.crossValidationCount / 3)
            : 0;
        const overallScore = (sourceReliability * 0.3 +
            timeliness * 0.3 +
            completeness * 0.2 +
            multiSourceVerification * 0.2);
        const level = overallScore >= 0.8
            ? evidence_dto_1.EvidenceQualityLevel.HIGH
            : overallScore >= 0.6
                ? evidence_dto_1.EvidenceQualityLevel.MEDIUM
                : evidence_dto_1.EvidenceQualityLevel.LOW;
        const explanation = this.generateExplanation(overallScore, { sourceReliability, timeliness, completeness, multiSourceVerification }, level);
        return {
            overallScore,
            components: {
                sourceReliability,
                timeliness,
                completeness,
                multiSourceVerification,
            },
            level,
            explanation,
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
    calculateTimelinessScore(status) {
        const scoreMap = {
            [evidence_dto_1.EvidenceFreshnessStatus.FRESH]: 1.0,
            [evidence_dto_1.EvidenceFreshnessStatus.STALE]: 0.6,
            [evidence_dto_1.EvidenceFreshnessStatus.EXPIRED]: 0.2,
        };
        return scoreMap[status] || 0.5;
    }
    calculateCompletenessScore(item) {
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
    generateExplanation(overallScore, components, level) {
        const factors = [];
        if (components.sourceReliability >= 0.8) {
            factors.push('数据来源可靠');
        }
        if (components.timeliness >= 0.8) {
            factors.push('数据新鲜');
        }
        if (components.completeness >= 0.8) {
            factors.push('数据完整');
        }
        if (components.multiSourceVerification >= 0.6) {
            factors.push('多源验证');
        }
        const scorePercent = Math.round(overallScore * 100);
        if (factors.length === 0) {
            return `${level}质量：综合评分 ${scorePercent}/100`;
        }
        return `${level}质量：${factors.join('、')}，综合评分 ${scorePercent}/100`;
    }
};
exports.EvidenceQualityScorer = EvidenceQualityScorer;
exports.EvidenceQualityScorer = EvidenceQualityScorer = EvidenceQualityScorer_1 = __decorate([
    (0, common_1.Injectable)()
], EvidenceQualityScorer);
//# sourceMappingURL=evidence-quality-scorer.service.js.map