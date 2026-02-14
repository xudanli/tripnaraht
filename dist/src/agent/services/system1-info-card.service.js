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
var System1InfoCardService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.System1InfoCardService = void 0;
const common_1 = require("@nestjs/common");
const route_directions_service_1 = require("../../route-directions/route-directions.service");
const places_service_1 = require("../../places/places.service");
const uncertainty_modeling_service_1 = require("../../data-modeling/services/uncertainty-modeling.service");
let System1InfoCardService = System1InfoCardService_1 = class System1InfoCardService {
    constructor(routeDirectionsService, placesService, uncertaintyModeling) {
        this.routeDirectionsService = routeDirectionsService;
        this.placesService = placesService;
        this.uncertaintyModeling = uncertaintyModeling;
        this.logger = new common_1.Logger(System1InfoCardService_1.name);
    }
    async generateInfoCard(routeId, state) {
        this.logger.log(`Generating info card for route ${routeId}`);
        const routeData = await this.getRouteData(routeId);
        const currentConditions = await this.getCurrentConditions(routeData, state);
        const yourMatch = await this.calculateYourMatch(routeData, state);
        const riskOverview = await this.calculateRiskOverview(routeData);
        const infoCard = {
            routeName: routeData.name || routeData.nameCN || '未知路线',
            distance: routeData.distance || 0,
            elevationGain: routeData.elevationGain || 0,
            estimatedDuration: routeData.estimatedDuration || 0,
            difficultyLevel: this.mapDifficultyLevel(routeData.difficultyLevel),
            currentConditions,
            yourMatch,
            riskOverview,
            summary: '基本信息已呈现，你可以判断是否感兴趣',
            routeId,
            metadata: {
                generatedAt: new Date().toISOString(),
                source: 'system1',
            },
        };
        return infoCard;
    }
    async getRouteData(routeId) {
        if (this.routeDirectionsService) {
            try {
                const idNum = parseInt(routeId, 10);
                if (!isNaN(idNum)) {
                    return await this.routeDirectionsService.findRouteDirectionById(idNum);
                }
                else {
                    return await this.routeDirectionsService.findRouteDirectionByUuid(routeId);
                }
            }
            catch (error) {
                this.logger.warn(`Failed to fetch route data for ${routeId}:`, error);
            }
        }
        return {
            name: '未知路线',
            distance: 0,
            elevationGain: 0,
            estimatedDuration: 0,
            difficultyLevel: 'MODERATE',
        };
    }
    async getCurrentConditions(routeData, state) {
        const weather = await this.getWeatherConditions(routeData);
        const crowd = await this.getCrowdConditions(routeData);
        const season = this.getSeasonStatus(routeData);
        const transportation = await this.getTransportationConditions(routeData);
        return {
            weather,
            crowd,
            season,
            transportation,
        };
    }
    async getWeatherConditions(routeData) {
        return {
            condition: '晴朗',
            temperature: '12-18°C',
            reliability: 'MEDIUM',
        };
    }
    async getCrowdConditions(routeData) {
        return {
            level: 'NORMAL',
            reliability: 'MEDIUM',
        };
    }
    getSeasonStatus(routeData) {
        var _a;
        const seasonality = routeData.seasonality || {};
        const bestMonths = seasonality.bestMonths || [];
        const currentMonth = new Date().getMonth() + 1;
        let status = 'ACCEPTABLE';
        if (bestMonths.includes(currentMonth)) {
            status = 'BEST';
        }
        else if (bestMonths.some((m) => Math.abs(m - currentMonth) <= 1)) {
            status = 'GOOD';
        }
        else if ((_a = seasonality.avoidMonths) === null || _a === void 0 ? void 0 : _a.includes(currentMonth)) {
            status = 'NOT_RECOMMENDED';
        }
        return {
            status,
            reliability: 'HIGH',
        };
    }
    async getTransportationConditions(routeData) {
        return {
            available: true,
            methods: ['自驾', '公共交通'],
            reliability: 'HIGH',
        };
    }
    async calculateYourMatch(routeData, state) {
        var _a;
        const userProfile = ((_a = state.memory) === null || _a === void 0 ? void 0 : _a.user_profile) || {};
        const fitnessRequirement = this.calculateFitnessMatch(routeData, userProfile);
        const timeRequirement = this.calculateTimeMatch(routeData, state);
        const difficultyRequirement = this.calculateDifficultyMatch(routeData, userProfile);
        const costRequirement = this.calculateCostMatch(routeData, state);
        return {
            fitnessRequirement,
            timeRequirement,
            difficultyRequirement,
            costRequirement,
        };
    }
    calculateFitnessMatch(routeData, userProfile) {
        const routeFitness = routeData.fitnessRequirement || 5;
        const userFitness = userProfile.fitnessLevel || 5;
        const diff = routeFitness - userFitness;
        let vsYourFitness;
        let explanation;
        if (Math.abs(diff) <= 1) {
            vsYourFitness = 'MATCH';
            explanation = '路线体力要求与你的水平匹配';
        }
        else if (diff > 0 && diff <= 2) {
            vsYourFitness = 'SLIGHTLY_ABOVE';
            explanation = '路线体力要求略高于你的水平';
        }
        else if (diff > 2) {
            vsYourFitness = 'ABOVE';
            explanation = '路线体力要求明显高于你的水平';
        }
        else {
            vsYourFitness = 'BELOW';
            explanation = '路线体力要求低于你的水平';
        }
        return { vsYourFitness, explanation };
    }
    calculateTimeMatch(routeData, state) {
        var _a;
        const routeDuration = routeData.estimatedDuration || 0;
        const tripDays = ((_a = state.trip) === null || _a === void 0 ? void 0 : _a.days) || 0;
        const availableDays = tripDays || 7;
        let vsYourTime;
        let explanation;
        if (routeDuration <= availableDays * 0.8) {
            vsYourTime = 'SUFFICIENT';
            explanation = `你有足够的时间完成这条路线（需要${routeDuration}天，你有${availableDays}天）`;
        }
        else if (routeDuration <= availableDays) {
            vsYourTime = 'TIGHT';
            explanation = `时间较紧（需要${routeDuration}天，你有${availableDays}天）`;
        }
        else {
            vsYourTime = 'INSUFFICIENT';
            explanation = `时间不足（需要${routeDuration}天，你只有${availableDays}天）`;
        }
        return { vsYourTime, explanation };
    }
    calculateDifficultyMatch(routeData, userProfile) {
        const routeDifficulty = this.mapDifficultyToNumber(routeData.difficultyLevel);
        const userExperience = userProfile.experienceLevel || 5;
        const diff = routeDifficulty - userExperience;
        let vsYourExperience;
        let explanation;
        if (Math.abs(diff) <= 1) {
            vsYourExperience = 'MATCH';
            explanation = '路线难度与你的经验匹配';
        }
        else if (diff > 0 && diff <= 2) {
            vsYourExperience = 'SLIGHTLY_ABOVE';
            explanation = '路线难度略高于你的经验';
        }
        else if (diff > 2) {
            vsYourExperience = 'ABOVE';
            explanation = '路线难度明显高于你的经验';
        }
        else {
            vsYourExperience = 'BELOW';
            explanation = '路线难度低于你的经验';
        }
        return { vsYourExperience, explanation };
    }
    calculateCostMatch(routeData, state) {
        const routeCost = routeData.estimatedCost || 0;
        const budgetAmount = 10000;
        const ratio = routeCost / budgetAmount;
        let vsYourBudget;
        let explanation;
        if (ratio <= 0.8) {
            vsYourBudget = 'WITHIN';
            explanation = `路线成本在你的预算范围内（预计${routeCost}元，预算${budgetAmount}元）`;
        }
        else if (ratio <= 1.0) {
            vsYourBudget = 'SLIGHTLY_OVER';
            explanation = `路线成本略超预算（预计${routeCost}元，预算${budgetAmount}元）`;
        }
        else if (ratio <= 1.2) {
            vsYourBudget = 'OVER';
            explanation = `路线成本超过预算（预计${routeCost}元，预算${budgetAmount}元）`;
        }
        else {
            vsYourBudget = 'BELOW';
            explanation = `路线成本远低于预算（预计${routeCost}元，预算${budgetAmount}元）`;
        }
        return { vsYourBudget, explanation };
    }
    async calculateRiskOverview(routeData) {
        const riskProfile = routeData.riskProfile || {};
        return {
            safetyRisk: this.mapRiskLevel(riskProfile.safetyRisk),
            physicalRisk: this.mapRiskLevel(riskProfile.physicalRisk),
            timeRisk: this.mapRiskLevel(riskProfile.timeRisk),
            experienceRisk: this.mapRiskLevel(riskProfile.experienceRisk),
            costRisk: this.mapRiskLevel(riskProfile.costRisk),
        };
    }
    mapDifficultyLevel(level) {
        if (typeof level === 'string') {
            const upper = level.toUpperCase();
            if (['EASY', 'MODERATE', 'HARD', 'EXTREME'].includes(upper)) {
                return upper;
            }
        }
        return 'MODERATE';
    }
    mapDifficultyToNumber(level) {
        const mapping = {
            EASY: 3,
            MODERATE: 5,
            HARD: 7,
            EXTREME: 9,
        };
        return mapping[this.mapDifficultyLevel(level)] || 5;
    }
    mapRiskLevel(level) {
        if (typeof level === 'string') {
            const upper = level.toUpperCase();
            if (['LOW', 'MEDIUM', 'HIGH'].includes(upper)) {
                return upper;
            }
        }
        return 'MEDIUM';
    }
};
exports.System1InfoCardService = System1InfoCardService;
exports.System1InfoCardService = System1InfoCardService = System1InfoCardService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [route_directions_service_1.RouteDirectionsService,
        places_service_1.PlacesService,
        uncertainty_modeling_service_1.UncertaintyModelingService])
], System1InfoCardService);
//# sourceMappingURL=system1-info-card.service.js.map