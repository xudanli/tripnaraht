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
var RouteDirectionSelectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionSelectorService = void 0;
const common_1 = require("@nestjs/common");
const route_directions_service_1 = require("../route-directions.service");
const route_direction_observability_service_1 = require("./route-direction-observability.service");
const route_direction_cache_service_1 = require("./route-direction-cache.service");
const decision_params_injector_service_1 = require("../../agent/memory/services/decision-params-injector.service");
let RouteDirectionSelectorService = RouteDirectionSelectorService_1 = class RouteDirectionSelectorService {
    constructor(routeDirectionsService, observabilityService, cacheService, decisionParamsInjector) {
        this.routeDirectionsService = routeDirectionsService;
        this.observabilityService = observabilityService;
        this.cacheService = cacheService;
        this.decisionParamsInjector = decisionParamsInjector;
        this.logger = new common_1.Logger(RouteDirectionSelectorService_1.name);
    }
    async pickRouteDirections(userIntent, countryCode, month, requestId) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        this.logger.log(`选择路线方向: country=${countryCode}, month=${month}, preferences=${(_a = userIntent.preferences) === null || _a === void 0 ? void 0 : _a.join(',')}`);
        const startTime = Date.now();
        if (this.cacheService) {
            const cached = await this.cacheService.getCachedRdSelection(countryCode, month, userIntent);
            if (cached) {
                this.logger.log(`使用缓存的 RD selection 结果`);
                if (this.observabilityService && requestId) {
                    this.observabilityService.recordRdSelectLatency(requestId, Date.now() - startTime);
                }
                return cached;
            }
        }
        const result = await this.routeDirectionsService.findRouteDirectionsByCountry(countryCode, {
            tags: userIntent.preferences,
            month,
            limit: 20,
            includeDeprecated: true,
            userId: userIntent.userId,
            persona: userIntent.persona,
            locale: userIntent.locale,
        });
        const routeDirections = result.active;
        const deprecatedRds = result.deprecated || [];
        if (routeDirections.length === 0) {
            this.logger.warn(`未找到 ${countryCode} 的路线方向`);
            return [];
        }
        let decisionParams = null;
        const userId = userIntent.userId;
        if (userId && this.decisionParamsInjector) {
            try {
                decisionParams = await this.decisionParamsInjector.getDecisionParamsForUser(userId);
                this.logger.debug(`Loaded decision params for user ${userId}`);
            }
            catch (error) {
                this.logger.warn(`Failed to load decision params: ${error}`);
            }
        }
        const scored = await Promise.all(routeDirections.map(async (rd) => {
            var _a, _b, _c;
            const breakdown = this.scoreRouteDirectionWithBreakdown(rd, userIntent, month);
            let finalScore = breakdown.totalScore;
            if (decisionParams && userId && this.decisionParamsInjector) {
                try {
                    const userProfile = await ((_a = this.decisionParamsInjector['memoryService']) === null || _a === void 0 ? void 0 : _a.getUserTravelProfile(userId));
                    if ((userProfile === null || userProfile === void 0 ? void 0 : userProfile.preferredRouteTypes) && userProfile.preferredRouteTypes.length > 0) {
                        const filterResult = this.decisionParamsInjector.filterRouteDirectionByPreference(rd, userProfile.preferredRouteTypes);
                        if (!filterResult.shouldKeep) {
                            finalScore *= filterResult.scoreMultiplier;
                            const routeType = ((_b = rd.metadata) === null || _b === void 0 ? void 0 : _b.archetype) || ((_c = rd.metadata) === null || _c === void 0 ? void 0 : _c.routeType) || 'unknown';
                            this.logger.debug(`Route type ${routeType} not in preferred types, score reduced to ${finalScore}`);
                        }
                    }
                    finalScore = await this.decisionParamsInjector.adjustRouteDirectionScore(rd.id, countryCode, finalScore, decisionParams, rd);
                    this.logger.debug(`Adjusted score for RD ${rd.id}: ${breakdown.totalScore} -> ${finalScore}`);
                }
                catch (error) {
                    this.logger.warn(`Failed to adjust score: ${error}`);
                }
            }
            return {
                routeDirection: rd,
                score: finalScore,
                breakdown,
                matchedSignals: this.extractMatchedSignals(rd, userIntent, month),
            };
        }));
        const sorted = scored.sort((a, b) => b.score - a.score);
        const rejected = sorted.slice(3, 6).map(item => ({
            routeDirectionId: item.routeDirection.id,
            routeDirectionName: item.routeDirection.name,
            score: item.score,
            primaryReason: this.getPrimaryRejectionReason(item.breakdown),
            details: {
                tagMatch: {
                    score: item.breakdown.tagMatch.score,
                    reason: item.breakdown.tagMatch.matchedTags.length === 0
                        ? '标签不匹配'
                        : `标签匹配度较低（${item.breakdown.tagMatch.matchedTags.length}/${item.breakdown.tagMatch.totalTags}）`,
                },
                seasonality: {
                    score: item.breakdown.seasonality.score,
                    reason: item.breakdown.seasonality.isAvoidMonth
                        ? '禁忌月份'
                        : item.breakdown.seasonality.isBestMonth
                            ? '最佳月份'
                            : '非最佳月份',
                },
                pace: {
                    score: item.breakdown.pace.score,
                    reason: item.breakdown.pace.compatible ? '节奏匹配' : '节奏不匹配',
                },
                risk: {
                    score: item.breakdown.risk.score,
                    reason: item.breakdown.risk.compatible ? '风险匹配' : '风险不匹配',
                },
            },
        }));
        const top3 = sorted.slice(0, 3).map(item => {
            const { totalScore, ...scoreBreakdown } = item.breakdown;
            return {
                routeDirection: item.routeDirection,
                score: item.score,
                reasons: this.generateReasons(item.routeDirection, userIntent, item.score, month),
                constraints: item.routeDirection.constraints,
                riskProfile: item.routeDirection.riskProfile,
                signaturePois: item.routeDirection.signaturePois,
                scoreBreakdown: scoreBreakdown,
                matchedSignals: item.matchedSignals,
            };
        });
        const deprecatedAlternatives = deprecatedRds.slice(0, 3).map(rd => ({
            routeDirectionId: rd.id,
            routeDirectionName: rd.name,
            score: 0,
            reasons: ['此路线方向已废弃，仅作为历史参考'],
            status: 'deprecated',
            version: rd.version,
        }));
        const whyNotOthers = this.generateWhyNotOthers(top3, sorted.slice(3, 6), userIntent, month);
        const explanation = {
            selected: {
                routeDirectionId: ((_b = top3[0]) === null || _b === void 0 ? void 0 : _b.routeDirection.id) || 0,
                routeDirectionName: ((_c = top3[0]) === null || _c === void 0 ? void 0 : _c.routeDirection.name) || '',
                score: ((_d = top3[0]) === null || _d === void 0 ? void 0 : _d.score) || 0,
                scoreBreakdown: ((_e = top3[0]) === null || _e === void 0 ? void 0 : _e.scoreBreakdown) || this.createEmptyBreakdown(),
                matchedSignals: ((_f = top3[0]) === null || _f === void 0 ? void 0 : _f.matchedSignals) || this.createEmptyMatchedSignals(userIntent, month),
                reasons: ((_g = top3[0]) === null || _g === void 0 ? void 0 : _g.reasons) || [],
                version: (_j = (_h = top3[0]) === null || _h === void 0 ? void 0 : _h.routeDirection) === null || _j === void 0 ? void 0 : _j.version,
            },
            alternatives: {
                top3: top3.map(item => {
                    var _a;
                    return ({
                        routeDirectionId: item.routeDirection.id,
                        routeDirectionName: item.routeDirection.name,
                        score: item.score,
                        reasons: item.reasons,
                        version: (_a = item.routeDirection) === null || _a === void 0 ? void 0 : _a.version,
                    });
                }),
                rejected,
                deprecated: deprecatedAlternatives.length > 0 ? deprecatedAlternatives : undefined,
            },
            whyNotOthers: whyNotOthers,
        };
        this.logger.log(`RouteDirection 选择解释: ${JSON.stringify(explanation, null, 2)}`);
        const latencyMs = Date.now() - startTime;
        if (this.observabilityService && requestId) {
            this.observabilityService.recordRdSelectLatency(requestId, latencyMs);
            if (top3.length > 0) {
                this.observabilityService.recordSelectedRd(requestId, top3[0].routeDirection.id, top3[0].routeDirection.name, {
                    countryCode,
                    month,
                    userIntent: {
                        preferences: userIntent.preferences,
                        pace: userIntent.pace,
                        riskTolerance: userIntent.riskTolerance,
                    },
                    scoreBreakdown: top3[0].scoreBreakdown ? {
                        tagMatch: top3[0].scoreBreakdown.tagMatch.score,
                        seasonMatch: top3[0].scoreBreakdown.seasonality.score,
                        paceMatch: top3[0].scoreBreakdown.pace.score,
                        riskMatch: top3[0].scoreBreakdown.risk.score,
                        totalScore: top3[0].score,
                    } : undefined,
                    matchedSignals: top3[0].matchedSignals,
                });
            }
        }
        if (this.cacheService) {
            await this.cacheService.cacheRdSelection(countryCode, month, userIntent, top3);
        }
        this.logger.log(`选择了 ${top3.length} 条路线方向`);
        return top3;
    }
    scoreRouteDirectionWithBreakdown(routeDirection, userIntent, month) {
        var _a, _b, _c;
        const userTags = userIntent.preferences || [];
        const routeTags = routeDirection.tags || [];
        const matchedTags = userTags.filter(tag => routeTags.includes(tag));
        const tagOverlap = this.calculateTagOverlap(userTags, routeTags);
        const seasonality = routeDirection.seasonality;
        const isBestMonth = month && ((_a = seasonality === null || seasonality === void 0 ? void 0 : seasonality.bestMonths) === null || _a === void 0 ? void 0 : _a.includes(month));
        const isAvoidMonth = month && ((_b = seasonality === null || seasonality === void 0 ? void 0 : seasonality.avoidMonths) === null || _b === void 0 ? void 0 : _b.includes(month));
        const seasonalityScore = isBestMonth ? 100 : isAvoidMonth ? 0 : month ? 33 : 50;
        const skeleton = routeDirection.itinerarySkeleton;
        const routePace = (_c = skeleton === null || skeleton === void 0 ? void 0 : skeleton.dailyPace) === null || _c === void 0 ? void 0 : _c.toUpperCase();
        const paceMatch = this.matchPace(routeDirection, userIntent.pace);
        const paceScore = paceMatch * 100;
        const riskMatch = this.matchRisk(routeDirection, userIntent.riskTolerance);
        const riskScore = riskMatch * 100;
        const breakdown = {
            tagMatch: {
                score: tagOverlap * 100,
                weight: 0.4,
                matchedTags,
                totalTags: routeTags.length,
            },
            seasonality: {
                score: seasonalityScore,
                weight: 0.3,
                isBestMonth: isBestMonth || false,
                isAvoidMonth: isAvoidMonth || false,
                month: month || 0,
            },
            pace: {
                score: paceScore,
                weight: 0.2,
                userPace: userIntent.pace || 'moderate',
                routePace: routePace || 'MODERATE',
                compatible: paceMatch > 0.7,
            },
            risk: {
                score: riskScore,
                weight: 0.1,
                userTolerance: userIntent.riskTolerance || 'medium',
                routeRisk: this.inferRouteRisk(routeDirection),
                compatible: riskMatch > 0.7,
            },
        };
        const totalScore = breakdown.tagMatch.score * breakdown.tagMatch.weight +
            breakdown.seasonality.score * breakdown.seasonality.weight +
            breakdown.pace.score * breakdown.pace.weight +
            breakdown.risk.score * breakdown.risk.weight;
        return { ...breakdown, totalScore: Math.max(0, Math.min(100, totalScore)) };
    }
    extractMatchedSignals(routeDirection, userIntent, month) {
        var _a;
        const userTags = userIntent.preferences || [];
        const routeTags = routeDirection.tags || [];
        const matchedTags = userTags.filter(tag => routeTags.includes(tag));
        const unmatchedTags = userTags.filter(tag => !routeTags.includes(tag));
        const seasonality = routeDirection.seasonality;
        const riskProfile = routeDirection.riskProfile;
        const skeleton = routeDirection.itinerarySkeleton;
        const routePace = ((_a = skeleton === null || skeleton === void 0 ? void 0 : skeleton.dailyPace) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || 'MODERATE';
        const paceMatch = this.matchPace(routeDirection, userIntent.pace);
        const paceCompatibility = paceMatch > 0.8 ? 'high' : paceMatch > 0.5 ? 'medium' : 'low';
        const riskFactors = [];
        if (riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.altitudeSickness)
            riskFactors.push('高反风险');
        if (riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.roadClosure)
            riskFactors.push('封路风险');
        if (riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.ferryDependent)
            riskFactors.push('依赖渡轮');
        if (riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.weatherWindow)
            riskFactors.push('天气窗口限制');
        return {
            tags: {
                matched: matchedTags,
                unmatched: unmatchedTags,
                routeTags,
            },
            seasonality: {
                month: month || 0,
                bestMonths: (seasonality === null || seasonality === void 0 ? void 0 : seasonality.bestMonths) || [],
                avoidMonths: (seasonality === null || seasonality === void 0 ? void 0 : seasonality.avoidMonths) || [],
            },
            pace: {
                userPace: userIntent.pace || 'moderate',
                routePace,
                compatibility: paceCompatibility,
            },
            risk: {
                userTolerance: userIntent.riskTolerance || 'medium',
                routeHasHighRisk: riskFactors.length > 0,
                riskFactors,
            },
        };
    }
    inferRouteRisk(routeDirection) {
        const riskProfile = routeDirection.riskProfile;
        if (!riskProfile)
            return 'low';
        const riskCount = (riskProfile.altitudeSickness ? 1 : 0) +
            (riskProfile.roadClosure ? 1 : 0) +
            (riskProfile.ferryDependent ? 1 : 0);
        if (riskCount >= 2)
            return 'high';
        if (riskCount === 1)
            return 'medium';
        return 'low';
    }
    getPrimaryRejectionReason(breakdown) {
        const scores = [
            { name: '标签匹配', score: breakdown.tagMatch.score, weight: breakdown.tagMatch.weight },
            { name: '季节性', score: breakdown.seasonality.score, weight: breakdown.seasonality.weight },
            { name: '节奏', score: breakdown.pace.score, weight: breakdown.pace.weight },
            { name: '风险', score: breakdown.risk.score, weight: breakdown.risk.weight },
        ];
        const weightedScores = scores.map(s => s.score * s.weight);
        const minIndex = weightedScores.indexOf(Math.min(...weightedScores));
        return `${scores[minIndex].name}得分较低`;
    }
    createEmptyBreakdown() {
        return {
            tagMatch: { score: 0, weight: 0.4, matchedTags: [], totalTags: 0 },
            seasonality: { score: 0, weight: 0.3, isBestMonth: false, isAvoidMonth: false, month: 0 },
            pace: { score: 0, weight: 0.2, userPace: 'moderate', routePace: 'MODERATE', compatible: false },
            risk: { score: 0, weight: 0.1, userTolerance: 'medium', routeRisk: 'low', compatible: false },
        };
    }
    createEmptyMatchedSignals(userIntent, month) {
        return {
            tags: { matched: [], unmatched: userIntent.preferences || [], routeTags: [] },
            seasonality: { month: month || 0, bestMonths: [], avoidMonths: [] },
            pace: { userPace: userIntent.pace || 'moderate', routePace: 'MODERATE', compatibility: 'low' },
            risk: { userTolerance: userIntent.riskTolerance || 'medium', routeHasHighRisk: false, riskFactors: [] },
        };
    }
    scoreRouteDirection(routeDirection, userIntent, month) {
        var _a, _b;
        let score = 0;
        const userTags = userIntent.preferences || [];
        const routeTags = routeDirection.tags || [];
        const tagOverlap = this.calculateTagOverlap(userTags, routeTags);
        score += tagOverlap * 40;
        if (month) {
            const seasonality = routeDirection.seasonality;
            if (seasonality) {
                const isBestMonth = (_a = seasonality.bestMonths) === null || _a === void 0 ? void 0 : _a.includes(month);
                const isAvoidMonth = (_b = seasonality.avoidMonths) === null || _b === void 0 ? void 0 : _b.includes(month);
                if (isBestMonth) {
                    score += 30;
                }
                else if (isAvoidMonth) {
                    score -= 20;
                }
                else {
                    score += 10;
                }
            }
            else {
                score += 15;
            }
        }
        else {
            score += 15;
        }
        const paceMatch = this.matchPace(routeDirection, userIntent.pace);
        score += paceMatch * 20;
        const riskMatch = this.matchRisk(routeDirection, userIntent.riskTolerance);
        score += riskMatch * 10;
        return Math.max(0, Math.min(100, score));
    }
    calculateTagOverlap(userTags, routeTags) {
        if (userTags.length === 0)
            return 0.5;
        if (routeTags.length === 0)
            return 0.3;
        const intersection = userTags.filter(tag => routeTags.includes(tag));
        return intersection.length / Math.max(userTags.length, routeTags.length);
    }
    matchPace(routeDirection, userPace) {
        var _a;
        if (!userPace)
            return 0.5;
        const skeleton = routeDirection.itinerarySkeleton;
        const routePace = (_a = skeleton === null || skeleton === void 0 ? void 0 : skeleton.dailyPace) === null || _a === void 0 ? void 0 : _a.toUpperCase();
        const paceMap = {
            RELAXED: ['LIGHT', 'RELAX', 'MODERATE'],
            MODERATE: ['MODERATE', 'BALANCED'],
            INTENSE: ['INTENSE', 'CHALLENGE', 'MODERATE'],
        };
        const compatiblePaces = paceMap[userPace.toUpperCase()] || [];
        if (routePace && compatiblePaces.includes(routePace)) {
            return 1.0;
        }
        return 0.3;
    }
    matchRisk(routeDirection, riskTolerance) {
        if (!riskTolerance)
            return 0.5;
        const riskProfile = routeDirection.riskProfile;
        if (!riskProfile)
            return 0.5;
        const hasHighRisk = riskProfile.altitudeSickness || riskProfile.roadClosure;
        if (riskTolerance === 'low' && !hasHighRisk) {
            return 1.0;
        }
        else if (riskTolerance === 'high' && hasHighRisk) {
            return 1.0;
        }
        else if (riskTolerance === 'medium') {
            return 0.7;
        }
        return 0.3;
    }
    generateReasons(routeDirection, userIntent, score, month) {
        var _a, _b;
        const reasons = [];
        const userTags = userIntent.preferences || [];
        const routeTags = routeDirection.tags || [];
        const matchedTags = userTags.filter(tag => routeTags.includes(tag));
        if (matchedTags.length > 0) {
            reasons.push(`匹配您的偏好：${matchedTags.join('、')}`);
        }
        if (month) {
            const seasonality = routeDirection.seasonality;
            if ((_a = seasonality === null || seasonality === void 0 ? void 0 : seasonality.bestMonths) === null || _a === void 0 ? void 0 : _a.includes(month)) {
                reasons.push(`${month}月是此路线的最佳季节`);
            }
            else if ((_b = seasonality === null || seasonality === void 0 ? void 0 : seasonality.avoidMonths) === null || _b === void 0 ? void 0 : _b.includes(month)) {
                reasons.push(`注意：${month}月可能不是最佳季节`);
            }
        }
        if (routeDirection.description) {
            reasons.push(routeDirection.description.substring(0, 100));
        }
        const paceMatch = this.matchPace(routeDirection, userIntent.pace);
        if (paceMatch > 0.7) {
            reasons.push(`节奏与您的偏好匹配`);
        }
        const riskProfile = routeDirection.riskProfile;
        if (riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.altitudeSickness) {
            reasons.push(`需要适应高海拔`);
        }
        if (riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.ferryDependent) {
            reasons.push(`依赖渡轮/出海班次`);
        }
        return reasons;
    }
    generateWhyNotOthers(top3, next3, userIntent, month) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (top3.length === 0 || next3.length === 0) {
            return undefined;
        }
        const selected = top3[0];
        const topAlternative = next3[0];
        if (!selected || !topAlternative) {
            return undefined;
        }
        const scoreDifference = selected.score - topAlternative.score;
        const whyNotReasons = [];
        if (scoreDifference > 20) {
            whyNotReasons.push(`综合评分比"${topAlternative.routeDirection.name}"高 ${Math.round(scoreDifference)} 分`);
        }
        const selectedTags = ((_b = (_a = selected.matchedSignals) === null || _a === void 0 ? void 0 : _a.tags) === null || _b === void 0 ? void 0 : _b.matched) || [];
        const alternativeTags = ((_d = (_c = topAlternative.matchedSignals) === null || _c === void 0 ? void 0 : _c.tags) === null || _d === void 0 ? void 0 : _d.matched) || [];
        const missingTags = alternativeTags.filter(tag => !selectedTags.includes(tag));
        if (missingTags.length > 0) {
            whyNotReasons.push(`更匹配您的偏好标签：${selectedTags.join('、')}`);
        }
        if (month) {
            const selectedSeasonality = (_e = selected.matchedSignals) === null || _e === void 0 ? void 0 : _e.seasonality;
            const alternativeSeasonality = (_f = topAlternative.matchedSignals) === null || _f === void 0 ? void 0 : _f.seasonality;
            if (((_g = selectedSeasonality === null || selectedSeasonality === void 0 ? void 0 : selectedSeasonality.bestMonths) === null || _g === void 0 ? void 0 : _g.includes(month)) &&
                !((_h = alternativeSeasonality === null || alternativeSeasonality === void 0 ? void 0 : alternativeSeasonality.bestMonths) === null || _h === void 0 ? void 0 : _h.includes(month))) {
                whyNotReasons.push(`${month}月是这条路线的最佳季节`);
            }
        }
        const selectedPace = (_j = selected.matchedSignals) === null || _j === void 0 ? void 0 : _j.pace;
        const alternativePace = (_k = topAlternative.matchedSignals) === null || _k === void 0 ? void 0 : _k.pace;
        if ((selectedPace === null || selectedPace === void 0 ? void 0 : selectedPace.compatibility) === 'high' && (alternativePace === null || alternativePace === void 0 ? void 0 : alternativePace.compatibility) !== 'high') {
            whyNotReasons.push(`节奏更符合您的偏好（${userIntent.pace || 'moderate'}）`);
        }
        const selectedRisk = (_l = selected.matchedSignals) === null || _l === void 0 ? void 0 : _l.risk;
        const alternativeRisk = (_m = topAlternative.matchedSignals) === null || _m === void 0 ? void 0 : _m.risk;
        if (selectedRisk && !selectedRisk.routeHasHighRisk && (alternativeRisk === null || alternativeRisk === void 0 ? void 0 : alternativeRisk.routeHasHighRisk)) {
            whyNotReasons.push(`风险更低，更适合您的风险承受度`);
        }
        const whyNot = whyNotReasons.length > 0
            ? whyNotReasons.join('；')
            : `综合评分更高（${Math.round(scoreDifference)} 分）`;
        const commonReasons = [];
        if (next3.length > 1) {
            const reasons = next3.slice(1).map(item => {
                var _a, _b, _c;
                const breakdown = item.breakdown;
                const lowScores = [];
                if (((_a = breakdown.tagMatch) === null || _a === void 0 ? void 0 : _a.score) && breakdown.tagMatch.score < 50) {
                    lowScores.push('标签匹配度低');
                }
                if (((_b = breakdown.seasonality) === null || _b === void 0 ? void 0 : _b.score) && breakdown.seasonality.score < 50) {
                    lowScores.push('季节性不匹配');
                }
                if (((_c = breakdown.pace) === null || _c === void 0 ? void 0 : _c.score) && breakdown.pace.score < 50) {
                    lowScores.push('节奏不匹配');
                }
                return lowScores;
            }).flat();
            const reasonCounts = new Map();
            reasons.forEach(reason => {
                reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
            });
            const sortedReasons = Array.from(reasonCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([reason]) => reason);
            commonReasons.push(...sortedReasons);
        }
        return {
            topAlternative: {
                routeDirectionId: topAlternative.routeDirection.id,
                routeDirectionName: topAlternative.routeDirection.name,
                whyNot,
                scoreDifference: Math.round(scoreDifference),
            },
            commonReasons: commonReasons.length > 0 ? commonReasons : undefined,
        };
    }
};
exports.RouteDirectionSelectorService = RouteDirectionSelectorService;
exports.RouteDirectionSelectorService = RouteDirectionSelectorService = RouteDirectionSelectorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [route_directions_service_1.RouteDirectionsService,
        route_direction_observability_service_1.RouteDirectionObservabilityService,
        route_direction_cache_service_1.RouteDirectionCacheService,
        decision_params_injector_service_1.DecisionParamsInjectorService])
], RouteDirectionSelectorService);
//# sourceMappingURL=route-direction-selector.service.js.map