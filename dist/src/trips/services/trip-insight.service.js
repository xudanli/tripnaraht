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
var TripInsightService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripInsightService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
const trip_insight_dto_1 = require("../dto/trip-insight.dto");
let TripInsightService = TripInsightService_1 = class TripInsightService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TripInsightService_1.name);
        this.MAX_PLACES_PER_DAY = 5;
        this.WARNING_PLACES_PER_DAY = 6;
    }
    async getInsight(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    orderBy: { date: 'asc' },
                    include: {
                        ItineraryItem: {
                            orderBy: { startTime: 'asc' },
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const tripSummary = this.buildTripSummary(trip);
        const findings = await this.generateFindings(trip);
        const readiness = await this.getReadinessSummary(tripId, trip);
        const overallStatus = this.calculateOverallStatus(findings, readiness);
        return {
            tripSummary,
            findings,
            readiness,
            overallStatus,
        };
    }
    buildTripSummary(trip) {
        const startDate = trip.startDate ? luxon_1.DateTime.fromJSDate(trip.startDate) : null;
        const endDate = trip.endDate ? luxon_1.DateTime.fromJSDate(trip.endDate) : null;
        const days = startDate && endDate
            ? Math.floor(endDate.diff(startDate, 'days').days) + 1
            : trip.TripDay.length;
        const placeIds = new Set();
        for (const day of trip.TripDay) {
            for (const item of day.ItineraryItem) {
                if (item.placeId && item.type === 'ACTIVITY') {
                    placeIds.add(item.placeId);
                }
            }
        }
        const destination = this.getDestinationName(trip.destination);
        return {
            destination,
            days,
            placesCount: placeIds.size,
            startDate: startDate ? startDate.toISODate() : '',
            endDate: endDate ? endDate.toISODate() : '',
        };
    }
    getDestinationName(countryCode) {
        const countryNames = {
            'CN': '中国',
            'JP': '日本',
            'KR': '韩国',
            'TH': '泰国',
            'VN': '越南',
            'SG': '新加坡',
            'MY': '马来西亚',
            'ID': '印度尼西亚',
            'PH': '菲律宾',
            'US': '美国',
            'CA': '加拿大',
            'AU': '澳大利亚',
            'NZ': '新西兰',
            'GB': '英国',
            'FR': '法国',
            'DE': '德国',
            'IT': '意大利',
            'ES': '西班牙',
            'IS': '冰岛',
            'NO': '挪威',
            'SE': '瑞典',
            'FI': '芬兰',
            'DK': '丹麦',
            'CH': '瑞士',
            'AT': '奥地利',
            'NL': '荷兰',
            'BE': '比利时',
            'PT': '葡萄牙',
            'GR': '希腊',
            'TR': '土耳其',
            'AE': '阿联酋',
            'EG': '埃及',
            'ZA': '南非',
            'BR': '巴西',
            'AR': '阿根廷',
            'MX': '墨西哥',
            'IN': '印度',
            'RU': '俄罗斯',
        };
        return countryNames[countryCode === null || countryCode === void 0 ? void 0 : countryCode.toUpperCase()] || countryCode || '未知目的地';
    }
    async generateFindings(trip) {
        const findings = [];
        for (let dayIndex = 0; dayIndex < trip.TripDay.length; dayIndex++) {
            const day = trip.TripDay[dayIndex];
            const dayNumber = dayIndex + 1;
            const activityItems = day.ItineraryItem.filter((item) => item.type === 'ACTIVITY');
            if (activityItems.length >= this.WARNING_PLACES_PER_DAY) {
                findings.push({
                    type: trip_insight_dto_1.FindingType.WARNING,
                    icon: 'clock',
                    title: `Day ${dayNumber} 安排较紧凑`,
                    message: `第${dayNumber}天安排了 ${activityItems.length} 个景点，可能需要更多休息时间`,
                    actionLabel: `优化 Day ${dayNumber}`,
                    actionPrompt: `帮我优化第${dayNumber}天的行程，适当减少景点或调整顺序`,
                });
            }
            const transitItems = day.ItineraryItem.filter((item) => item.type === 'TRANSIT');
            let totalTransitMinutes = 0;
            for (const transit of transitItems) {
                if (transit.startTime && transit.endTime) {
                    const start = luxon_1.DateTime.fromJSDate(transit.startTime);
                    const end = luxon_1.DateTime.fromJSDate(transit.endTime);
                    totalTransitMinutes += end.diff(start, 'minutes').minutes;
                }
            }
            if (totalTransitMinutes > 180) {
                findings.push({
                    type: trip_insight_dto_1.FindingType.SUGGESTION,
                    icon: 'route',
                    title: `Day ${dayNumber} 交通时间较长`,
                    message: `第${dayNumber}天交通时间约 ${Math.round(totalTransitMinutes / 60)} 小时，建议调整路线顺序`,
                    actionLabel: '优化路线',
                    actionPrompt: `帮我优化第${dayNumber}天的路线顺序，减少交通时间`,
                });
            }
        }
        const routeOptimizationFinding = this.checkRouteOptimization(trip);
        if (routeOptimizationFinding) {
            findings.push(routeOptimizationFinding);
        }
        const pacingFinding = this.checkPacing(trip);
        if (pacingFinding) {
            findings.push(pacingFinding);
        }
        if (findings.length === 0) {
            findings.push({
                type: trip_insight_dto_1.FindingType.POSITIVE,
                icon: 'check',
                title: '行程安排合理',
                message: '整体节奏良好，景点安排适中',
                actionLabel: null,
                actionPrompt: null,
            });
        }
        return findings.slice(0, 5);
    }
    checkRouteOptimization(trip) {
        var _a, _b;
        if (trip.TripDay.length < 2) {
            return null;
        }
        const dayLocations = [];
        for (const day of trip.TripDay) {
            const activities = day.ItineraryItem.filter((item) => item.type === 'ACTIVITY' && item.Place);
            if (activities.length > 0) {
                dayLocations.push({
                    first: activities[0].Place,
                    last: activities[activities.length - 1].Place,
                });
            }
        }
        for (let i = 0; i < dayLocations.length - 1; i++) {
            const currentDay = dayLocations[i];
            const nextDay = dayLocations[i + 1];
            if (((_a = currentDay.last) === null || _a === void 0 ? void 0 : _a.location) && ((_b = nextDay.first) === null || _b === void 0 ? void 0 : _b.location)) {
            }
        }
        return null;
    }
    checkPacing(trip) {
        const pacingConfig = trip.pacingConfig;
        const dailyActivityCounts = trip.TripDay.map((day) => day.ItineraryItem.filter((item) => item.type === 'ACTIVITY').length);
        const avg = dailyActivityCounts.reduce((a, b) => a + b, 0) / dailyActivityCounts.length;
        const variance = dailyActivityCounts.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / dailyActivityCounts.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev < 1.5 && avg <= this.MAX_PLACES_PER_DAY) {
            const style = (pacingConfig === null || pacingConfig === void 0 ? void 0 : pacingConfig.style) || 'balanced';
            if (style === 'relaxed' && avg <= 3) {
                return {
                    type: trip_insight_dto_1.FindingType.POSITIVE,
                    icon: 'check',
                    title: '节奏合理',
                    message: '整体节奏符合「轻松」偏好设定',
                    actionLabel: null,
                    actionPrompt: null,
                };
            }
            else if (style === 'balanced' && avg <= 4) {
                return {
                    type: trip_insight_dto_1.FindingType.POSITIVE,
                    icon: 'check',
                    title: '节奏均衡',
                    message: '整体节奏符合「均衡」偏好设定',
                    actionLabel: null,
                    actionPrompt: null,
                };
            }
        }
        if (stdDev > 2) {
            const maxDay = dailyActivityCounts.indexOf(Math.max(...dailyActivityCounts)) + 1;
            const minDay = dailyActivityCounts.indexOf(Math.min(...dailyActivityCounts)) + 1;
            return {
                type: trip_insight_dto_1.FindingType.SUGGESTION,
                icon: 'balance',
                title: '行程节奏不均',
                message: `第${maxDay}天活动较多，第${minDay}天较少，建议平衡调整`,
                actionLabel: '平衡节奏',
                actionPrompt: `帮我平衡行程节奏，把第${maxDay}天的部分活动调整到第${minDay}天`,
            };
        }
        return null;
    }
    async getReadinessSummary(_tripId, trip) {
        return this.estimateReadiness(trip);
    }
    estimateReadiness(trip) {
        let blockers = 0;
        let must = 0;
        let should = 0;
        if (!trip.startDate || !trip.endDate) {
            blockers++;
        }
        for (const day of trip.TripDay) {
            const activityCount = day.ItineraryItem.filter((item) => item.type === 'ACTIVITY').length;
            if (activityCount > 8) {
                must++;
            }
            else if (activityCount > 6) {
                should++;
            }
        }
        for (const day of trip.TripDay) {
            for (const item of day.ItineraryItem) {
                if (item.type === 'ACTIVITY' && !item.placeId) {
                    should++;
                }
            }
        }
        const budgetConfig = trip.budgetConfig;
        if (!(budgetConfig === null || budgetConfig === void 0 ? void 0 : budgetConfig.totalBudget)) {
            should++;
        }
        let status;
        if (blockers > 0) {
            status = trip_insight_dto_1.ReadinessStatus.BLOCK;
        }
        else if (must > 0) {
            status = trip_insight_dto_1.ReadinessStatus.WARN;
        }
        else {
            status = trip_insight_dto_1.ReadinessStatus.PASS;
        }
        return {
            status,
            blockers,
            must,
            should: Math.min(should, 10),
            warnings: must,
            suggestions: Math.min(should, 10),
        };
    }
    calculateOverallStatus(findings, readiness) {
        if (readiness.status === trip_insight_dto_1.ReadinessStatus.BLOCK) {
            return trip_insight_dto_1.OverallStatus.HAS_ISSUES;
        }
        const hasWarningFinding = findings.some(f => f.type === trip_insight_dto_1.FindingType.WARNING);
        if (hasWarningFinding || readiness.status === trip_insight_dto_1.ReadinessStatus.WARN) {
            return trip_insight_dto_1.OverallStatus.NEEDS_ATTENTION;
        }
        return trip_insight_dto_1.OverallStatus.GOOD;
    }
};
exports.TripInsightService = TripInsightService;
exports.TripInsightService = TripInsightService = TripInsightService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripInsightService);
//# sourceMappingURL=trip-insight.service.js.map