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
exports.CreateTripFromRouteTemplateDto = exports.ConstraintsFromTemplateDto = exports.TravelerFromTemplateDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class TravelerFromTemplateDto {
}
exports.TravelerFromTemplateDto = TravelerFromTemplateDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['ADULT', 'ELDERLY', 'CHILD'],
        description: '旅行者类型',
        example: 'ADULT',
    }),
    (0, class_validator_1.IsEnum)(['ADULT', 'ELDERLY', 'CHILD']),
    __metadata("design:type", String)
], TravelerFromTemplateDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['IRON_LEGS', 'ACTIVE_SENIOR', 'CITY_POTATO', 'LIMITED'],
        description: '行动能力标签',
        example: 'CITY_POTATO',
    }),
    (0, class_validator_1.IsEnum)(['IRON_LEGS', 'ACTIVE_SENIOR', 'CITY_POTATO', 'LIMITED']),
    __metadata("design:type", String)
], TravelerFromTemplateDto.prototype, "mobilityTag", void 0);
class ConstraintsFromTemplateDto {
}
exports.ConstraintsFromTemplateDto = ConstraintsFromTemplateDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有儿童', example: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConstraintsFromTemplateDto.prototype, "withChildren", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有老人', example: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConstraintsFromTemplateDto.prototype, "withElderly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否早起', example: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConstraintsFromTemplateDto.prototype, "earlyRiser", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '饮食限制', type: [String], example: ['vegetarian'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ConstraintsFromTemplateDto.prototype, "dietaryRestrictions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '避免的类别', type: [String], example: ['nightlife'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ConstraintsFromTemplateDto.prototype, "avoidCategories", void 0);
class CreateTripFromRouteTemplateDto {
}
exports.CreateTripFromRouteTemplateDto = CreateTripFromRouteTemplateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地国家代码', example: 'IS' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTripFromRouteTemplateDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始日期（ISO 8601）', example: '2024-06-01' }),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateTripFromRouteTemplateDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束日期（ISO 8601）', example: '2024-06-07' }),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateTripFromRouteTemplateDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '总预算（元）', example: 50000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateTripFromRouteTemplateDto.prototype, "totalBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: ['RELAXED', 'BALANCED', 'CHALLENGE'],
        description: '节奏偏好（覆盖模板默认值）',
        example: 'BALANCED',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['RELAXED', 'BALANCED', 'CHALLENGE']),
    __metadata("design:type", String)
], CreateTripFromRouteTemplateDto.prototype, "pacePreference", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: ['relaxed', 'balanced', 'intense'],
        description: '强度偏好',
        example: 'balanced',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['relaxed', 'balanced', 'intense']),
    __metadata("design:type", String)
], CreateTripFromRouteTemplateDto.prototype, "intensity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: ['walk', 'transit', 'car'],
        description: '交通方式',
        example: 'car',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['walk', 'transit', 'car']),
    __metadata("design:type", String)
], CreateTripFromRouteTemplateDto.prototype, "transport", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '旅行者列表',
        type: [TravelerFromTemplateDto],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TravelerFromTemplateDto),
    __metadata("design:type", Array)
], CreateTripFromRouteTemplateDto.prototype, "travelers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '约束条件',
        type: ConstraintsFromTemplateDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ConstraintsFromTemplateDto),
    __metadata("design:type", ConstraintsFromTemplateDto)
], CreateTripFromRouteTemplateDto.prototype, "constraints", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '行程名称（1-200 字符，可选。如不提供，系统将自动生成默认名称）',
        example: '冰岛环岛游',
        maxLength: 200,
        minLength: 1,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'name 必须是字符串' }),
    (0, class_validator_1.Length)(1, 200, { message: '行程名称长度必须在 1-200 字符之间' }),
    __metadata("design:type", String)
], CreateTripFromRouteTemplateDto.prototype, "name", void 0);
//# sourceMappingURL=create-trip-from-template.dto.js.map