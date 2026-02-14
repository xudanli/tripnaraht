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
exports.BatchUpdateEvidenceResponseDto = exports.BatchUpdateEvidenceRequestDto = exports.BatchUpdateEvidenceItemDto = exports.UpdateEvidenceResponseDto = exports.UpdateEvidenceRequestDto = exports.GetEvidenceQueryDto = exports.EvidenceSortBy = exports.EvidenceGroupBy = exports.EvidencePriorityFilter = exports.EvidenceListResponseDto = exports.EvidenceItemDto = exports.EvidenceQualityScoreDto = exports.EvidenceQualityComponentsDto = exports.EvidenceConfidenceDto = exports.EvidenceFreshnessDto = exports.EvidenceQualityLevel = exports.EvidenceConfidenceLevel = exports.EvidenceFreshnessStatus = exports.EvidenceStatus = exports.EvidenceSeverity = exports.EvidenceType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var EvidenceType;
(function (EvidenceType) {
    EvidenceType["OPENING_HOURS"] = "opening_hours";
    EvidenceType["ROAD_CLOSURE"] = "road_closure";
    EvidenceType["WEATHER"] = "weather";
    EvidenceType["BOOKING"] = "booking";
    EvidenceType["OTHER"] = "other";
})(EvidenceType || (exports.EvidenceType = EvidenceType = {}));
var EvidenceSeverity;
(function (EvidenceSeverity) {
    EvidenceSeverity["LOW"] = "low";
    EvidenceSeverity["MEDIUM"] = "medium";
    EvidenceSeverity["HIGH"] = "high";
})(EvidenceSeverity || (exports.EvidenceSeverity = EvidenceSeverity = {}));
var EvidenceStatus;
(function (EvidenceStatus) {
    EvidenceStatus["NEW"] = "new";
    EvidenceStatus["ACKNOWLEDGED"] = "acknowledged";
    EvidenceStatus["RESOLVED"] = "resolved";
    EvidenceStatus["DISMISSED"] = "dismissed";
})(EvidenceStatus || (exports.EvidenceStatus = EvidenceStatus = {}));
var EvidenceFreshnessStatus;
(function (EvidenceFreshnessStatus) {
    EvidenceFreshnessStatus["FRESH"] = "FRESH";
    EvidenceFreshnessStatus["STALE"] = "STALE";
    EvidenceFreshnessStatus["EXPIRED"] = "EXPIRED";
})(EvidenceFreshnessStatus || (exports.EvidenceFreshnessStatus = EvidenceFreshnessStatus = {}));
var EvidenceConfidenceLevel;
(function (EvidenceConfidenceLevel) {
    EvidenceConfidenceLevel["HIGH"] = "HIGH";
    EvidenceConfidenceLevel["MEDIUM"] = "MEDIUM";
    EvidenceConfidenceLevel["LOW"] = "LOW";
})(EvidenceConfidenceLevel || (exports.EvidenceConfidenceLevel = EvidenceConfidenceLevel = {}));
var EvidenceQualityLevel;
(function (EvidenceQualityLevel) {
    EvidenceQualityLevel["HIGH"] = "HIGH";
    EvidenceQualityLevel["MEDIUM"] = "MEDIUM";
    EvidenceQualityLevel["LOW"] = "LOW";
})(EvidenceQualityLevel || (exports.EvidenceQualityLevel = EvidenceQualityLevel = {}));
class EvidenceFreshnessDto {
}
exports.EvidenceFreshnessDto = EvidenceFreshnessDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '获取时间（ISO 8601 格式）', example: '2026-01-29T10:30:00Z' }),
    __metadata("design:type", String)
], EvidenceFreshnessDto.prototype, "fetchedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '过期时间（ISO 8601 格式）', example: '2026-01-29T11:00:00Z' }),
    __metadata("design:type", String)
], EvidenceFreshnessDto.prototype, "expiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '时效性状态',
        enum: EvidenceFreshnessStatus,
        example: EvidenceFreshnessStatus.FRESH
    }),
    __metadata("design:type", String)
], EvidenceFreshnessDto.prototype, "freshnessStatus", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '建议刷新时间（ISO 8601 格式）',
        example: '2026-01-29T11:00:00Z'
    }),
    __metadata("design:type", String)
], EvidenceFreshnessDto.prototype, "recommendedRefreshAt", void 0);
class EvidenceConfidenceDto {
}
exports.EvidenceConfidenceDto = EvidenceConfidenceDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '置信度分数（0-1）',
        example: 0.85,
        minimum: 0,
        maximum: 1
    }),
    __metadata("design:type", Number)
], EvidenceConfidenceDto.prototype, "score", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '置信度等级',
        enum: EvidenceConfidenceLevel,
        example: EvidenceConfidenceLevel.HIGH
    }),
    __metadata("design:type", String)
], EvidenceConfidenceDto.prototype, "level", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '影响置信度的因素',
        type: [String],
        example: ['数据来源可靠', '数据新鲜', '多源验证']
    }),
    __metadata("design:type", Array)
], EvidenceConfidenceDto.prototype, "factors", void 0);
class EvidenceQualityComponentsDto {
}
exports.EvidenceQualityComponentsDto = EvidenceQualityComponentsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '数据源可靠性（0-1）',
        example: 0.9,
        minimum: 0,
        maximum: 1
    }),
    __metadata("design:type", Number)
], EvidenceQualityComponentsDto.prototype, "sourceReliability", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '时效性（0-1）',
        example: 0.8,
        minimum: 0,
        maximum: 1
    }),
    __metadata("design:type", Number)
], EvidenceQualityComponentsDto.prototype, "timeliness", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '完整性（0-1）',
        example: 0.9,
        minimum: 0,
        maximum: 1
    }),
    __metadata("design:type", Number)
], EvidenceQualityComponentsDto.prototype, "completeness", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '多源验证（0-1）',
        example: 0.7,
        minimum: 0,
        maximum: 1
    }),
    __metadata("design:type", Number)
], EvidenceQualityComponentsDto.prototype, "multiSourceVerification", void 0);
class EvidenceQualityScoreDto {
}
exports.EvidenceQualityScoreDto = EvidenceQualityScoreDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '综合质量评分（0-1）',
        example: 0.85,
        minimum: 0,
        maximum: 1
    }),
    __metadata("design:type", Number)
], EvidenceQualityScoreDto.prototype, "overallScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '质量评分组件',
        type: EvidenceQualityComponentsDto
    }),
    __metadata("design:type", EvidenceQualityComponentsDto)
], EvidenceQualityScoreDto.prototype, "components", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '质量等级',
        enum: EvidenceQualityLevel,
        example: EvidenceQualityLevel.HIGH
    }),
    __metadata("design:type", String)
], EvidenceQualityScoreDto.prototype, "level", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '质量说明',
        example: '高质量：数据来源可靠、数据新鲜、多源验证，综合评分 85/100'
    }),
    __metadata("design:type", String)
], EvidenceQualityScoreDto.prototype, "explanation", void 0);
class EvidenceItemDto {
}
exports.EvidenceItemDto = EvidenceItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据项ID', example: 'ev-1' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据类型', enum: EvidenceType, example: EvidenceType.OPENING_HOURS }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据标题', example: '营业时间' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据描述', example: '景点 A 营业时间：09:00-18:00' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '数据来源', example: 'Google Places API' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '相关链接', example: 'https://maps.google.com/place/...' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "link", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '时间戳（ISO 8601 格式）', example: '2024-01-15T10:30:00Z' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '关联的POI ID', example: 'poi-123' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "poiId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '关联的行程天数（1-based）', example: 1 }),
    __metadata("design:type", Number)
], EvidenceItemDto.prototype, "day", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '严重程度', enum: EvidenceSeverity, example: EvidenceSeverity.LOW }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '额外元数据', type: Object, additionalProperties: true }),
    __metadata("design:type", Object)
], EvidenceItemDto.prototype, "metadata", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '证据状态', enum: () => EvidenceStatus, example: 'new' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户备注', example: '已确认营业时间' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "userNote", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '确认时间（ISO 8601 格式）', example: '2026-01-29T12:00:00Z' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "acknowledgedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '解决时间（ISO 8601 格式）', example: '2026-01-29T12:00:00Z' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "resolvedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '忽略时间（ISO 8601 格式）', example: '2026-01-29T12:00:00Z' }),
    __metadata("design:type", String)
], EvidenceItemDto.prototype, "dismissedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '证据时效性信息',
        type: EvidenceFreshnessDto
    }),
    __metadata("design:type", EvidenceFreshnessDto)
], EvidenceItemDto.prototype, "freshness", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '证据置信度信息',
        type: EvidenceConfidenceDto
    }),
    __metadata("design:type", EvidenceConfidenceDto)
], EvidenceItemDto.prototype, "confidence", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '证据质量评分信息',
        type: EvidenceQualityScoreDto
    }),
    __metadata("design:type", EvidenceQualityScoreDto)
], EvidenceItemDto.prototype, "qualityScore", void 0);
class EvidenceListResponseDto {
}
exports.EvidenceListResponseDto = EvidenceListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据项列表', type: [EvidenceItemDto] }),
    __metadata("design:type", Array)
], EvidenceListResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总数量', example: 3 }),
    __metadata("design:type", Number)
], EvidenceListResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '返回数量限制', example: 50 }),
    __metadata("design:type", Number)
], EvidenceListResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '偏移量', example: 0 }),
    __metadata("design:type", Number)
], EvidenceListResponseDto.prototype, "offset", void 0);
var EvidencePriorityFilter;
(function (EvidencePriorityFilter) {
    EvidencePriorityFilter["ALL"] = "all";
    EvidencePriorityFilter["HIGH"] = "high";
    EvidencePriorityFilter["MEDIUM_AND_HIGH"] = "medium_and_high";
})(EvidencePriorityFilter || (exports.EvidencePriorityFilter = EvidencePriorityFilter = {}));
var EvidenceGroupBy;
(function (EvidenceGroupBy) {
    EvidenceGroupBy["NONE"] = "none";
    EvidenceGroupBy["IMPORTANCE"] = "importance";
    EvidenceGroupBy["TYPE"] = "type";
    EvidenceGroupBy["DAY"] = "day";
})(EvidenceGroupBy || (exports.EvidenceGroupBy = EvidenceGroupBy = {}));
var EvidenceSortBy;
(function (EvidenceSortBy) {
    EvidenceSortBy["TIME"] = "time";
    EvidenceSortBy["IMPORTANCE"] = "importance";
    EvidenceSortBy["RELEVANCE"] = "relevance";
    EvidenceSortBy["FRESHNESS"] = "freshness";
    EvidenceSortBy["QUALITY"] = "quality";
})(EvidenceSortBy || (exports.EvidenceSortBy = EvidenceSortBy = {}));
class GetEvidenceQueryDto {
}
exports.GetEvidenceQueryDto = GetEvidenceQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '返回数量限制', example: 50, minimum: 1, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetEvidenceQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '偏移量', example: 0, minimum: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], GetEvidenceQueryDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '筛选特定天数的证据', example: 1, minimum: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetEvidenceQueryDto.prototype, "day", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '筛选特定类型的证据', enum: EvidenceType, example: EvidenceType.OPENING_HOURS }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(EvidenceType),
    __metadata("design:type", String)
], GetEvidenceQueryDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '优先级过滤（P1功能）',
        enum: EvidencePriorityFilter,
        example: EvidencePriorityFilter.HIGH,
        default: EvidencePriorityFilter.ALL
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(EvidencePriorityFilter),
    __metadata("design:type", String)
], GetEvidenceQueryDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '分组方式（P1功能）',
        enum: EvidenceGroupBy,
        example: EvidenceGroupBy.IMPORTANCE,
        default: EvidenceGroupBy.NONE
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(EvidenceGroupBy),
    __metadata("design:type", String)
], GetEvidenceQueryDto.prototype, "groupBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '排序方式（P1功能）',
        enum: EvidenceSortBy,
        example: EvidenceSortBy.IMPORTANCE,
        default: EvidenceSortBy.TIME
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(EvidenceSortBy),
    __metadata("design:type", String)
], GetEvidenceQueryDto.prototype, "sortBy", void 0);
class UpdateEvidenceRequestDto {
}
exports.UpdateEvidenceRequestDto = UpdateEvidenceRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '证据状态',
        enum: EvidenceStatus,
        example: EvidenceStatus.ACKNOWLEDGED
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(EvidenceStatus),
    __metadata("design:type", String)
], UpdateEvidenceRequestDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户备注',
        example: '已确认营业时间，已准备备选方案',
        maxLength: 500
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500, { message: '用户备注不能超过500字符' }),
    __metadata("design:type", String)
], UpdateEvidenceRequestDto.prototype, "userNote", void 0);
class UpdateEvidenceResponseDto {
}
exports.UpdateEvidenceResponseDto = UpdateEvidenceResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据项ID', example: 'ev-place-123-opening-hours' }),
    __metadata("design:type", String)
], UpdateEvidenceResponseDto.prototype, "evidenceId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新后的状态', enum: EvidenceStatus }),
    __metadata("design:type", String)
], UpdateEvidenceResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间（ISO 8601 格式）', example: '2026-01-29T12:00:00Z' }),
    __metadata("design:type", String)
], UpdateEvidenceResponseDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户备注' }),
    __metadata("design:type", String)
], UpdateEvidenceResponseDto.prototype, "userNote", void 0);
class BatchUpdateEvidenceItemDto {
}
exports.BatchUpdateEvidenceItemDto = BatchUpdateEvidenceItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '证据项ID', example: 'ev-place-123-opening-hours' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchUpdateEvidenceItemDto.prototype, "evidenceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '证据状态',
        enum: EvidenceStatus,
        example: EvidenceStatus.ACKNOWLEDGED
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(EvidenceStatus),
    __metadata("design:type", String)
], BatchUpdateEvidenceItemDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户备注',
        example: '已确认',
        maxLength: 500
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500, { message: '用户备注不能超过500字符' }),
    __metadata("design:type", String)
], BatchUpdateEvidenceItemDto.prototype, "userNote", void 0);
class BatchUpdateEvidenceRequestDto {
}
exports.BatchUpdateEvidenceRequestDto = BatchUpdateEvidenceRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '要更新的证据项列表',
        type: [BatchUpdateEvidenceItemDto],
        maxItems: 100
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BatchUpdateEvidenceItemDto),
    (0, class_validator_1.ArrayMaxSize)(100, { message: '批量更新最多支持100个证据项' }),
    __metadata("design:type", Array)
], BatchUpdateEvidenceRequestDto.prototype, "updates", void 0);
class BatchUpdateEvidenceResponseDto {
}
exports.BatchUpdateEvidenceResponseDto = BatchUpdateEvidenceResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '成功更新的数量', example: 5 }),
    __metadata("design:type", Number)
], BatchUpdateEvidenceResponseDto.prototype, "updated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '失败的数量', example: 0 }),
    __metadata("design:type", Number)
], BatchUpdateEvidenceResponseDto.prototype, "failed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '失败详情',
        type: [Object]
    }),
    __metadata("design:type", Array)
], BatchUpdateEvidenceResponseDto.prototype, "errors", void 0);
//# sourceMappingURL=evidence.dto.js.map