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
exports.ComparePlansResponseDto = exports.ComparisonRecommendationDto = exports.ComparisonDifferenceDto = exports.PlanComparisonDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class PlanComparisonDto {
}
exports.PlanComparisonDto = PlanComparisonDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案ID' }),
    __metadata("design:type", String)
], PlanComparisonDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案名称' }),
    __metadata("design:type", String)
], PlanComparisonDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案名称（中文）' }),
    __metadata("design:type", String)
], PlanComparisonDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '各维度分数' }),
    __metadata("design:type", Object)
], PlanComparisonDto.prototype, "scores", void 0);
class ComparisonDifferenceDto {
}
exports.ComparisonDifferenceDto = ComparisonDifferenceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '对比字段' }),
    __metadata("design:type", String)
], ComparisonDifferenceDto.prototype, "field", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案1的值' }),
    __metadata("design:type", Object)
], ComparisonDifferenceDto.prototype, "plan1Value", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案2的值' }),
    __metadata("design:type", Object)
], ComparisonDifferenceDto.prototype, "plan2Value", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '影响程度', enum: ['low', 'medium', 'high'] }),
    __metadata("design:type", String)
], ComparisonDifferenceDto.prototype, "impact", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '描述' }),
    __metadata("design:type", String)
], ComparisonDifferenceDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '描述（中文）' }),
    __metadata("design:type", String)
], ComparisonDifferenceDto.prototype, "descriptionCN", void 0);
class ComparisonRecommendationDto {
}
exports.ComparisonRecommendationDto = ComparisonRecommendationDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最佳预算方案ID' }),
    __metadata("design:type", String)
], ComparisonRecommendationDto.prototype, "bestBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最佳路线方案ID' }),
    __metadata("design:type", String)
], ComparisonRecommendationDto.prototype, "bestRoute", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最佳时间方案ID' }),
    __metadata("design:type", String)
], ComparisonRecommendationDto.prototype, "bestTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '总结' }),
    __metadata("design:type", String)
], ComparisonRecommendationDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '总结（中文）' }),
    __metadata("design:type", String)
], ComparisonRecommendationDto.prototype, "summaryCN", void 0);
class ComparePlansResponseDto {
}
exports.ComparePlansResponseDto = ComparePlansResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案列表', type: [PlanComparisonDto] }),
    __metadata("design:type", Array)
], ComparePlansResponseDto.prototype, "plans", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '对比维度', type: [String] }),
    __metadata("design:type", Array)
], ComparePlansResponseDto.prototype, "dimensions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '差异列表', type: [ComparisonDifferenceDto] }),
    __metadata("design:type", Array)
], ComparePlansResponseDto.prototype, "differences", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '推荐' }),
    __metadata("design:type", ComparisonRecommendationDto)
], ComparePlansResponseDto.prototype, "recommendation", void 0);
//# sourceMappingURL=compare-plans-response.dto.js.map