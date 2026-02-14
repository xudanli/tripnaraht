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
var TripQuickEvaluateSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripQuickEvaluateSkill = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const trip_metrics_service_1 = require("../../trips/services/trip-metrics.service");
const trip_conflicts_service_1 = require("../../trips/services/trip-conflicts.service");
const luxon_1 = require("luxon");
let TripQuickEvaluateSkill = TripQuickEvaluateSkill_1 = class TripQuickEvaluateSkill {
    constructor(prisma, tripMetricsService, tripConflictsService) {
        this.prisma = prisma;
        this.tripMetricsService = tripMetricsService;
        this.tripConflictsService = tripConflictsService;
        this.logger = new common_1.Logger(TripQuickEvaluateSkill_1.name);
        this.metadata = {
            name: 'trip.quickEvaluate',
            description: '对行程进行快速体检，输出统一的评分、警告和修复建议',
            version: '1.0.0',
            category: 'analytics',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 trip.quickEvaluate: tripId=${input.tripId}`);
        try {
            const trip = await this.prisma.trip.findUnique({
                where: { id: input.tripId },
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
                        orderBy: {
                            date: 'asc',
                        },
                    },
                },
            });
            if (!trip) {
                throw new common_1.NotFoundException(`行程不存在: ${input.tripId}`);
            }
            let metrics = null;
            let conflicts = { conflicts: [], total: 0 };
            if (this.tripMetricsService) {
                try {
                    metrics = await this.tripMetricsService.getTripMetrics(input.tripId);
                }
                catch (error) {
                    this.logger.warn(`获取行程指标失败: ${error.message}`);
                }
            }
            else {
                this.logger.warn('TripMetricsService 未可用，使用默认值');
            }
            if (this.tripConflictsService) {
                try {
                    conflicts = await this.tripConflictsService.getConflicts(input.tripId);
                }
                catch (error) {
                    this.logger.warn(`获取行程冲突失败: ${error.message}`);
                    conflicts = { conflicts: [], total: 0 };
                }
            }
            else {
                this.logger.warn('TripConflictsService 未可用，使用默认值');
            }
            const scores = this.calculateScores(trip, metrics, conflicts);
            const warnings = this.generateWarnings(trip, metrics, conflicts);
            const suggestedFixes = this.generateSuggestedFixes(warnings, conflicts);
            return {
                scores,
                warnings,
                suggestedFixes,
            };
        }
        catch (error) {
            this.logger.error(`行程体检失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    calculateScores(trip, metrics, conflicts) {
        var _a, _b, _c, _d, _e, _f;
        const highSeverityConflicts = ((_a = conflicts === null || conflicts === void 0 ? void 0 : conflicts.conflicts) === null || _a === void 0 ? void 0 : _a.filter((c) => c.severity === 'HIGH').length) || 0;
        const totalConflicts = (conflicts === null || conflicts === void 0 ? void 0 : conflicts.total) || 0;
        const safetyScore = Math.max(0, 100 - highSeverityConflicts * 20 - totalConflicts * 5);
        const totalFatigue = ((_b = metrics === null || metrics === void 0 ? void 0 : metrics.summary) === null || _b === void 0 ? void 0 : _b.totalFatigue) || 0;
        const totalBuffer = ((_c = metrics === null || metrics === void 0 ? void 0 : metrics.summary) === null || _c === void 0 ? void 0 : _c.totalBuffer) || 0;
        const dayCount = ((_d = trip.TripDay) === null || _d === void 0 ? void 0 : _d.length) || 1;
        const avgFatigue = totalFatigue / dayCount;
        const pacingScore = Math.max(0, 100 - (avgFatigue / 100) * 50 - (totalBuffer < 60 ? 20 : 0));
        const timeConflicts = ((_e = conflicts === null || conflicts === void 0 ? void 0 : conflicts.conflicts) === null || _e === void 0 ? void 0 : _e.filter((c) => c.type === 'TIME_CONFLICT').length) || 0;
        const bufferIssues = ((_f = conflicts === null || conflicts === void 0 ? void 0 : conflicts.conflicts) === null || _f === void 0 ? void 0 : _f.filter((c) => c.type === 'BUFFER_INSUFFICIENT').length) || 0;
        const executabilityScore = Math.max(0, 100 - timeConflicts * 30 - bufferIssues * 10);
        const diversityScore = this.calculateDiversityScore(trip);
        return {
            safety: Math.round(safetyScore),
            pacing: Math.round(pacingScore),
            executability: Math.round(executabilityScore),
            diversity: Math.round(diversityScore),
        };
    }
    calculateDiversityScore(trip) {
        var _a, _b;
        const activityTypes = new Set();
        const categories = new Set();
        let totalActivities = 0;
        if (!(trip === null || trip === void 0 ? void 0 : trip.TripDay) || !Array.isArray(trip.TripDay)) {
            return 50;
        }
        for (const day of trip.TripDay) {
            if (!(day === null || day === void 0 ? void 0 : day.ItineraryItem) || !Array.isArray(day.ItineraryItem)) {
                continue;
            }
            for (const item of day.ItineraryItem) {
                totalActivities++;
                if ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.category) {
                    categories.add(item.Place.category);
                }
                const metadata = (_b = item.Place) === null || _b === void 0 ? void 0 : _b.metadata;
                if (metadata === null || metadata === void 0 ? void 0 : metadata.type) {
                    activityTypes.add(metadata.type);
                }
            }
        }
        if (totalActivities === 0)
            return 0;
        const typeDiversity = (activityTypes.size / Math.max(1, totalActivities)) * 50;
        const categoryDiversity = (categories.size / Math.max(1, totalActivities)) * 50;
        return Math.min(100, typeDiversity + categoryDiversity);
    }
    generateWarnings(trip, metrics, conflicts) {
        var _a, _b, _c, _d;
        const warnings = [];
        if ((conflicts === null || conflicts === void 0 ? void 0 : conflicts.conflicts) && Array.isArray(conflicts.conflicts)) {
            for (const conflict of conflicts.conflicts) {
                warnings.push({
                    type: conflict.type || 'UNKNOWN',
                    severity: (((_a = conflict.severity) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'low'),
                    message: conflict.description || '未知冲突',
                    affectedDays: conflict.affectedDays,
                    affectedItemIds: conflict.affectedItemIds,
                });
            }
        }
        if ((metrics === null || metrics === void 0 ? void 0 : metrics.days) && ((_b = trip.TripDay) === null || _b === void 0 ? void 0 : _b.length) > 1) {
            for (let i = 0; i < trip.TripDay.length - 1; i++) {
                const day1 = trip.TripDay[i];
                const day2 = trip.TripDay[i + 1];
                const day1Metrics = metrics.days.find((d) => d.date === luxon_1.DateTime.fromJSDate(day1.date).toISODate());
                const day2Metrics = metrics.days.find((d) => d.date === luxon_1.DateTime.fromJSDate(day2.date).toISODate());
                const day1Drive = ((_c = day1Metrics === null || day1Metrics === void 0 ? void 0 : day1Metrics.metrics) === null || _c === void 0 ? void 0 : _c.drive) || 0;
                const day2Drive = ((_d = day2Metrics === null || day2Metrics === void 0 ? void 0 : day2Metrics.metrics) === null || _d === void 0 ? void 0 : _d.drive) || 0;
                if (day1Drive + day2Drive > 480) {
                    warnings.push({
                        type: 'CONSECUTIVE_LONG_DRIVE',
                        severity: 'high',
                        message: `D${i + 1} 与 D${i + 2} 总行车时长过长（${Math.round((day1Drive + day2Drive) / 60)} 小时），建议拆分或增加休息`,
                        affectedDays: [
                            luxon_1.DateTime.fromJSDate(day1.date).toISODate() || '',
                            luxon_1.DateTime.fromJSDate(day2.date).toISODate() || '',
                        ],
                    });
                }
            }
        }
        if ((trip === null || trip === void 0 ? void 0 : trip.TripDay) && Array.isArray(trip.TripDay)) {
            for (let i = 0; i < trip.TripDay.length; i++) {
                const day = trip.TripDay[i];
                if (!(day === null || day === void 0 ? void 0 : day.ItineraryItem) || !Array.isArray(day.ItineraryItem) || day.ItineraryItem.length === 0) {
                    continue;
                }
                const allTransit = day.ItineraryItem.every((item) => {
                    var _a, _b;
                    const metadata = (_a = item.Place) === null || _a === void 0 ? void 0 : _a.metadata;
                    return (metadata === null || metadata === void 0 ? void 0 : metadata.type) === 'transit' || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.category) === 'TRANSIT';
                });
                if (allTransit) {
                    warnings.push({
                        type: 'ALL_TRANSIT_DAY',
                        severity: 'medium',
                        message: `D${i + 1} 行程全是中转/交通，没有实际游览活动`,
                        affectedDays: [luxon_1.DateTime.fromJSDate(day.date).toISODate() || ''],
                        affectedItemIds: day.ItineraryItem.map((item) => item.id).filter((id) => id),
                    });
                }
            }
        }
        return warnings;
    }
    generateSuggestedFixes(warnings, conflicts) {
        const fixes = [];
        for (const warning of warnings) {
            if (warning.type === 'FATIGUE_EXCEEDED' || warning.type === 'CONSECUTIVE_LONG_DRIVE') {
                fixes.push({
                    issue: warning.message,
                    fixType: 'DR_DRE_PACE',
                    description: '使用 Dr.Dre 策略调整行程节奏，拆分密集活动或插入缓冲时间',
                    priority: warning.severity,
                });
            }
            else if (warning.type === 'CLOSURE_RISK' || warning.type === 'ALL_TRANSIT_DAY') {
                fixes.push({
                    issue: warning.message,
                    fixType: 'NEPTUNE_REPLACE',
                    description: '使用 Neptune 策略替换不可用的路段或 POI，保持路线核心风格',
                    priority: warning.severity,
                });
            }
            else if (warning.type === 'TIME_CONFLICT' || warning.type === 'BUFFER_INSUFFICIENT') {
                fixes.push({
                    issue: warning.message,
                    fixType: 'MANUAL_ADJUST',
                    description: '需要手动调整活动时间，解决时间冲突或增加缓冲',
                    priority: warning.severity,
                });
            }
        }
        const uniqueFixes = fixes.filter((fix, index, self) => index === self.findIndex(f => f.issue === fix.issue && f.fixType === fix.fixType));
        return uniqueFixes.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }
};
exports.TripQuickEvaluateSkill = TripQuickEvaluateSkill;
exports.TripQuickEvaluateSkill = TripQuickEvaluateSkill = TripQuickEvaluateSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trip_metrics_service_1.TripMetricsService,
        trip_conflicts_service_1.TripConflictsService])
], TripQuickEvaluateSkill);
//# sourceMappingURL=trip-quick-evaluate.skill.js.map