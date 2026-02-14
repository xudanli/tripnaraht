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
var PreferenceLearningService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreferenceLearningService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../../prisma/prisma.service");
let PreferenceLearningService = PreferenceLearningService_1 = class PreferenceLearningService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PreferenceLearningService_1.name);
        this.profileCache = new Map();
        this.learningWeights = {
            destination_selected: 0.3,
            plan_generated: 0.2,
            plan_confirmed: 0.6,
            trip_completed: 1.0,
            preference_stated: 0.8,
        };
        this.logger.log('偏好学习服务已初始化');
    }
    async learnFromAction(input) {
        const { userId, action, data } = input;
        const weight = this.learningWeights[action];
        this.logger.debug(`学习用户偏好: userId=${userId}, action=${action}`);
        let profile = await this.getProfile(userId);
        if (!profile) {
            profile = this.createEmptyProfile(userId);
        }
        if (data.destinationType) {
            this.updatePreference(profile, 'destination_type', data.destinationType, weight);
        }
        if (data.budget) {
            this.updatePreference(profile, 'budget_range', data.budget, weight);
        }
        if (data.days) {
            this.updatePreference(profile, 'trip_duration', data.days, weight);
        }
        if (data.travelers) {
            this.updatePreference(profile, 'travelers', data.travelers, weight);
        }
        if (data.activities) {
            this.updatePreference(profile, 'activities', data.activities, weight);
        }
        if (data.pace) {
            this.updatePreference(profile, 'pace', data.pace, weight);
        }
        if (data.season) {
            this.updatePreference(profile, 'season', data.season, weight);
        }
        if (action === 'trip_completed' && data.destination) {
            profile.tripHistory.totalTrips++;
            if (!profile.tripHistory.destinations.includes(data.destination)) {
                profile.tripHistory.destinations.push(data.destination);
            }
            if (data.budget) {
                profile.tripHistory.averageBudget = this.calculateRunningAverage(profile.tripHistory.averageBudget, data.budget, profile.tripHistory.totalTrips);
            }
            if (data.days) {
                profile.tripHistory.averageDays = this.calculateRunningAverage(profile.tripHistory.averageDays, data.days, profile.tripHistory.totalTrips);
            }
        }
        profile.updatedAt = new Date();
        await this.saveProfile(profile);
    }
    async getProfile(userId) {
        if (this.profileCache.has(userId)) {
            return this.profileCache.get(userId);
        }
        if (this.prisma) {
            try {
                const userProfile = await this.prisma.userProfile.findUnique({
                    where: { userId },
                    select: { preferences: true },
                });
                if (userProfile === null || userProfile === void 0 ? void 0 : userProfile.preferences) {
                    const prefs = userProfile.preferences;
                    if (prefs.learnedProfile) {
                        const profile = prefs.learnedProfile;
                        this.profileCache.set(userId, profile);
                        return profile;
                    }
                }
            }
            catch (error) {
                this.logger.warn(`加载用户偏好失败: ${error.message}`);
            }
        }
        return null;
    }
    async saveProfile(profile) {
        this.profileCache.set(profile.userId, profile);
        if (this.prisma) {
            try {
                const existing = await this.prisma.userProfile.findUnique({
                    where: { userId: profile.userId },
                    select: { preferences: true },
                });
                const prefs = (existing === null || existing === void 0 ? void 0 : existing.preferences) || {};
                prefs.learnedProfile = profile;
                await this.prisma.userProfile.upsert({
                    where: { userId: profile.userId },
                    update: { preferences: prefs, updatedAt: new Date() },
                    create: {
                        userId: profile.userId,
                        preferences: prefs,
                        updatedAt: new Date(),
                    },
                });
            }
            catch (error) {
                this.logger.warn(`保存用户偏好失败: ${error.message}`);
            }
        }
    }
    createEmptyProfile(userId) {
        return {
            userId,
            preferences: [],
            tripHistory: {
                totalTrips: 0,
                destinations: [],
                averageBudget: 0,
                averageDays: 0,
                preferredTravelersCount: 2,
            },
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }
    updatePreference(profile, category, value, weight) {
        const existing = profile.preferences.find(p => p.category === category && this.isSameKey(p.key, value));
        if (existing) {
            existing.confidence = Math.min(100, existing.confidence + weight * 10);
            existing.sourceCount++;
            existing.lastUpdated = new Date();
            if (typeof value === 'number') {
                existing.value = this.calculateRunningAverage(existing.value, value, existing.sourceCount);
            }
        }
        else {
            profile.preferences.push({
                category,
                key: this.extractKey(value),
                value,
                confidence: weight * 15,
                sourceCount: 1,
                lastUpdated: new Date(),
            });
        }
        this.prunePreferences(profile, category);
    }
    extractKey(value) {
        if (typeof value === 'string')
            return value;
        if (typeof value === 'number')
            return 'numeric';
        if (Array.isArray(value))
            return value.sort().join(',');
        if (typeof value === 'object')
            return JSON.stringify(value);
        return String(value);
    }
    isSameKey(existingKey, newValue) {
        const newKey = this.extractKey(newValue);
        return existingKey === newKey;
    }
    calculateRunningAverage(oldAvg, newValue, count) {
        if (count <= 1)
            return newValue;
        return (oldAvg * (count - 1) + newValue) / count;
    }
    prunePreferences(profile, category) {
        const maxPerCategory = 5;
        const categoryPrefs = profile.preferences.filter(p => p.category === category);
        if (categoryPrefs.length > maxPerCategory) {
            categoryPrefs.sort((a, b) => b.confidence - a.confidence);
            const toRemove = categoryPrefs.slice(maxPerCategory);
            profile.preferences = profile.preferences.filter(p => p.category !== category || !toRemove.includes(p));
        }
    }
    async getAsUserPreferences(userId) {
        var _a, _b;
        const profile = await this.getProfile(userId);
        if (!profile)
            return {};
        const prefs = {};
        const highConfidencePrefs = profile.preferences.filter(p => p.confidence >= 30);
        for (const pref of highConfidencePrefs) {
            switch (pref.category) {
                case 'budget_range':
                    prefs.budget = prefs.budget || { total: pref.value };
                    break;
                case 'trip_duration':
                    prefs.days = pref.value;
                    break;
                case 'destination_type':
                    prefs.destination = prefs.destination || { type: [] };
                    if (prefs.destination.type) {
                        if (Array.isArray(pref.value)) {
                            prefs.destination.type.push(...pref.value);
                        }
                        else {
                            prefs.destination.type.push(pref.value);
                        }
                    }
                    break;
                case 'activities':
                    prefs.activities = prefs.activities || { preferred: [] };
                    if (prefs.activities.preferred) {
                        if (Array.isArray(pref.value)) {
                            prefs.activities.preferred.push(...pref.value);
                        }
                        else {
                            prefs.activities.preferred.push(pref.value);
                        }
                    }
                    break;
                case 'pace':
                    prefs.pace = pref.value;
                    break;
                case 'travelers':
                    prefs.travelers = pref.value;
                    break;
            }
        }
        if ((_a = prefs.destination) === null || _a === void 0 ? void 0 : _a.type) {
            prefs.destination.type = [...new Set(prefs.destination.type)];
        }
        if ((_b = prefs.activities) === null || _b === void 0 ? void 0 : _b.preferred) {
            prefs.activities.preferred = [...new Set(prefs.activities.preferred)];
        }
        return prefs;
    }
    async getPreferenceSummary(userId) {
        const profile = await this.getProfile(userId);
        if (!profile || profile.preferences.length === 0) {
            return {
                summary: 'No travel preferences learned yet. Start planning your first trip!',
                summaryCN: '还没有学习到旅行偏好。开始规划您的第一次旅行吧！',
                topPreferences: [],
            };
        }
        const topPrefs = profile.preferences
            .filter(p => p.confidence >= 30)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);
        const topPreferences = topPrefs.map(pref => ({
            label: this.getCategoryLabel(pref.category, 'en'),
            labelCN: this.getCategoryLabel(pref.category, 'zh'),
            value: this.formatPreferenceValue(pref),
        }));
        const summaryParts = [];
        const summaryCNParts = [];
        if (profile.tripHistory.totalTrips > 0) {
            summaryParts.push(`${profile.tripHistory.totalTrips} trips completed`);
            summaryCNParts.push(`已完成 ${profile.tripHistory.totalTrips} 次旅行`);
        }
        const budgetPref = topPrefs.find(p => p.category === 'budget_range');
        if (budgetPref) {
            summaryParts.push(`avg budget $${Math.round(budgetPref.value)}`);
            summaryCNParts.push(`平均预算 $${Math.round(budgetPref.value)}`);
        }
        const durationPref = topPrefs.find(p => p.category === 'trip_duration');
        if (durationPref) {
            summaryParts.push(`prefer ${Math.round(durationPref.value)}-day trips`);
            summaryCNParts.push(`偏好 ${Math.round(durationPref.value)} 天行程`);
        }
        return {
            summary: summaryParts.length > 0 ? summaryParts.join(', ') : 'Learning your preferences...',
            summaryCN: summaryCNParts.length > 0 ? summaryCNParts.join('，') : '正在学习您的偏好...',
            topPreferences,
        };
    }
    getCategoryLabel(category, lang) {
        var _a;
        const labels = {
            budget_range: { en: 'Budget', zh: '预算' },
            trip_duration: { en: 'Duration', zh: '时长' },
            destination_type: { en: 'Destination Type', zh: '目的地类型' },
            activities: { en: 'Activities', zh: '活动' },
            pace: { en: 'Pace', zh: '节奏' },
            travelers: { en: 'Travelers', zh: '出行人数' },
            season: { en: 'Season', zh: '季节' },
        };
        return ((_a = labels[category]) === null || _a === void 0 ? void 0 : _a[lang]) || category;
    }
    formatPreferenceValue(pref) {
        if (typeof pref.value === 'number') {
            if (pref.category === 'budget_range') {
                return `$${Math.round(pref.value)}`;
            }
            if (pref.category === 'trip_duration') {
                return `${Math.round(pref.value)} days`;
            }
            return String(Math.round(pref.value));
        }
        if (Array.isArray(pref.value)) {
            return pref.value.slice(0, 3).join(', ');
        }
        if (typeof pref.value === 'object' && pref.value.adults !== undefined) {
            const t = pref.value;
            return `${t.adults || 0} adults${t.children ? `, ${t.children} children` : ''}`;
        }
        return String(pref.value);
    }
    async mergeWithLearnedPreferences(userId, explicitPreferences) {
        const learned = await this.getAsUserPreferences(userId);
        const merged = {
            destination: {
                ...learned.destination,
                ...explicitPreferences.destination,
            },
            budget: explicitPreferences.budget || learned.budget,
            travelers: explicitPreferences.travelers || learned.travelers || { adults: 2 },
            activities: {
                pacePreference: learned.pace,
                ...learned.activities,
                ...explicitPreferences.activities,
            },
            dateRange: explicitPreferences.dateRange,
        };
        return merged;
    }
    async clearProfile(userId) {
        this.profileCache.delete(userId);
        if (this.prisma) {
            try {
                const existing = await this.prisma.userProfile.findUnique({
                    where: { userId },
                    select: { preferences: true },
                });
                if (existing) {
                    const prefs = existing.preferences || {};
                    delete prefs.learnedProfile;
                    await this.prisma.userProfile.update({
                        where: { userId },
                        data: { preferences: prefs, updatedAt: new Date() },
                    });
                }
            }
            catch (error) {
                this.logger.warn(`清除用户偏好失败: ${error.message}`);
            }
        }
    }
};
exports.PreferenceLearningService = PreferenceLearningService;
exports.PreferenceLearningService = PreferenceLearningService = PreferenceLearningService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PreferenceLearningService);
//# sourceMappingURL=preference-learning.service.js.map