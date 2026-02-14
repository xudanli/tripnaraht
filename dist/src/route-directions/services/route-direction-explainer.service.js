"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RouteDirectionExplainerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionExplainerService = void 0;
const common_1 = require("@nestjs/common");
let RouteDirectionExplainerService = RouteDirectionExplainerService_1 = class RouteDirectionExplainerService {
    constructor() {
        this.logger = new common_1.Logger(RouteDirectionExplainerService_1.name);
    }
    generateExplainer(recommendation) {
        const rd = recommendation.routeDirection;
        const constraints = (rd.constraints || {});
        const riskProfile = (rd.riskProfile || {});
        const seasonality = (rd.seasonality || {});
        const tags = rd.tags || [];
        const tagline = this.generateTagline(rd, tags, riskProfile);
        const description = this.generateDescription(rd, constraints, riskProfile, tags);
        const { suitableFor, notSuitableFor } = this.generateSuitability(rd, constraints, riskProfile, tags);
        const terrainProfile = this.generateTerrainProfile(constraints, rd);
        const riskProfileExplainer = this.generateRiskProfileExplainer(riskProfile, constraints, rd);
        const keywords = this.generateKeywords(rd, tags, riskProfile);
        const { culturalHighlights, signatureExperiences } = this.extractHighlights(rd, tags);
        return {
            id: rd.id,
            uuid: rd.uuid || '',
            title: rd.nameEN || rd.name || '',
            titleCN: rd.nameCN || rd.name || '',
            tagline,
            description,
            suitableFor,
            notSuitableFor,
            bestMonths: seasonality.bestMonths || [],
            avoidMonths: seasonality.avoidMonths,
            terrainProfile,
            riskProfile: riskProfileExplainer,
            keywords,
            culturalHighlights,
            signatureExperiences,
            typicalDuration: this.inferTypicalDuration(rd),
            entryPoints: rd.entryHubs || [],
            exitPoints: rd.entryHubs || [],
            metadata: {
                version: rd.version,
                lastUpdated: rd.updatedAt || new Date().toISOString(),
                source: 'RouteDirection System',
            },
        };
    }
    generateTagline(rd, tags, riskProfile) {
        const tagKeywords = tags.slice(0, 2).join(' + ');
        const riskKeyword = riskProfile.altitudeSickness ? '高海拔' : '';
        const culturalKeyword = tags.includes('文化') || tags.includes('culture') ? '文化' : '';
        if (riskKeyword && culturalKeyword) {
            return `${riskKeyword}${culturalKeyword}${tagKeywords}走廊`;
        }
        else if (riskKeyword) {
            return `${riskKeyword}${tagKeywords}路线`;
        }
        else if (culturalKeyword) {
            return `${culturalKeyword}${tagKeywords}之旅`;
        }
        else {
            return `${tagKeywords}探索路线`;
        }
    }
    generateDescription(rd, constraints, riskProfile, tags) {
        var _a, _b;
        const parts = [];
        parts.push(`${rd.nameCN || rd.name}是一条${tags.join('、')}主题的旅行路线。`);
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM;
        const maxAscent = ((_b = constraints.soft) === null || _b === void 0 ? void 0 : _b.maxDailyAscentM) || constraints.maxDailyAscentM;
        if (maxElevation) {
            parts.push(`路线最高海拔${maxElevation}米`);
            if (maxAscent) {
                parts.push(`，每日最大爬升约${maxAscent}米`);
            }
            parts.push('。');
        }
        if (riskProfile.altitudeSickness) {
            parts.push('路线涉及高海拔区域，需要注意高反风险。');
        }
        if (riskProfile.weatherWindow) {
            parts.push('受天气窗口限制，建议在最佳季节前往。');
        }
        if (riskProfile.ferryDependent) {
            parts.push('部分路段依赖渡轮，需提前预订。');
        }
        if (tags.includes('文化') || tags.includes('culture')) {
            parts.push('路线融合了丰富的当地文化体验。');
        }
        if (tags.includes('摄影') || tags.includes('photography')) {
            parts.push('沿途风景优美，是摄影爱好者的理想选择。');
        }
        const difficulty = this.inferDifficulty(constraints, riskProfile);
        parts.push(`适合${difficulty}的旅行者。`);
        let description = parts.join('');
        if (description.length < 150) {
            description += '这条路线将带你深入探索目的地的独特魅力，体验与众不同的旅行方式。';
        }
        if (description.length > 300) {
            description = description.substring(0, 297) + '...';
        }
        return description;
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
    generateTerrainProfile(constraints, rd) {
        var _a, _b, _c;
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM || 0;
        const maxAscent = ((_b = constraints.soft) === null || _b === void 0 ? void 0 : _b.maxDailyAscentM) || constraints.maxDailyAscentM || 0;
        const minElevation = maxElevation > 0 ? Math.max(0, maxElevation - 2000) : 0;
        const avgElevation = (maxElevation + minElevation) / 2;
        const maxSlope = ((_c = constraints.hard) === null || _c === void 0 ? void 0 : _c.maxSlopePct) || constraints.maxSlope || 25;
        const typicalSlope = maxSlope * 0.6;
        const difficultyLevel = this.inferDifficultyLevel(maxElevation, maxAscent, maxSlope);
        return {
            avgElevation: Math.round(avgElevation),
            elevationRange: {
                min: Math.round(minElevation),
                max: Math.round(maxElevation),
            },
            typicalSlope: Math.round(typicalSlope),
            totalAscent: maxAscent > 0 ? Math.round(maxAscent * 7) : undefined,
            difficultyLevel,
        };
    }
    generateRiskProfileExplainer(riskProfile, constraints, rd) {
        var _a, _b, _c;
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM || 0;
        let altitudeLevel = 'none';
        if (maxElevation > 5000) {
            altitudeLevel = 'high';
        }
        else if (maxElevation > 4000) {
            altitudeLevel = 'high';
        }
        else if (maxElevation > 3000) {
            altitudeLevel = 'medium';
        }
        else if (maxElevation > 2000) {
            altitudeLevel = 'low';
        }
        let weatherLevel = 'stable';
        if (riskProfile.weatherWindow) {
            weatherLevel = 'unpredictable';
        }
        if (rd.countryCode === 'NP' || rd.countryCode === 'CN_XZ') {
            weatherLevel = 'variable';
        }
        const rdTags = (rd.tags || []);
        let isolationLevel = 'accessible';
        if (maxElevation > 5000 && riskProfile.altitudeSickness) {
            isolationLevel = 'very_remote';
        }
        else if (maxElevation > 4000 && riskProfile.altitudeSickness) {
            isolationLevel = 'remote';
        }
        else if (rdTags.includes('徒步') && maxElevation > 3000) {
            isolationLevel = 'remote';
        }
        else if (rdTags.includes('城市') || rdTags.includes('city')) {
            isolationLevel = 'urban';
        }
        let nearestHospitalKm = 20;
        let cellCoverage = 'good';
        if (isolationLevel === 'very_remote') {
            nearestHospitalKm = 100;
            cellCoverage = 'poor';
        }
        else if (isolationLevel === 'remote') {
            nearestHospitalKm = 50;
            cellCoverage = 'partial';
        }
        else if (isolationLevel === 'urban') {
            nearestHospitalKm = 5;
            cellCoverage = 'good';
        }
        return {
            altitude: {
                level: altitudeLevel,
                maxElevation: Math.round(maxElevation),
                daysAbove3000m: maxElevation > 3000 ? 3 : undefined,
                description: this.getAltitudeDescription(altitudeLevel, maxElevation),
            },
            weather: {
                level: weatherLevel,
                weatherWindow: riskProfile.weatherWindow,
                weatherWindowMonths: riskProfile.weatherWindowMonths,
                description: this.getWeatherDescription(weatherLevel, riskProfile),
            },
            isolation: {
                level: isolationLevel,
                nearestHospitalKm,
                cellCoverage,
                description: this.getIsolationDescription(isolationLevel),
            },
            other: {
                roadClosure: riskProfile.roadClosure,
                ferryDependent: riskProfile.ferryDependent,
                permitRequired: ((_b = constraints.hard) === null || _b === void 0 ? void 0 : _b.requiresPermit) || constraints.requiresPermit,
                guideRequired: ((_c = constraints.hard) === null || _c === void 0 ? void 0 : _c.requiresGuide) || constraints.requiresGuide,
            },
        };
    }
    generateKeywords(rd, tags, riskProfile) {
        const keywords = [];
        if (tags && tags.length > 0) {
            keywords.push(...tags.slice(0, 3));
        }
        if (riskProfile.altitudeSickness) {
            keywords.push('高海拔');
        }
        if (rd.countryCode === 'NP') {
            keywords.push('Sherpa', '茶屋', '冰川谷地');
        }
        if (rd.countryCode === 'CN_XZ') {
            keywords.push('藏文化', '高原', '圣湖');
        }
        return keywords.slice(0, 5);
    }
    extractHighlights(rd, tags) {
        const culturalHighlights = [];
        const signatureExperiences = [];
        if (tags.includes('文化') || tags.includes('culture')) {
            culturalHighlights.push('体验当地传统文化');
            signatureExperiences.push('参观历史遗迹');
        }
        if (tags.includes('徒步') || tags.includes('hiking')) {
            signatureExperiences.push('徒步探索自然');
        }
        if (tags.includes('摄影') || tags.includes('photography')) {
            signatureExperiences.push('拍摄绝美风景');
        }
        if (tags.includes('出海') || tags.includes('sea')) {
            signatureExperiences.push('海上巡游');
        }
        if (rd.countryCode === 'NP') {
            culturalHighlights.push('Sherpa 文化', '茶屋住宿体验');
            signatureExperiences.push('喜马拉雅徒步', '观赏雪山');
        }
        if (rd.countryCode === 'CN_XZ') {
            culturalHighlights.push('藏传佛教文化', '高原生活体验');
            signatureExperiences.push('朝圣之旅', '高原湖泊');
        }
        return {
            culturalHighlights: culturalHighlights.length > 0 ? culturalHighlights : [],
            signatureExperiences: signatureExperiences.length > 0 ? signatureExperiences : [],
        };
    }
    inferTypicalDuration(rd) {
        const skeleton = rd.itinerarySkeleton;
        if (skeleton === null || skeleton === void 0 ? void 0 : skeleton.dayThemes) {
            const days = skeleton.dayThemes.length;
            return {
                min: Math.max(3, days - 2),
                max: days + 2,
                recommended: days,
            };
        }
        return {
            min: 5,
            max: 10,
            recommended: 7,
        };
    }
    inferDifficultyLevel(maxElevation, maxAscent, maxSlope) {
        if (maxElevation > 5000 || maxAscent > 1500 || maxSlope > 40) {
            return 'EXTREME';
        }
        if (maxElevation > 4000 || maxAscent > 1000 || maxSlope > 30) {
            return 'CHALLENGING';
        }
        if (maxElevation > 2000 || maxAscent > 500 || maxSlope > 20) {
            return 'MODERATE';
        }
        return 'EASY';
    }
    inferDifficulty(constraints, riskProfile) {
        var _a, _b;
        const maxElevation = ((_a = constraints.soft) === null || _a === void 0 ? void 0 : _a.maxElevationM) || constraints.maxElevationM || 0;
        const maxAscent = ((_b = constraints.soft) === null || _b === void 0 ? void 0 : _b.maxDailyAscentM) || constraints.maxDailyAscentM || 0;
        if (maxElevation > 4000 || maxAscent > 1000) {
            return '有经验且体力较好';
        }
        else if (maxElevation > 2000 || maxAscent > 500) {
            return '有基础经验';
        }
        else {
            return '一般';
        }
    }
    getAltitudeDescription(level, maxElevation) {
        switch (level) {
            case 'high':
                return `最高海拔${maxElevation}米，存在高反风险，需要充分适应`;
            case 'medium':
                return `最高海拔${maxElevation}米，部分人可能出现高反症状`;
            case 'low':
                return `最高海拔${maxElevation}米，一般不会出现高反`;
            default:
                return '海拔较低，无高反风险';
        }
    }
    getWeatherDescription(level, riskProfile) {
        switch (level) {
            case 'extreme':
                return '天气变化极端，需要密切关注天气预报';
            case 'unpredictable':
                return '天气变化不可预测，建议在天气窗口期前往';
            case 'variable':
                return '天气变化较大，建议准备应对措施';
            default:
                return '天气相对稳定';
        }
    }
    getIsolationDescription(level) {
        switch (level) {
            case 'very_remote':
                return '非常偏远，医疗和通讯条件有限';
            case 'remote':
                return '较为偏远，需要做好充分准备';
            case 'accessible':
                return '交通便利，基础设施完善';
            default:
                return '城市区域，设施完善';
        }
    }
};
exports.RouteDirectionExplainerService = RouteDirectionExplainerService;
exports.RouteDirectionExplainerService = RouteDirectionExplainerService = RouteDirectionExplainerService_1 = __decorate([
    (0, common_1.Injectable)()
], RouteDirectionExplainerService);
//# sourceMappingURL=route-direction-explainer.service.js.map