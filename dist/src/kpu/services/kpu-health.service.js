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
var KPUHealthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KPUHealthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const redis_service_1 = require("../../redis/redis.service");
const llm_service_1 = require("../../llm/services/llm.service");
const kpu_monitoring_service_1 = require("./kpu-monitoring.service");
let KPUHealthService = KPUHealthService_1 = class KPUHealthService {
    constructor(prisma, redisService, llmService, monitoringService) {
        this.prisma = prisma;
        this.redisService = redisService;
        this.llmService = llmService;
        this.monitoringService = monitoringService;
        this.logger = new common_1.Logger(KPUHealthService_1.name);
    }
    async checkHealth() {
        const services = {
            database: await this.checkDatabase(),
            redis: await this.checkRedis(),
            llm: await this.checkLlm(),
        };
        const metrics = this.monitoringService.getMetrics();
        const successRate = metrics.totalValidations > 0
            ? (metrics.successfulValidations / metrics.totalValidations) * 100
            : 100;
        const errorCount = Object.values(services).filter(s => s === 'error').length;
        let status;
        if (errorCount === 0) {
            status = 'healthy';
        }
        else if (errorCount === 1 && services.redis === 'error') {
            status = 'degraded';
        }
        else {
            status = 'unhealthy';
        }
        return {
            status,
            services,
            metrics: {
                totalValidations: metrics.totalValidations,
                successRate: Math.round(successRate * 100) / 100,
                avgLatency: Math.round(metrics.avgValidationLatency),
                cacheHitRate: Math.round(metrics.cacheHitRate * 100) / 100,
            },
            timestamp: new Date(),
        };
    }
    async checkDatabase() {
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            return 'ok';
        }
        catch (error) {
            this.logger.error('数据库健康检查失败', error);
            return 'error';
        }
    }
    async checkRedis() {
        if (!this.redisService) {
            return 'disabled';
        }
        try {
            await this.redisService.get('health_check');
            return 'ok';
        }
        catch (error) {
            this.logger.warn('Redis健康检查失败', error);
            return 'error';
        }
    }
    async checkLlm() {
        if (!this.llmService) {
            return 'disabled';
        }
        const hasApiKey = !!(process.env.DEEPSEEK_API_KEY ||
            process.env.OPENAI_API_KEY ||
            process.env.ANTHROPIC_API_KEY ||
            process.env.GEMINI_API_KEY);
        return hasApiKey ? 'ok' : 'error';
    }
};
exports.KPUHealthService = KPUHealthService;
exports.KPUHealthService = KPUHealthService = KPUHealthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        llm_service_1.LlmService,
        kpu_monitoring_service_1.KPUMonitoringService])
], KPUHealthService);
//# sourceMappingURL=kpu-health.service.js.map