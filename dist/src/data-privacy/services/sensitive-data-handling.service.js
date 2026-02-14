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
var SensitiveDataHandlingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SensitiveDataHandlingService = void 0;
const common_1 = require("@nestjs/common");
const encryption_service_1 = require("./encryption.service");
const data_privacy_framework_service_1 = require("./data-privacy-framework.service");
let SensitiveDataHandlingService = SensitiveDataHandlingService_1 = class SensitiveDataHandlingService {
    constructor(encryptionService, privacyFramework) {
        this.encryptionService = encryptionService;
        this.privacyFramework = privacyFramework;
        this.logger = new common_1.Logger(SensitiveDataHandlingService_1.name);
    }
    async handleHealthData(data) {
        this.logger.log(`Processing health data for user ${data.userId}`);
        const encrypted = await this.encryptionService.encrypt(data.healthInfo, 'AES-256');
        const retentionPolicy = await this.privacyFramework.minimizeRetentionPeriod('HEALTH_DATA');
        return {
            data: encrypted,
            encryption: 'AES-256加密存储',
            accessControl: '仅医疗专业人员可访问',
            retention: `最多保留${retentionPolicy.retentionDays}天`,
            purposeLimitation: '仅用于健康风险评估',
        };
    }
    async handleLocationData(data) {
        this.logger.log(`Processing location data for user ${data.userId}`);
        const processed = {
            region: this.getRegionFromCoordinates(data.location.latitude, data.location.longitude),
            timestamp: data.location.timestamp,
            accuracy: data.location.accuracy || 'unknown',
        };
        const encrypted = await this.encryptionService.encrypt(processed, 'AES-256');
        const retentionPolicy = await this.privacyFramework.minimizeRetentionPeriod('LOCATION_DATA');
        return {
            data: encrypted,
            encryption: '端到端加密',
            realTimeHandling: '实时处理后立即删除原始精确坐标',
            historicalRetention: `最多保留${retentionPolicy.retentionDays}天`,
        };
    }
    async handleBehavioralData(data) {
        this.logger.log(`Processing behavioral data for user ${data.userId}`);
        const anonymized = this.anonymizeData(data.behavior);
        const aggregated = this.aggregateData(anonymized);
        const retentionPolicy = await this.privacyFramework.minimizeRetentionPeriod('BEHAVIORAL_DATA');
        return {
            data: aggregated,
            anonymization: '去标识化处理',
            aggregation: '仅保留聚合统计',
            retention: `最多保留${retentionPolicy.retentionDays}天`,
        };
    }
    getRegionFromCoordinates(lat, lng) {
        const regionLat = Math.round(lat * 10) / 10;
        const regionLng = Math.round(lng * 10) / 10;
        return `${regionLat},${regionLng}`;
    }
    anonymizeData(behavior) {
        const anonymized = {};
        if (behavior.searchHistory) {
            anonymized.searchKeywords = behavior.searchHistory.map((item) => {
                if (typeof item === 'string') {
                    return item;
                }
                return item.query || item.keyword || 'unknown';
            });
        }
        if (behavior.clickHistory) {
            anonymized.clickTypes = this.countOccurrences(behavior.clickHistory.map((item) => item.type || 'unknown'));
        }
        if (behavior.preferences) {
            anonymized.preferences = behavior.preferences;
        }
        return anonymized;
    }
    aggregateData(anonymized) {
        const aggregated = {};
        if (anonymized.searchKeywords) {
            aggregated.searchStats = {
                totalSearches: anonymized.searchKeywords.length,
                uniqueKeywords: new Set(anonymized.searchKeywords).size,
                topKeywords: this.getTopItems(anonymized.searchKeywords, 5),
            };
        }
        if (anonymized.clickTypes) {
            aggregated.clickStats = anonymized.clickTypes;
        }
        if (anonymized.preferences) {
            aggregated.preferences = anonymized.preferences;
        }
        return aggregated;
    }
    countOccurrences(items) {
        const counts = {};
        items.forEach(item => {
            counts[item] = (counts[item] || 0) + 1;
        });
        return counts;
    }
    getTopItems(items, n) {
        const counts = this.countOccurrences(items);
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([item]) => item);
    }
};
exports.SensitiveDataHandlingService = SensitiveDataHandlingService;
exports.SensitiveDataHandlingService = SensitiveDataHandlingService = SensitiveDataHandlingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [encryption_service_1.EncryptionService,
        data_privacy_framework_service_1.DataPrivacyFrameworkService])
], SensitiveDataHandlingService);
//# sourceMappingURL=sensitive-data-handling.service.js.map