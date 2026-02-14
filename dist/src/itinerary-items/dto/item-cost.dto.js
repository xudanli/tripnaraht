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
exports.BatchUpdateCostResultDto = exports.TripCostSummaryDto = exports.CostVarianceDto = exports.DailyCostSummaryDto = exports.CategoryCostSummaryDto = exports.BatchUpdateCostDto = exports.BatchUpdateCostItemDto = exports.ItemCostDto = exports.CostCategory = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var CostCategory;
(function (CostCategory) {
    CostCategory["ACCOMMODATION"] = "ACCOMMODATION";
    CostCategory["TRANSPORTATION"] = "TRANSPORTATION";
    CostCategory["FOOD"] = "FOOD";
    CostCategory["ACTIVITIES"] = "ACTIVITIES";
    CostCategory["SHOPPING"] = "SHOPPING";
    CostCategory["OTHER"] = "OTHER";
})(CostCategory || (exports.CostCategory = CostCategory = {}));
class ItemCostDto {
}
exports.ItemCostDto = ItemCostDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '预估费用（人民币或指定货币）',
        example: 150,
        minimum: 0
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ItemCostDto.prototype, "estimatedCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '实际费用（旅行后记录）',
        example: 165,
        minimum: 0
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ItemCostDto.prototype, "actualCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '货币类型（ISO 4217）',
        example: 'CNY',
        default: 'CNY',
        enum: ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'KRW', 'THB', 'SGD', 'AUD']
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ItemCostDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '费用分类',
        enum: CostCategory,
        example: CostCategory.ACTIVITIES
    }),
    (0, class_validator_1.IsEnum)(CostCategory),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ItemCostDto.prototype, "costCategory", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '费用备注（如：门票+缆车）',
        example: '门票含缆车'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ItemCostDto.prototype, "costNote", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否已支付',
        default: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], ItemCostDto.prototype, "isPaid", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '支付人ID（多人旅行场景）'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ItemCostDto.prototype, "paidBy", void 0);
class BatchUpdateCostItemDto {
}
exports.BatchUpdateCostItemDto = BatchUpdateCostItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程项ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchUpdateCostItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '实际费用', minimum: 0 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], BatchUpdateCostItemDto.prototype, "actualCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否已支付' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], BatchUpdateCostItemDto.prototype, "isPaid", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '费用备注' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BatchUpdateCostItemDto.prototype, "costNote", void 0);
class BatchUpdateCostDto {
}
exports.BatchUpdateCostDto = BatchUpdateCostDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchUpdateCostDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '费用更新列表',
        type: [BatchUpdateCostItemDto]
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BatchUpdateCostItemDto),
    __metadata("design:type", Array)
], BatchUpdateCostDto.prototype, "items", void 0);
class CategoryCostSummaryDto {
}
exports.CategoryCostSummaryDto = CategoryCostSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预估费用' }),
    __metadata("design:type", Number)
], CategoryCostSummaryDto.prototype, "estimated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '实际费用' }),
    __metadata("design:type", Number)
], CategoryCostSummaryDto.prototype, "actual", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '费用项数量' }),
    __metadata("design:type", Number)
], CategoryCostSummaryDto.prototype, "count", void 0);
class DailyCostSummaryDto {
}
exports.DailyCostSummaryDto = DailyCostSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期 (YYYY-MM-DD)' }),
    __metadata("design:type", String)
], DailyCostSummaryDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预估费用' }),
    __metadata("design:type", Number)
], DailyCostSummaryDto.prototype, "estimated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '实际费用' }),
    __metadata("design:type", Number)
], DailyCostSummaryDto.prototype, "actual", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '费用项数量' }),
    __metadata("design:type", Number)
], DailyCostSummaryDto.prototype, "itemCount", void 0);
class CostVarianceDto {
}
exports.CostVarianceDto = CostVarianceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '差额（负数表示节省，正数表示超支）' }),
    __metadata("design:type", Number)
], CostVarianceDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '差额百分比' }),
    __metadata("design:type", Number)
], CostVarianceDto.prototype, "percentage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '状态',
        enum: ['UNDER_BUDGET', 'ON_BUDGET', 'OVER_BUDGET']
    }),
    __metadata("design:type", String)
], CostVarianceDto.prototype, "status", void 0);
class TripCostSummaryDto {
}
exports.TripCostSummaryDto = TripCostSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程总预算' }),
    __metadata("design:type", Number)
], TripCostSummaryDto.prototype, "totalBudget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总预估费用' }),
    __metadata("design:type", Number)
], TripCostSummaryDto.prototype, "totalEstimated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总实际费用' }),
    __metadata("design:type", Number)
], TripCostSummaryDto.prototype, "totalActual", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '已支付金额' }),
    __metadata("design:type", Number)
], TripCostSummaryDto.prototype, "totalPaid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '待支付金额' }),
    __metadata("design:type", Number)
], TripCostSummaryDto.prototype, "totalUnpaid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '货币类型' }),
    __metadata("design:type", String)
], TripCostSummaryDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '按分类汇总',
        type: 'object',
        additionalProperties: { type: 'object' }
    }),
    __metadata("design:type", Object)
], TripCostSummaryDto.prototype, "byCategory", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '按日期汇总',
        type: [DailyCostSummaryDto]
    }),
    __metadata("design:type", Array)
], TripCostSummaryDto.prototype, "byDay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '预算偏差（实际 vs 预估）',
        type: CostVarianceDto
    }),
    __metadata("design:type", CostVarianceDto)
], TripCostSummaryDto.prototype, "variance", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '预算使用率（实际费用/总预算）',
        example: 65.5
    }),
    __metadata("design:type", Number)
], TripCostSummaryDto.prototype, "budgetUsagePercent", void 0);
class BatchUpdateCostResultDto {
}
exports.BatchUpdateCostResultDto = BatchUpdateCostResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新成功数量' }),
    __metadata("design:type", Number)
], BatchUpdateCostResultDto.prototype, "updated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新失败数量' }),
    __metadata("design:type", Number)
], BatchUpdateCostResultDto.prototype, "failed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '失败的项目ID列表' }),
    __metadata("design:type", Array)
], BatchUpdateCostResultDto.prototype, "failedIds", void 0);
//# sourceMappingURL=item-cost.dto.js.map