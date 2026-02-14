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
var PostgreSQLMcpMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgreSQLMcpMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
let PostgreSQLMcpMonitoringService = PostgreSQLMcpMonitoringService_1 = class PostgreSQLMcpMonitoringService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(PostgreSQLMcpMonitoringService_1.name);
        this.metricsKeyPrefix = 'postgresql-mcp:metrics:';
        this.slowQueryThreshold = 1000;
        this.maxSlowQueries = 100;
        this.slowQueries = [];
        this.dailyStats = new Map();
    }
    async recordQueryMetrics(metrics) {
        try {
            if (metrics.success) {
                this.logger.debug(`Query executed: ${metrics.executionTime}ms, rows: ${metrics.rowCount || 0}`);
            }
            else {
                this.logger.warn(`Query failed: ${metrics.error}, executionTime: ${metrics.executionTime}ms`);
            }
            if (metrics.executionTime > this.slowQueryThreshold) {
                await this.recordSlowQuery(metrics);
            }
            if (this.redisService) {
                await this.recordToRedis(metrics);
            }
        }
        catch (error) {
            this.logger.error(`Failed to record query metrics: ${error.message}`);
        }
    }
    async recordSlowQuery(metrics) {
        try {
            this.slowQueries.push(metrics);
            this.slowQueries.sort((a, b) => b.executionTime - a.executionTime);
            if (this.slowQueries.length > this.maxSlowQueries) {
                this.slowQueries.splice(this.maxSlowQueries);
            }
            if (this.redisService) {
                const key = `${this.metricsKeyPrefix}slow-queries`;
                const serialized = JSON.stringify(this.slowQueries.slice(0, this.maxSlowQueries));
                await this.redisService.set(key, serialized, 7 * 24 * 60 * 60);
            }
            this.logger.warn(`Slow query detected: ${metrics.executionTime}ms\nQuery: ${metrics.query.substring(0, 200)}...`);
        }
        catch (error) {
            this.logger.error(`Failed to record slow query: ${error.message}`);
        }
    }
    async recordToRedis(metrics) {
        try {
            const date = new Date().toISOString().split('T')[0];
            if (!this.dailyStats.has(date)) {
                this.dailyStats.set(date, {
                    totalQueries: 0,
                    successQueries: 0,
                    failedQueries: 0,
                    executionTimes: [],
                });
            }
            const stats = this.dailyStats.get(date);
            stats.totalQueries++;
            if (metrics.success) {
                stats.successQueries++;
            }
            else {
                stats.failedQueries++;
            }
            stats.executionTimes.push(metrics.executionTime);
            if (stats.executionTimes.length > 10000) {
                stats.executionTimes = stats.executionTimes.slice(-10000);
            }
            if (this.redisService) {
                const key = `${this.metricsKeyPrefix}daily:${date}`;
                const serialized = JSON.stringify(stats);
                await this.redisService.set(key, serialized, 30 * 24 * 60 * 60);
            }
        }
        catch (error) {
            this.logger.error(`Failed to record to Redis: ${error.message}`);
        }
    }
    async getPerformanceStats(days = 1) {
        try {
            const stats = {
                totalQueries: 0,
                avgExecutionTime: 0,
                p50ExecutionTime: 0,
                p95ExecutionTime: 0,
                p99ExecutionTime: 0,
                errorRate: 0,
                slowQueries: [],
            };
            const executionTimes = [];
            let totalQueries = 0;
            let successQueries = 0;
            let failedQueries = 0;
            for (let i = 0; i < days; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                let dailyStats = this.dailyStats.get(dateStr);
                if (!dailyStats && this.redisService) {
                    const key = `${this.metricsKeyPrefix}daily:${dateStr}`;
                    const cached = await this.redisService.get(key);
                    if (cached) {
                        dailyStats = cached;
                        this.dailyStats.set(dateStr, dailyStats);
                    }
                }
                if (dailyStats) {
                    totalQueries += dailyStats.totalQueries;
                    successQueries += dailyStats.successQueries;
                    failedQueries += dailyStats.failedQueries;
                    executionTimes.push(...dailyStats.executionTimes);
                }
            }
            if (executionTimes.length > 0) {
                executionTimes.sort((a, b) => a - b);
                const sum = executionTimes.reduce((a, b) => a + b, 0);
                stats.avgExecutionTime = sum / executionTimes.length;
                stats.p50ExecutionTime = this.getPercentile(executionTimes, 50);
                stats.p95ExecutionTime = this.getPercentile(executionTimes, 95);
                stats.p99ExecutionTime = this.getPercentile(executionTimes, 99);
            }
            stats.totalQueries = totalQueries;
            stats.errorRate = totalQueries > 0 ? failedQueries / totalQueries : 0;
            stats.slowQueries = await this.getSlowQueries();
            return stats;
        }
        catch (error) {
            this.logger.error(`Failed to get performance stats: ${error.message}`);
            return this.getDefaultStats();
        }
    }
    async getSlowQueries(limit = 20) {
        try {
            let queries = this.slowQueries.slice(0, limit);
            if (queries.length === 0 && this.redisService) {
                const key = `${this.metricsKeyPrefix}slow-queries`;
                const cached = await this.redisService.get(key);
                if (cached && Array.isArray(cached)) {
                    queries = cached.slice(0, limit);
                    this.slowQueries.push(...cached);
                    this.slowQueries.sort((a, b) => b.executionTime - a.executionTime);
                    if (this.slowQueries.length > this.maxSlowQueries) {
                        this.slowQueries.splice(this.maxSlowQueries);
                    }
                }
            }
            return queries.map(q => ({
                ...q,
                timestamp: q.timestamp instanceof Date ? q.timestamp : new Date(q.timestamp),
            }));
        }
        catch (error) {
            this.logger.error(`Failed to get slow queries: ${error.message}`);
            return [];
        }
    }
    getPercentile(sortedArray, percentile) {
        if (sortedArray.length === 0) {
            return 0;
        }
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    }
    getDefaultStats() {
        return {
            totalQueries: 0,
            avgExecutionTime: 0,
            p50ExecutionTime: 0,
            p95ExecutionTime: 0,
            p99ExecutionTime: 0,
            errorRate: 0,
            slowQueries: [],
        };
    }
};
exports.PostgreSQLMcpMonitoringService = PostgreSQLMcpMonitoringService;
exports.PostgreSQLMcpMonitoringService = PostgreSQLMcpMonitoringService = PostgreSQLMcpMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], PostgreSQLMcpMonitoringService);
//# sourceMappingURL=postgresql-mcp-monitoring.service.js.map