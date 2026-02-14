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
var RollMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const roll_client_service_1 = require("./roll-client.service");
let RollMonitoringService = RollMonitoringService_1 = class RollMonitoringService {
    constructor(configService, rollClient) {
        this.configService = configService;
        this.rollClient = rollClient;
        this.logger = new common_1.Logger(RollMonitoringService_1.name);
        this.enabled =
            this.configService.get('ROLL_MONITORING_ENABLED') !== false &&
                !!this.rollClient;
        this.bridgeUrl =
            this.configService.get('ROLL_BRIDGE_URL') ||
                'http://localhost:8001';
    }
    async getMetrics() {
        if (!this.enabled) {
            return {};
        }
        try {
            const response = await fetch(`${this.bridgeUrl}/api/metrics`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            this.logger.warn(`[RollMonitoring] 获取指标失败: ${error.message}`);
            return {};
        }
    }
    async getWorkersStatus() {
        if (!this.enabled) {
            return {};
        }
        try {
            const health = await this.rollClient.healthCheck();
            return health;
        }
        catch (error) {
            this.logger.warn(`[RollMonitoring] 获取 Workers 状态失败: ${error.message}`);
            return {};
        }
    }
    async checkHealth() {
        var _a;
        if (!this.enabled) {
            return {
                status: 'unhealthy',
                details: { reason: 'ROLL 监控未启用' },
            };
        }
        try {
            const health = await this.rollClient.healthCheck();
            const metrics = await this.getMetrics();
            const workersAvailable = health.workersAvailable || [];
            const allWorkersHealthy = workersAvailable.length >= 3;
            const errorRate = ((_a = metrics.bridgeService) === null || _a === void 0 ? void 0 : _a.error_rates) || {};
            const hasHighErrorRate = Object.values(errorRate).some((rate) => rate > 0.1);
            let status = 'healthy';
            if (!allWorkersHealthy) {
                status = 'degraded';
            }
            if (hasHighErrorRate) {
                status = 'unhealthy';
            }
            return {
                status,
                details: {
                    workersAvailable,
                    allWorkersHealthy,
                    errorRates: errorRate,
                    metrics,
                },
            };
        }
        catch (error) {
            this.logger.error(`[RollMonitoring] 健康检查失败: ${error.message}`);
            return {
                status: 'unhealthy',
                details: { error: error.message },
            };
        }
    }
};
exports.RollMonitoringService = RollMonitoringService;
exports.RollMonitoringService = RollMonitoringService = RollMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        roll_client_service_1.RollClientService])
], RollMonitoringService);
//# sourceMappingURL=roll-monitoring.service.js.map