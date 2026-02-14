"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RhythmMatchingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RhythmMatchingService = void 0;
const common_1 = require("@nestjs/common");
let RhythmMatchingService = RhythmMatchingService_1 = class RhythmMatchingService {
    constructor() {
        this.logger = new common_1.Logger(RhythmMatchingService_1.name);
        this.rhythmTypeDefinitions = {
            INTENSIVE: {
                type: 'INTENSIVE',
                dailySteps: { min: 15000, max: 25000 },
                poiCount: { min: 5, max: 8 },
                restTime: { min: 0.5, max: 1.5 },
                suitableFor: ['体力充沛', '时间紧张', '追求效率'],
                warnings: ['可能过于疲劳', '需要充分休息'],
                typicalSchedule: '早出晚归，密集活动，少量休息',
            },
            RELAXED: {
                type: 'RELAXED',
                dailySteps: { min: 5000, max: 10000 },
                poiCount: { min: 1, max: 3 },
                restTime: { min: 2, max: 4 },
                suitableFor: ['想要放松', '时间充足', '注重体验'],
                warnings: ['可能错过一些景点', '需要更多时间'],
                typicalSchedule: '晚起早归，少量活动，充分休息',
            },
            FLEXIBLE: {
                type: 'FLEXIBLE',
                dailySteps: { min: 8000, max: 15000 },
                poiCount: { min: 2, max: 5 },
                restTime: { min: 1, max: 3 },
                suitableFor: ['喜欢灵活', '不确定偏好', '首次旅行'],
                warnings: ['需要灵活调整', '可能不够紧凑'],
                typicalSchedule: '根据当天状态灵活调整',
            },
            THEMED: {
                type: 'THEMED',
                dailySteps: { min: 10000, max: 18000 },
                poiCount: { min: 3, max: 6 },
                restTime: { min: 1, max: 2.5 },
                suitableFor: ['有明确主题', '深度体验', '文化探索'],
                warnings: ['需要提前规划', '可能错过其他类型'],
                typicalSchedule: '围绕主题安排，深度体验',
            },
            HYBRID: {
                type: 'HYBRID',
                dailySteps: { min: 10000, max: 20000 },
                poiCount: { min: 3, max: 7 },
                restTime: { min: 1, max: 3 },
                suitableFor: ['多样化需求', '平衡体验', '经验丰富'],
                warnings: ['需要良好规划', '可能过于复杂'],
                typicalSchedule: '混合不同类型，平衡安排',
            },
        };
    }
    async calculateRhythmMatch(route, userPersona, tripContext) {
        const routeProfile = this.extractRouteRhythmProfile(route);
        const userCapacity = this.extractUserRhythmCapacity(userPersona, tripContext);
        const scores = this.computeMatchingScores(routeProfile, userCapacity);
        const recommendedRhythm = this.recommendRhythmType(scores, routeProfile, userCapacity);
        const adjustments = this.generateRhythmAdjustments(recommendedRhythm, routeProfile, userCapacity);
        const alternativeRhythms = this.generateAlternativeRhythms(scores, recommendedRhythm);
        return {
            scores,
            recommendedRhythm,
            recommendationReason: this.generateRecommendationReason(recommendedRhythm, scores),
            adjustments,
            alternativeRhythms,
        };
    }
    async triggerRhythmAdjustment(userPersona, travelProgress, newSignals) {
        const needsAdjustment = this.shouldTriggerAdjustment(userPersona, travelProgress, newSignals);
        if (!needsAdjustment) {
            return {
                needsAdjustment: false,
                adjustments: [],
                reasons: [],
                expectedEffects: [],
            };
        }
        const adjustmentType = this.determineAdjustmentType(travelProgress, newSignals);
        const adjustments = this.generateDynamicAdjustments(userPersona, travelProgress, newSignals);
        const reasons = this.generateAdjustmentReasons(travelProgress, newSignals);
        const expectedEffects = this.generateExpectedEffects(adjustments);
        return {
            needsAdjustment: true,
            adjustmentType,
            adjustments,
            reasons,
            expectedEffects,
        };
    }
    recommendRhythmType(scores, routeProfile, userCapacity) {
        if (userCapacity.preferredRhythmType) {
            const preferredScore = this.calculateRhythmTypeScore(userCapacity.preferredRhythmType, routeProfile, userCapacity);
            if (preferredScore >= 0.7) {
                return userCapacity.preferredRhythmType;
            }
        }
        const rhythmScores = Object.keys(this.rhythmTypeDefinitions).map(type => ({
            type: type,
            score: this.calculateRhythmTypeScore(type, routeProfile, userCapacity),
        }));
        rhythmScores.sort((a, b) => b.score - a.score);
        return rhythmScores[0].type;
    }
    extractRouteRhythmProfile(route) {
        var _a, _b;
        const constraints = route.constraints || {};
        const itinerarySkeleton = route.itinerarySkeleton || {};
        const metadata = route.metadata || {};
        const maxElevation = ((_a = constraints.hard) === null || _a === void 0 ? void 0 : _a.maxElevationM) || 0;
        const maxSlope = ((_b = constraints.hard) === null || _b === void 0 ? void 0 : _b.maxSlopePct) || 0;
        const physicalIntensity = this.calculatePhysicalIntensity(maxElevation, maxSlope);
        const mentalLoad = this.calculateMentalLoad(route);
        const informationDensity = this.calculateInformationDensity(route);
        const decisionFrequency = this.calculateDecisionFrequency(route);
        const environmentalStimulation = this.calculateEnvironmentalStimulation(route);
        const estimatedDuration = metadata.estimatedDuration || 7;
        const averageDailySteps = this.estimateDailySteps(route, estimatedDuration);
        const averageDailyPois = this.estimateDailyPois(route, estimatedDuration);
        const averageDailyRestTime = this.estimateDailyRestTime(route, estimatedDuration);
        const rhythmVariation = this.calculateRhythmVariation(route);
        return {
            physicalIntensity,
            mentalLoad,
            informationDensity,
            decisionFrequency,
            environmentalStimulation,
            averageDailySteps,
            averageDailyPois,
            averageDailyRestTime,
            rhythmVariation,
        };
    }
    calculatePhysicalIntensity(maxElevation, maxSlope) {
        let intensity = 0;
        if (maxElevation > 4000) {
            intensity += 0.5;
        }
        else if (maxElevation > 3000) {
            intensity += 0.4;
        }
        else if (maxElevation > 2000) {
            intensity += 0.3;
        }
        else if (maxElevation > 1000) {
            intensity += 0.2;
        }
        else {
            intensity += 0.1;
        }
        if (maxSlope > 30) {
            intensity += 0.5;
        }
        else if (maxSlope > 20) {
            intensity += 0.4;
        }
        else if (maxSlope > 15) {
            intensity += 0.3;
        }
        else if (maxSlope > 10) {
            intensity += 0.2;
        }
        else {
            intensity += 0.1;
        }
        return Math.min(1.0, intensity);
    }
    calculateMentalLoad(route) {
        var _a;
        let load = 0;
        const constraints = route.constraints || {};
        if (constraints.requiresPermit)
            load += 0.2;
        if ((_a = constraints.hard) === null || _a === void 0 ? void 0 : _a.requiresGuide)
            load += 0.2;
        const riskProfile = route.riskProfile || {};
        if (riskProfile.altitudeSickness)
            load += 0.2;
        if (riskProfile.weatherWindow)
            load += 0.15;
        if (riskProfile.roadClosure)
            load += 0.15;
        const tags = route.tags || [];
        if (tags.includes('挑战') || tags.includes('冒险'))
            load += 0.1;
        return Math.min(1.0, load);
    }
    calculateInformationDensity(route) {
        let density = 0;
        const signaturePois = route.signaturePois || {};
        const poiTypes = signaturePois.types || [];
        density += Math.min(poiTypes.length / 10, 0.4);
        const description = route.description || '';
        density += Math.min(description.length / 1000, 0.3);
        const tags = route.tags || [];
        density += Math.min(tags.length / 10, 0.3);
        return Math.min(1.0, density);
    }
    calculateDecisionFrequency(route) {
        const itinerarySkeleton = route.itinerarySkeleton || {};
        const dayThemes = itinerarySkeleton.dayThemes || [];
        const optionalActivities = itinerarySkeleton.optionalActivities || [];
        let frequency = 0;
        frequency += Math.min(dayThemes.length / 10, 0.4);
        frequency += Math.min(optionalActivities.length / 10, 0.6);
        return Math.min(1.0, frequency);
    }
    calculateEnvironmentalStimulation(route) {
        const tags = route.tags || [];
        let stimulation = 0;
        if (tags.includes('自然') || tags.includes('风景'))
            stimulation += 0.3;
        if (tags.includes('文化') || tags.includes('历史'))
            stimulation += 0.2;
        if (tags.includes('城市') || tags.includes('现代'))
            stimulation += 0.2;
        if (tags.includes('冒险') || tags.includes('挑战'))
            stimulation += 0.3;
        return Math.min(1.0, stimulation);
    }
    estimateDailySteps(route, duration) {
        const tags = route.tags || [];
        const baseSteps = tags.includes('徒步') || tags.includes('登山') ? 15000 : 10000;
        return baseSteps;
    }
    estimateDailyPois(route, duration) {
        const signaturePois = route.signaturePois || {};
        const poiTypes = signaturePois.types || [];
        return duration > 0 ? Math.ceil(poiTypes.length / duration) : 3;
    }
    estimateDailyRestTime(route, duration) {
        var _a, _b, _c, _d;
        const physicalIntensity = this.calculatePhysicalIntensity(((_b = (_a = route.constraints) === null || _a === void 0 ? void 0 : _a.hard) === null || _b === void 0 ? void 0 : _b.maxElevationM) || 0, ((_d = (_c = route.constraints) === null || _c === void 0 ? void 0 : _c.hard) === null || _d === void 0 ? void 0 : _d.maxSlopePct) || 0);
        return 1 + physicalIntensity * 2;
    }
    calculateRhythmVariation(route) {
        const itinerarySkeleton = route.itinerarySkeleton || {};
        const dayThemes = itinerarySkeleton.dayThemes || [];
        const dailyPace = itinerarySkeleton.dailyPace || [];
        const themeVariation = dayThemes.length > 1 ? 0.5 : 0.2;
        const paceVariation = dailyPace.length > 1 ? 0.5 : 0.2;
        return Math.min(1.0, (themeVariation + paceVariation) / 2);
    }
    extractUserRhythmCapacity(userPersona, tripContext) {
        const physicalState = userPersona.currentState.physical;
        const psychologicalState = userPersona.currentState.psychological;
        const temporalState = userPersona.currentState.temporal;
        const preferences = userPersona.preferences;
        const physicalCapacity = this.calculatePhysicalCapacity(physicalState);
        const attentionCapacity = this.calculateAttentionCapacity(psychologicalState);
        const emotionalCapacity = this.calculateEmotionalCapacity(psychologicalState);
        const dailyAvailableTime = temporalState.availableDays > 0
            ? (temporalState.availableDays * 8) / temporalState.availableDays
            : 8;
        const preferredRhythmType = this.mapPreferenceToRhythmType(preferences);
        const rhythmFlexibility = this.determineRhythmFlexibility(userPersona, tripContext);
        return {
            physicalCapacity,
            attentionCapacity,
            emotionalCapacity,
            dailyAvailableTime,
            preferredRhythmType,
            rhythmFlexibility,
        };
    }
    calculatePhysicalCapacity(physicalState) {
        const fitnessLevel = physicalState.fitnessLevel || 5;
        const fatigueLevel = physicalState.fatigueLevel || 0.3;
        const healthStatus = physicalState.healthStatus || 'GOOD';
        let capacity = fitnessLevel / 10;
        capacity -= fatigueLevel * 0.3;
        if (healthStatus === 'EXCELLENT')
            capacity += 0.1;
        else if (healthStatus === 'POOR')
            capacity -= 0.2;
        return Math.max(0, Math.min(1, capacity));
    }
    calculateAttentionCapacity(psychologicalState) {
        const stressLevel = psychologicalState.stressLevel || 0.3;
        const confidenceLevel = psychologicalState.confidenceLevel || 0.5;
        let capacity = confidenceLevel;
        capacity -= stressLevel * 0.3;
        return Math.max(0, Math.min(1, capacity));
    }
    calculateEmotionalCapacity(psychologicalState) {
        const excitementLevel = psychologicalState.excitementLevel || 0.6;
        const mood = psychologicalState.mood || 'POSITIVE';
        let capacity = excitementLevel;
        if (mood === 'POSITIVE')
            capacity += 0.2;
        else if (mood === 'NEGATIVE')
            capacity -= 0.2;
        return Math.max(0, Math.min(1, capacity));
    }
    mapPreferenceToRhythmType(preferences) {
        const pacePreference = preferences.pacePreference;
        if (pacePreference === 'FAST')
            return 'INTENSIVE';
        if (pacePreference === 'SLOW')
            return 'RELAXED';
        if (pacePreference === 'MODERATE')
            return 'FLEXIBLE';
        return undefined;
    }
    determineRhythmFlexibility(userPersona, tripContext) {
        const timePressure = (tripContext === null || tripContext === void 0 ? void 0 : tripContext.timePressure) || userPersona.currentState.temporal.timePressure;
        const timeFlexibility = userPersona.currentState.temporal.timeFlexibility;
        if (timePressure > 0.7 || timeFlexibility === 'LOW')
            return 'LOW';
        if (timePressure < 0.3 || timeFlexibility === 'HIGH')
            return 'HIGH';
        return 'MEDIUM';
    }
    computeMatchingScores(routeProfile, userCapacity) {
        const physicalMatch = this.calculatePhysicalMatch(routeProfile.physicalIntensity, userCapacity.physicalCapacity);
        const attentionMatch = this.calculateAttentionMatch(routeProfile.mentalLoad + routeProfile.informationDensity, userCapacity.attentionCapacity);
        const emotionalMatch = this.calculateEmotionalMatch(routeProfile.environmentalStimulation, userCapacity.emotionalCapacity);
        const timeMatch = this.calculateTimeMatch(routeProfile, userCapacity);
        const overallMatch = physicalMatch * 0.3 +
            attentionMatch * 0.25 +
            emotionalMatch * 0.2 +
            timeMatch * 0.25;
        return {
            physicalMatch,
            attentionMatch,
            emotionalMatch,
            timeMatch,
            overallMatch,
        };
    }
    calculatePhysicalMatch(routeIntensity, userCapacity) {
        const idealIntensity = userCapacity * 0.8;
        const diff = Math.abs(routeIntensity - idealIntensity);
        return Math.max(0, 1 - diff * 2);
    }
    calculateAttentionMatch(routeLoad, userCapacity) {
        if (routeLoad <= userCapacity) {
            return 1.0;
        }
        const overload = routeLoad - userCapacity;
        return Math.max(0, 1 - overload * 2);
    }
    calculateEmotionalMatch(routeStimulation, userCapacity) {
        const diff = Math.abs(routeStimulation - userCapacity);
        return Math.max(0, 1 - diff * 1.5);
    }
    calculateTimeMatch(routeProfile, userCapacity) {
        const estimatedRouteTime = routeProfile.averageDailyPois * 2 + routeProfile.averageDailyRestTime;
        const timeRatio = estimatedRouteTime / userCapacity.dailyAvailableTime;
        if (timeRatio <= 0.8) {
            return 1.0;
        }
        else if (timeRatio <= 1.0) {
            return 0.8;
        }
        else if (timeRatio <= 1.2) {
            return 0.5;
        }
        else {
            return 0.2;
        }
    }
    calculateRhythmTypeScore(rhythmType, routeProfile, userCapacity) {
        const definition = this.rhythmTypeDefinitions[rhythmType];
        let score = 0;
        let factors = 0;
        const stepsMatch = this.matchRange(routeProfile.averageDailySteps, definition.dailySteps.min, definition.dailySteps.max);
        score += stepsMatch * 0.3;
        factors += 0.3;
        const poiMatch = this.matchRange(routeProfile.averageDailyPois, definition.poiCount.min, definition.poiCount.max);
        score += poiMatch * 0.3;
        factors += 0.3;
        const restMatch = this.matchRange(routeProfile.averageDailyRestTime, definition.restTime.min, definition.restTime.max);
        score += restMatch * 0.2;
        factors += 0.2;
        if (userCapacity.preferredRhythmType === rhythmType) {
            score += 0.2;
        }
        factors += 0.2;
        return factors > 0 ? score / factors : 0.5;
    }
    matchRange(value, min, max) {
        if (value >= min && value <= max) {
            return 1.0;
        }
        else if (value < min) {
            return Math.max(0, 1 - (min - value) / min);
        }
        else {
            return Math.max(0, 1 - (value - max) / max);
        }
    }
    generateRhythmAdjustments(recommendedRhythm, routeProfile, userCapacity) {
        const adjustments = [];
        if (routeProfile.physicalIntensity > userCapacity.physicalCapacity * 1.2) {
            adjustments.push({
                type: 'REDUCE_INTENSITY',
                description: '路线物理强度超出你的能力范围',
                priority: 'HIGH',
                suggestions: [
                    '考虑减少每日活动量',
                    '增加休息时间',
                    '选择强度较低的替代路线',
                ],
            });
        }
        const totalLoad = routeProfile.mentalLoad + routeProfile.informationDensity;
        if (totalLoad > userCapacity.attentionCapacity * 1.2) {
            adjustments.push({
                type: 'REDUCE_POIS',
                description: '信息密度和决策频率较高',
                priority: 'MEDIUM',
                suggestions: [
                    '减少每日POI数量',
                    '简化决策点',
                    '提前规划以减少现场决策',
                ],
            });
        }
        const estimatedTime = routeProfile.averageDailyPois * 2 + routeProfile.averageDailyRestTime;
        if (estimatedTime > userCapacity.dailyAvailableTime * 1.2) {
            adjustments.push({
                type: 'ADJUST_SCHEDULE',
                description: '预计时间超出你的可用时间',
                priority: 'HIGH',
                suggestions: [
                    '减少每日活动数量',
                    '缩短每个活动的停留时间',
                    '延长旅行天数',
                ],
            });
        }
        return adjustments;
    }
    generateAlternativeRhythms(scores, recommendedRhythm) {
        const allTypes = ['INTENSIVE', 'RELAXED', 'FLEXIBLE', 'THEMED', 'HYBRID'];
        const alternatives = allTypes
            .filter(type => type !== recommendedRhythm)
            .map(type => ({
            type,
            score: scores.overallMatch * 0.8,
            reason: `作为${recommendedRhythm}的替代选择`,
        }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 2);
        return alternatives;
    }
    generateRecommendationReason(rhythmType, scores) {
        const definition = this.rhythmTypeDefinitions[rhythmType];
        return `${rhythmType}节奏类型最适合你。整体匹配度${Math.round(scores.overallMatch * 100)}%，${definition.suitableFor.join('、')}。`;
    }
    shouldTriggerAdjustment(userPersona, travelProgress, newSignals) {
        var _a, _b;
        if (travelProgress.currentFatigue > 0.8) {
            return true;
        }
        if (((_a = newSignals.physical) === null || _a === void 0 ? void 0 : _a.fatigueLevel) && newSignals.physical.fatigueLevel > 0.7) {
            return true;
        }
        if (((_b = newSignals.psychological) === null || _b === void 0 ? void 0 : _b.stressLevel) && newSignals.psychological.stressLevel > 0.7) {
            return true;
        }
        if (travelProgress.currentSatisfaction < 0.5) {
            return true;
        }
        return false;
    }
    determineAdjustmentType(travelProgress, newSignals) {
        var _a, _b;
        if (travelProgress.currentFatigue > 0.8) {
            return 'IMMEDIATE';
        }
        if ((((_a = newSignals.physical) === null || _a === void 0 ? void 0 : _a.fatigueLevel) && newSignals.physical.fatigueLevel > 0.6) ||
            (((_b = newSignals.psychological) === null || _b === void 0 ? void 0 : _b.stressLevel) && newSignals.psychological.stressLevel > 0.6)) {
            return 'PREVENTIVE';
        }
        return 'GRADUAL';
    }
    generateDynamicAdjustments(userPersona, travelProgress, newSignals) {
        var _a, _b;
        const adjustments = [];
        if (travelProgress.currentFatigue > 0.7) {
            adjustments.push({
                type: 'INCREASE_REST',
                description: '当前疲劳度较高，建议增加休息时间',
                priority: 'HIGH',
                suggestions: [
                    '明天减少活动数量',
                    '增加休息时间',
                    '选择更轻松的活动',
                ],
            });
        }
        if (((_a = newSignals.physical) === null || _a === void 0 ? void 0 : _a.fatigueLevel) && newSignals.physical.fatigueLevel > 0.6) {
            adjustments.push({
                type: 'REDUCE_INTENSITY',
                description: '体力消耗较大，建议降低强度',
                priority: 'MEDIUM',
                suggestions: [
                    '减少高强度活动',
                    '增加低强度活动',
                    '延长休息间隔',
                ],
            });
        }
        if (((_b = newSignals.psychological) === null || _b === void 0 ? void 0 : _b.stressLevel) && newSignals.psychological.stressLevel > 0.6) {
            adjustments.push({
                type: 'ADJUST_SCHEDULE',
                description: '心理压力较大，建议调整行程',
                priority: 'MEDIUM',
                suggestions: [
                    '简化行程安排',
                    '减少决策点',
                    '增加自由时间',
                ],
            });
        }
        return adjustments;
    }
    generateAdjustmentReasons(travelProgress, newSignals) {
        var _a, _b;
        const reasons = [];
        if (travelProgress.currentFatigue > 0.7) {
            reasons.push(`当前疲劳度${Math.round(travelProgress.currentFatigue * 100)}%，需要调整`);
        }
        if (((_a = newSignals.physical) === null || _a === void 0 ? void 0 : _a.fatigueLevel) && newSignals.physical.fatigueLevel > 0.6) {
            reasons.push('体力消耗超出预期');
        }
        if (((_b = newSignals.psychological) === null || _b === void 0 ? void 0 : _b.stressLevel) && newSignals.psychological.stressLevel > 0.6) {
            reasons.push('心理压力较大');
        }
        return reasons;
    }
    generateExpectedEffects(adjustments) {
        const effects = [];
        if (adjustments.some(a => a.type === 'INCREASE_REST')) {
            effects.push('增加休息后，疲劳度会降低');
        }
        if (adjustments.some(a => a.type === 'REDUCE_INTENSITY')) {
            effects.push('降低强度后，体力消耗会减少');
        }
        if (adjustments.some(a => a.type === 'ADJUST_SCHEDULE')) {
            effects.push('调整行程后，压力会减轻');
        }
        return effects.length > 0 ? effects : ['调整后，整体体验会改善'];
    }
};
exports.RhythmMatchingService = RhythmMatchingService;
exports.RhythmMatchingService = RhythmMatchingService = RhythmMatchingService_1 = __decorate([
    (0, common_1.Injectable)()
], RhythmMatchingService);
//# sourceMappingURL=rhythm-matching.service.js.map