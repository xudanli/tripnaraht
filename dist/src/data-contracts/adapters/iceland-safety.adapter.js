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
var IcelandSafetyAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcelandSafetyAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const base_adapter_1 = require("./base.adapter");
const adapter_mapper_util_1 = require("../../common/utils/adapter-mapper.util");
let IcelandSafetyAdapter = IcelandSafetyAdapter_1 = class IcelandSafetyAdapter extends base_adapter_1.BaseAdapter {
    constructor(configService) {
        super(IcelandSafetyAdapter_1.name, {
            baseURL: 'https://safetravel.is',
            timeout: 15000,
        });
        this.configService = configService;
    }
    async getSafetyAlerts(lat, lng) {
        return this.safeRequest(async () => {
            const params = {};
            if (lat !== undefined && lng !== undefined) {
                params.lat = lat;
                params.lng = lng;
            }
            const response = await this.httpClient.get('/api/alerts', { params });
            return this.mapToSafetyAlerts(response.data);
        }, '获取冰岛安全警报失败', []);
    }
    async getSafetyAlertsByType(type, lat, lng) {
        const allAlerts = await this.getSafetyAlerts(lat, lng);
        return allAlerts.filter(alert => alert.type === type);
    }
    async getCriticalSafetyAlerts(lat, lng) {
        const allAlerts = await this.getSafetyAlerts(lat, lng);
        return allAlerts.filter(alert => alert.severity === 'warning' || alert.severity === 'critical');
    }
    mapToSafetyAlerts(data) {
        const alerts = [];
        if (!data || !Array.isArray(data)) {
            return alerts;
        }
        for (const item of data) {
            alerts.push({
                id: item.id || item.alertId || String(Date.now()),
                type: this.mapAlertType(item.type || item.category),
                severity: this.mapSeverity(item.severity || item.level),
                title: item.title || item.headline,
                description: item.description || item.text || item.message,
                affectedAreas: this.mapAffectedAreas(item.affectedAreas || item.areas),
                effectiveTime: item.effectiveTime ? new Date(item.effectiveTime) : new Date(),
                expiryTime: item.expiryTime ? new Date(item.expiryTime) : undefined,
                source: 'safetravel',
                metadata: {
                    rawData: item,
                },
            });
        }
        return alerts;
    }
    mapAlertType(type) {
        const typeMap = {
            'weather': 'weather',
            'road': 'road',
            'volcano': 'volcano',
            'volcanic': 'volcano',
            'glacier': 'glacier',
            'geothermal': 'geothermal',
            'hot-spring': 'geothermal',
            'general': 'general',
        };
        return typeMap[type === null || type === void 0 ? void 0 : type.toLowerCase()] || 'general';
    }
    mapSeverity(severity) {
        return adapter_mapper_util_1.AdapterMapper.mapSeverity(severity, {
            'danger': 'critical',
        });
    }
    mapAffectedAreas(areas) {
        if (!areas) {
            return [];
        }
        if (Array.isArray(areas)) {
            return areas.map((area) => ({
                name: area.name || area,
                coordinates: area.coordinates || (area.lat && area.lng ? { lat: area.lat, lng: area.lng } : undefined),
            }));
        }
        return [];
    }
};
exports.IcelandSafetyAdapter = IcelandSafetyAdapter;
exports.IcelandSafetyAdapter = IcelandSafetyAdapter = IcelandSafetyAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], IcelandSafetyAdapter);
//# sourceMappingURL=iceland-safety.adapter.js.map