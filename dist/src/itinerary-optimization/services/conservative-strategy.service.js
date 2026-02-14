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
var ConservativeStrategyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConservativeStrategyService = void 0;
const common_1 = require("@nestjs/common");
const data_expiry_policy_service_1 = require("./data-expiry-policy.service");
let ConservativeStrategyService = ConservativeStrategyService_1 = class ConservativeStrategyService {
    constructor(dataExpiryPolicyService) {
        this.dataExpiryPolicyService = dataExpiryPolicyService;
        this.logger = new common_1.Logger(ConservativeStrategyService_1.name);
    }
    async checkDataQuality(request, dataSources) {
        const missingDataList = [];
        const staleDataList = [];
        if (!dataSources.dem) {
            missingDataList.push({
                type: 'DEM',
                severity: this.assessDEMSeverity(request),
                affected_segments: this.getAffectedSegments(request, 'DEM'),
                description: 'DEM 地形数据缺失',
                impact: '无法评估路线爬升、坡度等体力消耗特征',
            });
        }
        else {
            const assessment = this.dataExpiryPolicyService.assessDataQuality(dataSources.dem);
            if (assessment.is_expired || assessment.reliability === 'LOW') {
                staleDataList.push({
                    type: 'DEM',
                    age_seconds: assessment.age_seconds,
                    reliability: assessment.reliability,
                });
            }
        }
        if (!dataSources.transport) {
            missingDataList.push({
                type: 'TRANSPORT',
                severity: 'HIGH',
                affected_segments: this.getAffectedSegments(request, 'TRANSPORT'),
                description: '交通路线数据缺失',
                impact: '无法准确计算旅行时间和换乘方案',
            });
        }
        else {
            const assessment = this.dataExpiryPolicyService.assessDataQuality(dataSources.transport);
            if (assessment.is_expired || assessment.reliability === 'LOW') {
                staleDataList.push({
                    type: 'TRANSPORT',
                    age_seconds: assessment.age_seconds,
                    reliability: assessment.reliability,
                });
            }
        }
        if (!dataSources.opening_hours || Object.keys(dataSources.opening_hours.data).length === 0) {
            const affectedPois = request.nodes
                .filter(n => n.type === 'poi' || n.type === 'restaurant')
                .map(n => n.id.toString());
            missingDataList.push({
                type: 'OPENING_HOURS',
                severity: affectedPois.length > 0 ? 'HIGH' : 'MEDIUM',
                affected_segments: affectedPois,
                description: 'POI 开放时间数据缺失',
                impact: '无法验证时间窗约束，可能导致到达时闭馆',
            });
        }
        else {
            const assessment = this.dataExpiryPolicyService.assessDataQuality(dataSources.opening_hours);
            if (assessment.is_expired || assessment.reliability === 'LOW') {
                staleDataList.push({
                    type: 'OPENING_HOURS',
                    age_seconds: assessment.age_seconds,
                    reliability: assessment.reliability,
                });
            }
        }
        if (!dataSources.weather) {
            missingDataList.push({
                type: 'WEATHER',
                severity: 'MEDIUM',
                affected_segments: [],
                description: '天气数据缺失',
                impact: '无法评估天气对路线的影响（如雨天步行风险）',
            });
        }
        else {
            const assessment = this.dataExpiryPolicyService.assessDataQuality(dataSources.weather);
            if (assessment.is_expired || assessment.reliability === 'LOW') {
                staleDataList.push({
                    type: 'WEATHER',
                    age_seconds: assessment.age_seconds,
                    reliability: assessment.reliability,
                });
            }
        }
        return {
            has_stale_data: staleDataList.length > 0,
            has_missing_data: missingDataList.length > 0,
            missing_data_list: missingDataList,
            stale_data_list: staleDataList,
        };
    }
    async applyConservativeStrategy(request, dataQuality) {
        const criticalMissing = dataQuality.missing_data_list.filter(m => m.severity === 'CRITICAL');
        const highMissing = dataQuality.missing_data_list.filter(m => m.severity === 'HIGH');
        const mediumMissing = dataQuality.missing_data_list.filter(m => m.severity === 'MEDIUM');
        if (criticalMissing.length > 0) {
            return {
                decision: 'REJECT',
                reason: 'CRITICAL_DATA_MISSING',
                missing_data: criticalMissing,
                suggestions: this.generateDataRecoverySuggestions(criticalMissing),
                explanation: this.generateRejectionExplanation(criticalMissing),
            };
        }
        if (highMissing.length > 0) {
            const avoidSegments = highMissing.flatMap(m => m.affected_segments);
            return {
                decision: 'ADJUST',
                strategy: 'SAFE_ROUTE_ONLY',
                constraints: {
                    require_verified_route: true,
                    avoid_segments: avoidSegments.length > 0 ? avoidSegments : undefined,
                    safety_buffer_multiplier: 1.5,
                    max_risk_level: 'LOW',
                },
                missing_data: highMissing,
                suggestions: this.generateDataRecoverySuggestions(highMissing),
                explanation: this.generateAdjustmentExplanation(highMissing),
                warnings: highMissing.map(m => ({
                    type: m.type,
                    message: `${m.description}: ${m.impact}`,
                    reliability: 'LOW',
                })),
            };
        }
        if (mediumMissing.length > 0 || dataQuality.has_stale_data) {
            const warnings = [];
            mediumMissing.forEach(m => {
                warnings.push({
                    type: m.type,
                    message: `${m.description}: ${m.impact}`,
                    reliability: 'MEDIUM',
                });
            });
            dataQuality.stale_data_list.forEach(s => {
                warnings.push({
                    type: s.type,
                    message: `数据已过期（年龄: ${this.formatAge(s.age_seconds)}），使用估算值`,
                    reliability: s.reliability,
                });
            });
            return {
                decision: 'PROCEED_WITH_WARNING',
                missing_data: mediumMissing,
                suggestions: this.generateDataRecoverySuggestions(mediumMissing),
                warnings,
                explanation: '数据质量存在风险，但可以继续执行。建议验证关键数据。',
            };
        }
        return {
            decision: 'PROCEED_WITH_WARNING',
            explanation: '数据质量良好，可以正常执行',
        };
    }
    assessDEMSeverity(request) {
        const hasWalkingNodes = request.nodes.some(n => { var _a, _b; return n.type === 'poi' && ((_b = (_a = n.meta) === null || _a === void 0 ? void 0 : _a.tags) === null || _b === void 0 ? void 0 : _b.some(t => t.includes('hiking') || t.includes('trail'))); });
        if (hasWalkingNodes) {
            return 'CRITICAL';
        }
        const hasHardNodes = request.nodes.some(n => { var _a; return (_a = n.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node; });
        if (hasHardNodes) {
            return 'HIGH';
        }
        return 'MEDIUM';
    }
    getAffectedSegments(request, dataType) {
        switch (dataType) {
            case 'DEM':
                return request.nodes
                    .filter(n => n.type === 'poi')
                    .map(n => n.id.toString());
            case 'TRANSPORT':
                const segments = [];
                for (let i = 0; i < request.nodes.length - 1; i++) {
                    segments.push(`${request.nodes[i].id}-${request.nodes[i + 1].id}`);
                }
                return segments;
            case 'OPENING_HOURS':
                return request.nodes
                    .filter(n => n.type === 'poi' || n.type === 'restaurant')
                    .map(n => n.id.toString());
            default:
                return [];
        }
    }
    generateDataRecoverySuggestions(missingData) {
        const suggestions = [];
        const types = new Set(missingData.map(m => m.type));
        if (types.has('DEM')) {
            suggestions.push('建议：等待 DEM 数据更新或选择更安全的路线（避开高难度地形）');
        }
        if (types.has('TRANSPORT')) {
            suggestions.push('建议：使用备用交通数据源（如 Google Routes API）或选择步行路线');
        }
        if (types.has('OPENING_HOURS')) {
            suggestions.push('建议：联系 POI 确认开放时间或选择替代景点');
        }
        if (types.has('WEATHER')) {
            suggestions.push('建议：使用天气 API 获取最新数据或采用保守的天气假设');
        }
        if (types.has('POI')) {
            suggestions.push('建议：从 POI 数据库获取最新信息或使用已验证的 POI');
        }
        return suggestions;
    }
    generateRejectionExplanation(missingData) {
        const types = missingData.map(m => m.type).join('、');
        return `由于关键数据缺失（${types}），无法安全生成路线。${this.generateDataRecoverySuggestions(missingData).join(' ')}`;
    }
    generateAdjustmentExplanation(missingData) {
        const types = missingData.map(m => m.type).join('、');
        return `由于数据缺失（${types}），将采用保守策略：仅使用已验证的路线，避开高风险区域，增加安全缓冲。`;
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
};
exports.ConservativeStrategyService = ConservativeStrategyService;
exports.ConservativeStrategyService = ConservativeStrategyService = ConservativeStrategyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_expiry_policy_service_1.DataExpiryPolicyService])
], ConservativeStrategyService);
//# sourceMappingURL=conservative-strategy.service.js.map