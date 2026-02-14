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
exports.DeleteAccountResponseDto = exports.DeleteAccountDto = exports.UpdateCurrentUserDto = exports.CurrentUserResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CurrentUserResponseDto {
}
exports.CurrentUserResponseDto = CurrentUserResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户ID', example: '550e8400-e29b-41d4-a716-446655440000' }),
    __metadata("design:type", String)
], CurrentUserResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '邮箱', example: 'user@example.com' }),
    __metadata("design:type", String)
], CurrentUserResponseDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '邮箱是否已验证', example: true }),
    __metadata("design:type", Boolean)
], CurrentUserResponseDto.prototype, "emailVerified", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '显示名称', example: '张三' }),
    __metadata("design:type", String)
], CurrentUserResponseDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '头像URL', example: 'https://example.com/avatar.jpg' }),
    __metadata("design:type", String)
], CurrentUserResponseDto.prototype, "avatarUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Google用户ID（如果通过Google登录）' }),
    __metadata("design:type", String)
], CurrentUserResponseDto.prototype, "googleSub", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '账户创建时间' }),
    __metadata("design:type", Date)
], CurrentUserResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '账户更新时间' }),
    __metadata("design:type", Date)
], CurrentUserResponseDto.prototype, "updatedAt", void 0);
class UpdateCurrentUserDto {
}
exports.UpdateCurrentUserDto = UpdateCurrentUserDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '显示名称',
        example: '张三',
        maxLength: 100,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateCurrentUserDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '头像URL',
        example: 'https://example.com/avatar.jpg',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: '头像URL格式无效' }),
    __metadata("design:type", String)
], UpdateCurrentUserDto.prototype, "avatarUrl", void 0);
class DeleteAccountDto {
}
exports.DeleteAccountDto = DeleteAccountDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '删除确认文本（需输入"确认删除"）',
        example: '确认删除',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeleteAccountDto.prototype, "confirmText", void 0);
class DeleteAccountResponseDto {
}
exports.DeleteAccountResponseDto = DeleteAccountResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否成功删除', example: true }),
    __metadata("design:type", Boolean)
], DeleteAccountResponseDto.prototype, "deleted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '删除的用户ID' }),
    __metadata("design:type", String)
], DeleteAccountResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '删除时间' }),
    __metadata("design:type", Date)
], DeleteAccountResponseDto.prototype, "deletedAt", void 0);
//# sourceMappingURL=current-user.dto.js.map