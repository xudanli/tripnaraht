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
var SafetravelService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetravelService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const http_client_factory_1 = require("../../common/utils/http-client.factory");
const safetravel_dto_1 = require("../dto/safetravel.dto");
let SafetravelService = SafetravelService_1 = class SafetravelService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(SafetravelService_1.name);
        this.baseURL = 'https://safetravel.is';
        this.httpClient = http_client_factory_1.HttpClientFactory.create({
            baseURL: this.baseURL,
            timeout: 10000,
        });
    }
    async getSafetyInfo(query) {
        try {
            try {
                const alertsResponse = await this.httpClient.get('/api/alerts', {
                    params: {
                        region: query.region,
                        type: query.alertType,
                    },
                }).catch(() => null);
                const conditionsResponse = await this.httpClient.get('/api/travel-conditions', {
                    params: {
                        region: query.region,
                    },
                }).catch(() => null);
                if (alertsResponse || conditionsResponse) {
                    return this.parseSafetravelResponse(alertsResponse === null || alertsResponse === void 0 ? void 0 : alertsResponse.data, conditionsResponse === null || conditionsResponse === void 0 ? void 0 : conditionsResponse.data, query);
                }
                this.logger.warn('safetravel.is API不可用，使用模拟数据');
                return this.getMockSafetyData(query);
            }
            catch (apiError) {
                this.logger.warn(`safetravel.is API调用失败: ${apiError.message}，使用模拟数据`);
                return this.getMockSafetyData(query);
            }
        }
        catch (error) {
            this.logger.error(`获取safetravel.is安全信息失败: ${error.message}`);
            throw error;
        }
    }
    parseSafetravelResponse(alertsData, conditionsData, query) {
        const alerts = ((alertsData === null || alertsData === void 0 ? void 0 : alertsData.alerts) || []).map((alert) => {
            let severity = safetravel_dto_1.AlertSeverity.MEDIUM;
            if (alert.severity) {
                const severityStr = String(alert.severity).toLowerCase();
                if (severityStr === 'low')
                    severity = safetravel_dto_1.AlertSeverity.LOW;
                else if (severityStr === 'medium')
                    severity = safetravel_dto_1.AlertSeverity.MEDIUM;
                else if (severityStr === 'high')
                    severity = safetravel_dto_1.AlertSeverity.HIGH;
                else if (severityStr === 'critical')
                    severity = safetravel_dto_1.AlertSeverity.CRITICAL;
            }
            return {
                id: alert.id || `alert-${Date.now()}`,
                title: alert.title || '安全警报',
                description: alert.description || '',
                type: alert.type || safetravel_dto_1.AlertType.GENERAL,
                severity,
                effectiveTime: alert.effectiveTime || new Date().toISOString(),
                expiryTime: alert.expiryTime,
                regions: alert.regions || [],
                fRoads: alert.fRoads || [],
            };
        });
        const travelConditions = ((conditionsData === null || conditionsData === void 0 ? void 0 : conditionsData.conditions) || []).map((condition) => ({
            region: condition.region || '',
            roadStatus: condition.roadStatus || 'open',
            weatherStatus: condition.weatherStatus || 'good',
            overallStatus: condition.overallStatus || 'green',
            description: condition.description || '',
            lastUpdated: condition.lastUpdated || new Date().toISOString(),
        }));
        return {
            alerts: alerts.filter((alert) => {
                if (query.region && !alert.regions.includes(query.region)) {
                    return false;
                }
                if (query.alertType && alert.type !== query.alertType) {
                    return false;
                }
                return true;
            }),
            travelConditions: travelConditions.filter((condition) => {
                if (query.region && condition.region !== query.region) {
                    return false;
                }
                return true;
            }),
            lastUpdated: new Date().toISOString(),
        };
    }
    getMockSafetyData(query) {
        const alerts = [
            {
                id: 'alert-1',
                title: '高地强风警告',
                description: '中央高地区域预计有强风，风速可能超过15m/s，建议推迟出行。',
                type: safetravel_dto_1.AlertType.WEATHER,
                severity: safetravel_dto_1.AlertSeverity.HIGH,
                effectiveTime: new Date().toISOString(),
                expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                regions: ['highlands', 'central-highlands'],
                fRoads: ['F26', 'F208'],
            },
            {
                id: 'alert-2',
                title: 'F路路况提醒',
                description: '部分F路因天气原因需要谨慎驾驶，建议4x4车辆。',
                type: safetravel_dto_1.AlertType.ROAD,
                severity: safetravel_dto_1.AlertSeverity.MEDIUM,
                effectiveTime: new Date().toISOString(),
                regions: ['highlands'],
                fRoads: ['F910', 'F88'],
            },
        ].filter((alert) => {
            if (query.region && !alert.regions.includes(query.region)) {
                return false;
            }
            if (query.alertType && alert.type !== query.alertType) {
                return false;
            }
            return true;
        });
        const travelConditions = [
            {
                region: 'highlands',
                roadStatus: 'caution',
                weatherStatus: 'fair',
                overallStatus: 'yellow',
                description: '高地路况一般，部分F路需要谨慎驾驶',
                lastUpdated: new Date().toISOString(),
            },
            {
                region: 'central-highlands',
                roadStatus: 'open',
                weatherStatus: 'good',
                overallStatus: 'green',
                description: '中央高地区域路况良好',
                lastUpdated: new Date().toISOString(),
            },
        ].filter((condition) => {
            if (query.region && condition.region !== query.region) {
                return false;
            }
            return true;
        });
        return {
            alerts,
            travelConditions,
            lastUpdated: new Date().toISOString(),
        };
    }
};
exports.SafetravelService = SafetravelService;
exports.SafetravelService = SafetravelService = SafetravelService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SafetravelService);
//# sourceMappingURL=safetravel.service.js.map