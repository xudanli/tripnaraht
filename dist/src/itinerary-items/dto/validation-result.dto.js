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
exports.BatchValidationResultDto = exports.BatchValidationItemDto = exports.CascadeImpactDto = exports.CascadeImpactItemDto = exports.TimeRangeDto = exports.AggregatedValidationResultDto = exports.TravelInfoDto = exports.ValidationResultDto = exports.ValidationSuggestionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const validation_interface_1 = require("../interfaces/validation.interface");
class ValidationSuggestionDto {
}
exports.ValidationSuggestionDto = ValidationSuggestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议动作', example: 'ADJUST_TIME' }),
    __metadata("design:type", String)
], ValidationSuggestionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述', example: '将开始时间调整为 14:15' }),
    __metadata("design:type", String)
], ValidationSuggestionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '建议的新值',
        example: { startTime: '2025-12-05T14:15:00Z', endTime: '2025-12-05T16:15:00Z' }
    }),
    __metadata("design:type", Object)
], ValidationSuggestionDto.prototype, "suggestedValue", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预计改善效果', example: '消除时间重叠' }),
    __metadata("design:type", String)
], ValidationSuggestionDto.prototype, "estimatedImprovement", void 0);
class ValidationResultDto {
}
exports.ValidationResultDto = ValidationResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否通过', example: false }),
    __metadata("design:type", Boolean)
], ValidationResultDto.prototype, "valid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '严重程度',
        enum: validation_interface_1.ValidationSeverity,
        example: 'error'
    }),
    __metadata("design:type", String)
], ValidationResultDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '校验代码',
        enum: validation_interface_1.ValidationCode,
        example: 'TIME_OVERLAP'
    }),
    __metadata("design:type", String)
], ValidationResultDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息', example: '时间冲突：与「蓝湖温泉」存在重叠' }),
    __metadata("design:type", String)
], ValidationResultDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '详细信息' }),
    __metadata("design:type", Object)
], ValidationResultDto.prototype, "details", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [ValidationSuggestionDto], description: '建议列表' }),
    __metadata("design:type", Array)
], ValidationResultDto.prototype, "suggestions", void 0);
class TravelInfoDto {
}
exports.TravelInfoDto = TravelInfoDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '起点地点名称', example: '蓝湖温泉' }),
    __metadata("design:type", String)
], TravelInfoDto.prototype, "fromPlace", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '终点地点名称', example: '雷克雅未克市区' }),
    __metadata("design:type", String)
], TravelInfoDto.prototype, "toPlace", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '直线距离（km）', example: 42.5 }),
    __metadata("design:type", Number)
], TravelInfoDto.prototype, "straightDistance", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '道路距离（km）', example: 48.2 }),
    __metadata("design:type", Number)
], TravelInfoDto.prototype, "roadDistance", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预计时长（分钟）', example: 45 }),
    __metadata("design:type", Number)
], TravelInfoDto.prototype, "estimatedDuration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '推荐交通方式', example: 'DRIVING' }),
    __metadata("design:type", String)
], TravelInfoDto.prototype, "recommendedTransport", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '可用时间（分钟）', example: 20 }),
    __metadata("design:type", Number)
], TravelInfoDto.prototype, "availableTime", void 0);
class AggregatedValidationResultDto {
}
exports.AggregatedValidationResultDto = AggregatedValidationResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否可以继续（无 ERROR）', example: true }),
    __metadata("design:type", Boolean)
], AggregatedValidationResultDto.prototype, "canProceed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否需要确认（有 WARNING）', example: true }),
    __metadata("design:type", Boolean)
], AggregatedValidationResultDto.prototype, "requiresConfirmation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ValidationResultDto], description: 'ERROR 级别结果' }),
    __metadata("design:type", Array)
], AggregatedValidationResultDto.prototype, "errors", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ValidationResultDto], description: 'WARNING 级别结果' }),
    __metadata("design:type", Array)
], AggregatedValidationResultDto.prototype, "warnings", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ValidationResultDto], description: 'INFO 级别结果' }),
    __metadata("design:type", Array)
], AggregatedValidationResultDto.prototype, "infos", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: TravelInfoDto, description: '交通信息' }),
    __metadata("design:type", TravelInfoDto)
], AggregatedValidationResultDto.prototype, "travelInfo", void 0);
class TimeRangeDto {
}
exports.TimeRangeDto = TimeRangeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始时间', example: '09:00' }),
    __metadata("design:type", String)
], TimeRangeDto.prototype, "start", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束时间', example: '11:00' }),
    __metadata("design:type", String)
], TimeRangeDto.prototype, "end", void 0);
class CascadeImpactItemDto {
}
exports.CascadeImpactItemDto = CascadeImpactItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程项 ID' }),
    __metadata("design:type", String)
], CascadeImpactItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '活动名称', example: '午餐' }),
    __metadata("design:type", String)
], CascadeImpactItemDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '原时间（兼容格式）', example: '12:00-13:00' }),
    __metadata("design:type", String)
], CascadeImpactItemDto.prototype, "originalTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议时间（兼容格式）', example: '12:30-13:30' }),
    __metadata("design:type", String)
], CascadeImpactItemDto.prototype, "suggestedTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '延迟分钟数', example: 30 }),
    __metadata("design:type", Number)
], CascadeImpactItemDto.prototype, "delayMinutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: TimeRangeDto, description: '原时间（结构化）' }),
    __metadata("design:type", TimeRangeDto)
], CascadeImpactItemDto.prototype, "originalTimeRange", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: TimeRangeDto, description: '调整后时间（结构化）' }),
    __metadata("design:type", TimeRangeDto)
], CascadeImpactItemDto.prototype, "adjustedTimeRange", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '时间变化描述', example: '+2小时30分钟' }),
    __metadata("design:type", String)
], CascadeImpactItemDto.prototype, "timeDelta", void 0);
class CascadeImpactDto {
}
exports.CascadeImpactDto = CascadeImpactDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '受影响数量', example: 2 }),
    __metadata("design:type", Number)
], CascadeImpactDto.prototype, "affectedCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CascadeImpactItemDto], description: '受影响的行程项' }),
    __metadata("design:type", Array)
], CascadeImpactDto.prototype, "affectedItems", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已自动调整', example: false }),
    __metadata("design:type", Boolean)
], CascadeImpactDto.prototype, "autoAdjusted", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否会自动调整（确认后）', example: true }),
    __metadata("design:type", Boolean)
], CascadeImpactDto.prototype, "autoAdjust", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '调整说明', example: '「黄金瀑布」将顺延+2小时' }),
    __metadata("design:type", String)
], CascadeImpactDto.prototype, "adjustmentSummary", void 0);
class BatchValidationItemDto {
}
exports.BatchValidationItemDto = BatchValidationItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期', example: '2025-12-05' }),
    __metadata("design:type", String)
], BatchValidationItemDto.prototype, "day", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '受影响的行程项 ID', type: [String] }),
    __metadata("design:type", Array)
], BatchValidationItemDto.prototype, "itemIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '校验类型', example: 'TIME_OVERLAP' }),
    __metadata("design:type", String)
], BatchValidationItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息' }),
    __metadata("design:type", String)
], BatchValidationItemDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: validation_interface_1.ValidationSeverity }),
    __metadata("design:type", String)
], BatchValidationItemDto.prototype, "severity", void 0);
class BatchValidationResultDto {
}
exports.BatchValidationResultDto = BatchValidationResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否有效（无 ERROR）', example: false }),
    __metadata("design:type", Boolean)
], BatchValidationResultDto.prototype, "valid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程 ID' }),
    __metadata("design:type", String)
], BatchValidationResultDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [BatchValidationItemDto], description: '错误列表' }),
    __metadata("design:type", Array)
], BatchValidationResultDto.prototype, "errors", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [BatchValidationItemDto], description: '警告列表' }),
    __metadata("design:type", Array)
], BatchValidationResultDto.prototype, "warnings", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '统计摘要',
        example: { errorCount: 2, warningCount: 3, infoCount: 1 }
    }),
    __metadata("design:type", Object)
], BatchValidationResultDto.prototype, "summary", void 0);
//# sourceMappingURL=validation-result.dto.js.map