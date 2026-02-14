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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextAnalyticsResponseDto = exports.TokenUsageTrendPoint = exports.GetContextAnalyticsQueryDto = exports.ContextMetricsResponseDto = exports.GetContextMetricsQueryDto = exports.ContextPackageDetailResponseDto = exports.ContextPackageListResponseDto = exports.ContextPackageListItemDto = exports.GetContextPackagesQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class GetContextPackagesQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
    }
}
exports.GetContextPackagesQueryDto = GetContextPackagesQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '页码', example: 1, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetContextPackagesQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每页数量（最大100）', example: 20, default: 20, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], GetContextPackagesQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Trip ID 筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContextPackagesQueryDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '规划阶段筛选', example: 'planning' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContextPackagesQueryDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Agent 筛选', example: 'PLANNER' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContextPackagesQueryDto.prototype, "agent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], GetContextPackagesQueryDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], GetContextPackagesQueryDto.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '搜索关键词（userQuery、tripId）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContextPackagesQueryDto.prototype, "search", void 0);
class ContextPackageListItemDto {
}
exports.ContextPackageListItemDto = ContextPackageListItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Package ID' }),
    __metadata("design:type", String)
], ContextPackageListItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Trip ID' }),
    __metadata("design:type", String)
], ContextPackageListItemDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '规划阶段' }),
    __metadata("design:type", String)
], ContextPackageListItemDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Agent' }),
    __metadata("design:type", String)
], ContextPackageListItemDto.prototype, "agent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户请求' }),
    __metadata("design:type", String)
], ContextPackageListItemDto.prototype, "userQuery", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Blocks 数量' }),
    __metadata("design:type", Number)
], ContextPackageListItemDto.prototype, "blocksCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total Tokens' }),
    __metadata("design:type", Number)
], ContextPackageListItemDto.prototype, "totalTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Token 预算' }),
    __metadata("design:type", Number)
], ContextPackageListItemDto.prototype, "tokenBudget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已压缩' }),
    __metadata("design:type", Boolean)
], ContextPackageListItemDto.prototype, "compressed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", String)
], ContextPackageListItemDto.prototype, "createdAt", void 0);
class ContextPackageListResponseDto {
}
exports.ContextPackageListResponseDto = ContextPackageListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Context Package 列表', type: [ContextPackageListItemDto] }),
    __metadata("design:type", Array)
], ContextPackageListResponseDto.prototype, "packages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总数' }),
    __metadata("design:type", Number)
], ContextPackageListResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '页码' }),
    __metadata("design:type", Number)
], ContextPackageListResponseDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '每页数量' }),
    __metadata("design:type", Number)
], ContextPackageListResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总页数' }),
    __metadata("design:type", Number)
], ContextPackageListResponseDto.prototype, "totalPages", void 0);
class ContextPackageDetailResponseDto {
}
exports.ContextPackageDetailResponseDto = ContextPackageDetailResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Context Package' }),
    __metadata("design:type", Object)
], ContextPackageDetailResponseDto.prototype, "package", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '关联的指标记录' }),
    __metadata("design:type", Object)
], ContextPackageDetailResponseDto.prototype, "metrics", void 0);
class GetContextMetricsQueryDto {
}
exports.GetContextMetricsQueryDto = GetContextMetricsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Trip ID 筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContextMetricsQueryDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '规划阶段筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContextMetricsQueryDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Agent 筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContextMetricsQueryDto.prototype, "agent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], GetContextMetricsQueryDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], GetContextMetricsQueryDto.prototype, "endTime", void 0);
class ContextMetricsResponseDto {
}
exports.ContextMetricsResponseDto = ContextMetricsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '指标摘要' }),
    __metadata("design:type", Object)
], ContextMetricsResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '按 Agent 分类统计' }),
    __metadata("design:type", Object)
], ContextMetricsResponseDto.prototype, "byAgent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '按 Phase 分类统计' }),
    __metadata("design:type", Object)
], ContextMetricsResponseDto.prototype, "byPhase", void 0);
class GetContextAnalyticsQueryDto {
    constructor() {
        this.granularity = 'day';
    }
}
exports.GetContextAnalyticsQueryDto = GetContextAnalyticsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间（ISO 8601）', example: '2025-01-01T00:00:00Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], GetContextAnalyticsQueryDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间（ISO 8601）', example: '2025-01-31T23:59:59Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], GetContextAnalyticsQueryDto.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时间粒度', enum: ['hour', 'day', 'week', 'month'], default: 'day' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContextAnalyticsQueryDto.prototype, "granularity", void 0);
class TokenUsageTrendPoint {
}
exports.TokenUsageTrendPoint = TokenUsageTrendPoint;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '时间点' }),
    __metadata("design:type", String)
], TokenUsageTrendPoint.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '平均 Token 使用' }),
    __metadata("design:type", Number)
], TokenUsageTrendPoint.prototype, "avgTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最大 Token 使用' }),
    __metadata("design:type", Number)
], TokenUsageTrendPoint.prototype, "maxTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最小 Token 使用' }),
    __metadata("design:type", Number)
], TokenUsageTrendPoint.prototype, "minTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '请求数量' }),
    __metadata("design:type", Number)
], TokenUsageTrendPoint.prototype, "count", void 0);
class ContextAnalyticsResponseDto {
}
exports.ContextAnalyticsResponseDto = ContextAnalyticsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Token 使用趋势', type: [TokenUsageTrendPoint] }),
    __metadata("design:type", Array)
], ContextAnalyticsResponseDto.prototype, "tokenUsageTrend", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '缓存命中率趋势', type: [Object] }),
    __metadata("design:type", Array)
], ContextAnalyticsResponseDto.prototype, "cacheHitRateTrend", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '压缩率分析' }),
    __metadata("design:type", Object)
], ContextAnalyticsResponseDto.prototype, "compressionAnalysis", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '质量分布分析' }),
    __metadata("design:type", Object)
], ContextAnalyticsResponseDto.prototype, "qualityAnalysis", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Top Block Types' }),
    __metadata("design:type", Array)
], ContextAnalyticsResponseDto.prototype, "topBlockTypes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '性能瓶颈分析' }),
    __metadata("design:type", Array)
], ContextAnalyticsResponseDto.prototype, "performanceBottlenecks", void 0);
//# sourceMappingURL=admin-context.dto.js.map