"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionConstraintsService = void 0;
const common_1 = require("@nestjs/common");
let RouteDirectionConstraintsService = class RouteDirectionConstraintsService {
    checkHardConstraints(state, candidate, dayElevation, dayAscent) {
        var _a, _b;
        const violations = [];
        const policies = state.policies;
        const hardConstraints = policies === null || policies === void 0 ? void 0 : policies.hardConstraints;
        if (!hardConstraints)
            return violations;
        if (hardConstraints.rapidAscentForbidden && dayAscent !== undefined) {
            const maxRapidAscent = hardConstraints.maxDailyRapidAscentM || 500;
            if (dayAscent > maxRapidAscent) {
                violations.push({
                    type: 'hard',
                    code: 'RAPID_ASCENT_VIOLATION',
                    message: `每日快速爬升超过限制: ${dayAscent}m > ${maxRapidAscent}m`,
                    candidateId: candidate.id,
                    severity: 'critical',
                    details: { dayAscent, maxRapidAscent },
                });
            }
        }
        if (hardConstraints.maxSlopePct && ((_a = candidate.metadata) === null || _a === void 0 ? void 0 : _a.slope)) {
            const slope = candidate.metadata.slope;
            if (slope > hardConstraints.maxSlopePct) {
                violations.push({
                    type: 'hard',
                    code: 'SLOPE_VIOLATION',
                    message: `坡度超过限制: ${slope}% > ${hardConstraints.maxSlopePct}%`,
                    candidateId: candidate.id,
                    severity: 'critical',
                    details: { slope, maxSlope: hardConstraints.maxSlopePct },
                });
            }
        }
        if (hardConstraints.requiresPermit && !((_b = candidate.metadata) === null || _b === void 0 ? void 0 : _b.hasPermit)) {
            violations.push({
                type: 'hard',
                code: 'PERMIT_REQUIRED',
                message: '此路线需要许可，但未检测到许可信息',
                candidateId: candidate.id,
                severity: 'critical',
                details: { requiresPermit: true },
            });
        }
        return violations;
    }
    checkSoftConstraints(state, candidate, dayElevation, dayAscent) {
        const violations = [];
        const policies = state.policies;
        const softConstraints = policies === null || policies === void 0 ? void 0 : policies.softConstraints;
        if (!softConstraints)
            return violations;
        if (softConstraints.maxElevationM && dayElevation !== undefined) {
            if (dayElevation > softConstraints.maxElevationM) {
                violations.push({
                    type: 'soft',
                    code: 'ELEVATION_WARNING',
                    message: `海拔超过建议值: ${dayElevation}m > ${softConstraints.maxElevationM}m`,
                    candidateId: candidate.id,
                    severity: 'warning',
                    details: { dayElevation, maxElevation: softConstraints.maxElevationM },
                });
            }
        }
        if (softConstraints.maxDailyAscentM && dayAscent !== undefined) {
            if (dayAscent > softConstraints.maxDailyAscentM) {
                violations.push({
                    type: 'soft',
                    code: 'DAILY_ASCENT_WARNING',
                    message: `每日爬升超过建议值: ${dayAscent}m > ${softConstraints.maxDailyAscentM}m`,
                    candidateId: candidate.id,
                    severity: 'warning',
                    details: { dayAscent, maxDailyAscent: softConstraints.maxDailyAscentM },
                });
            }
        }
        return violations;
    }
    calculateSoftConstraintPenalty(state, candidate, dayElevation, dayAscent) {
        var _a, _b, _c, _d;
        const violations = this.checkSoftConstraints(state, candidate, dayElevation, dayAscent);
        let penalty = 0;
        for (const violation of violations) {
            if (violation.code === 'ELEVATION_WARNING') {
                const excess = (dayElevation || 0) - ((_b = (_a = state.policies) === null || _a === void 0 ? void 0 : _a.softConstraints) === null || _b === void 0 ? void 0 : _b.maxElevationM) || 0;
                penalty += Math.min(0.3, excess / 1000);
            }
            if (violation.code === 'DAILY_ASCENT_WARNING') {
                const excess = (dayAscent || 0) - ((_d = (_c = state.policies) === null || _c === void 0 ? void 0 : _c.softConstraints) === null || _d === void 0 ? void 0 : _d.maxDailyAscentM) || 0;
                penalty += Math.min(0.2, excess / 500);
            }
        }
        return penalty;
    }
    applyObjectiveWeights(state, candidate, baseScore) {
        var _a, _b, _c;
        const policies = state.policies;
        const objectives = policies === null || policies === void 0 ? void 0 : policies.objectives;
        if (!objectives)
            return baseScore;
        let weightedScore = baseScore;
        if (objectives.preferViewpoints && ((_a = candidate.intentTags) === null || _a === void 0 ? void 0 : _a.includes('摄影'))) {
            weightedScore += objectives.preferViewpoints * 0.1;
        }
        if (objectives.preferHotSpring && ((_b = candidate.intentTags) === null || _b === void 0 ? void 0 : _b.includes('温泉'))) {
            weightedScore += objectives.preferHotSpring * 0.1;
        }
        if (objectives.preferPhotography && ((_c = candidate.intentTags) === null || _c === void 0 ? void 0 : _c.includes('摄影'))) {
            weightedScore += objectives.preferPhotography * 0.1;
        }
        return weightedScore;
    }
};
exports.RouteDirectionConstraintsService = RouteDirectionConstraintsService;
exports.RouteDirectionConstraintsService = RouteDirectionConstraintsService = __decorate([
    (0, common_1.Injectable)()
], RouteDirectionConstraintsService);
//# sourceMappingURL=route-direction-constraints.service.js.map