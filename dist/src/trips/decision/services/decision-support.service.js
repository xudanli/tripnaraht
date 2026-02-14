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
var DecisionSupportService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionSupportService = void 0;
const common_1 = require("@nestjs/common");
const uncertainty_modeling_service_1 = require("../../../data-modeling/services/uncertainty-modeling.service");
let DecisionSupportService = DecisionSupportService_1 = class DecisionSupportService {
    constructor(uncertaintyModeling) {
        this.uncertaintyModeling = uncertaintyModeling;
        this.logger = new common_1.Logger(DecisionSupportService_1.name);
    }
    async presentOptions(routes, userContext) {
        this.logger.log(`Presenting ${routes.length} route options (not recommendations)`);
        const options = routes.map(route => ({
            routeId: route.id ? String(route.id) : (route.name || 'unknown'),
            routeName: route.nameCN || route.name || '未知路线',
            systemAnalysis: this.analyzeRoute(route, userContext),
            metadata: {
                countryCode: route.countryCode,
                tags: route.tags || [],
            },
        }));
        const comparison = this.generateComparison(options);
        const userGuidance = this.generateUserGuidance(options, userContext);
        return {
            options,
            comparison,
            userGuidance,
        };
    }
    async generateMatchingAnalysis(route, userContext) {
        this.logger.log(`Generating matching analysis for route ${route.id || route.name || 'unknown'}`);
        const whatYouWantItems = this.extractUserWants(userContext);
        const matchStatus = this.checkMatch(route, userContext, whatYouWantItems);
        const yourConcernsItems = this.extractUserConcerns(userContext);
        const addressStatus = this.checkAddress(route, userContext, yourConcernsItems);
        const overallJudgment = this.generateJudgment(route, userContext, whatYouWantItems, yourConcernsItems);
        const nextSteps = this.generateNextSteps(route, userContext, matchStatus, addressStatus);
        const mappedMatchStatus = matchStatus === 'MATCH' ? 'MATCH' :
            matchStatus === 'PARTIAL_MATCH' ? 'PARTIAL' : 'MISMATCH';
        const mappedAddressStatus = addressStatus === 'ADDRESSED' ? 'ADDRESSED' :
            addressStatus === 'PARTIALLY_ADDRESSED' ? 'PARTIAL' : 'NOT_ADDRESSED';
        return {
            whatYouWant: {
                items: whatYouWantItems,
                matchStatus: mappedMatchStatus,
            },
            yourConcerns: {
                items: yourConcernsItems,
                addressStatus: mappedAddressStatus,
            },
            overallJudgment,
            nextSteps,
        };
    }
    async generateDecisionInterface(routes, userContext) {
        const routeOptions = await this.presentOptions(routes, userContext);
        const rhythmOptions = this.generateRhythmOptions(userContext);
        const conditionalSupport = this.generateConditionalSupport(routes, userContext);
        return {
            routeSelection: {
                options: routeOptions.options,
                comparison: routeOptions.comparison,
            },
            rhythmSelection: {
                options: rhythmOptions.options,
                comparison: rhythmOptions.comparison,
            },
            conditionalSupport,
        };
    }
    analyzeRoute(route, userContext) {
        const characteristics = this.extractCharacteristics(route);
        const matchingAnalysis = this.analyzeMatching(route, userContext);
        const riskAssessment = this.analyzeRisks(route);
        return {
            characteristics,
            matchingAnalysis,
            riskAssessment,
        };
    }
    extractCharacteristics(route) {
        var _a;
        const constraints = route.constraints || {};
        const riskProfile = route.riskProfile || {};
        const seasonality = route.seasonality || {};
        let difficultyLevel = 'MODERATE';
        if (constraints.minFitnessLevel) {
            if (constraints.minFitnessLevel >= 8) {
                difficultyLevel = 'EXTREME';
            }
            else if (constraints.minFitnessLevel >= 6) {
                difficultyLevel = 'HARD';
            }
            else if (constraints.minFitnessLevel >= 4) {
                difficultyLevel = 'MODERATE';
            }
            else {
                difficultyLevel = 'EASY';
            }
        }
        const currentMonth = new Date().getMonth() + 1;
        const bestMonths = seasonality.bestMonths || [];
        let seasonSuitability = 'ACCEPTABLE';
        if (bestMonths.includes(currentMonth)) {
            seasonSuitability = 'BEST';
        }
        else if (bestMonths.some((m) => Math.abs(m - currentMonth) <= 1)) {
            seasonSuitability = 'GOOD';
        }
        else if ((_a = seasonality.avoidMonths) === null || _a === void 0 ? void 0 : _a.includes(currentMonth)) {
            seasonSuitability = 'NOT_RECOMMENDED';
        }
        const extensions = route.extensions;
        const metadata = route.metadata;
        const estimatedDuration = (extensions === null || extensions === void 0 ? void 0 : extensions.estimatedDuration) || (metadata === null || metadata === void 0 ? void 0 : metadata.estimatedDuration) || 0;
        const distance = (metadata === null || metadata === void 0 ? void 0 : metadata.distance) || 0;
        const elevationGain = (metadata === null || metadata === void 0 ? void 0 : metadata.elevationGain) || 0;
        return {
            distance,
            elevationGain,
            estimatedDuration,
            difficultyLevel,
            seasonSuitability,
            experienceTypes: route.tags || [],
            riskLevel: riskProfile.overallRisk || 'MEDIUM',
        };
    }
    analyzeMatching(route, userContext) {
        var _a;
        const userProfile = userContext.userProfile || {};
        const constraints = route.constraints || {};
        const extensions = route.extensions;
        const metadata = route.metadata;
        const routeFitness = constraints.minFitnessLevel || 5;
        const userFitness = userProfile.fitnessLevel || 5;
        const fitnessDiff = routeFitness - userFitness;
        let fitnessMatch = 'MATCH';
        if (Math.abs(fitnessDiff) <= 1) {
            fitnessMatch = 'MATCH';
        }
        else if (fitnessDiff > 0 && fitnessDiff <= 2) {
            fitnessMatch = 'SLIGHTLY_ABOVE';
        }
        else if (fitnessDiff > 2) {
            fitnessMatch = 'ABOVE';
        }
        else {
            fitnessMatch = 'BELOW';
        }
        const routeDuration = (extensions === null || extensions === void 0 ? void 0 : extensions.estimatedDuration) || (metadata === null || metadata === void 0 ? void 0 : metadata.estimatedDuration) || 0;
        const tripDays = userContext.tripDays || 7;
        let timeMatch = 'SUFFICIENT';
        if (routeDuration <= tripDays * 0.8) {
            timeMatch = 'SUFFICIENT';
        }
        else if (routeDuration <= tripDays) {
            timeMatch = 'TIGHT';
        }
        else {
            timeMatch = 'INSUFFICIENT';
        }
        const routeDifficulty = this.mapDifficultyToNumber(((_a = route.constraints) === null || _a === void 0 ? void 0 : _a.minFitnessLevel) || 5);
        const userExperience = userProfile.experienceLevel || 5;
        const experienceDiff = routeDifficulty - userExperience;
        let experienceMatch = 'MATCH';
        if (Math.abs(experienceDiff) <= 1) {
            experienceMatch = 'MATCH';
        }
        else if (experienceDiff > 0 && experienceDiff <= 2) {
            experienceMatch = 'SLIGHTLY_ABOVE';
        }
        else if (experienceDiff > 2) {
            experienceMatch = 'ABOVE';
        }
        else {
            experienceMatch = 'BELOW';
        }
        const routeCost = (extensions === null || extensions === void 0 ? void 0 : extensions.estimatedCost) || (metadata === null || metadata === void 0 ? void 0 : metadata.estimatedCost) || 0;
        const budget = userContext.budget || 10000;
        const costRatio = routeCost / budget;
        let costMatch = 'WITHIN';
        if (costRatio <= 0.8) {
            costMatch = 'WITHIN';
        }
        else if (costRatio <= 1.0) {
            costMatch = 'SLIGHTLY_OVER';
        }
        else if (costRatio <= 1.2) {
            costMatch = 'OVER';
        }
        else {
            costMatch = 'BELOW';
        }
        return {
            fitnessMatch,
            timeMatch,
            experienceMatch,
            costMatch,
        };
    }
    analyzeRisks(route) {
        const riskProfile = route.riskProfile || {};
        return {
            safetyRisk: riskProfile.safetyRisk || 'MEDIUM',
            physicalRisk: riskProfile.physicalRisk || 'MEDIUM',
            timeRisk: riskProfile.timeRisk || 'MEDIUM',
        };
    }
    generateComparison(options) {
        if (options.length === 0) {
            return {
                dimensions: [],
                comparisonNote: '暂无对比数据',
            };
        }
        const dimensions = [];
        const distanceValues = {};
        options.forEach(opt => {
            distanceValues[opt.routeId] = opt.systemAnalysis.characteristics.distance;
        });
        dimensions.push({
            name: '距离（公里）',
            values: distanceValues,
        });
        const difficultyValues = {};
        options.forEach(opt => {
            difficultyValues[opt.routeId] = opt.systemAnalysis.characteristics.difficultyLevel;
        });
        dimensions.push({
            name: '难度等级',
            values: difficultyValues,
        });
        const durationValues = {};
        options.forEach(opt => {
            durationValues[opt.routeId] = opt.systemAnalysis.characteristics.estimatedDuration;
        });
        dimensions.push({
            name: '预计时长（小时）',
            values: durationValues,
        });
        const comparisonNote = `以上是各选项的对比信息，你可以根据你的需求和偏好来选择。`;
        return {
            dimensions,
            comparisonNote,
        };
    }
    generateUserGuidance(options, userContext) {
        if (options.length === 0) {
            return '暂无可用选项';
        }
        return `基于你的情况，这些选项各有特点。你可以根据距离、难度、时长和风险等级来判断哪个更符合你的需求。`;
    }
    extractUserWants(userContext) {
        const wants = [];
        if (userContext.preferences) {
            if (userContext.preferences.pace) {
                wants.push({
                    item: `节奏偏好：${userContext.preferences.pace}`,
                    matchStatus: 'MATCH',
                    explanation: '已记录你的节奏偏好',
                });
            }
            if (userContext.preferences.budget) {
                wants.push({
                    item: `预算：${userContext.preferences.budget}`,
                    matchStatus: 'MATCH',
                    explanation: '已考虑你的预算限制',
                });
            }
        }
        return wants;
    }
    extractUserConcerns(userContext) {
        const concerns = [];
        if (userContext.concerns && Array.isArray(userContext.concerns)) {
            userContext.concerns.forEach((concern) => {
                concerns.push({
                    item: concern,
                    addressStatus: 'ADDRESSED',
                    explanation: '系统已考虑此担忧',
                });
            });
        }
        return concerns;
    }
    checkMatch(route, userContext, wants) {
        const matching = this.analyzeMatching(route, userContext);
        const matchCount = [
            matching.fitnessMatch === 'MATCH',
            matching.timeMatch === 'SUFFICIENT',
            matching.experienceMatch === 'MATCH',
            matching.costMatch === 'WITHIN' || matching.costMatch === 'SLIGHTLY_OVER',
        ].filter(Boolean).length;
        if (matchCount >= 3) {
            return 'MATCH';
        }
        else if (matchCount >= 2) {
            return 'PARTIAL_MATCH';
        }
        else {
            return 'NO_MATCH';
        }
    }
    checkAddress(route, userContext, concerns) {
        if (concerns.length === 0) {
            return 'ADDRESSED';
        }
        return 'ADDRESSED';
    }
    generateJudgment(route, userContext, wants, concerns) {
        const matching = this.analyzeMatching(route, userContext);
        const factors = [];
        if (matching.fitnessMatch === 'MATCH') {
            factors.push('体力要求匹配');
        }
        if (matching.timeMatch === 'SUFFICIENT') {
            factors.push('时间充足');
        }
        if (matching.experienceMatch === 'MATCH') {
            factors.push('经验匹配');
        }
        if (matching.costMatch === 'WITHIN') {
            factors.push('预算范围内');
        }
        let statement = '这条路线';
        if (factors.length >= 3) {
            statement += '在多个方面与你的情况匹配';
        }
        else if (factors.length >= 2) {
            statement += '在部分方面与你的情况匹配';
        }
        else {
            statement += '与你的情况匹配度较低';
        }
        return {
            statement,
            factors,
            confidence: factors.length / 4,
        };
    }
    generateNextSteps(route, userContext, matchStatus, addressStatus) {
        const steps = [];
        if (matchStatus === 'NO_MATCH') {
            steps.push({
                action: '考虑调整行程参数或选择其他路线',
                reason: '当前路线与你的情况匹配度较低',
                optional: true,
            });
        }
        if (addressStatus === 'NOT_ADDRESSED') {
            steps.push({
                action: '进一步了解路线详情以评估担忧',
                reason: '部分担忧需要更多信息来评估',
                optional: true,
            });
        }
        steps.push({
            action: '查看详细的路线信息和风险评估',
            reason: '了解更多信息有助于做出决策',
            optional: true,
        });
        return steps;
    }
    generateRhythmOptions(userContext) {
        const options = [
            {
                type: 'RELAXED',
                characteristics: {
                    dailyActivityCount: 2,
                    averageDuration: 4,
                    bufferTime: 2,
                },
                systemAnalysis: {
                    suitability: 'MATCH',
                    explanation: '轻松节奏，适合想要放松的旅行',
                },
            },
            {
                type: 'NORMAL',
                characteristics: {
                    dailyActivityCount: 3,
                    averageDuration: 3,
                    bufferTime: 1,
                },
                systemAnalysis: {
                    suitability: 'MATCH',
                    explanation: '正常节奏，平衡体验和休息',
                },
            },
            {
                type: 'TIGHT',
                characteristics: {
                    dailyActivityCount: 4,
                    averageDuration: 2,
                    bufferTime: 0.5,
                },
                systemAnalysis: {
                    suitability: 'SLIGHTLY_ABOVE',
                    explanation: '紧凑节奏，适合想要充分利用时间的旅行',
                },
            },
        ];
        const comparison = {
            dimensions: [
                {
                    name: '每日活动数',
                    values: {
                        RELAXED: 2,
                        NORMAL: 3,
                        TIGHT: 4,
                    },
                },
                {
                    name: '平均时长（小时）',
                    values: {
                        RELAXED: 4,
                        NORMAL: 3,
                        TIGHT: 2,
                    },
                },
                {
                    name: '缓冲时间（小时）',
                    values: {
                        RELAXED: 2,
                        NORMAL: 1,
                        TIGHT: 0.5,
                    },
                },
            ],
            comparisonNote: '你可以根据你的体力和时间偏好来选择节奏',
        };
        return { options, comparison };
    }
    generateConditionalSupport(routes, userContext) {
        const scenarios = [];
        routes.forEach(route => {
            if (route.seasonality) {
                const bestMonths = route.seasonality.bestMonths || [];
                if (bestMonths.length > 0) {
                    scenarios.push({
                        condition: `如果在${bestMonths.join('、')}月出行`,
                        outcome: '这条路线将处于最佳状态',
                        probability: 0.9,
                        explanation: '这些月份是这条路线的最佳旅行时间',
                    });
                }
            }
        });
        return {
            scenarios,
            userQuestions: [],
            systemAnswers: [],
        };
    }
    mapDifficultyToNumber(fitnessLevel) {
        if (fitnessLevel <= 3)
            return 3;
        if (fitnessLevel <= 5)
            return 5;
        if (fitnessLevel <= 7)
            return 7;
        return 9;
    }
};
exports.DecisionSupportService = DecisionSupportService;
exports.DecisionSupportService = DecisionSupportService = DecisionSupportService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [uncertainty_modeling_service_1.UncertaintyModelingService])
], DecisionSupportService);
//# sourceMappingURL=decision-support.service.js.map