"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DataExpiryPolicyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataExpiryPolicyService = void 0;
const common_1 = require("@nestjs/common");
let DataExpiryPolicyService = DataExpiryPolicyService_1 = class DataExpiryPolicyService {
    constructor() {
        this.logger = new common_1.Logger(DataExpiryPolicyService_1.name);
        this.defaultTTL = {
            DEM: 86400 * 7,
            TRANSPORT: 3600,
            OPENING_HOURS: 86400,
            WEATHER: 3600,
            POI: 86400 * 30,
            ROUTE: 3600,
        };
    }
    isExpired(data) {
        const { expiry_policy, timestamp } = data.metadata;
        const ageSeconds = this.getDataAge(data);
        switch (expiry_policy.type) {
            case 'TTL':
                if (expiry_policy.ttl_seconds) {
                    return ageSeconds > expiry_policy.ttl_seconds;
                }
                return this.isExpiredByDefaultTTL(data, ageSeconds);
            case 'SCHEDULED':
                if (expiry_policy.expiry_time) {
                    return new Date() > new Date(expiry_policy.expiry_time);
                }
                return false;
            case 'EVENT_BASED':
                return false;
            default:
                return this.isExpiredByDefaultTTL(data, ageSeconds);
        }
    }
    isExpiredByDefaultTTL(data, ageSeconds) {
        const dataType = this.inferDataType(data);
        const defaultTTL = this.defaultTTL[dataType] || 3600;
        return ageSeconds > defaultTTL;
    }
    inferDataType(data) {
        const source = data.metadata.source;
        if (source === 'ESTIMATED' || source === 'DEFAULT') {
            return 'ROUTE';
        }
        return 'ROUTE';
    }
    getDataAge(data) {
        const timestamp = new Date(data.metadata.timestamp);
        const now = new Date();
        return Math.floor((now.getTime() - timestamp.getTime()) / 1000);
    }
    assessDataQuality(data) {
        const ageSeconds = this.getDataAge(data);
        const isExpired = this.isExpired(data);
        const warnings = [];
        const recommendations = [];
        if (isExpired) {
            warnings.push(`数据已过期（年龄: ${this.formatAge(ageSeconds)}）`);
            recommendations.push('建议：刷新数据或使用保守策略');
        }
        const reliability = data.metadata.reliability;
        if (reliability === 'LOW') {
            warnings.push('数据可靠性低');
            recommendations.push('建议：验证数据来源或使用备用数据');
        }
        const source = data.metadata.source;
        if (source === 'ESTIMATED' || source === 'DEFAULT') {
            warnings.push(`数据来源为估算值（${source}）`);
            recommendations.push('建议：使用实际数据源验证');
        }
        const dataType = this.inferDataType(data);
        const defaultTTL = this.defaultTTL[dataType] || 3600;
        const ageRatio = ageSeconds / defaultTTL;
        if (ageRatio > 0.8) {
            warnings.push(`数据年龄接近过期阈值（${this.formatAge(ageSeconds)}）`);
            recommendations.push('建议：考虑刷新数据');
        }
        return {
            is_expired: isExpired,
            age_seconds: ageSeconds,
            reliability,
            warnings,
            recommendations,
        };
    }
    assessMultipleDataQuality(dataList) {
        const details = dataList.map((data, index) => ({
            index,
            assessment: this.assessDataQuality(data),
        }));
        const expired = details.filter(d => d.assessment.is_expired).length;
        const lowReliability = details.filter(d => d.assessment.reliability === 'LOW').length;
        const warningsCount = details.reduce((sum, d) => sum + d.assessment.warnings.length, 0);
        return {
            overall: {
                total: dataList.length,
                expired,
                low_reliability: lowReliability,
                warnings_count: warningsCount,
            },
            details,
        };
    }
    createTimestampedData(data, options = {}) {
        const timestamp = new Date().toISOString();
        const source = options.source || 'DATABASE';
        const reliability = options.reliability || this.inferReliability(source);
        const expiry_policy = options.expiry_policy || {
            type: 'TTL',
            ttl_seconds: this.defaultTTL[this.inferDataType({ data, metadata: { timestamp, source, expiry_policy: { type: 'TTL' }, reliability } })] || 3600,
        };
        return {
            data,
            metadata: {
                timestamp,
                source,
                expiry_policy,
                reliability,
            },
        };
    }
    inferReliability(source) {
        switch (source) {
            case 'API':
                return 'HIGH';
            case 'DATABASE':
                return 'MEDIUM';
            case 'CACHE':
                return 'MEDIUM';
            case 'ESTIMATED':
                return 'LOW';
            case 'DEFAULT':
                return 'LOW';
            default:
                return 'MEDIUM';
        }
    }
    formatAge(seconds) {
        if (seconds < 60) {
            return `${seconds} 秒`;
        }
        else if (seconds < 3600) {
            return `${Math.floor(seconds / 60)} 分钟`;
        }
        else if (seconds < 86400) {
            return `${Math.floor(seconds / 3600)} 小时`;
        }
        else {
            return `${Math.floor(seconds / 86400)} 天`;
        }
    }
    getDefaultTTL(dataType) {
        return this.defaultTTL[dataType] || 3600;
    }
    setDefaultTTL(dataType, ttlSeconds) {
        this.defaultTTL[dataType] = ttlSeconds;
        this.logger.debug(`设置 ${dataType} 的默认 TTL 为 ${ttlSeconds} 秒`);
    }
};
exports.DataExpiryPolicyService = DataExpiryPolicyService;
exports.DataExpiryPolicyService = DataExpiryPolicyService = DataExpiryPolicyService_1 = __decorate([
    (0, common_1.Injectable)()
], DataExpiryPolicyService);
//# sourceMappingURL=data-expiry-policy.service.js.map