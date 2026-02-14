"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DataQualityAlertService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQualityAlertService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let DataQualityAlertService = DataQualityAlertService_1 = class DataQualityAlertService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DataQualityAlertService_1.name);
    }
    async createAlert(dto) {
        try {
            const existingAlert = await this.prisma.dataQualityAlert.findFirst({
                where: {
                    monitorId: dto.monitorId || undefined,
                    geographicMonitorId: dto.geographicMonitorId || undefined,
                    alertType: dto.alertType,
                    status: 'PENDING',
                    createdAt: {
                        gte: new Date(Date.now() - 60 * 60 * 1000),
                    },
                },
            });
            if (existingAlert) {
                this.logger.debug(`告警已存在，跳过创建: ${dto.alertType}`);
                return;
            }
            const alert = await this.prisma.dataQualityAlert.create({
                data: {
                    monitorId: dto.monitorId,
                    geographicMonitorId: dto.geographicMonitorId,
                    severity: dto.severity,
                    alertType: dto.alertType,
                    message: dto.message,
                    details: dto.details || {},
                    status: 'PENDING',
                },
            });
            this.logger.warn(`创建告警: ${dto.alertType} - ${dto.message}`);
            this.sendNotification(alert.id, dto).catch(error => {
                this.logger.error(`发送告警通知失败: ${error.message}`, error.stack);
            });
        }
        catch (error) {
            this.logger.error(`创建告警失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async sendNotification(alertId, dto) {
        this.logger.log(`发送告警通知: ${dto.alertType} - ${dto.message}`);
    }
    async acknowledgeAlert(alertId, acknowledgedBy) {
        await this.prisma.dataQualityAlert.update({
            where: { id: alertId },
            data: {
                status: 'ACKNOWLEDGED',
                acknowledgedBy,
                acknowledgedAt: new Date(),
            },
        });
        this.logger.log(`告警已处理: ${alertId} by ${acknowledgedBy}`);
    }
    async resolveAlert(alertId) {
        await this.prisma.dataQualityAlert.update({
            where: { id: alertId },
            data: {
                status: 'RESOLVED',
                resolvedAt: new Date(),
            },
        });
        this.logger.log(`告警已解决: ${alertId}`);
    }
    async getPendingAlerts(limit = 100) {
        return this.prisma.dataQualityAlert.findMany({
            where: {
                status: 'PENDING',
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: limit,
            include: {
                monitor: true,
                geographicMonitor: true,
            },
        });
    }
    async checkDataExpiry() {
        const { EXPIRY_RULES, isDataExpired } = await Promise.resolve().then(() => __importStar(require('../config/data-expiry-rules.config')));
        const monitors = await this.prisma.dataQualityMonitor.findMany({
            select: {
                id: true,
                dataSource: true,
                dataType: true,
                countryCode: true,
                lastUpdated: true,
            },
        });
        for (const monitor of monitors) {
            const rule = EXPIRY_RULES[monitor.dataType];
            if (rule && typeof rule === 'object' && 'expiryDays' in rule) {
                const expiryDays = rule.expiryDays;
                if (expiryDays && isDataExpired(monitor.lastUpdated, expiryDays)) {
                    await this.createAlert({
                        monitorId: monitor.id,
                        severity: 'HIGH',
                        alertType: 'DATA_EXPIRED',
                        message: `数据已过期: ${monitor.dataSource} (${monitor.dataType})，超过 ${expiryDays} 天未更新`,
                        details: {
                            dataSource: monitor.dataSource,
                            dataType: monitor.dataType,
                            lastUpdated: monitor.lastUpdated,
                            expiryDays,
                        },
                    });
                }
            }
        }
        const geographicMonitors = await this.prisma.geographicDataQualityMonitor.findMany({
            select: {
                id: true,
                dataSource: true,
                dataType: true,
                countryCode: true,
                lastUpdated: true,
                coverageRate: true,
            },
        });
        for (const monitor of geographicMonitors) {
            const featuresRule = EXPIRY_RULES.GEOGRAPHIC_FEATURES;
            const rule = featuresRule[monitor.dataType];
            if (rule && rule.expiryDays) {
                if (isDataExpired(monitor.lastUpdated, rule.expiryDays)) {
                    await this.createAlert({
                        geographicMonitorId: monitor.id,
                        severity: 'MEDIUM',
                        alertType: 'GEOGRAPHIC_DATA_EXPIRED',
                        message: `地理数据已过期: ${monitor.dataSource} (${monitor.dataType})，超过 ${rule.expiryDays} 天未更新`,
                        details: {
                            dataSource: monitor.dataSource,
                            dataType: monitor.dataType,
                            lastUpdated: monitor.lastUpdated,
                            expiryDays: rule.expiryDays,
                        },
                    });
                }
            }
            else if (monitor.dataType === 'DEM') {
                const demRule = EXPIRY_RULES.DEM;
                if (demRule.checkIntegrity && monitor.coverageRate !== null && monitor.coverageRate < 0.8) {
                    await this.createAlert({
                        geographicMonitorId: monitor.id,
                        severity: 'CRITICAL',
                        alertType: 'DEM_DATA_INTEGRITY_LOW',
                        message: `DEM数据完整性不足: ${monitor.dataSource}，覆盖率: ${(monitor.coverageRate * 100).toFixed(1)}%`,
                        details: {
                            dataSource: monitor.dataSource,
                            dataType: monitor.dataType,
                            coverageRate: monitor.coverageRate,
                        },
                    });
                }
            }
        }
    }
};
exports.DataQualityAlertService = DataQualityAlertService;
exports.DataQualityAlertService = DataQualityAlertService = DataQualityAlertService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DataQualityAlertService);
//# sourceMappingURL=data-quality-alert.service.js.map