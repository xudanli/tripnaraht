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
exports.TripInsightResponseDto = exports.ReadinessSummaryDto = exports.FindingDto = exports.TripSummaryDto = exports.OverallStatus = exports.ReadinessStatus = exports.FindingType = void 0;
const swagger_1 = require("@nestjs/swagger");
var FindingType;
(function (FindingType) {
    FindingType["WARNING"] = "warning";
    FindingType["SUGGESTION"] = "suggestion";
    FindingType["POSITIVE"] = "positive";
})(FindingType || (exports.FindingType = FindingType = {}));
var ReadinessStatus;
(function (ReadinessStatus) {
    ReadinessStatus["PASS"] = "pass";
    ReadinessStatus["WARN"] = "warn";
    ReadinessStatus["BLOCK"] = "block";
})(ReadinessStatus || (exports.ReadinessStatus = ReadinessStatus = {}));
var OverallStatus;
(function (OverallStatus) {
    OverallStatus["GOOD"] = "good";
    OverallStatus["NEEDS_ATTENTION"] = "needs_attention";
    OverallStatus["HAS_ISSUES"] = "has_issues";
})(OverallStatus || (exports.OverallStatus = OverallStatus = {}));
class TripSummaryDto {
}
exports.TripSummaryDto = TripSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地', example: '中国' }),
    __metadata("design:type", String)
], TripSummaryDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程天数', example: 7 }),
    __metadata("design:type", Number)
], TripSummaryDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '景点数量', example: 12 }),
    __metadata("design:type", Number)
], TripSummaryDto.prototype, "placesCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始日期', example: '2025-02-01' }),
    __metadata("design:type", String)
], TripSummaryDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束日期', example: '2025-02-07' }),
    __metadata("design:type", String)
], TripSummaryDto.prototype, "endDate", void 0);
class FindingDto {
}
exports.FindingDto = FindingDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '发现类型',
        enum: FindingType,
        example: 'warning'
    }),
    __metadata("design:type", String)
], FindingDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '前端图标提示',
        example: 'clock'
    }),
    __metadata("design:type", String)
], FindingDto.prototype, "icon", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '标题',
        example: 'Day 2 安排较紧凑'
    }),
    __metadata("design:type", String)
], FindingDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '详细消息',
        example: '第二天安排了 6 个景点，可能需要更多休息时间'
    }),
    __metadata("design:type", String)
], FindingDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '快捷按钮文案（为空时不显示按钮）',
        example: '优化 Day 2'
    }),
    __metadata("design:type", String)
], FindingDto.prototype, "actionLabel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '快捷按钮对应的 AI 提示词（为空时不显示按钮）',
        example: '帮我优化第二天的行程，适当减少景点或调整顺序'
    }),
    __metadata("design:type", String)
], FindingDto.prototype, "actionPrompt", void 0);
class ReadinessSummaryDto {
}
exports.ReadinessSummaryDto = ReadinessSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '准备度状态',
        enum: ReadinessStatus,
        example: 'warn'
    }),
    __metadata("design:type", String)
], ReadinessSummaryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '阻塞项数量', example: 0 }),
    __metadata("design:type", Number)
], ReadinessSummaryDto.prototype, "blockers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '必须项数量', example: 2 }),
    __metadata("design:type", Number)
], ReadinessSummaryDto.prototype, "must", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议项数量', example: 5 }),
    __metadata("design:type", Number)
], ReadinessSummaryDto.prototype, "should", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '警告项数量（已废弃，使用must）', example: 2, deprecated: true }),
    __metadata("design:type", Number)
], ReadinessSummaryDto.prototype, "warnings", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '建议项数量（已废弃，使用should）', example: 5, deprecated: true }),
    __metadata("design:type", Number)
], ReadinessSummaryDto.prototype, "suggestions", void 0);
class TripInsightResponseDto {
}
exports.TripInsightResponseDto = TripInsightResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '行程基本信息',
        type: TripSummaryDto
    }),
    __metadata("design:type", TripSummaryDto)
], TripInsightResponseDto.prototype, "tripSummary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'AI 发现的问题/建议（最多 3-5 条）',
        type: [FindingDto]
    }),
    __metadata("design:type", Array)
], TripInsightResponseDto.prototype, "findings", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '准备度摘要',
        type: ReadinessSummaryDto
    }),
    __metadata("design:type", ReadinessSummaryDto)
], TripInsightResponseDto.prototype, "readiness", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '整体状态',
        enum: OverallStatus,
        example: 'needs_attention'
    }),
    __metadata("design:type", String)
], TripInsightResponseDto.prototype, "overallStatus", void 0);
//# sourceMappingURL=trip-insight.dto.js.map