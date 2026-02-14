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
exports.UserDetailResponseDto = exports.UserStatsResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class UserStatsResponseDto {
}
exports.UserStatsResponseDto = UserStatsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总用户数', example: 1000 }),
    __metadata("design:type", Number)
], UserStatsResponseDto.prototype, "totalUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '已验证邮箱用户数', example: 800 }),
    __metadata("design:type", Number)
], UserStatsResponseDto.prototype, "verifiedUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '未验证邮箱用户数', example: 200 }),
    __metadata("design:type", Number)
], UserStatsResponseDto.prototype, "unverifiedUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Google登录用户数', example: 600 }),
    __metadata("design:type", Number)
], UserStatsResponseDto.prototype, "googleUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '今日新注册用户数', example: 10 }),
    __metadata("design:type", Number)
], UserStatsResponseDto.prototype, "todayNewUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '本周新注册用户数', example: 50 }),
    __metadata("design:type", Number)
], UserStatsResponseDto.prototype, "weekNewUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '本月新注册用户数', example: 200 }),
    __metadata("design:type", Number)
], UserStatsResponseDto.prototype, "monthNewUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '有偏好设置的用户数', example: 500 }),
    __metadata("design:type", Number)
], UserStatsResponseDto.prototype, "usersWithProfile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '统计时间' }),
    __metadata("design:type", Date)
], UserStatsResponseDto.prototype, "generatedAt", void 0);
class UserDetailResponseDto {
}
exports.UserDetailResponseDto = UserDetailResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户ID' }),
    __metadata("design:type", String)
], UserDetailResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Google用户唯一ID' }),
    __metadata("design:type", String)
], UserDetailResponseDto.prototype, "googleSub", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '邮箱' }),
    __metadata("design:type", String)
], UserDetailResponseDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '邮箱是否验证' }),
    __metadata("design:type", Boolean)
], UserDetailResponseDto.prototype, "emailVerified", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '显示名称' }),
    __metadata("design:type", String)
], UserDetailResponseDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '头像URL' }),
    __metadata("design:type", String)
], UserDetailResponseDto.prototype, "avatarUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], UserDetailResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间' }),
    __metadata("design:type", Date)
], UserDetailResponseDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户偏好设置' }),
    __metadata("design:type", Object)
], UserDetailResponseDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '关联的行程数量', example: 5 }),
    __metadata("design:type", Number)
], UserDetailResponseDto.prototype, "tripCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '收藏的行程数量', example: 3 }),
    __metadata("design:type", Number)
], UserDetailResponseDto.prototype, "collectionCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '点赞的行程数量', example: 10 }),
    __metadata("design:type", Number)
], UserDetailResponseDto.prototype, "likeCount", void 0);
//# sourceMappingURL=user-stats.dto.js.map