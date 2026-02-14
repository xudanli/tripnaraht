"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringService = void 0;
const common_1 = require("@nestjs/common");
let MonitoringService = MonitoringService_1 = class MonitoringService {
    constructor() {
        this.logger = new common_1.Logger(MonitoringService_1.name);
        this.metrics = {
            performance: {
                avgGenerationTime: 0,
                avgRepairTime: 0,
                p95GenerationTime: 0,
                p95RepairTime: 0,
            },
            quality: {
                avgExecutabilityRate: 0,
                avgStabilityScore: 0,
                violationRate: 0,
            },
            usage: {
                totalPlansGenerated: 0,
                totalRepairs: 0,
                activeUsers: 0,
            },
        };
        this.generationTimes = [];
        this.repairTimes = [];
        this.executabilityRates = [];
        this.stabilityScores = [];
        this.alerts = [];
    }
    recordPlanGeneration(log, generationTime, metrics) {
        this.metrics.usage.totalPlansGenerated++;
        this.generationTimes.push(generationTime);
        this.updatePerformanceMetrics();
        if (metrics) {
            this.executabilityRates.push(metrics.executability.executabilityRate);
            this.stabilityScores.push(metrics.stability.stabilityScore);
            this.updateQualityMetrics();
        }
        this.checkAlerts();
    }
    recordPlanRepair(log, repairTime, metrics) {
        this.metrics.usage.totalRepairs++;
        this.repairTimes.push(repairTime);
        this.updatePerformanceMetrics();
        if (metrics) {
            this.executabilityRates.push(metrics.executability.executabilityRate);
            this.stabilityScores.push(metrics.stability.stabilityScore);
            this.updateQualityMetrics();
        }
        this.checkAlerts();
    }
    getMetrics() {
        return { ...this.metrics };
    }
    getAlerts(level) {
        if (level) {
            return this.alerts.filter(a => a.level === level);
        }
        return [...this.alerts];
    }
    updatePerformanceMetrics() {
        if (this.generationTimes.length > 0) {
            const sum = this.generationTimes.reduce((a, b) => a + b, 0);
            this.metrics.performance.avgGenerationTime =
                sum / this.generationTimes.length;
            const sorted = [...this.generationTimes].sort((a, b) => a - b);
            const p95Index = Math.floor(sorted.length * 0.95);
            this.metrics.performance.p95GenerationTime = sorted[p95Index] || 0;
        }
        if (this.repairTimes.length > 0) {
            const sum = this.repairTimes.reduce((a, b) => a + b, 0);
            this.metrics.performance.avgRepairTime =
                sum / this.repairTimes.length;
            const sorted = [...this.repairTimes].sort((a, b) => a - b);
            const p95Index = Math.floor(sorted.length * 0.95);
            this.metrics.performance.p95RepairTime = sorted[p95Index] || 0;
        }
    }
    updateQualityMetrics() {
        if (this.executabilityRates.length > 0) {
            const sum = this.executabilityRates.reduce((a, b) => a + b, 0);
            this.metrics.quality.avgExecutabilityRate =
                sum / this.executabilityRates.length;
        }
        if (this.stabilityScores.length > 0) {
            const sum = this.stabilityScores.reduce((a, b) => a + b, 0);
            this.metrics.quality.avgStabilityScore =
                sum / this.stabilityScores.length;
        }
        this.metrics.quality.violationRate =
            1 - this.metrics.quality.avgExecutabilityRate;
    }
    checkAlerts() {
        if (this.metrics.performance.avgGenerationTime > 5000 &&
            this.generationTimes.length > 10) {
            this.addAlert('warning', '平均生成时间超过5秒', {
                avgTime: this.metrics.performance.avgGenerationTime,
            });
        }
        if (this.metrics.performance.p95GenerationTime > 10000 &&
            this.generationTimes.length > 10) {
            this.addAlert('error', 'P95生成时间超过10秒', {
                p95Time: this.metrics.performance.p95GenerationTime,
            });
        }
        if (this.metrics.quality.avgExecutabilityRate < 0.8 &&
            this.executabilityRates.length > 10) {
            this.addAlert('warning', '平均可执行率低于80%', {
                rate: this.metrics.quality.avgExecutabilityRate,
            });
        }
        if (this.metrics.quality.violationRate > 0.3 &&
            this.executabilityRates.length > 10) {
            this.addAlert('error', '违规率超过30%', {
                violationRate: this.metrics.quality.violationRate,
            });
        }
    }
    addAlert(level, message, details) {
        const alert = {
            level,
            message,
            timestamp: new Date().toISOString(),
            details,
        };
        this.alerts.push(alert);
        if (this.alerts.length > 100) {
            this.alerts.shift();
        }
        switch (level) {
            case 'critical':
            case 'error':
                this.logger.error(`[Alert] ${message}`, details);
                break;
            case 'warning':
                this.logger.warn(`[Alert] ${message}`, details);
                break;
            default:
                this.logger.log(`[Alert] ${message}`, details);
        }
    }
    reset() {
        this.generationTimes.length = 0;
        this.repairTimes.length = 0;
        this.executabilityRates.length = 0;
        this.stabilityScores.length = 0;
        this.alerts.length = 0;
        Object.assign(this.metrics, {
            performance: {
                avgGenerationTime: 0,
                avgRepairTime: 0,
                p95GenerationTime: 0,
                p95RepairTime: 0,
            },
            quality: {
                avgExecutabilityRate: 0,
                avgStabilityScore: 0,
                violationRate: 0,
            },
            usage: {
                totalPlansGenerated: 0,
                totalRepairs: 0,
                activeUsers: 0,
            },
        });
    }
};
exports.MonitoringService = MonitoringService;
exports.MonitoringService = MonitoringService = MonitoringService_1 = __decorate([
    (0, common_1.Injectable)()
], MonitoringService);
//# sourceMappingURL=monitoring.service.js.map