"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EvidenceCompletenessChecker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceCompletenessChecker = void 0;
const common_1 = require("@nestjs/common");
const evidence_dto_1 = require("../dto/evidence.dto");
let EvidenceCompletenessChecker = EvidenceCompletenessChecker_1 = class EvidenceCompletenessChecker {
    constructor() {
        this.logger = new common_1.Logger(EvidenceCompletenessChecker_1.name);
        this.CATEGORY_EVIDENCE_MAP = {
            'ATTRACTION': [evidence_dto_1.EvidenceType.OPENING_HOURS, evidence_dto_1.EvidenceType.WEATHER],
            'RESTAURANT': [evidence_dto_1.EvidenceType.OPENING_HOURS],
            'ACCOMMODATION': [evidence_dto_1.EvidenceType.BOOKING],
            'TRANSPORT': [evidence_dto_1.EvidenceType.ROAD_CLOSURE],
            'NATURE': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.ROAD_CLOSURE],
            'ADVENTURE': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.ROAD_CLOSURE, evidence_dto_1.EvidenceType.BOOKING],
        };
        this.CANONICAL_TYPE_EVIDENCE_MAP = {
            'museum': [evidence_dto_1.EvidenceType.OPENING_HOURS],
            'restaurant': [evidence_dto_1.EvidenceType.OPENING_HOURS],
            'hotel': [evidence_dto_1.EvidenceType.BOOKING],
            'hiking_trail': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.ROAD_CLOSURE],
            'scenic_viewpoint': [evidence_dto_1.EvidenceType.WEATHER],
            'beach': [evidence_dto_1.EvidenceType.WEATHER],
            'mountain': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.ROAD_CLOSURE],
            'waterfall': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.ROAD_CLOSURE],
            'glacier': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.ROAD_CLOSURE],
            'volcano': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.ROAD_CLOSURE],
            'national_park': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.ROAD_CLOSURE],
            'adventure_activity': [evidence_dto_1.EvidenceType.WEATHER, evidence_dto_1.EvidenceType.BOOKING],
        };
    }
    checkCompleteness(places, existingEvidence, tripStartDate) {
        const missingEvidence = [];
        const evidenceMap = this.buildEvidenceMap(existingEvidence);
        const isWinter = this.isWinterSeason(tripStartDate);
        let totalExpected = 0;
        let totalMissing = 0;
        for (const place of places) {
            const expectedTypes = this.getExpectedEvidenceTypes(place, isWinter);
            totalExpected += expectedTypes.length;
            const existingTypes = evidenceMap.get(place.id) || new Set();
            const missingTypes = expectedTypes.filter(type => !existingTypes.has(type));
            if (missingTypes.length > 0) {
                totalMissing += missingTypes.length;
                const impact = this.calculateImpact(missingTypes, place);
                missingEvidence.push({
                    poiId: place.id,
                    poiName: place.nameCN || place.nameEN || `Place ${place.id}`,
                    missingTypes,
                    impact,
                    reason: this.getMissingReason(missingTypes, place),
                });
            }
        }
        const completenessScore = totalExpected > 0
            ? 1 - (totalMissing / totalExpected)
            : 1.0;
        const recommendations = this.generateRecommendations(missingEvidence, places);
        return {
            completenessScore,
            missingEvidence,
            recommendations,
        };
    }
    buildEvidenceMap(existingEvidence) {
        const map = new Map();
        for (const evidence of existingEvidence) {
            if (evidence.poiId) {
                const poiId = parseInt(evidence.poiId);
                if (!isNaN(poiId)) {
                    if (!map.has(poiId)) {
                        map.set(poiId, new Set());
                    }
                    map.get(poiId).add(evidence.type);
                }
            }
        }
        return map;
    }
    getExpectedEvidenceTypes(place, isWinter) {
        var _a;
        const expectedTypes = new Set();
        const metadata = place.metadata || {};
        const category = ((_a = place.category) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || '';
        const canonicalType = metadata.canonicalType || '';
        if (this.CATEGORY_EVIDENCE_MAP[category]) {
            this.CATEGORY_EVIDENCE_MAP[category].forEach(type => expectedTypes.add(type));
        }
        if (canonicalType && this.CANONICAL_TYPE_EVIDENCE_MAP[canonicalType]) {
            this.CANONICAL_TYPE_EVIDENCE_MAP[canonicalType].forEach(type => expectedTypes.add(type));
        }
        if (isWinter) {
            if (category === 'NATURE' || category === 'ADVENTURE') {
                expectedTypes.add(evidence_dto_1.EvidenceType.WEATHER);
                expectedTypes.add(evidence_dto_1.EvidenceType.ROAD_CLOSURE);
            }
        }
        return Array.from(expectedTypes);
    }
    isWinterSeason(tripStartDate) {
        if (!tripStartDate) {
            return false;
        }
        try {
            const date = new Date(tripStartDate);
            const month = date.getMonth() + 1;
            return month === 12 || month === 1 || month === 2;
        }
        catch {
            return false;
        }
    }
    calculateImpact(missingTypes, place) {
        var _a, _b;
        if (missingTypes.includes(evidence_dto_1.EvidenceType.ROAD_CLOSURE)) {
            return 'HIGH';
        }
        if (missingTypes.includes(evidence_dto_1.EvidenceType.WEATHER)) {
            const category = ((_a = place.category) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || '';
            if (category === 'NATURE' || category === 'ADVENTURE') {
                return 'HIGH';
            }
            return 'MEDIUM';
        }
        if (missingTypes.includes(evidence_dto_1.EvidenceType.OPENING_HOURS)) {
            const category = ((_b = place.category) === null || _b === void 0 ? void 0 : _b.toUpperCase()) || '';
            if (category === 'ATTRACTION' || category === 'RESTAURANT') {
                return 'MEDIUM';
            }
            return 'LOW';
        }
        if (missingTypes.includes(evidence_dto_1.EvidenceType.BOOKING)) {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    getMissingReason(missingTypes, place) {
        var _a;
        const reasons = [];
        const category = ((_a = place.category) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || '';
        if (missingTypes.includes(evidence_dto_1.EvidenceType.OPENING_HOURS)) {
            if (category === 'ATTRACTION') {
                reasons.push('景点需要营业时间信息');
            }
            else if (category === 'RESTAURANT') {
                reasons.push('餐厅需要营业时间信息');
            }
            else {
                reasons.push('需要营业时间信息');
            }
        }
        if (missingTypes.includes(evidence_dto_1.EvidenceType.WEATHER)) {
            if (category === 'NATURE' || category === 'ADVENTURE') {
                reasons.push('自然景点/冒险活动需要天气信息');
            }
            else {
                reasons.push('需要天气信息');
            }
        }
        if (missingTypes.includes(evidence_dto_1.EvidenceType.ROAD_CLOSURE)) {
            reasons.push('需要道路封闭信息（安全关键）');
        }
        if (missingTypes.includes(evidence_dto_1.EvidenceType.BOOKING)) {
            reasons.push('需要预订确认信息');
        }
        return reasons.join('、') || '缺少必要证据';
    }
    generateRecommendations(missingEvidence, places) {
        const recommendations = [];
        const typeGroups = new Map();
        for (const missing of missingEvidence) {
            for (const type of missing.missingTypes) {
                if (!typeGroups.has(type)) {
                    typeGroups.set(type, []);
                }
                typeGroups.get(type).push(missing.poiId);
            }
        }
        for (const [type, poiIds] of typeGroups.entries()) {
            const highImpactCount = missingEvidence.filter(m => poiIds.includes(m.poiId) && m.impact === 'HIGH').length;
            const priority = highImpactCount > 0 ? 'HIGH' : 'MEDIUM';
            const estimatedTime = this.estimateFetchTime(type, poiIds.length);
            recommendations.push({
                action: this.getActionDescription(type, poiIds.length),
                priority,
                estimatedTime,
                evidenceTypes: [type],
                affectedPois: poiIds,
            });
        }
        recommendations.sort((a, b) => {
            const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        return recommendations;
    }
    estimateFetchTime(type, count) {
        const baseTime = {
            [evidence_dto_1.EvidenceType.WEATHER]: 2,
            [evidence_dto_1.EvidenceType.ROAD_CLOSURE]: 3,
            [evidence_dto_1.EvidenceType.OPENING_HOURS]: 1,
            [evidence_dto_1.EvidenceType.BOOKING]: 1,
            [evidence_dto_1.EvidenceType.OTHER]: 1,
        };
        const perItemTime = {
            [evidence_dto_1.EvidenceType.WEATHER]: 1,
            [evidence_dto_1.EvidenceType.ROAD_CLOSURE]: 1,
            [evidence_dto_1.EvidenceType.OPENING_HOURS]: 0.5,
            [evidence_dto_1.EvidenceType.BOOKING]: 0.5,
            [evidence_dto_1.EvidenceType.OTHER]: 0.5,
        };
        return baseTime[type] + (perItemTime[type] * count);
    }
    getActionDescription(type, count) {
        const typeNames = {
            [evidence_dto_1.EvidenceType.WEATHER]: '天气数据',
            [evidence_dto_1.EvidenceType.ROAD_CLOSURE]: '道路封闭信息',
            [evidence_dto_1.EvidenceType.OPENING_HOURS]: '营业时间',
            [evidence_dto_1.EvidenceType.BOOKING]: '预订确认信息',
            [evidence_dto_1.EvidenceType.OTHER]: '其他证据',
        };
        return `为 ${count} 个POI获取${typeNames[type]}`;
    }
};
exports.EvidenceCompletenessChecker = EvidenceCompletenessChecker;
exports.EvidenceCompletenessChecker = EvidenceCompletenessChecker = EvidenceCompletenessChecker_1 = __decorate([
    (0, common_1.Injectable)()
], EvidenceCompletenessChecker);
//# sourceMappingURL=evidence-completeness-checker.service.js.map