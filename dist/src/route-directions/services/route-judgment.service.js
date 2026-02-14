"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RouteJudgmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteJudgmentService = void 0;
const common_1 = require("@nestjs/common");
let RouteJudgmentService = RouteJudgmentService_1 = class RouteJudgmentService {
    constructor() {
        this.logger = new common_1.Logger(RouteJudgmentService_1.name);
    }
    async judgeRouteExistence(route, context, user) {
        this.logger.log(`Judging route existence for ${route.id || route.name}`);
        const feasibility = await this.assessFeasibility(route, context);
        const timeliness = await this.assessTimeliness(route, context);
        const matching = await this.assessMatching(route, user);
        const existence = this.combineJudgments(feasibility, timeliness, matching);
        const explanation = this.generateExistenceExplanation(feasibility, timeliness, matching);
        return {
            feasibility,
            timeliness,
            matching,
            existence,
            explanation,
        };
    }
    async assessFeasibility(route, context) {
        const accessibility = await this.checkAccessibility(route);
        const timeFeasibility = await this.checkTimeFeasibility(route, context);
        const transportAvailability = await this.checkTransportAvailability(route, context);
        const admissionRequirements = await this.checkAdmissionRequirements(route);
        let feasibilityLevel = '完全可行';
        if (!accessibility.available || !transportAvailability.available) {
            feasibilityLevel = '不可行';
        }
        else if (admissionRequirements.requiresPermit && !admissionRequirements.permitObtained) {
            feasibilityLevel = '有条件可行';
        }
        else if (timeFeasibility.tight) {
            feasibilityLevel = '困难';
        }
        return {
            level: feasibilityLevel,
            accessibility,
            timeFeasibility,
            transportAvailability,
            admissionRequirements,
        };
    }
    async assessTimeliness(route, context) {
        const seasonFit = await this.checkSeasonFit(route, context);
        const weatherFit = await this.checkWeatherFit(route, context);
        const crowdFit = await this.checkCrowdFit(route, context);
        const eventImpact = await this.checkEventImpact(route, context);
        let timelinessLevel = '可接受';
        if (weatherFit.hasWarning) {
            timelinessLevel = '警告';
        }
        else if (seasonFit.bad && crowdFit.veryHigh) {
            timelinessLevel = '不建议';
        }
        else if (seasonFit.best && weatherFit.good && crowdFit.normal) {
            timelinessLevel = '最佳时机';
        }
        else if (seasonFit.good && weatherFit.ok) {
            timelinessLevel = '合适时机';
        }
        return {
            level: timelinessLevel,
            seasonFit,
            weatherFit,
            crowdFit,
            eventImpact,
        };
    }
    async assessMatching(route, user) {
        const physicalMatch = await this.matchPhysical(route, user);
        const experienceMatch = await this.matchExperience(route, user);
        const timeMatch = await this.matchTime(route, user);
        const budgetMatch = await this.matchBudget(route, user);
        const preferenceMatch = await this.matchPreference(route, user);
        const matchScores = [
            physicalMatch.score,
            experienceMatch.score,
            timeMatch.score,
            budgetMatch.score,
            preferenceMatch.score,
        ];
        const avgScore = matchScores.reduce((a, b) => a + b, 0) / matchScores.length;
        let overallMatch;
        if (avgScore >= 0.85) {
            overallMatch = '高度匹配';
        }
        else if (avgScore >= 0.7) {
            overallMatch = '基本匹配';
        }
        else if (avgScore >= 0.55) {
            overallMatch = '部分匹配';
        }
        else {
            overallMatch = '不匹配';
        }
        return {
            overallMatch,
            physicalMatch,
            experienceMatch,
            timeMatch,
            budgetMatch,
            preferenceMatch,
        };
    }
    async checkAccessibility(route) {
        return {
            available: true,
            explanation: '路线地理上可达',
        };
    }
    async checkTimeFeasibility(route, context) {
        var _a, _b, _c;
        const routeDuration = ((_a = route.metadata) === null || _a === void 0 ? void 0 : _a.estimatedDuration) ||
            ((_b = route.extensions) === null || _b === void 0 ? void 0 : _b.estimatedDuration) ||
            ((_c = route.metadata) === null || _c === void 0 ? void 0 : _c.durationDays) ||
            0;
        const travelDays = context.travelDates
            ? Math.ceil((context.travelDates.end.getTime() - context.travelDates.start.getTime()) /
                (1000 * 60 * 60 * 24))
            : 7;
        const feasible = routeDuration <= travelDays || routeDuration === 0;
        const tight = routeDuration > 0 && routeDuration > travelDays * 0.8;
        return {
            feasible,
            tight,
            explanation: routeDuration === 0
                ? '路线时长未指定'
                : feasible
                    ? `路线时长${routeDuration}天，你有${travelDays}天，时间${tight ? '较紧' : '充足'}`
                    : `路线时长${routeDuration}天，你只有${travelDays}天，时间不足`,
        };
    }
    async checkTransportAvailability(route, context) {
        return {
            available: true,
            methods: ['自驾', '公共交通'],
            explanation: '交通方式可用',
        };
    }
    async checkAdmissionRequirements(route) {
        const constraints = route.constraints || {};
        const requiresPermit = constraints.requiresPermit || false;
        return {
            requiresPermit,
            permitObtained: false,
            otherRequirements: constraints.otherRequirements || [],
        };
    }
    async checkSeasonFit(route, context) {
        const seasonality = route.seasonality || {};
        const currentMonth = context.currentDate.getMonth() + 1;
        const bestMonths = seasonality.bestMonths || [];
        const avoidMonths = seasonality.avoidMonths || [];
        const best = bestMonths.includes(currentMonth);
        const good = bestMonths.some((m) => Math.abs(m - currentMonth) <= 1);
        const bad = avoidMonths.includes(currentMonth);
        const ok = !best && !good && !bad;
        return {
            best,
            good,
            ok,
            bad,
            explanation: best
                ? '当前处于最佳旅行季节'
                : good
                    ? '当前处于良好旅行季节'
                    : bad
                        ? '当前不是推荐的旅行季节'
                        : '当前季节可接受',
        };
    }
    async checkWeatherFit(route, context) {
        const weather = context.weather || {};
        const hasWarning = weather.hasWarning || false;
        const good = weather.condition === 'good';
        const ok = weather.condition === 'ok' || !hasWarning;
        return {
            good,
            ok,
            hasWarning,
            explanation: hasWarning
                ? '当前天气状况有警告'
                : good
                    ? '当前天气状况良好'
                    : '当前天气状况可接受',
        };
    }
    async checkCrowdFit(route, context) {
        const crowd = context.crowd || {};
        const veryHigh = crowd.level === 'VERY_HIGH';
        const normal = crowd.level === 'NORMAL' || crowd.level === 'LOW';
        return {
            normal,
            veryHigh,
            explanation: veryHigh
                ? '当前人流密度很高'
                : normal
                    ? '当前人流密度正常'
                    : '当前人流密度较高',
        };
    }
    async checkEventImpact(route, context) {
        const events = context.events || [];
        const hasImpact = events.length > 0;
        return {
            hasImpact,
            impactType: hasImpact ? 'NEUTRAL' : undefined,
            explanation: hasImpact
                ? `当前有${events.length}个相关事件可能影响路线`
                : '当前没有特殊事件影响',
        };
    }
    async matchPhysical(route, user) {
        var _a, _b, _c;
        const routeFitness = ((_a = route.metadata) === null || _a === void 0 ? void 0 : _a.minFitnessLevel) ||
            ((_c = (_b = route.constraints) === null || _b === void 0 ? void 0 : _b.metadata) === null || _c === void 0 ? void 0 : _c.minFitnessLevel) ||
            5;
        const userFitness = user.fitnessLevel || 5;
        const diff = Math.abs(routeFitness - userFitness);
        let score = 1 - diff / 10;
        score = Math.max(0, Math.min(1, score));
        return {
            score,
            explanation: diff <= 1
                ? '体力要求匹配'
                : routeFitness > userFitness
                    ? `路线体力要求略高于你的水平（${routeFitness} vs ${userFitness}）`
                    : `路线体力要求低于你的水平（${routeFitness} vs ${userFitness}）`,
        };
    }
    async matchExperience(route, user) {
        var _a, _b, _c;
        const routeFitness = ((_a = route.metadata) === null || _a === void 0 ? void 0 : _a.minFitnessLevel) ||
            ((_c = (_b = route.constraints) === null || _b === void 0 ? void 0 : _b.metadata) === null || _c === void 0 ? void 0 : _c.minFitnessLevel) ||
            5;
        const routeDifficulty = this.mapDifficultyToNumber(routeFitness);
        const userExperience = user.experienceLevel || 5;
        const diff = Math.abs(routeDifficulty - userExperience);
        let score = 1 - diff / 10;
        score = Math.max(0, Math.min(1, score));
        return {
            score,
            explanation: diff <= 1
                ? '难度与经验匹配'
                : routeDifficulty > userExperience
                    ? `路线难度高于你的经验水平`
                    : `路线难度低于你的经验水平`,
        };
    }
    async matchTime(route, user) {
        var _a, _b, _c;
        const routeDuration = ((_a = route.metadata) === null || _a === void 0 ? void 0 : _a.estimatedDuration) ||
            ((_b = route.extensions) === null || _b === void 0 ? void 0 : _b.estimatedDuration) ||
            ((_c = route.metadata) === null || _c === void 0 ? void 0 : _c.durationDays) ||
            0;
        const availableDays = user.availableDays || 7;
        if (routeDuration === 0) {
            return {
                score: 0.7,
                explanation: '路线时长未指定，无法精确匹配',
            };
        }
        const ratio = routeDuration / availableDays;
        let score;
        if (ratio <= 0.8) {
            score = 1.0;
        }
        else if (ratio <= 1.0) {
            score = 0.8;
        }
        else if (ratio <= 1.2) {
            score = 0.5;
        }
        else {
            score = 0.2;
        }
        return {
            score,
            explanation: ratio <= 0.8
                ? '时间充足'
                : ratio <= 1.0
                    ? '时间较紧但可行'
                    : '时间不足',
        };
    }
    async matchBudget(route, user) {
        var _a, _b;
        const routeCost = ((_a = route.metadata) === null || _a === void 0 ? void 0 : _a.estimatedCost) ||
            ((_b = route.extensions) === null || _b === void 0 ? void 0 : _b.estimatedCost) ||
            0;
        const budget = user.budget || 10000;
        if (routeCost === 0) {
            return {
                score: 0.7,
                explanation: '路线费用未指定，无法精确匹配',
            };
        }
        const ratio = routeCost / budget;
        let score;
        if (ratio <= 0.8) {
            score = 1.0;
        }
        else if (ratio <= 1.0) {
            score = 0.8;
        }
        else if (ratio <= 1.2) {
            score = 0.5;
        }
        else {
            score = 0.2;
        }
        return {
            score,
            explanation: ratio <= 0.8
                ? '预算充足'
                : ratio <= 1.0
                    ? '预算略紧但可行'
                    : '预算不足',
        };
    }
    async matchPreference(route, user) {
        const routeTags = route.tags || [];
        const userPreferences = user.preferences || {};
        const preferredTags = userPreferences.tags || [];
        if (preferredTags.length === 0) {
            return {
                score: 0.7,
                explanation: '未指定偏好，使用默认匹配度',
            };
        }
        const matchCount = routeTags.filter(tag => preferredTags.includes(tag)).length;
        const score = matchCount / Math.max(preferredTags.length, routeTags.length);
        return {
            score,
            explanation: matchCount > 0
                ? `路线包含${matchCount}个你偏好的标签`
                : '路线标签与你的偏好不匹配',
        };
    }
    combineJudgments(feasibility, timeliness, matching) {
        if (feasibility.level === '不可行') {
            return {
                status: 'NOT_EXISTS',
                reason: '路线物理上不可行',
                evidence: [
                    feasibility.accessibility.explanation,
                    feasibility.transportAvailability.explanation,
                ],
                score: 0,
            };
        }
        if (timeliness.level === '警告') {
            return {
                status: 'NOT_EXISTS',
                reason: '当前状态不适合走这条路线',
                evidence: [timeliness.weatherFit.explanation],
                score: 0.2,
            };
        }
        const feasibilityScore = this.mapFeasibilityToScore(feasibility.level);
        const timelinessScore = this.mapTimelinessToScore(timeliness.level);
        const matchingScore = this.calculateMatchingScore(matching);
        const overallScore = feasibilityScore * 0.4 + timelinessScore * 0.3 + matchingScore * 0.3;
        let status;
        if (overallScore >= 0.8) {
            status = 'EXISTS';
        }
        else if (overallScore >= 0.5) {
            status = 'CONDITIONAL_EXISTS';
        }
        else {
            status = 'NOT_EXISTS';
        }
        const reasons = [];
        if (feasibility.level !== '完全可行') {
            reasons.push(`可行性：${feasibility.level}`);
        }
        if (timeliness.level !== '最佳时机' && timeliness.level !== '合适时机') {
            reasons.push(`适时性：${timeliness.level}`);
        }
        if (matching.overallMatch !== '高度匹配' && matching.overallMatch !== '基本匹配') {
            reasons.push(`匹配性：${matching.overallMatch}`);
        }
        return {
            status,
            reason: reasons.length > 0 ? reasons.join('；') : '路线存在且适合',
            evidence: [
                feasibility.accessibility.explanation,
                timeliness.seasonFit.explanation,
                matching.physicalMatch.explanation,
            ],
            score: overallScore,
        };
    }
    generateExistenceExplanation(feasibility, timeliness, matching) {
        const parts = [];
        parts.push(`可行性：${feasibility.level}`);
        parts.push(`适时性：${timeliness.level}`);
        parts.push(`匹配性：${matching.overallMatch}`);
        return parts.join('；');
    }
    mapFeasibilityToScore(level) {
        const mapping = {
            完全可行: 1.0,
            有条件可行: 0.7,
            困难: 0.4,
            不可行: 0.0,
        };
        return mapping[level] || 0.5;
    }
    mapTimelinessToScore(level) {
        const mapping = {
            最佳时机: 1.0,
            合适时机: 0.8,
            可接受: 0.6,
            不建议: 0.3,
            警告: 0.1,
        };
        return mapping[level] || 0.5;
    }
    calculateMatchingScore(matching) {
        const scores = [
            matching.physicalMatch.score,
            matching.experienceMatch.score,
            matching.timeMatch.score,
            matching.budgetMatch.score,
            matching.preferenceMatch.score,
        ];
        return scores.reduce((a, b) => a + b, 0) / scores.length;
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
exports.RouteJudgmentService = RouteJudgmentService;
exports.RouteJudgmentService = RouteJudgmentService = RouteJudgmentService_1 = __decorate([
    (0, common_1.Injectable)()
], RouteJudgmentService);
//# sourceMappingURL=route-judgment.service.js.map