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
exports.CreateTripFromTemplateDto = exports.TripTemplateResponseDto = exports.GetTripTemplatesQueryDto = exports.TripTemplateTheme = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var TripTemplateTheme;
(function (TripTemplateTheme) {
    TripTemplateTheme["FAMILY"] = "FAMILY";
    TripTemplateTheme["BACKPACKER"] = "BACKPACKER";
    TripTemplateTheme["LEISURE"] = "LEISURE";
    TripTemplateTheme["BUSINESS"] = "BUSINESS";
    TripTemplateTheme["HONEYMOON"] = "HONEYMOON";
    TripTemplateTheme["ADVENTURE"] = "ADVENTURE";
})(TripTemplateTheme || (exports.TripTemplateTheme = TripTemplateTheme = {}));
class GetTripTemplatesQueryDto {
}
exports.GetTripTemplatesQueryDto = GetTripTemplatesQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '模板主题',
        enum: TripTemplateTheme,
    }),
    (0, class_validator_1.IsEnum)(TripTemplateTheme),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GetTripTemplatesQueryDto.prototype, "theme", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '目的地国家代码',
        example: 'JP',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GetTripTemplatesQueryDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否只返回公开模板',
        example: true,
        default: true,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], GetTripTemplatesQueryDto.prototype, "isPublic", void 0);
class TripTemplateResponseDto {
}
exports.TripTemplateResponseDto = TripTemplateResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '模板ID', example: 'uuid' }),
    __metadata("design:type", String)
], TripTemplateResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '模板名称', example: '日本亲子游' }),
    __metadata("design:type", String)
], TripTemplateResponseDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '中文名称', example: '日本亲子游' }),
    __metadata("design:type", String)
], TripTemplateResponseDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '模板描述', example: '适合带小孩的日本旅行' }),
    __metadata("design:type", String)
], TripTemplateResponseDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '主题', enum: TripTemplateTheme, example: TripTemplateTheme.FAMILY }),
    __metadata("design:type", String)
], TripTemplateResponseDto.prototype, "theme", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '推荐目的地', example: 'JP' }),
    __metadata("design:type", String)
], TripTemplateResponseDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '模板配置（budgetConfig, pacingConfig 等）', type: Object }),
    __metadata("design:type", Object)
], TripTemplateResponseDto.prototype, "config", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否公开', example: true }),
    __metadata("design:type", Boolean)
], TripTemplateResponseDto.prototype, "isPublic", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], TripTemplateResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间' }),
    __metadata("design:type", Date)
], TripTemplateResponseDto.prototype, "updatedAt", void 0);
class CreateTripFromTemplateDto {
}
exports.CreateTripFromTemplateDto = CreateTripFromTemplateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '模板ID', example: 'uuid' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTripFromTemplateDto.prototype, "templateId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地国家代码', example: 'JP' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTripFromTemplateDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始日期（ISO 格式）', example: '2024-05-01T00:00:00.000Z' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTripFromTemplateDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束日期（ISO 格式）', example: '2024-05-05T00:00:00.000Z' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTripFromTemplateDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '总预算（元）',
        example: 20000,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTripFromTemplateDto.prototype, "totalBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '覆盖模板配置（可选）',
        type: Object,
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTripFromTemplateDto.prototype, "overrideConfig", void 0);
//# sourceMappingURL=trip-template.dto.js.map