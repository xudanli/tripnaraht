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
var AirbnbMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirbnbMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis/redis.service");
let AirbnbMonitoringService = AirbnbMonitoringService_1 = class AirbnbMonitoringService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(AirbnbMonitoringService_1.name);
        this.metricsKeyPrefix = 'airbnb:metrics:';
        this.statsKeyPrefix = 'airbnb:stats:';
        this.pricing = {
            airbnb_search: 0.0001,
            airbnb_listing_details: 0.0001,
            default: 0.0001,
        };
    }
    async onModuleInit() {
        this.logger.log('AirbnbMonitoringService initialized');
    }
    async recordCall(metrics) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const timestamp = Date.now();
            await this.updateDailyStats(date, metrics);
            this.logger.debug(`Airbnb API call: ${metrics.toolName} - ${metrics.success ? 'success' : 'failed'} ` +
                `(${metrics.responseTime}ms)`);
        }
        catch (error) {
            this.logger.warn(`Failed to record Airbnb call metrics: ${error.message}`);
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
            stats.totalCalls++;
            if (metrics.success) {
                stats.successfulCalls++;
            }
            else {
                stats.failedCalls++;
            }
            const totalResponseTime = stats.avgResponseTime * (stats.totalCalls - 1) + metrics.responseTime;
            stats.avgResponseTime = totalResponseTime / stats.totalCalls;
            stats.callsByTool[metrics.toolName] = (stats.callsByTool[metrics.toolName] || 0) + 1;
            const callCost = this.pricing[metrics.toolName] || this.pricing.default;
            stats.estimatedCost += callCost;
            await this.redisService.set(statsKey, JSON.stringify(stats), 86400 * 30);
        }
        catch (error) {
            this.logger.warn(`Failed to update daily stats: ${error.message}`);
        }
    }
    async getDailyStats(date) {
        if (!this.redisService) {
            return null;
        }
        try {
            const statsKey = `${this.statsKeyPrefix}${date}`;
            const statsJson = await this.redisService.get(statsKey);
            return statsJson ? JSON.parse(statsJson) : null;
        }
        catch (error) {
            this.logger.warn(`Failed to get daily stats: ${error.message}`);
            return null;
        }
    }
    async getRecentStats(days = 7) {
        const stats = [];
        const today = new Date();
        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const dailyStats = await this.getDailyStats(dateStr);
            if (dailyStats) {
                stats.push(dailyStats);
            }
        }
        return stats.sort((a, b) => a.date.localeCompare(b.date));
    }
    async getTotalCostEstimate(days = 30) {
        const stats = await this.getRecentStats(days);
        return stats.reduce((total, stat) => total + stat.estimatedCost, 0);
    }
    async checkCostLimit(dailyLimit = 1) {
        const today = new Date().toISOString().split('T')[0];
        const stats = await this.getDailyStats(today);
        const currentCost = (stats === null || stats === void 0 ? void 0 : stats.estimatedCost) || 0;
        return {
            exceeded: currentCost > dailyLimit,
            currentCost,
            limit: dailyLimit,
        };
    }
    async getPerformanceMetrics(days = 7) {
        const stats = await this.getRecentStats(days);
        if (stats.length === 0) {
            return {
                avgResponseTime: 0,
                successRate: 0,
                totalCalls: 0,
                callsByTool: {},
            };
        }
        const totalCalls = stats.reduce((sum, s) => sum + s.totalCalls, 0);
        const successfulCalls = stats.reduce((sum, s) => sum + s.successfulCalls, 0);
        const totalResponseTime = stats.reduce((sum, s) => sum + s.avgResponseTime * s.totalCalls, 0);
        const callsByTool = {};
        stats.forEach(stat => {
            Object.entries(stat.callsByTool).forEach(([tool, count]) => {
                callsByTool[tool] = (callsByTool[tool] || 0) + count;
            });
        });
        return {
            avgResponseTime: totalCalls > 0 ? totalResponseTime / totalCalls : 0,
            successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
            totalCalls,
            callsByTool,
        };
    }
};
exports.AirbnbMonitoringService = AirbnbMonitoringService;
exports.AirbnbMonitoringService = AirbnbMonitoringService = AirbnbMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], AirbnbMonitoringService);
//# sourceMappingURL=airbnb-monitoring.service.js.map