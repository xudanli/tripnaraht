"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CandidatePoolService = void 0;
const common_1 = require("@nestjs/common");
let CandidatePoolService = class CandidatePoolService {
    generateDailyCandidates(state, date, centerPoint, config = { maxCandidatesPerDay: 20 }) {
        let candidates = state.candidatesByDate[date] || [];
        if (centerPoint && config.maxDistanceKm) {
            candidates = candidates.filter(c => {
                var _a;
                if (!((_a = c.location) === null || _a === void 0 ? void 0 : _a.point))
                    return false;
                const distance = this.calculateDistance(centerPoint, c.location.point);
                return distance <= config.maxDistanceKm;
            });
        }
        if (config.preferIndoor) {
            candidates = candidates.filter(c => c.indoorOutdoor === 'indoor' || c.indoorOutdoor === 'mixed');
        }
        candidates = this.scoreAndSort(candidates, state);
        return candidates.slice(0, config.maxCandidatesPerDay);
    }
    generateSubstitutionSets(candidates, baseCandidate) {
        var _a;
        const sets = [];
        if (baseCandidate.indoorOutdoor === 'outdoor') {
            const indoorAlternatives = candidates.filter(c => c.id !== baseCandidate.id &&
                (c.indoorOutdoor === 'indoor' || c.indoorOutdoor === 'mixed') &&
                c.type === baseCandidate.type);
            if (indoorAlternatives.length > 0) {
                sets.push({
                    groupId: `indoor_${baseCandidate.id}`,
                    candidates: indoorAlternatives,
                    reason: 'Indoor alternatives for outdoor activity',
                });
            }
        }
        if ((_a = baseCandidate.location) === null || _a === void 0 ? void 0 : _a.point) {
            const basePoint = baseCandidate.location.point;
            const nearby = candidates
                .filter(c => {
                var _a;
                return c.id !== baseCandidate.id &&
                    ((_a = c.location) === null || _a === void 0 ? void 0 : _a.point) &&
                    this.calculateDistance(basePoint, c.location.point) < 10;
            })
                .slice(0, 5);
            if (nearby.length > 0) {
                sets.push({
                    groupId: `nearby_${baseCandidate.id}`,
                    candidates: nearby,
                    reason: 'Nearby alternatives',
                });
            }
        }
        if (baseCandidate.cost) {
            const baseCost = baseCandidate.cost.amount;
            const cheaper = candidates.filter(c => c.id !== baseCandidate.id &&
                c.cost &&
                c.cost.amount < baseCost * 0.7);
            if (cheaper.length > 0) {
                sets.push({
                    groupId: `cheaper_${baseCandidate.id}`,
                    candidates: cheaper.slice(0, 5),
                    reason: 'Cheaper alternatives',
                });
            }
        }
        const sameType = candidates.filter(c => c.id !== baseCandidate.id && c.type === baseCandidate.type);
        if (sameType.length > 0) {
            sets.push({
                groupId: `same_type_${baseCandidate.id}`,
                candidates: sameType.slice(0, 5),
                reason: 'Same type alternatives',
            });
        }
        return sets;
    }
    assignAlternativeGroups(candidates) {
        var _a;
        const typeGroups = new Map();
        for (const c of candidates) {
            if (!typeGroups.has(c.type)) {
                typeGroups.set(c.type, []);
            }
            typeGroups.get(c.type).push(c);
        }
        for (const [type, group] of typeGroups) {
            if (group.length > 1) {
                const groupId = `type_${type}_${group[0].id}`;
                for (const c of group) {
                    c.alternativeGroupId = groupId;
                }
            }
        }
        const regionGroups = new Map();
        for (const c of candidates) {
            const region = (_a = c.location) === null || _a === void 0 ? void 0 : _a.region;
            if (region) {
                if (!regionGroups.has(region)) {
                    regionGroups.set(region, []);
                }
                regionGroups.get(region).push(c);
            }
        }
        for (const [region, group] of regionGroups) {
            if (group.length > 1) {
                const groupId = `region_${region}`;
                for (const c of group) {
                    if (!c.alternativeGroupId) {
                        c.alternativeGroupId = groupId;
                    }
                }
            }
        }
        return candidates;
    }
    scoreAndSort(candidates, state) {
        const scored = candidates.map(c => ({
            candidate: c,
            score: this.calculateScore(c, state),
        }));
        return scored
            .sort((a, b) => b.score - a.score)
            .map(item => item.candidate);
    }
    calculateScore(candidate, state) {
        let score = 0;
        const intentScore = (candidate.intentTags || []).reduce((sum, tag) => sum + (state.context.preferences.intents[tag] || 0), 0);
        score += intentScore * 1.2;
        score += (candidate.qualityScore || 0.5) * 0.8;
        score += (candidate.uniquenessScore || 0.3) * 0.5;
        if (candidate.mustSee) {
            score += 10;
        }
        if (candidate.weatherSensitivity) {
            score -= candidate.weatherSensitivity * 0.15;
        }
        if (candidate.riskLevel === 'high' &&
            state.context.preferences.riskTolerance === 'low') {
            score -= 0.6;
        }
        return score;
    }
    calculateDistance(from, to) {
        const R = 6371;
        const dLat = this.toRad(to.lat - from.lat);
        const dLon = this.toRad(to.lng - from.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(from.lat)) *
                Math.cos(this.toRad(to.lat)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(degrees) {
        return (degrees * Math.PI) / 180;
    }
};
exports.CandidatePoolService = CandidatePoolService;
exports.CandidatePoolService = CandidatePoolService = __decorate([
    (0, common_1.Injectable)()
], CandidatePoolService);
//# sourceMappingURL=candidate-pool.service.js.map