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
exports.FeedbackStatsQueryDto = exports.BatchFeedbackDto = exports.DecisionQualityFeedbackDto = exports.ConflictFeedbackDto = exports.PlanVariantFeedbackDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class PlanVariantFeedbackDto {
}
exports.PlanVariantFeedbackDto = PlanVariantFeedbackDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策运行ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlanVariantFeedbackDto.prototype, "runId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '变体ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlanVariantFeedbackDto.prototype, "variantId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '变体策略', enum: ['conservative', 'balanced', 'aggressive'] }),
    (0, class_validator_1.IsEnum)(['conservative', 'balanced', 'aggressive']),
    __metadata("design:type", String)
], PlanVariantFeedbackDto.prototype, "variantStrategy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户选择', enum: ['selected', 'rejected', 'modified'] }),
    (0, class_validator_1.IsEnum)(['selected', 'rejected', 'modified']),
    __metadata("design:type", String)
], PlanVariantFeedbackDto.prototype, "userChoice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '评分（1-5）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], PlanVariantFeedbackDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '反馈原因' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlanVariantFeedbackDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlanVariantFeedbackDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlanVariantFeedbackDto.prototype, "userId", void 0);
class ConflictFeedbackDto {
}
exports.ConflictFeedbackDto = ConflictFeedbackDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策运行ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConflictFeedbackDto.prototype, "runId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConflictFeedbackDto.prototype, "conflictId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突类型' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConflictFeedbackDto.prototype, "conflictType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突是否被理解' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConflictFeedbackDto.prototype, "understood", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突解释是否清晰' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConflictFeedbackDto.prototype, "explanationClear", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '权衡选项是否有用' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConflictFeedbackDto.prototype, "tradeoffOptionsUseful", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户选择的权衡选项' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConflictFeedbackDto.prototype, "selectedTradeoffOption", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConflictFeedbackDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConflictFeedbackDto.prototype, "userId", void 0);
class DecisionQualityFeedbackDto {
}
exports.DecisionQualityFeedbackDto = DecisionQualityFeedbackDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '决策运行ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecisionQualityFeedbackDto.prototype, "runId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '整体满意度（1-5）' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], DecisionQualityFeedbackDto.prototype, "overallSatisfaction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '计划质量评分（1-5）' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], DecisionQualityFeedbackDto.prototype, "planQuality", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '冲突解释质量（1-5）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], DecisionQualityFeedbackDto.prototype, "conflictExplanationQuality", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '权衡选项质量（1-5）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], DecisionQualityFeedbackDto.prototype, "tradeoffOptionsQuality", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '决策速度评分（1-5）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], DecisionQualityFeedbackDto.prototype, "decisionSpeed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '额外反馈' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecisionQualityFeedbackDto.prototype, "additionalFeedback", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecisionQualityFeedbackDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecisionQualityFeedbackDto.prototype, "userId", void 0);
class BatchFeedbackDto {
}
exports.BatchFeedbackDto = BatchFeedbackDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '计划变体反馈列表', type: [PlanVariantFeedbackDto] }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BatchFeedbackDto.prototype, "planVariantFeedbacks", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '约束冲突反馈列表', type: [ConflictFeedbackDto] }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BatchFeedbackDto.prototype, "conflictFeedbacks", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '决策质量反馈列表', type: [DecisionQualityFeedbackDto] }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BatchFeedbackDto.prototype, "decisionQualityFeedbacks", void 0);
class FeedbackStatsQueryDto {
}
exports.FeedbackStatsQueryDto = FeedbackStatsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FeedbackStatsQueryDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '行程ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FeedbackStatsQueryDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始日期' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], FeedbackStatsQueryDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束日期' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], FeedbackStatsQueryDto.prototype, "endDate", void 0);
//# sourceMappingURL=feedback.dto.js.map