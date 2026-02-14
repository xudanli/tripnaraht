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
exports.UpdateUserProfileDto = exports.GetUserProfileResponseDto = exports.UserPreferencesDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class UserPreferencesDto {
}
exports.UserPreferencesDto = UserPreferencesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '喜欢的景点类型',
        example: ['ATTRACTION', 'NATURE', 'CULTURE'],
        type: [String],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], UserPreferencesDto.prototype, "preferredAttractionTypes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '饮食禁忌',
        example: ['VEGETARIAN', 'NO_PORK', 'NO_SEAFOOD'],
        type: [String],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], UserPreferencesDto.prototype, "dietaryRestrictions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否偏好小众景点',
        example: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UserPreferencesDto.prototype, "preferOffbeatAttractions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '出行偏好',
        example: {
            pace: 'LEISURE',
            budget: 'MEDIUM',
            accommodation: 'COMFORTABLE',
        },
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UserPreferencesDto.prototype, "travelPreferences", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '其他偏好（JSON 格式）',
        example: { accessibility: true, petFriendly: false },
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UserPreferencesDto.prototype, "other", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '国籍（ISO 3166-1 alpha-2）',
        example: 'CN',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UserPreferencesDto.prototype, "nationality", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '居住国（ISO 3166-1 alpha-2）',
        example: 'CN',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UserPreferencesDto.prototype, "residencyCountry", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '旅行者标签',
        example: ['senior', 'family_with_children', 'solo'],
        type: [String],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], UserPreferencesDto.prototype, "tags", void 0);
class GetUserProfileResponseDto {
}
exports.GetUserProfileResponseDto = GetUserProfileResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户ID', example: 'user-123' }),
    __metadata("design:type", String)
], GetUserProfileResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户偏好',
        type: UserPreferencesDto,
    }),
    __metadata("design:type", UserPreferencesDto)
], GetUserProfileResponseDto.prototype, "preferences", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], GetUserProfileResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间' }),
    __metadata("design:type", Date)
], GetUserProfileResponseDto.prototype, "updatedAt", void 0);
class UpdateUserProfileDto {
}
exports.UpdateUserProfileDto = UpdateUserProfileDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户偏好',
        type: UserPreferencesDto,
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", UserPreferencesDto)
], UpdateUserProfileDto.prototype, "preferences", void 0);
//# sourceMappingURL=user-profile.dto.js.map