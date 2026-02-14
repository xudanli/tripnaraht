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
var TripBudgetService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripBudgetService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
let TripBudgetService = TripBudgetService_1 = class TripBudgetService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TripBudgetService_1.name);
        this.SUPPORTED_CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY'];
        this.MIN_BUDGET = 100;
        this.MAX_BUDGET = 1000000;
        this.DEFAULT_ALERT_THRESHOLD = 0.8;
    }
    async getBudgetSummary(tripId) {
        var _a, _b;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const budgetConfig = trip.budgetConfig || {};
        const totalBudget = budgetConfig.totalBudget || budgetConfig.total || 0;
        const currency = budgetConfig.currency || 'CNY';
        let totalSpent = 0;
        const dailySpent = {};
        const categoryBreakdown = {
            accommodation: 0,
            transportation: 0,
            food: 0,
            activities: 0,
            other: 0,
        };
        for (const day of trip.TripDay) {
            const dateKey = luxon_1.DateTime.fromJSDate(day.date).toISODate() || '';
            dailySpent[dateKey] = 0;
            for (const item of day.ItineraryItem) {
                const placeMetadata = ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.metadata) || {};
                const cost = placeMetadata.cost || placeMetadata.price || 0;
                const category = ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.category) || 'other';
                totalSpent += cost;
                dailySpent[dateKey] += cost;
                if (category === 'HOTEL') {
                    categoryBreakdown.accommodation += cost;
                }
                else if (category === 'RESTAURANT') {
                    categoryBreakdown.food += cost;
                }
                else if (category === 'ATTRACTION') {
                    categoryBreakdown.activities += cost;
                }
                else if (category === 'TRANSIT_HUB') {
                    categoryBreakdown.transportation += cost;
                }
                else {
                    categoryBreakdown.other += cost;
                }
            }
        }
        const start = luxon_1.DateTime.fromJSDate(trip.startDate);
        const end = luxon_1.DateTime.fromJSDate(trip.endDate);
        const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
        const dailyBudget = durationDays > 0 ? totalBudget / durationDays : 0;
        const warnings = [];
        const remaining = totalBudget - totalSpent;
        const overspendRatio = totalSpent / totalBudget;
        if (overspendRatio > 1.0) {
            warnings.push({
                type: 'OVERSPEND',
                message: `预算已超支 ${((overspendRatio - 1) * 100).toFixed(1)}%`,
                severity: 'error',
            });
        }
        else if (overspendRatio > 0.9) {
            warnings.push({
                type: 'APPROACHING_LIMIT',
                message: `预算使用率已达 ${(overspendRatio * 100).toFixed(1)}%，接近预算上限`,
                severity: 'warning',
            });
        }
        for (const [date, spent] of Object.entries(dailySpent)) {
            if (spent > dailyBudget * 1.2) {
                warnings.push({
                    type: 'DAILY_EXCEEDED',
                    message: `${date} 当日消费 ${spent.toFixed(2)} ${currency}，超出每日预算 ${((spent / dailyBudget - 1) * 100).toFixed(1)}%`,
                    severity: 'warning',
                });
            }
        }
        return {
            totalBudget,
            totalSpent,
            remaining,
            dailyBudget,
            dailySpent,
            categoryBreakdown,
            warnings,
        };
    }
    async checkBudgetAlert(tripId, newItemCost) {
        const summary = await this.getBudgetSummary(tripId);
        const projectedTotal = summary.totalSpent + newItemCost;
        const projectedRatio = projectedTotal / summary.totalBudget;
        if (projectedRatio > 1.0) {
            return {
                type: 'OVERSPEND',
                message: `添加此项将导致预算超支 ${((projectedRatio - 1) * 100).toFixed(1)}%`,
                severity: 'error',
                suggestions: [
                    '移除其他可选活动',
                    '选择更便宜的替代方案',
                    '调整其他天的预算分配',
                ],
            };
        }
        else if (projectedRatio > 0.9) {
            return {
                type: 'APPROACHING_LIMIT',
                message: `添加此项后预算使用率将达 ${(projectedRatio * 100).toFixed(1)}%`,
                severity: 'warning',
                suggestions: [
                    '考虑选择更便宜的替代方案',
                    '调整其他天的活动安排',
                ],
            };
        }
        return null;
    }
    async getBudgetOptimizationSuggestions(tripId, category) {
        const summary = await this.getBudgetSummary(tripId);
        const suggestions = [];
        if (summary.totalSpent > summary.totalBudget) {
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                include: {
                    TripDay: {
                        include: {
                            ItineraryItem: {
                                include: {
                                    Place: true,
                                },
                                orderBy: {
                                    startTime: 'asc',
                                },
                            },
                        },
                    },
                },
            });
            if (trip) {
                const items = trip.TripDay.flatMap(day => day.ItineraryItem);
                const itemsWithCost = items
                    .map(item => {
                    var _a, _b, _c;
                    const placeMetadata = ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.metadata) || {};
                    const cost = placeMetadata.cost || placeMetadata.price || 0;
                    return {
                        itemId: item.id,
                        itemName: ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.nameCN) || ((_c = item.Place) === null || _c === void 0 ? void 0 : _c.nameEN) || '未知',
                        cost,
                    };
                })
                    .filter(item => item.cost > 0)
                    .sort((a, b) => b.cost - a.cost);
                if (itemsWithCost.length > 0) {
                    const topExpensive = itemsWithCost[0];
                    suggestions.push({
                        type: 'REMOVE',
                        message: `移除 "${topExpensive.itemName}" 可节省约 ${topExpensive.cost.toFixed(2)} 元`,
                        itemId: topExpensive.itemId,
                        itemName: topExpensive.itemName,
                        estimatedSavings: topExpensive.cost,
                    });
                }
            }
        }
        return suggestions;
    }
    async generateBudgetReport(tripId) {
        const summary = await this.getBudgetSummary(tripId);
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const start = luxon_1.DateTime.fromJSDate(trip.startDate);
        const end = luxon_1.DateTime.fromJSDate(trip.endDate);
        const dailySpending = [];
        for (let i = 0; i <= Math.floor(end.diff(start, 'days').days); i++) {
            const date = start.plus({ days: i });
            const dateKey = date.toISODate() || '';
            const spent = summary.dailySpent[dateKey] || 0;
            dailySpending.push({
                date: dateKey,
                budget: summary.dailyBudget,
                spent,
                ratio: summary.dailyBudget > 0 ? spent / summary.dailyBudget : 0,
            });
        }
        const total = Object.values(summary.categoryBreakdown).reduce((a, b) => a + b, 0);
        const categoryDistribution = {};
        for (const [key, value] of Object.entries(summary.categoryBreakdown)) {
            categoryDistribution[key] = total > 0 ? value / total : 0;
        }
        const recommendations = [];
        if (summary.totalSpent > summary.totalBudget) {
            recommendations.push('预算已超支，建议减少后续活动的消费');
        }
        if (summary.categoryBreakdown.food / summary.totalSpent > 0.4) {
            recommendations.push('餐饮消费占比偏高，可考虑选择更经济的餐厅');
        }
        if (summary.categoryBreakdown.activities / summary.totalSpent < 0.2) {
            recommendations.push('活动消费占比偏低，可适当增加体验类活动');
        }
        return {
            summary,
            trends: {
                dailySpending,
                categoryDistribution,
            },
            recommendations,
        };
    }
    async setBudgetConstraint(tripId, constraint) {
        var _a, _b;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        if (constraint.total !== undefined) {
            if (constraint.total < this.MIN_BUDGET || constraint.total > this.MAX_BUDGET) {
                throw new common_1.BadRequestException(`预算范围必须在 ${this.MIN_BUDGET} - ${this.MAX_BUDGET} ${constraint.currency || 'CNY'} 之间`);
            }
        }
        const currency = constraint.currency || 'CNY';
        if (!this.SUPPORTED_CURRENCIES.includes(currency)) {
            throw new common_1.BadRequestException(`不支持的货币单位: ${currency}。支持的货币: ${this.SUPPORTED_CURRENCIES.join(', ')}`);
        }
        const start = luxon_1.DateTime.fromJSDate(trip.startDate);
        const end = luxon_1.DateTime.fromJSDate(trip.endDate);
        const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
        const totalBudget = constraint.total || 0;
        const dailyBudget = constraint.dailyBudget || (durationDays > 0 ? totalBudget / durationDays : 0);
        if (constraint.categoryLimits && totalBudget > 0) {
            const categorySum = Object.values(constraint.categoryLimits).reduce((sum, val) => sum + (val || 0), 0);
            if (categorySum > totalBudget) {
                throw new common_1.BadRequestException('分类预算总和不能超过总预算');
            }
        }
        const existingConfig = trip.budgetConfig || {};
        const budgetConfig = {
            ...existingConfig,
            totalBudget: totalBudget || existingConfig.totalBudget || existingConfig.total || 0,
            total: totalBudget || existingConfig.totalBudget || existingConfig.total || 0,
            currency: currency || existingConfig.currency || 'CNY',
            dailyBudget: dailyBudget || existingConfig.dailyBudget,
            alertThreshold: (_b = (_a = constraint.alertThreshold) !== null && _a !== void 0 ? _a : existingConfig.alertThreshold) !== null && _b !== void 0 ? _b : this.DEFAULT_ALERT_THRESHOLD,
            updatedAt: new Date().toISOString(),
        };
        if (constraint.categoryLimits) {
            budgetConfig.categoryLimits = constraint.categoryLimits;
        }
        if (!existingConfig.createdAt) {
            budgetConfig.createdAt = new Date().toISOString();
        }
        await this.prisma.trip.update({
            where: { id: tripId },
            data: { budgetConfig },
        });
        return {
            total: budgetConfig.totalBudget || budgetConfig.total,
            currency: budgetConfig.currency,
            dailyBudget: budgetConfig.dailyBudget,
            categoryLimits: budgetConfig.categoryLimits,
            alertThreshold: budgetConfig.alertThreshold,
            createdAt: budgetConfig.createdAt,
            updatedAt: budgetConfig.updatedAt,
        };
    }
    async getBudgetConstraint(tripId, userId) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: true,
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const budgetConfig = trip.budgetConfig || {};
        if (!budgetConfig.totalBudget && !budgetConfig.total) {
            const recommendedBudget = await this.getRecommendedBudgetFromReadiness(tripId, trip, userId);
            if (recommendedBudget) {
                return {
                    ...recommendedBudget,
                    _isRecommended: true,
                };
            }
            return null;
        }
        return {
            total: budgetConfig.totalBudget || budgetConfig.total,
            currency: budgetConfig.currency || 'CNY',
            dailyBudget: budgetConfig.dailyBudget,
            categoryLimits: budgetConfig.categoryLimits,
            alertThreshold: (_a = budgetConfig.alertThreshold) !== null && _a !== void 0 ? _a : this.DEFAULT_ALERT_THRESHOLD,
            createdAt: budgetConfig.createdAt,
            updatedAt: budgetConfig.updatedAt,
        };
    }
    async getRecommendedBudgetFromReadiness(tripId, trip, userId) {
        var _a, _b, _c;
        try {
            const startDate = luxon_1.DateTime.fromJSDate(trip.startDate);
            const endDate = luxon_1.DateTime.fromJSDate(trip.endDate);
            const durationDays = Math.ceil(endDate.diff(startDate, 'days').days) + 1;
            let budgetLevel = 'medium';
            if (userId) {
                try {
                    const userProfile = await this.prisma.userProfile.findUnique({
                        where: { userId },
                    });
                    if (userProfile === null || userProfile === void 0 ? void 0 : userProfile.preferences) {
                        const prefs = userProfile.preferences;
                        budgetLevel = prefs.budgetLevel || ((_b = (_a = prefs.travelPreferences) === null || _a === void 0 ? void 0 : _a.budget) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || 'medium';
                    }
                }
                catch (error) {
                    this.logger.warn(`Failed to get user profile for userId ${userId}: ${error}`);
                }
            }
            const metadata = trip.metadata || {};
            const preferences = metadata.preferences || {};
            if (preferences.budgetLevel) {
                budgetLevel = preferences.budgetLevel;
            }
            const baseDailyPerPerson = 500;
            const travelers = ((_c = trip.metadata) === null || _c === void 0 ? void 0 : _c.travelers) || 1;
            let dailyMultiplier = 1.0;
            if (budgetLevel === 'low') {
                dailyMultiplier = 0.6;
            }
            else if (budgetLevel === 'high') {
                dailyMultiplier = 1.8;
            }
            const recommendedDaily = baseDailyPerPerson * dailyMultiplier * travelers;
            const recommendedTotal = recommendedDaily * durationDays;
            const categoryLimits = {
                accommodation: Math.round(recommendedTotal * 0.35),
                transportation: Math.round(recommendedTotal * 0.25),
                food: Math.round(recommendedTotal * 0.20),
                activities: Math.round(recommendedTotal * 0.15),
                other: Math.round(recommendedTotal * 0.05),
            };
            return {
                total: Math.round(recommendedTotal),
                currency: 'CNY',
                dailyBudget: Math.round(recommendedDaily),
                categoryLimits,
                alertThreshold: this.DEFAULT_ALERT_THRESHOLD,
            };
        }
        catch (error) {
            this.logger.warn(`Failed to get recommended budget from readiness: ${error}`);
            return null;
        }
    }
    async deleteBudgetConstraint(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const budgetConfig = trip.budgetConfig || {};
        const updatedConfig = {
            ...budgetConfig,
            totalBudget: null,
            total: null,
            dailyBudget: null,
            categoryLimits: null,
            deletedAt: new Date().toISOString(),
        };
        await this.prisma.trip.update({
            where: { id: tripId },
            data: { budgetConfig: updatedConfig },
        });
    }
    async getBudgetDetails(tripId, params) {
        var _a, _b, _c, _d;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const budgetConfig = trip.budgetConfig || {};
        const currency = budgetConfig.currency || 'CNY';
        const limit = params.limit || 50;
        const offset = params.offset || 0;
        const items = [];
        for (const day of trip.TripDay) {
            const dateKey = luxon_1.DateTime.fromJSDate(day.date).toISODate() || '';
            if (params.startDate && dateKey < params.startDate)
                continue;
            if (params.endDate && dateKey > params.endDate)
                continue;
            for (const item of day.ItineraryItem) {
                const placeMetadata = ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.metadata) || {};
                const cost = placeMetadata.cost || placeMetadata.price || 0;
                const category = ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.category) || 'other';
                if (params.category) {
                    const categoryMap = {
                        HOTEL: 'accommodation',
                        RESTAURANT: 'food',
                        ATTRACTION: 'activities',
                        TRANSIT_HUB: 'transportation',
                    };
                    if (categoryMap[category] !== params.category && category !== params.category) {
                        continue;
                    }
                }
                if (cost > 0) {
                    items.push({
                        id: item.id,
                        date: dateKey,
                        category: this.mapCategory(category),
                        itemName: ((_c = item.Place) === null || _c === void 0 ? void 0 : _c.nameCN) || ((_d = item.Place) === null || _d === void 0 ? void 0 : _d.nameEN) || '未知',
                        amount: cost,
                        currency,
                        itineraryItemId: item.id,
                        evidenceRefs: placeMetadata.evidenceRefs || [],
                    });
                }
            }
        }
        items.sort((a, b) => b.date.localeCompare(a.date));
        const total = items.length;
        const paginatedItems = items.slice(offset, offset + limit);
        return {
            items: paginatedItems,
            total,
            limit,
            offset,
        };
    }
    async getBudgetTrends(tripId, params) {
        const summary = await this.getBudgetSummary(tripId);
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const granularity = params.granularity || 'daily';
        const start = params.startDate
            ? luxon_1.DateTime.fromISO(params.startDate)
            : luxon_1.DateTime.fromJSDate(trip.startDate);
        const end = params.endDate
            ? luxon_1.DateTime.fromISO(params.endDate)
            : luxon_1.DateTime.fromJSDate(trip.endDate);
        const dailySpending = [];
        if (granularity === 'daily') {
            for (let i = 0; i <= Math.floor(end.diff(start, 'days').days); i++) {
                const date = start.plus({ days: i });
                const dateKey = date.toISODate() || '';
                const spent = summary.dailySpent[dateKey] || 0;
                dailySpending.push({
                    date: dateKey,
                    budget: summary.dailyBudget,
                    spent,
                    ratio: summary.dailyBudget > 0 ? spent / summary.dailyBudget : 0,
                });
            }
        }
        else {
            const days = Math.floor(end.diff(start, 'days').days) + 1;
            const periodSize = granularity === 'weekly' ? 7 : 30;
            const periods = Math.ceil(days / periodSize);
            for (let p = 0; p < periods; p++) {
                const periodStart = start.plus({ days: p * periodSize });
                const periodEnd = periodStart.plus({ days: periodSize - 1 });
                const periodEndActual = periodEnd > end ? end : periodEnd;
                let periodSpent = 0;
                for (let i = 0; i < periodSize && periodStart.plus({ days: i }) <= periodEndActual; i++) {
                    const date = periodStart.plus({ days: i });
                    const dateKey = date.toISODate() || '';
                    periodSpent += summary.dailySpent[dateKey] || 0;
                }
                dailySpending.push({
                    date: periodStart.toISODate() || '',
                    budget: summary.dailyBudget * Math.min(periodSize, Math.floor(periodEndActual.diff(periodStart, 'days').days) + 1),
                    spent: periodSpent,
                    ratio: summary.dailyBudget > 0 ? periodSpent / (summary.dailyBudget * Math.min(periodSize, Math.floor(periodEndActual.diff(periodStart, 'days').days) + 1)) : 0,
                });
            }
        }
        const totalSpent = Object.values(summary.categoryBreakdown).reduce((a, b) => a + b, 0);
        const categoryDistribution = {
            accommodation: totalSpent > 0 ? summary.categoryBreakdown.accommodation / totalSpent : 0,
            transportation: totalSpent > 0 ? summary.categoryBreakdown.transportation / totalSpent : 0,
            food: totalSpent > 0 ? summary.categoryBreakdown.food / totalSpent : 0,
            activities: totalSpent > 0 ? summary.categoryBreakdown.activities / totalSpent : 0,
            other: totalSpent > 0 ? summary.categoryBreakdown.other / totalSpent : 0,
        };
        const forecast = this.calculateForecast(summary, dailySpending);
        return {
            dailySpending,
            categoryDistribution,
            forecast,
        };
    }
    async getBudgetStatistics(tripId) {
        const summary = await this.getBudgetSummary(tripId);
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const completionRate = summary.totalBudget > 0 ? summary.totalSpent / summary.totalBudget : 0;
        const overspendRate = summary.totalBudget > 0
            ? (summary.totalSpent - summary.totalBudget) / summary.totalBudget
            : 0;
        const totalSpent = Object.values(summary.categoryBreakdown).reduce((a, b) => a + b, 0);
        const categoryPercentages = {
            accommodation: totalSpent > 0 ? summary.categoryBreakdown.accommodation / totalSpent : 0,
            transportation: totalSpent > 0 ? summary.categoryBreakdown.transportation / totalSpent : 0,
            food: totalSpent > 0 ? summary.categoryBreakdown.food / totalSpent : 0,
            activities: totalSpent > 0 ? summary.categoryBreakdown.activities / totalSpent : 0,
            other: totalSpent > 0 ? summary.categoryBreakdown.other / totalSpent : 0,
        };
        const start = luxon_1.DateTime.fromJSDate(trip.startDate);
        const end = luxon_1.DateTime.fromJSDate(trip.endDate);
        const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
        const dailyAverage = durationDays > 0 ? summary.totalSpent / durationDays : 0;
        const projectedCompletion = this.calculateProjectedCompletion(summary, start, end, durationDays);
        const riskLevel = this.calculateRiskLevel(completionRate, overspendRate, durationDays);
        return {
            completionRate,
            overspendRate,
            categoryPercentages,
            dailyAverage,
            projectedCompletion,
            riskLevel,
        };
    }
    async getBudgetMonitor(tripId) {
        const summary = await this.getBudgetSummary(tripId);
        const alerts = [];
        const alertThreshold = 0.8;
        const ratio = summary.totalBudget > 0 ? summary.totalSpent / summary.totalBudget : 0;
        if (ratio > 1.0) {
            alerts.push({
                type: 'OVERSPEND',
                message: `预算已超支 ${((ratio - 1) * 100).toFixed(1)}%`,
                severity: 'error',
                suggestions: ['减少后续活动', '选择更便宜的替代方案'],
            });
        }
        else if (ratio > alertThreshold) {
            alerts.push({
                type: 'APPROACHING_LIMIT',
                message: `预算使用率已达 ${(ratio * 100).toFixed(1)}%`,
                severity: 'warning',
                suggestions: ['注意控制后续消费'],
            });
        }
        return {
            currentSpent: summary.totalSpent,
            remaining: summary.remaining,
            dailySpent: summary.dailySpent,
            alerts,
            lastUpdated: new Date().toISOString(),
        };
    }
    mapCategory(category) {
        const categoryMap = {
            HOTEL: 'accommodation',
            RESTAURANT: 'food',
            ATTRACTION: 'activities',
            TRANSIT_HUB: 'transportation',
        };
        return categoryMap[category] || 'other';
    }
    calculateForecast(summary, dailySpending) {
        if (dailySpending.length < 2) {
            return undefined;
        }
        const avgDailySpent = dailySpending.reduce((sum, day) => sum + day.spent, 0) / dailySpending.length;
        const remainingDays = Math.max(0, Math.ceil(summary.remaining / avgDailySpent));
        const projectedTotal = summary.totalSpent + (avgDailySpent * remainingDays);
        const projectedRemaining = summary.totalBudget - projectedTotal;
        const confidence = Math.min(1.0, dailySpending.length / 7);
        return {
            projectedTotal,
            projectedRemaining,
            confidence,
        };
    }
    calculateProjectedCompletion(summary, start, end, durationDays) {
        if (summary.totalSpent <= 0 || summary.dailyBudget <= 0) {
            return end.toISODate() || '';
        }
        const avgDailySpent = summary.totalSpent / durationDays;
        if (avgDailySpent <= 0) {
            return end.toISODate() || '';
        }
        const remainingDays = Math.ceil(summary.remaining / avgDailySpent);
        const projectedDate = luxon_1.DateTime.now().plus({ days: remainingDays });
        return projectedDate > end ? end.toISODate() || '' : projectedDate.toISODate() || '';
    }
    calculateRiskLevel(completionRate, overspendRate, durationDays) {
        if (overspendRate > 0.1 || completionRate > 1.0) {
            return 'high';
        }
        if (overspendRate > 0.05 || completionRate > 0.9) {
            return 'medium';
        }
        return 'low';
    }
};
exports.TripBudgetService = TripBudgetService;
exports.TripBudgetService = TripBudgetService = TripBudgetService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripBudgetService);
//# sourceMappingURL=trip-budget.service.js.map