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
var MultiPersonDecisionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiPersonDecisionService = void 0;
const common_1 = require("@nestjs/common");
const pacing_config_interface_1 = require("../../interfaces/pacing-config.interface");
const rhythm_matching_service_1 = require("./rhythm-matching.service");
let MultiPersonDecisionService = MultiPersonDecisionService_1 = class MultiPersonDecisionService {
    constructor(rhythmMatchingService) {
        this.rhythmMatchingService = rhythmMatchingService;
        this.logger = new common_1.Logger(MultiPersonDecisionService_1.name);
    }
    async supportMultiPersonDecision(groupMembers, proposedItinerary, personas) {
        const individualPreferences = this.analyzeIndividualPreferences(groupMembers, personas);
        const conflicts = this.analyzeConflicts(individualPreferences);
        const consensus = this.findConsensus(individualPreferences);
        const individualAnalysis = await this.analyzeFitForEachMember(individualPreferences, proposedItinerary);
        const coordinationOptions = this.generateCoordinationOptions(conflicts, consensus, individualPreferences, proposedItinerary);
        const discussionTopics = this.suggestDiscussionTopics(conflicts, consensus);
        const overallRecommendation = this.generateOverallRecommendation(conflicts, consensus, coordinationOptions);
        return {
            individualAnalysis,
            conflictAreas: conflicts,
            consensus,
            optionsForCoordination: coordinationOptions,
            suggestedDiscussionPoints: discussionTopics,
            overallRecommendation,
        };
    }
    analyzeIndividualPreferences(groupMembers, personas) {
        return groupMembers.map((member, index) => {
            const travelerId = `traveler_${index}`;
            const persona = personas === null || personas === void 0 ? void 0 : personas.get(travelerId);
            const rhythmPreference = this.extractRhythmPreference(member, persona);
            const riskTolerance = this.extractRiskTolerance(member, persona);
            const interests = this.extractInterests(member, persona);
            const budgetPreference = this.extractBudgetPreference(member, persona);
            const timePreference = this.extractTimePreference(member, persona);
            return {
                travelerId,
                travelerInfo: member,
                persona,
                rhythmPreference,
                riskTolerance,
                interests,
                budgetPreference,
                timePreference,
            };
        });
    }
    extractRhythmPreference(member, persona) {
        var _a;
        if (member.mobilityProfile === pacing_config_interface_1.MobilityProfile.IRON_LEGS) {
            return 'INTENSIVE';
        }
        else if (member.mobilityProfile === pacing_config_interface_1.MobilityProfile.ACTIVE_SENIOR) {
            return 'RELAXED';
        }
        else if (member.mobilityProfile === pacing_config_interface_1.MobilityProfile.CITY_POTATO) {
            return 'FLEXIBLE';
        }
        else if (member.mobilityProfile === pacing_config_interface_1.MobilityProfile.LIMITED) {
            return 'RELAXED';
        }
        if ((_a = persona === null || persona === void 0 ? void 0 : persona.preferences) === null || _a === void 0 ? void 0 : _a.pacePreference) {
            const pace = persona.preferences.pacePreference;
            if (pace === 'FAST')
                return 'INTENSIVE';
            if (pace === 'SLOW')
                return 'RELAXED';
            if (pace === 'MODERATE')
                return 'FLEXIBLE';
        }
        return undefined;
    }
    extractRiskTolerance(member, persona) {
        var _a;
        if ((_a = persona === null || persona === void 0 ? void 0 : persona.preferences) === null || _a === void 0 ? void 0 : _a.riskTolerance) {
            const risk = persona.preferences.riskTolerance;
            if (risk === 'LOW')
                return 'LOW';
            if (risk === 'MEDIUM')
                return 'MEDIUM';
            if (risk === 'HIGH')
                return 'HIGH';
        }
        if (member.interestProfile === pacing_config_interface_1.InterestProfile.ELDERLY) {
            return 'LOW';
        }
        else if (member.interestProfile === pacing_config_interface_1.InterestProfile.CHILD) {
            return 'LOW';
        }
        return 'MEDIUM';
    }
    extractInterests(member, persona) {
        var _a;
        const interests = [];
        if (member.interestProfile === pacing_config_interface_1.InterestProfile.ELDERLY) {
            interests.push('文化', '历史', '自然');
        }
        else if (member.interestProfile === pacing_config_interface_1.InterestProfile.ADULT) {
            interests.push('文化', '美食', '购物');
        }
        else if (member.interestProfile === pacing_config_interface_1.InterestProfile.CHILD) {
            interests.push('娱乐', '互动', '教育');
        }
        if ((_a = persona === null || persona === void 0 ? void 0 : persona.preferences) === null || _a === void 0 ? void 0 : _a.interests) {
            interests.push(...persona.preferences.interests);
        }
        return Array.from(new Set(interests));
    }
    extractBudgetPreference(member, persona) {
        var _a;
        if ((_a = persona === null || persona === void 0 ? void 0 : persona.preferences) === null || _a === void 0 ? void 0 : _a.budgetPreference) {
            return persona.preferences.budgetPreference;
        }
        return 'MODERATE';
    }
    extractTimePreference(member, persona) {
        var _a;
        if ((_a = persona === null || persona === void 0 ? void 0 : persona.preferences) === null || _a === void 0 ? void 0 : _a.timePreference) {
            return persona.preferences.timePreference;
        }
        if (member.interestProfile === pacing_config_interface_1.InterestProfile.ELDERLY) {
            return 'EARLY_BIRD';
        }
        return 'NORMAL';
    }
    analyzeConflicts(preferences) {
        const conflicts = [];
        const rhythmConflicts = this.detectRhythmConflicts(preferences);
        conflicts.push(...rhythmConflicts);
        const riskConflicts = this.detectRiskConflicts(preferences);
        conflicts.push(...riskConflicts);
        const interestConflicts = this.detectInterestConflicts(preferences);
        conflicts.push(...interestConflicts);
        const budgetConflicts = this.detectBudgetConflicts(preferences);
        conflicts.push(...budgetConflicts);
        const timeConflicts = this.detectTimeConflicts(preferences);
        conflicts.push(...timeConflicts);
        const physicalConflicts = this.detectPhysicalConflicts(preferences);
        conflicts.push(...physicalConflicts);
        return conflicts;
    }
    detectRhythmConflicts(preferences) {
        const conflicts = [];
        const rhythmGroups = new Map();
        for (const pref of preferences) {
            if (pref.rhythmPreference) {
                const group = rhythmGroups.get(pref.rhythmPreference) || [];
                group.push(pref.travelerId);
                rhythmGroups.set(pref.rhythmPreference, group);
            }
        }
        if (rhythmGroups.size > 1) {
            const groups = Array.from(rhythmGroups.entries());
            for (let i = 0; i < groups.length; i++) {
                for (let j = i + 1; j < groups.length; j++) {
                    const [rhythm1, travelers1] = groups[i];
                    const [rhythm2, travelers2] = groups[j];
                    const severity = this.getRhythmConflictSeverity(rhythm1, rhythm2);
                    conflicts.push({
                        id: `rhythm-conflict-${rhythm1}-${rhythm2}`,
                        type: 'RHYTHM_MISMATCH',
                        severity,
                        involvedTravelers: [...travelers1, ...travelers2],
                        description: `节奏偏好差异：部分成员偏好${rhythm1}节奏，部分偏好${rhythm2}节奏`,
                        reason: '不同成员对旅行节奏的期望不同',
                        impact: ['行程安排', '每日活动数量', '休息时间'],
                    });
                }
            }
        }
        return conflicts;
    }
    getRhythmConflictSeverity(rhythm1, rhythm2) {
        const intensityMap = {
            INTENSIVE: 5,
            HYBRID: 4,
            THEMED: 3,
            FLEXIBLE: 2,
            RELAXED: 1,
        };
        const diff = Math.abs(intensityMap[rhythm1] - intensityMap[rhythm2]);
        if (diff >= 3)
            return 'HIGH';
        if (diff >= 2)
            return 'MEDIUM';
        return 'LOW';
    }
    detectRiskConflicts(preferences) {
        const conflicts = [];
        const riskGroups = new Map();
        for (const pref of preferences) {
            if (pref.riskTolerance) {
                const group = riskGroups.get(pref.riskTolerance) || [];
                group.push(pref.travelerId);
                riskGroups.set(pref.riskTolerance, group);
            }
        }
        if (riskGroups.has('LOW') && riskGroups.has('HIGH')) {
            conflicts.push({
                id: 'risk-conflict-low-high',
                type: 'RISK_TOLERANCE_GAP',
                severity: 'HIGH',
                involvedTravelers: [
                    ...(riskGroups.get('LOW') || []),
                    ...(riskGroups.get('HIGH') || []),
                ],
                description: '风险容忍度差异：部分成员偏好低风险活动，部分偏好高风险活动',
                reason: '不同成员对风险的接受程度不同',
                impact: ['活动选择', '路线规划', '安全考虑'],
            });
        }
        return conflicts;
    }
    detectInterestConflicts(preferences) {
        const conflicts = [];
        for (let i = 0; i < preferences.length; i++) {
            for (let j = i + 1; j < preferences.length; j++) {
                const pref1 = preferences[i];
                const pref2 = preferences[j];
                const interests1 = pref1.interests || [];
                const interests2 = pref2.interests || [];
                const overlap = interests1.filter(i => interests2.includes(i)).length;
                const totalUnique = new Set([...interests1, ...interests2]).size;
                if (totalUnique > 0 && overlap / totalUnique < 0.3) {
                    conflicts.push({
                        id: `interest-conflict-${pref1.travelerId}-${pref2.travelerId}`,
                        type: 'INTEREST_DIVERGENCE',
                        severity: 'MEDIUM',
                        involvedTravelers: [pref1.travelerId, pref2.travelerId],
                        description: `兴趣分歧：${pref1.travelerId}和${pref2.travelerId}的兴趣重叠度较低`,
                        reason: '不同成员对旅行内容的期望不同',
                        impact: ['景点选择', '活动安排', '体验满意度'],
                    });
                }
            }
        }
        return conflicts;
    }
    detectBudgetConflicts(preferences) {
        const conflicts = [];
        const budgetGroups = new Map();
        for (const pref of preferences) {
            if (pref.budgetPreference) {
                const group = budgetGroups.get(pref.budgetPreference) || [];
                group.push(pref.travelerId);
                budgetGroups.set(pref.budgetPreference, group);
            }
        }
        if (budgetGroups.has('BUDGET') && budgetGroups.has('LUXURY')) {
            conflicts.push({
                id: 'budget-conflict',
                type: 'BUDGET_CONFLICT',
                severity: 'HIGH',
                involvedTravelers: [
                    ...(budgetGroups.get('BUDGET') || []),
                    ...(budgetGroups.get('LUXURY') || []),
                ],
                description: '预算偏好差异：部分成员偏好经济型，部分偏好豪华型',
                reason: '不同成员对消费水平的期望不同',
                impact: ['住宿选择', '餐饮选择', '活动选择', '总预算'],
            });
        }
        return conflicts;
    }
    detectTimeConflicts(preferences) {
        const conflicts = [];
        const timeGroups = new Map();
        for (const pref of preferences) {
            if (pref.timePreference) {
                const group = timeGroups.get(pref.timePreference) || [];
                group.push(pref.travelerId);
                timeGroups.set(pref.timePreference, group);
            }
        }
        if (timeGroups.has('EARLY_BIRD') && timeGroups.has('NIGHT_OWL')) {
            conflicts.push({
                id: 'time-conflict',
                type: 'TIME_PREFERENCE_GAP',
                severity: 'MEDIUM',
                involvedTravelers: [
                    ...(timeGroups.get('EARLY_BIRD') || []),
                    ...(timeGroups.get('NIGHT_OWL') || []),
                ],
                description: '时间偏好差异：部分成员偏好早起，部分偏好晚起',
                reason: '不同成员的作息习惯不同',
                impact: ['每日开始时间', '活动安排', '休息时间'],
            });
        }
        return conflicts;
    }
    detectPhysicalConflicts(preferences) {
        const conflicts = [];
        const hasHighCapacity = preferences.some(p => p.travelerInfo.mobilityProfile === pacing_config_interface_1.MobilityProfile.IRON_LEGS);
        const hasLowCapacity = preferences.some(p => p.travelerInfo.mobilityProfile === pacing_config_interface_1.MobilityProfile.CITY_POTATO ||
            p.travelerInfo.mobilityProfile === pacing_config_interface_1.MobilityProfile.LIMITED);
        if (hasHighCapacity && hasLowCapacity) {
            conflicts.push({
                id: 'physical-conflict',
                type: 'PHYSICAL_CAPACITY_GAP',
                severity: 'HIGH',
                involvedTravelers: preferences.map(p => p.travelerId),
                description: '体能差异：部分成员体能充沛，部分成员体能有限',
                reason: '不同成员的体能水平差异较大',
                impact: ['路线选择', '活动强度', '休息安排', '整体节奏'],
            });
        }
        return conflicts;
    }
    findConsensus(preferences) {
        const consensus = [];
        const rhythmConsensus = this.findRhythmConsensus(preferences);
        if (rhythmConsensus)
            consensus.push(rhythmConsensus);
        const interestConsensus = this.findInterestConsensus(preferences);
        if (interestConsensus)
            consensus.push(...interestConsensus);
        const riskConsensus = this.findRiskConsensus(preferences);
        if (riskConsensus)
            consensus.push(riskConsensus);
        return consensus;
    }
    findRhythmConsensus(preferences) {
        var _a;
        const rhythmCounts = new Map();
        for (const pref of preferences) {
            if (pref.rhythmPreference) {
                rhythmCounts.set(pref.rhythmPreference, (rhythmCounts.get(pref.rhythmPreference) || 0) + 1);
            }
        }
        if (rhythmCounts.size === 0)
            return null;
        const maxCount = Math.max(...Array.from(rhythmCounts.values()));
        const total = preferences.length;
        if (maxCount / total >= 0.5) {
            const consensusRhythm = (_a = Array.from(rhythmCounts.entries()).find(([, count]) => count === maxCount)) === null || _a === void 0 ? void 0 : _a[0];
            if (consensusRhythm) {
                return {
                    id: 'rhythm-consensus',
                    type: 'RHYTHM',
                    involvedTravelers: preferences
                        .filter(p => p.rhythmPreference === consensusRhythm)
                        .map(p => p.travelerId),
                    description: `大多数成员偏好${consensusRhythm}节奏`,
                    strength: maxCount / total,
                };
            }
        }
        return null;
    }
    findInterestConsensus(preferences) {
        const interestCounts = new Map();
        for (const pref of preferences) {
            const interests = pref.interests || [];
            for (const interest of interests) {
                interestCounts.set(interest, (interestCounts.get(interest) || 0) + 1);
            }
        }
        const consensus = [];
        const total = preferences.length;
        for (const [interest, count] of interestCounts.entries()) {
            if (count / total >= 0.5) {
                consensus.push({
                    id: `interest-consensus-${interest}`,
                    type: 'INTEREST',
                    involvedTravelers: preferences
                        .filter(p => (p.interests || []).includes(interest))
                        .map(p => p.travelerId),
                    description: `大多数成员对"${interest}"感兴趣`,
                    strength: count / total,
                });
            }
        }
        return consensus;
    }
    findRiskConsensus(preferences) {
        var _a;
        const riskCounts = new Map();
        for (const pref of preferences) {
            if (pref.riskTolerance) {
                riskCounts.set(pref.riskTolerance, (riskCounts.get(pref.riskTolerance) || 0) + 1);
            }
        }
        if (riskCounts.size === 0)
            return null;
        const maxCount = Math.max(...Array.from(riskCounts.values()));
        const total = preferences.length;
        if (maxCount / total >= 0.5) {
            const consensusRisk = (_a = Array.from(riskCounts.entries()).find(([, count]) => count === maxCount)) === null || _a === void 0 ? void 0 : _a[0];
            if (consensusRisk) {
                return {
                    id: 'risk-consensus',
                    type: 'RISK',
                    involvedTravelers: preferences
                        .filter(p => p.riskTolerance === consensusRisk)
                        .map(p => p.travelerId),
                    description: `大多数成员的风险容忍度为${consensusRisk}`,
                    strength: maxCount / total,
                };
            }
        }
        return null;
    }
    async analyzeFitForEachMember(preferences, proposedItinerary) {
        const analyses = [];
        for (const pref of preferences) {
            let rhythmMatch = 0.5;
            if (pref.persona && proposedItinerary.route) {
                try {
                    const rhythmResult = await this.rhythmMatchingService.calculateRhythmMatch(proposedItinerary.route, pref.persona);
                    rhythmMatch = rhythmResult.scores.overallMatch;
                }
                catch (error) {
                    this.logger.warn(`Failed to calculate rhythm match for ${pref.travelerId}: ${error}`);
                }
            }
            const interestMatch = this.calculateInterestMatch(pref, proposedItinerary);
            const riskMatch = this.calculateRiskMatch(pref, proposedItinerary);
            const physicalMatch = this.calculatePhysicalMatch(pref, proposedItinerary);
            const overallMatch = (rhythmMatch + interestMatch + riskMatch + physicalMatch) / 4;
            analyses.push({
                travelerId: pref.travelerId,
                overallMatch,
                rhythmMatch,
                interestMatch,
                riskMatch,
                physicalMatch,
                matchPoints: this.identifyMatchPoints(pref, proposedItinerary),
                mismatchPoints: this.identifyMismatchPoints(pref, proposedItinerary),
                suggestions: this.generateIndividualSuggestions(pref, proposedItinerary),
            });
        }
        return analyses;
    }
    calculateInterestMatch(preference, itinerary) {
        var _a;
        const interests = preference.interests || [];
        if (interests.length === 0)
            return 0.5;
        const routeTags = ((_a = itinerary.route) === null || _a === void 0 ? void 0 : _a.tags) || [];
        const matches = interests.filter(i => routeTags.includes(i)).length;
        return matches / interests.length;
    }
    calculateRiskMatch(preference, itinerary) {
        var _a;
        const riskTolerance = preference.riskTolerance || 'MEDIUM';
        const routeRisk = ((_a = itinerary.route) === null || _a === void 0 ? void 0 : _a.riskProfile) || {};
        if (riskTolerance === 'LOW' && routeRisk.altitudeSickness) {
            return 0.3;
        }
        if (riskTolerance === 'HIGH' && !routeRisk.altitudeSickness && !routeRisk.weatherWindow) {
            return 0.7;
        }
        return 0.5;
    }
    calculatePhysicalMatch(preference, itinerary) {
        var _a, _b, _c;
        const mobility = preference.travelerInfo.mobilityProfile;
        const constraints = ((_a = itinerary.route) === null || _a === void 0 ? void 0 : _a.constraints) || {};
        if (mobility === pacing_config_interface_1.MobilityProfile.LIMITED && ((_b = constraints.hard) === null || _b === void 0 ? void 0 : _b.maxSlopePct)) {
            return constraints.hard.maxSlopePct > 10 ? 0.2 : 0.8;
        }
        if (mobility === pacing_config_interface_1.MobilityProfile.ACTIVE_SENIOR && ((_c = constraints.hard) === null || _c === void 0 ? void 0 : _c.requiresStairs)) {
            return 0.3;
        }
        return 0.7;
    }
    identifyMatchPoints(preference, itinerary) {
        const points = [];
        if (preference.rhythmPreference === itinerary.suggestedRhythm) {
            points.push('节奏偏好匹配');
        }
        const interestMatch = this.calculateInterestMatch(preference, itinerary);
        if (interestMatch > 0.6) {
            points.push('兴趣匹配度高');
        }
        return points;
    }
    identifyMismatchPoints(preference, itinerary) {
        const points = [];
        if (preference.rhythmPreference && preference.rhythmPreference !== itinerary.suggestedRhythm) {
            points.push('节奏偏好不匹配');
        }
        const interestMatch = this.calculateInterestMatch(preference, itinerary);
        if (interestMatch < 0.4) {
            points.push('兴趣匹配度低');
        }
        return points;
    }
    generateIndividualSuggestions(preference, itinerary) {
        const suggestions = [];
        if (preference.rhythmPreference && preference.rhythmPreference !== itinerary.suggestedRhythm) {
            suggestions.push(`考虑调整节奏以匹配你的偏好（${preference.rhythmPreference}）`);
        }
        const interestMatch = this.calculateInterestMatch(preference, itinerary);
        if (interestMatch < 0.5) {
            suggestions.push('考虑增加你感兴趣的活动类型');
        }
        return suggestions;
    }
    generateCoordinationOptions(conflicts, consensus, preferences, itinerary) {
        const options = [];
        if (conflicts.some(c => c.type === 'RHYTHM_MISMATCH')) {
            options.push(this.generateSegmentedRhythmOption(conflicts, preferences));
        }
        if (conflicts.some(c => c.type === 'RHYTHM_MISMATCH' || c.type === 'PHYSICAL_CAPACITY_GAP')) {
            options.push(this.generateRelaxedWithUpgradeOption(conflicts, preferences));
        }
        if (conflicts.some(c => c.type === 'INTEREST_DIVERGENCE')) {
            options.push(this.generateSplitActivitiesOption(conflicts, preferences));
        }
        options.push(this.generateCompromiseOption(conflicts, preferences));
        if (conflicts.length > 0) {
            options.push(this.generateRotatingPriorityOption(conflicts, preferences));
        }
        if (conflicts.some(c => c.type === 'TIME_PREFERENCE_GAP')) {
            options.push(this.generateIndependentTimeOption(conflicts, preferences));
        }
        return options.map(option => ({
            ...option,
            suitabilityScore: this.calculateSuitabilityScore(option, conflicts, preferences),
            expectedSatisfaction: this.calculateExpectedSatisfaction(option, preferences),
        }));
    }
    generateSegmentedRhythmOption(conflicts, preferences) {
        const rhythmConflicts = conflicts.filter(c => c.type === 'RHYTHM_MISMATCH');
        return {
            id: 'segmented-rhythm',
            strategy: 'SEGMENTED_RHYTHM',
            description: '分段采用不同节奏，满足不同成员的需求',
            implementation: [
                '将行程分为几个阶段',
                '每个阶段采用不同节奏（如前期紧凑，后期舒缓）',
                '让不同成员在不同阶段得到满足',
            ],
            resolvedConflicts: rhythmConflicts.map(c => c.id),
            advantages: [
                '满足不同成员的节奏需求',
                '避免全程妥协',
                '提供多样化体验',
            ],
            disadvantages: [
                '需要更详细的规划',
                '可能增加复杂度',
            ],
            suitabilityScore: 0,
            expectedSatisfaction: {},
        };
    }
    generateRelaxedWithUpgradeOption(conflicts, preferences) {
        return {
            id: 'relaxed-with-upgrade',
            strategy: 'OVERALL_RELAXED_WITH_UPGRADE',
            description: '整体采用舒缓节奏，为体能充沛的成员提供升级选项',
            implementation: [
                '基础行程采用舒缓节奏',
                '为体能充沛的成员提供额外活动选项',
                '允许成员选择是否参与升级活动',
            ],
            resolvedConflicts: conflicts
                .filter(c => c.type === 'RHYTHM_MISMATCH' || c.type === 'PHYSICAL_CAPACITY_GAP')
                .map(c => c.id),
            advantages: [
                '照顾体能较弱的成员',
                '为体能充沛的成员提供选择',
                '保持整体节奏一致',
            ],
            disadvantages: [
                '部分成员可能觉得不够挑战',
                '需要额外的活动规划',
            ],
            suitabilityScore: 0,
            expectedSatisfaction: {},
        };
    }
    generateSplitActivitiesOption(conflicts, preferences) {
        return {
            id: 'split-activities',
            strategy: 'SPLIT_ACTIVITIES',
            description: '部分时间分开活动，各自选择感兴趣的内容',
            implementation: [
                '识别兴趣差异较大的时间段',
                '允许成员分开选择活动',
                '约定集合时间和地点',
            ],
            resolvedConflicts: conflicts.filter(c => c.type === 'INTEREST_DIVERGENCE').map(c => c.id),
            advantages: [
                '满足不同兴趣',
                '提高个人满意度',
                '增加灵活性',
            ],
            disadvantages: [
                '减少共同体验',
                '需要协调集合',
                '可能增加安全风险',
            ],
            suitabilityScore: 0,
            expectedSatisfaction: {},
        };
    }
    generateCompromiseOption(conflicts, preferences) {
        return {
            id: 'compromise-middle',
            strategy: 'COMPROMISE_MIDDLE',
            description: '采用折中方案，平衡各方需求',
            implementation: [
                '找出各方偏好的中间值',
                '采用中等节奏、中等风险',
                '平衡不同兴趣',
            ],
            resolvedConflicts: conflicts.map(c => c.id),
            advantages: [
                '简单易行',
                '平衡各方需求',
                '减少冲突',
            ],
            disadvantages: [
                '可能无法完全满足任何人',
                '缺乏特色',
            ],
            suitabilityScore: 0,
            expectedSatisfaction: {},
        };
    }
    generateRotatingPriorityOption(conflicts, preferences) {
        return {
            id: 'rotating-priority',
            strategy: 'ROTATING_PRIORITY',
            description: '轮流让不同成员优先选择，确保每个人都有机会',
            implementation: [
                '将行程分为几个阶段',
                '每个阶段由不同成员优先选择',
                '其他成员提供建议和支持',
            ],
            resolvedConflicts: conflicts.map(c => c.id),
            advantages: [
                '公平分配决策权',
                '满足不同需求',
                '增强参与感',
            ],
            disadvantages: [
                '需要良好的沟通',
                '可能增加规划时间',
            ],
            suitabilityScore: 0,
            expectedSatisfaction: {},
        };
    }
    generateIndependentTimeOption(conflicts, preferences) {
        return {
            id: 'independent-time',
            strategy: 'INDEPENDENT_TIME',
            description: '为不同作息习惯的成员安排独立时间',
            implementation: [
                '早起成员可以先行活动',
                '晚起成员可以晚些开始',
                '约定共同活动时间',
            ],
            resolvedConflicts: conflicts.filter(c => c.type === 'TIME_PREFERENCE_GAP').map(c => c.id),
            advantages: [
                '尊重不同作息',
                '减少时间冲突',
                '提高舒适度',
            ],
            disadvantages: [
                '减少共同时间',
                '需要协调',
            ],
            suitabilityScore: 0,
            expectedSatisfaction: {},
        };
    }
    calculateSuitabilityScore(option, conflicts, preferences) {
        let score = 0.5;
        const resolvedRatio = option.resolvedConflicts.length / Math.max(1, conflicts.length);
        score += resolvedRatio * 0.3;
        score += (option.advantages.length / 5) * 0.1;
        score += (1 - option.disadvantages.length / 5) * 0.1;
        return Math.min(1.0, score);
    }
    calculateExpectedSatisfaction(option, preferences) {
        const satisfaction = {};
        for (const pref of preferences) {
            let score = 0.5;
            const memberConflicts = option.resolvedConflicts.filter(id => id.includes(pref.travelerId));
            if (memberConflicts.length > 0) {
                score += 0.2;
            }
            satisfaction[pref.travelerId] = Math.min(1.0, score);
        }
        return satisfaction;
    }
    suggestDiscussionTopics(conflicts, consensus) {
        const topics = [];
        for (const conflict of conflicts.filter(c => c.severity === 'HIGH')) {
            topics.push({
                id: `topic-${conflict.id}`,
                title: `讨论：${conflict.description}`,
                description: conflict.reason,
                relatedConflicts: [conflict.id],
                discussionPoints: [
                    '为什么会有这个差异？',
                    '这个差异对旅行体验的影响有多大？',
                    '是否可以找到折中方案？',
                ],
                suggestedQuestions: [
                    `你们对${conflict.type}的看法是什么？`,
                    '这个差异是否可以接受？',
                    '有什么方法可以协调？',
                ],
            });
        }
        for (const cons of consensus) {
            topics.push({
                id: `topic-${cons.id}`,
                title: `确认共识：${cons.description}`,
                description: '确认大家对这一点是否一致',
                relatedConflicts: [],
                discussionPoints: [
                    '是否所有人都同意这一点？',
                    '这个共识如何体现在行程中？',
                ],
                suggestedQuestions: [
                    '大家对这一点是否一致？',
                    '如何利用这个共识优化行程？',
                ],
            });
        }
        return topics;
    }
    generateOverallRecommendation(conflicts, consensus, options) {
        var _a;
        if (conflicts.length === 0) {
            return '团队成员偏好较为一致，建议直接采用推荐的行程方案。';
        }
        const highSeverityConflicts = conflicts.filter(c => c.severity === 'HIGH');
        if (highSeverityConflicts.length > 0) {
            return `存在${highSeverityConflicts.length}个高严重度冲突，建议优先讨论这些冲突，并考虑采用"${(_a = options[0]) === null || _a === void 0 ? void 0 : _a.strategy}"协调方案。`;
        }
        return `存在${conflicts.length}个冲突，建议团队成员讨论协调方案，选择最适合的方案。`;
    }
};
exports.MultiPersonDecisionService = MultiPersonDecisionService;
exports.MultiPersonDecisionService = MultiPersonDecisionService = MultiPersonDecisionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rhythm_matching_service_1.RhythmMatchingService])
], MultiPersonDecisionService);
//# sourceMappingURL=multi-person-decision.service.js.map