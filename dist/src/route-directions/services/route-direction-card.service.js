"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RouteDirectionCardService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionCardService = void 0;
const common_1 = require("@nestjs/common");
const route_direction_explainer_service_1 = require("./route-direction-explainer.service");
let RouteDirectionCardService = RouteDirectionCardService_1 = class RouteDirectionCardService {
    constructor(explainerService) {
        this.explainerService = explainerService;
        this.logger = new common_1.Logger(RouteDirectionCardService_1.name);
    }
    toCard(recommendation, scoreBreakdown, matchedSignals) {
        const rd = recommendation.routeDirection;
        const seasonality = (rd.seasonality || {});
        const riskProfile = (rd.riskProfile || {});
        const constraints = (rd.constraints || {});
        let tagline = '';
        let longDescription = '';
        let suitableFor = [];
        let notSuitableFor = [];
        if (this.explainerService) {
            const explainer = this.explainerService.generateExplainer(recommendation);
            tagline = explainer.tagline;
            longDescription = explainer.description;
            suitableFor = explainer.suitableFor;
            notSuitableFor = explainer.notSuitableFor;
        }
        else {
            tagline = this.generateSimpleTagline(rd);
            longDescription = this.generateSimpleDescription(rd, constraints, riskProfile);
            const suitability = this.generateSuitability(rd, constraints, riskProfile, rd.tags || []);
            suitableFor = suitability.suitableFor;
            notSuitableFor = suitability.notSuitableFor;
        }
        const terrainSignature = this.generateTerrainSignature(constraints, rd);
        const experienceTags = this.generateExperienceTags(rd, constraints, riskProfile);
        const riskProfileDetail = this.generateRiskProfileDetail(riskProfile, constraints, rd);
        const typicalDurationDays = this.inferTypicalDuration(rd);
        const whyThis = this.generateWhyThis(recommendation, scoreBreakdown, matchedSignals);
        return {
            id: rd.id,
            uuid: rd.uuid || '',
            name: rd.nameCN || rd.name || '',
            nameCN: rd.nameCN || rd.name || '',
            nameEN: rd.nameEN,
            tagline,
            longDescription,
            suitableFor,
            notSuitableFor,
            bestMonths: seasonality.bestMonths || [],
            avoidMonths: seasonality.avoidMonths,
            typicalDurationDays,
            terrainSignature,
            experienceTags,
            riskProfile: riskProfileDetail,
            description: longDescription,
            whyThis,
            countryCode: rd.countryCode,
            version: rd.version,
            tags: rd.tags || [],
            entryHubs: rd.entryHubs || [],
            regions: rd.regions || [],
        };
    }
    generateWhyThis(recommendation, scoreBreakdown, matchedSignals) {
        var _a;
        const reasons = [];
        if (((_a = matchedSignals === null || matchedSignals === void 0 ? void 0 : matchedSignals.tags) === null || _a === void 0 ? void 0 : _a.matched) && matchedSignals.tags.matched.length > 0) {
            const tags = matchedSignals.tags.matched.join('、');
            reasons.push(`这条路线特别适合${tags}爱好者`);
        }
        if (matchedSignals === null || matchedSignals === void 0 ? void 0 : matchedSignals.seasonality) {
            const { month, bestMonths, avoidMonths } = matchedSignals.seasonality;
            if (month && bestMonths && bestMonths.includes(month)) {
                reasons.push(`${month}月是这条路线的最佳旅行时间`);
            }
            else if (month && avoidMonths && avoidMonths.includes(month)) {
                reasons.push(`注意：${month}月可能不是最佳时间`);
            }
        }
        if (matchedSignals === null || matchedSignals === void 0 ? void 0 : matchedSignals.pace) {
            const { userPace, routePace, compatibility } = matchedSignals.pace;
            if (compatibility === 'high') {
                reasons.push(`路线节奏与您的偏好（${userPace}）高度匹配`);
            }
        }
        if (matchedSignals === null || matchedSignals === void 0 ? void 0 : matchedSignals.risk) {
            const { userTolerance, routeHasHighRisk } = matchedSignals.risk;
            if (!routeHasHighRisk && userTolerance === 'low') {
                reasons.push('路线风险较低，适合您的风险承受度');
            }
        }
        if (scoreBreakdown) {
            const topScore = this.getTopScoreReason(scoreBreakdown);
            if (topScore) {
                reasons.push(topScore);
            }
        }
        if (reasons.length === 0) {
            reasons.push('这条路线符合您的基本偏好');
        }
        return reasons.slice(0, 3).join('。') + '。';
    }
    getTopScoreReason(breakdown) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const scores = [
            { name: '标签匹配', score: ((_a = breakdown.tagMatch) === null || _a === void 0 ? void 0 : _a.score) || 0, weight: ((_b = breakdown.tagMatch) === null || _b === void 0 ? void 0 : _b.weight) || 0 },
            { name: '季节性', score: ((_c = breakdown.seasonality) === null || _c === void 0 ? void 0 : _c.score) || 0, weight: ((_d = breakdown.seasonality) === null || _d === void 0 ? void 0 : _d.weight) || 0 },
            { name: '节奏匹配', score: ((_e = breakdown.pace) === null || _e === void 0 ? void 0 : _e.score) || 0, weight: ((_f = breakdown.pace) === null || _f === void 0 ? void 0 : _f.weight) || 0 },
            { name: '风险匹配', score: ((_g = breakdown.risk) === null || _g === void 0 ? void 0 : _g.score) || 0, weight: ((_h = breakdown.risk) === null || _h === void 0 ? void 0 : _h.weight) || 0 },
        ];
        scores.sort((a, b) => (b.score * b.weight) - (a.score * a.weight));
        const top = scores[0];
        if (top.score > 70 && top.weight > 0) {
            return `${top.name}得分很高（${Math.round(top.score)}分）`;
        }
        return null;
    }
    generateSuitability(rd, constraints, riskProfile, tags) {
        var _a, _b;
        const suitableFor = [];
        const notSuitableFor = [];
        if (tags.includes('徒步') || tags.includes('hiking')) {
            suitableFor.push('有基础徒步经验的旅行者');
            notSuitableFor.push('第一次出国徒步的新手');
        }
        if (tags.includes('摄影') || tags.includes('photography')) {
            suitableFor.push('摄影爱好者');
        }
        if (tags.includes('文化') || tags.includes('culture')) {
            suitableFor.push('对当地文化感兴趣的旅行者');
        }
        if (tags.includes('挑战') || tags.includes('challenge')) {
            suitableFor.push('喜欢挑战的旅行者');
            notSuitableFor.push('追求轻松舒适的旅行者');
        }
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM;
        if (maxElevation && maxElevation > 4000) {
            suitableFor.push('有高海拔经验的旅行者');
            notSuitableFor.push('心肺基础差的旅行者');
            notSuitableFor.push('有严重高反史的旅行者');
        }
        else if (maxElevation && maxElevation > 3000) {
            suitableFor.push('能适应中等海拔的旅行者');
            notSuitableFor.push('对高海拔敏感的旅行者');
        }
        const maxAscent = ((_b = constraints.soft) === null || _b === void 0 ? void 0 : _b.maxDailyAscentM) || constraints.maxDailyAscentM;
        if (maxAscent && maxAscent > 1000) {
            suitableFor.push('体力较好的旅行者');
            notSuitableFor.push('体力较差的旅行者');
        }
        if (riskProfile.weatherWindow) {
            suitableFor.push('能灵活调整行程的旅行者');
            notSuitableFor.push('行程时间固定的旅行者');
        }
        if (riskProfile.ferryDependent) {
            suitableFor.push('能提前预订交通的旅行者');
        }
        if (suitableFor.length === 0) {
            suitableFor.push('一般旅行者');
        }
        if (notSuitableFor.length === 0) {
            notSuitableFor.push('行动不便的旅行者');
        }
        return { suitableFor, notSuitableFor };
    }
    generateTerrainSignature(constraints, rd) {
        var _a, _b;
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM || 0;
        const minElevation = maxElevation > 0 ? Math.max(0, maxElevation - 2000) : 0;
        const avgElevation = (maxElevation + minElevation) / 2;
        const maxSlope = ((_b = constraints.hard) === null || _b === void 0 ? void 0 : _b.maxSlopePct) || constraints.maxSlope || undefined;
        return {
            avgElevationM: maxElevation > 0 ? Math.round(avgElevation) : undefined,
            elevationRangeM: maxElevation > 0 ? [Math.round(minElevation), Math.round(maxElevation)] : undefined,
            maxSlope: maxSlope,
        };
    }
    generateExperienceTags(rd, constraints, riskProfile) {
        var _a;
        const tags = [];
        const routeTags = rd.tags || [];
        if (routeTags.includes('摄影') || routeTags.includes('photography')) {
            tags.push('震撼', '视觉享受');
        }
        if (routeTags.includes('徒步') || routeTags.includes('hiking')) {
            tags.push('挑战', '成就感');
        }
        if (routeTags.includes('文化') || routeTags.includes('culture')) {
            tags.push('文化', '深度体验');
        }
        if (routeTags.includes('自然') || routeTags.includes('nature')) {
            tags.push('宁静', '自然');
        }
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM || 0;
        if (maxElevation > 4000) {
            tags.push('极限', '挑战');
        }
        else if (maxElevation > 3000) {
            tags.push('刺激');
        }
        if (riskProfile.weatherWindow) {
            tags.push('不确定性', '冒险');
        }
        if (riskProfile.ferryDependent) {
            tags.push('独特体验');
        }
        return Array.from(new Set(tags));
    }
    generateRiskProfileDetail(riskProfile, constraints, rd) {
        var _a;
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM || 0;
        let altitude = 0;
        if (maxElevation > 5000) {
            altitude = 3;
        }
        else if (maxElevation > 4000) {
            altitude = 2;
        }
        else if (maxElevation > 3000) {
            altitude = 1;
        }
        if (riskProfile.altitudeSickness) {
            altitude = Math.max(altitude, 2);
        }
        let weather = 0;
        if (riskProfile.weatherWindow) {
            weather = 2;
        }
        if (riskProfile.roadClosure) {
            weather = Math.max(weather, 1);
        }
        let isolation = 0;
        if (maxElevation > 4000 && riskProfile.altitudeSickness) {
            isolation = 2;
        }
        if (riskProfile.ferryDependent) {
            isolation = Math.max(isolation, 1);
        }
        const regions = rd.regions || [];
        if (regions.length === 0 || regions.length === 1) {
            isolation = Math.max(isolation, 1);
        }
        return {
            altitude,
            weather,
            isolation,
        };
    }
    inferTypicalDuration(rd) {
        const skeleton = rd.itinerarySkeleton;
        if ((skeleton === null || skeleton === void 0 ? void 0 : skeleton.dayThemes) && Array.isArray(skeleton.dayThemes)) {
            return skeleton.dayThemes.length;
        }
        return 7;
    }
    generateSimpleTagline(rd) {
        const tags = rd.tags || [];
        if (tags.length > 0) {
            return `${tags.slice(0, 2).join(' + ')}探索路线`;
        }
        return `${rd.nameCN || rd.name}之旅`;
    }
    generateSimpleDescription(rd, constraints, riskProfile) {
        var _a;
        const parts = [];
        parts.push(`${rd.nameCN || rd.name}是一条独特的旅行路线。`);
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM;
        if (maxElevation) {
            parts.push(`路线最高海拔${maxElevation}米。`);
        }
        if (riskProfile.altitudeSickness) {
            parts.push('路线涉及高海拔区域，需要注意高反风险。');
        }
        parts.push('这条路线将带你深入探索目的地的独特魅力，体验与众不同的旅行方式。');
        return parts.join('');
    }
    extractRiskTypes(riskProfile) {
        const risks = [];
        if (riskProfile.altitudeSickness) {
            risks.push('HIGH_ALTITUDE');
        }
        if (riskProfile.weatherWindow) {
            risks.push('WEATHER_WINDOW');
        }
        if (riskProfile.roadClosure) {
            risks.push('ROAD_CLOSURE');
        }
        if (riskProfile.ferryDependent) {
            risks.push('FERRY');
        }
        return risks;
    }
};
exports.RouteDirectionCardService = RouteDirectionCardService;
exports.RouteDirectionCardService = RouteDirectionCardService = RouteDirectionCardService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [route_direction_explainer_service_1.RouteDirectionExplainerService])
], RouteDirectionCardService);
//# sourceMappingURL=route-direction-card.service.js.map