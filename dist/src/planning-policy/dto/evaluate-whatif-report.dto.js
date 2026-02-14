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
exports.EvaluateWhatIfReportDto = exports.OptimizationSuggestionDto = exports.BudgetStrategyDto = exports.RobustnessConfigDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class RobustnessConfigDto {
}
exports.RobustnessConfigDto = RobustnessConfigDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '采样次数', example: 300, default: 300 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], RobustnessConfigDto.prototype, "samples", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '随机种子（用于可复现评估）', example: 42 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RobustnessConfigDto.prototype, "seed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '准点容差（分钟）', example: 0, default: 0 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], RobustnessConfigDto.prototype, "onTimeSlackMin", void 0);
class BudgetStrategyDto {
}
exports.BudgetStrategyDto = BudgetStrategyDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Base 评估 samples', example: 300, default: 300 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], BudgetStrategyDto.prototype, "baseSamples", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '候选评估 samples', example: 300, default: 300 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], BudgetStrategyDto.prototype, "candidateSamples", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '复评 samples', example: 600, default: 600 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], BudgetStrategyDto.prototype, "confirmSamples", void 0);
class OptimizationSuggestionDto {
}
exports.OptimizationSuggestionDto = OptimizationSuggestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议类型', enum: ['SHIFT_EARLIER', 'REORDER_AVOID_WAIT', 'UPGRADE_TRANSIT'] }),
    (0, class_validator_1.IsEnum)(['SHIFT_EARLIER', 'REORDER_AVOID_WAIT', 'UPGRADE_TRANSIT']),
    __metadata("design:type", String)
], OptimizationSuggestionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'POI ID', example: 'poi-123' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizationSuggestionDto.prototype, "poiId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '提前分钟数（SHIFT_EARLIER 时必填）', example: 35 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], OptimizationSuggestionDto.prototype, "minutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '原因说明', example: '入场裕量偏紧，主要受最晚入场约束' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OptimizationSuggestionDto.prototype, "reason", void 0);
class EvaluateWhatIfReportDto {
}
exports.EvaluateWhatIfReportDto = EvaluateWhatIfReportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '规划策略（JSON 对象）', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], EvaluateWhatIfReportDto.prototype, "policy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Base 行程计划（DayScheduleResult）', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], EvaluateWhatIfReportDto.prototype, "schedule", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '一天结束时间（分钟）', example: 1200 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], EvaluateWhatIfReportDto.prototype, "dayEndMin", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期（ISO 8601 date）', example: '2026-12-25' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EvaluateWhatIfReportDto.prototype, "dateISO", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '星期几（0=周日, 1=周一, ..., 6=周六）', example: 0, enum: [0, 1, 2, 3, 4, 5, 6] }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsEnum)([0, 1, 2, 3, 4, 5, 6]),
    __metadata("design:type", Number)
], EvaluateWhatIfReportDto.prototype, "dayOfWeek", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'POI 查找表（Map<string, Poi>）。如果提供了 placeIds，此字段可选，系统会自动从数据库查询并转换',
        type: Object,
    }),
    (0, class_validator_1.ValidateIf)((o) => {
        const hasPlaceIds = o && o.placeIds && Array.isArray(o.placeIds) && o.placeIds.length > 0;
        return !hasPlaceIds;
    }),
    (0, class_validator_1.IsObject)({ message: '如果未提供 placeIds，则必须提供 poiLookup 且必须是对象' }),
    __metadata("design:type", Object)
], EvaluateWhatIfReportDto.prototype, "poiLookup", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Place ID 数组。如果提供，系统会从数据库查询这些 Place 并自动转换为 Poi。与 poiLookup 二选一即可',
        type: [Number],
        example: [1, 2, 3],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNumber)({}, { each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], EvaluateWhatIfReportDto.prototype, "placeIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '评估配置', type: RobustnessConfigDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RobustnessConfigDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", RobustnessConfigDto)
], EvaluateWhatIfReportDto.prototype, "config", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '优化建议列表（可选，不传则自动生成）', type: [OptimizationSuggestionDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => OptimizationSuggestionDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], EvaluateWhatIfReportDto.prototype, "suggestions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预算策略', type: BudgetStrategyDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => BudgetStrategyDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", BudgetStrategyDto)
], EvaluateWhatIfReportDto.prototype, "budgetStrategy", void 0);
//# sourceMappingURL=evaluate-whatif-report.dto.js.map