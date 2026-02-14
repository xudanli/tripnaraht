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
exports.GetMetricsResponseDto = exports.GetMetricsQueryDto = exports.WriteBackDto = exports.ProjectStateResponseDto = exports.ProjectStateDto = exports.CompressContextResponseDto = exports.CompressContextDto = exports.BuildContextPackageResponseDto = exports.BuildContextPackageDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class BuildContextPackageDto {
}
exports.BuildContextPackageDto = BuildContextPackageDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Trip ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BuildContextPackageDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '规划阶段', example: 'planning' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BuildContextPackageDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前 Agent', example: 'PLANNER' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BuildContextPackageDto.prototype, "agent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户请求', example: '帮我规划冰岛7天行程' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BuildContextPackageDto.prototype, "userQuery", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Token 预算（默认 3600）', default: 3600 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_validator_1.Max)(100000),
    __metadata("design:type", Number)
], BuildContextPackageDto.prototype, "tokenBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否包含私有块（默认 false）', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BuildContextPackageDto.prototype, "includePrivate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '需要包含的主题块', type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BuildContextPackageDto.prototype, "requiredTopics", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '需要排除的主题块', type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BuildContextPackageDto.prototype, "excludeTopics", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否使用缓存（默认 true）', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BuildContextPackageDto.prototype, "useCache", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否包含 API 文档（默认 false）', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BuildContextPackageDto.prototype, "includeApiDocs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'API 文档类别',
        type: [String],
        enum: ['ROLL', 'ADMIN', 'CONTEXT', 'TRAINING', 'AGENT', 'TRIPS', 'DECISION', 'ALL'],
        example: ['CONTEXT', 'AGENT'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BuildContextPackageDto.prototype, "apiDocCategories", void 0);
class BuildContextPackageResponseDto {
}
exports.BuildContextPackageResponseDto = BuildContextPackageResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Context Package' }),
    __metadata("design:type", Object)
], BuildContextPackageResponseDto.prototype, "contextPackage", void 0);
class CompressContextDto {
}
exports.CompressContextDto = CompressContextDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '需要压缩的块列表', type: [Object] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], CompressContextDto.prototype, "blocks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Token 预算' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_validator_1.Max)(100000),
    __metadata("design:type", Number)
], CompressContextDto.prototype, "tokenBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '压缩策略',
        enum: ['aggressive', 'conservative', 'balanced'],
        default: 'balanced'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CompressContextDto.prototype, "strategy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '需要保留的关键块 key', type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CompressContextDto.prototype, "preserveKeys", void 0);
class CompressContextResponseDto {
}
exports.CompressContextResponseDto = CompressContextResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '压缩后的块列表', type: [Object] }),
    __metadata("design:type", Array)
], CompressContextResponseDto.prototype, "compressedBlocks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '压缩统计' }),
    __metadata("design:type", Object)
], CompressContextResponseDto.prototype, "stats", void 0);
class ProjectStateDto {
}
exports.ProjectStateDto = ProjectStateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trip State 或 LangGraph State', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ProjectStateDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否包含完整状态（默认 false）', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ProjectStateDto.prototype, "includeFullState", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '决策日志保留数量（默认 5）', default: 5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], ProjectStateDto.prototype, "decisionLogLimit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '拒绝日志保留数量（默认 3）', default: 3 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], ProjectStateDto.prototype, "rejectionLogLimit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Token 预算（用于自动裁剪）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(100),
    (0, class_validator_1.Max)(100000),
    __metadata("design:type", Number)
], ProjectStateDto.prototype, "tokenBudget", void 0);
class ProjectStateResponseDto {
}
exports.ProjectStateResponseDto = ProjectStateResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态投影结果' }),
    __metadata("design:type", Object)
], ProjectStateResponseDto.prototype, "projection", void 0);
class WriteBackDto {
}
exports.WriteBackDto = WriteBackDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trip Run ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WriteBackDto.prototype, "tripRunId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '尝试次数' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], WriteBackDto.prototype, "attemptNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Scratchpad 内容' }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], WriteBackDto.prototype, "scratchpad", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '决策日志增量', type: [Object] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], WriteBackDto.prototype, "decisionLogDelta", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Artifacts 引用', type: Object }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], WriteBackDto.prototype, "artifactsRefs", void 0);
class GetMetricsQueryDto {
}
exports.GetMetricsQueryDto = GetMetricsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Trip ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetMetricsQueryDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '规划阶段' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetMetricsQueryDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Agent' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetMetricsQueryDto.prototype, "agent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetMetricsQueryDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间（ISO 8601）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetMetricsQueryDto.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '返回最近 N 条记录（用于 getRecent）', default: 10 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], GetMetricsQueryDto.prototype, "limit", void 0);
class GetMetricsResponseDto {
}
exports.GetMetricsResponseDto = GetMetricsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '指标摘要' }),
    __metadata("design:type", Object)
], GetMetricsResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最近的指标记录（如果请求了 limit）', type: [Object] }),
    __metadata("design:type", Array)
], GetMetricsResponseDto.prototype, "recent", void 0);
//# sourceMappingURL=context.dto.js.map