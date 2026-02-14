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
exports.DestinationRecommendationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DestinationRecommendationDto {
}
exports.DestinationRecommendationDto = DestinationRecommendationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地ID' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '国家代码' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '名称（英文）' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '名称（中文）' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述（英文）' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述（中文）' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "descriptionCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '亮点（英文）', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "highlights", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '亮点（中文）', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "highlightsCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '匹配分数 (0-100)' }),
    __metadata("design:type", Number)
], DestinationRecommendationDto.prototype, "matchScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '匹配原因（英文）', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "matchReasons", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '匹配原因（中文）', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "matchReasonsCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预估预算' }),
    __metadata("design:type", Object)
], DestinationRecommendationDto.prototype, "estimatedBudget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最佳季节', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "bestSeasons", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '图片URL' }),
    __metadata("design:type", String)
], DestinationRecommendationDto.prototype, "imageUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标签', type: [String] }),
    __metadata("design:type", Array)
], DestinationRecommendationDto.prototype, "tags", void 0);
//# sourceMappingURL=destination-recommendation.dto.js.map