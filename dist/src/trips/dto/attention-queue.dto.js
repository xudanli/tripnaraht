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
exports.GetAttentionQueueQueryDto = exports.AttentionQueueResponseDto = exports.AttentionItemDto = exports.AttentionStatus = exports.AttentionSeverity = exports.AttentionItemType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var AttentionItemType;
(function (AttentionItemType) {
    AttentionItemType["SCHEDULE_CONFLICT"] = "schedule_conflict";
    AttentionItemType["ROAD_CLOSED"] = "road_closed";
    AttentionItemType["WEATHER_RISK"] = "weather_risk";
    AttentionItemType["BUDGET_ALERT"] = "budget_alert";
    AttentionItemType["SAFETY_RISK"] = "safety_risk";
    AttentionItemType["BOOKING_ISSUE"] = "booking_issue";
    AttentionItemType["OTHER"] = "other";
})(AttentionItemType || (exports.AttentionItemType = AttentionItemType = {}));
var AttentionSeverity;
(function (AttentionSeverity) {
    AttentionSeverity["CRITICAL"] = "critical";
    AttentionSeverity["HIGH"] = "high";
    AttentionSeverity["MEDIUM"] = "medium";
    AttentionSeverity["LOW"] = "low";
})(AttentionSeverity || (exports.AttentionSeverity = AttentionSeverity = {}));
var AttentionStatus;
(function (AttentionStatus) {
    AttentionStatus["NEW"] = "new";
    AttentionStatus["ACKNOWLEDGED"] = "acknowledged";
    AttentionStatus["RESOLVED"] = "resolved";
})(AttentionStatus || (exports.AttentionStatus = AttentionStatus = {}));
class AttentionItemDto {
}
exports.AttentionItemDto = AttentionItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '关注项ID', example: 'att-1' }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '类型', enum: AttentionItemType, example: AttentionItemType.SCHEDULE_CONFLICT }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题', example: '时间窗冲突' }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '详细描述', example: 'Day 1 下午行程过于紧凑，缺少缓冲时间' }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '关联的行程ID', example: 'trip-123' }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '严重程度', enum: AttentionSeverity, example: AttentionSeverity.HIGH }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间（ISO 8601 格式）', example: '2024-01-15T10:30:00Z' }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '更新时间', example: '2024-01-15T10:30:00Z' }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '状态', enum: AttentionStatus, example: AttentionStatus.NEW }),
    __metadata("design:type", String)
], AttentionItemDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '额外元数据', type: Object, additionalProperties: true }),
    __metadata("design:type", Object)
], AttentionItemDto.prototype, "metadata", void 0);
class AttentionQueueResponseDto {
}
exports.AttentionQueueResponseDto = AttentionQueueResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '关注项列表', type: [AttentionItemDto] }),
    __metadata("design:type", Array)
], AttentionQueueResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总数量', example: 3 }),
    __metadata("design:type", Number)
], AttentionQueueResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '返回数量限制', example: 20 }),
    __metadata("design:type", Number)
], AttentionQueueResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '偏移量', example: 0 }),
    __metadata("design:type", Number)
], AttentionQueueResponseDto.prototype, "offset", void 0);
class GetAttentionQueueQueryDto {
}
exports.GetAttentionQueueQueryDto = GetAttentionQueueQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '返回数量限制', example: 20, minimum: 1, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetAttentionQueueQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '偏移量', example: 0, minimum: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], GetAttentionQueueQueryDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '筛选严重程度', enum: AttentionSeverity, example: AttentionSeverity.HIGH }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(AttentionSeverity),
    __metadata("design:type", String)
], GetAttentionQueueQueryDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '筛选类型', enum: AttentionItemType, example: AttentionItemType.SCHEDULE_CONFLICT }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(AttentionItemType),
    __metadata("design:type", String)
], GetAttentionQueueQueryDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '筛选特定行程ID', example: 'trip-123' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetAttentionQueueQueryDto.prototype, "tripId", void 0);
//# sourceMappingURL=attention-queue.dto.js.map