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
var BookingComMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingComMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis/redis.service");
let BookingComMonitoringService = BookingComMonitoringService_1 = class BookingComMonitoringService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(BookingComMonitoringService_1.name);
        this.metricsKeyPrefix = 'booking-com:metrics:';
        this.statsKeyPrefix = 'booking-com:stats:';
        this.pricing = {
            searchCarRentals: 0.01,
            default: 0.01,
        };
    }
    async onModuleInit() {
        this.logger.log('BookingComMonitoringService initialized');
    }
    async recordCall(metrics) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const timestamp = Date.now();
            await this.updateDailyStats(date, metrics);
            this.logger.debug(`Booking.com API call: ${metrics.toolName} - ${metrics.success ? 'success' : 'failed'} ` +
                `(${metrics.responseTime}ms)`);
        }
        catch (error) {
            this.logger.warn(`Failed to record Booking.com call metrics: ${error.message}`);
        }
    }
    async updateDailyStats(date, metrics) {
        if (!this.redisService) {
            return;
        }
        try {
            const statsKey = `${this.statsKeyPrefix}${date}`;
            const existingStats = await this.redisService.get(statsKey);
            let stats;
            if (existingStats) {
                stats = JSON.parse(existingStats);
            }
            else {
                stats = {
                    date,
                    totalCalls: 0,
                    successfulCalls: 0,
                    failedCalls: 0,
                    avgResponseTime: 0,
                    callsByTool: {},
                    estimatedCost: 0,
                };
            }
            stats.totalCalls += 1;
            if (metrics.success) {
                stats.successfulCalls += 1;
            }
            else {
                stats.failedCalls += 1;
            }
            const totalResponseTime = stats.avgResponseTime * (stats.totalCalls - 1) + metrics.responseTime;
            stats.avgResponseTime = Math.round(totalResponseTime / stats.totalCalls);
            if (!stats.callsByTool[metrics.toolName]) {
                stats.callsByTool[metrics.toolName] = 0;
            }
            stats.callsByTool[metrics.toolName] += 1;
            const callCost = this.pricing[metrics.toolName] || this.pricing.default;
            stats.estimatedCost += callCost;
            await this.redisService.set(statsKey, JSON.stringify(stats), 2592000);
        }
        catch (error) {
            this.logger.warn(`Failed to update Booking.com daily stats: ${error.message}`);
        }
    }
    async getDailyStats(date) {
        if (!this.redisService) {
            return null;
        }
        try {
            const statsKey = `${this.statsKeyPrefix}${date}`;
            const statsJson = await this.redisService.get(statsKey);
            if (!statsJson) {
                return null;
            }
            return JSON.parse(statsJson);
        }
        catch (error) {
            this.logger.warn(`Failed to get Booking.com daily stats: ${error.message}`);
            return null;
        }
    }
    async getStatsForDateRange(startDate, endDate) {
        if (!this.redisService) {
            return [];
        }
        const stats = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dailyStats = await this.getDailyStats(dateStr);
            if (dailyStats) {
                stats.push(dailyStats);
            }
        }
        return stats;
    }
    async getPerformanceSummary(days = 7) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const stats = await this.getStatsForDateRange(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        let totalCalls = 0;
        let totalSuccessfulCalls = 0;
        let totalResponseTime = 0;
        const callsByTool = {};
        for (const stat of stats) {
            totalCalls += stat.totalCalls;
            totalSuccessfulCalls += stat.successfulCalls;
            totalResponseTime += stat.avgResponseTime * stat.totalCalls;
            for (const [tool, count] of Object.entries(stat.callsByTool)) {
                if (!callsByTool[tool]) {
                    callsByTool[tool] = 0;
                }
                callsByTool[tool] += count;
            }
        }
        return {
            avgResponseTime: totalCalls > 0 ? Math.round(totalResponseTime / totalCalls) : 0,
            successRate: totalCalls > 0 ? totalSuccessfulCalls / totalCalls : 0,
            totalCalls,
            callsByTool,
        };
    }
    async getTotalCostEstimate(days = 7) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const stats = await this.getStatsForDateRange(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        return stats.reduce((total, stat) => total + stat.estimatedCost, 0);
    }
    async checkCostLimit(limit, days = 7) {
        const currentCost = await this.getTotalCostEstimate(days);
        return {
            exceeded: currentCost > limit,
            currentCost,
            limit,
        };
    }
};
exports.BookingComMonitoringService = BookingComMonitoringService;
exports.BookingComMonitoringService = BookingComMonitoringService = BookingComMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], BookingComMonitoringService);
//# sourceMappingURL=booking-com-monitoring.service.js.map