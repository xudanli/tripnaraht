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
exports.TripShareResponseDto = exports.CreateTripShareDto = exports.SharePermission = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var SharePermission;
(function (SharePermission) {
    SharePermission["VIEW"] = "VIEW";
    SharePermission["EDIT"] = "EDIT";
})(SharePermission || (exports.SharePermission = SharePermission = {}));
class CreateTripShareDto {
}
exports.CreateTripShareDto = CreateTripShareDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '分享权限',
        enum: SharePermission,
        default: SharePermission.VIEW,
    }),
    (0, class_validator_1.IsEnum)(SharePermission),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripShareDto.prototype, "permission", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '过期时间（ISO 格式）',
        example: '2024-12-31T23:59:59.000Z',
    }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripShareDto.prototype, "expiresAt", void 0);
class TripShareResponseDto {
}
exports.TripShareResponseDto = TripShareResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '分享ID' }),
    __metadata("design:type", String)
], TripShareResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID' }),
    __metadata("design:type", String)
], TripShareResponseDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '分享令牌' }),
    __metadata("design:type", String)
], TripShareResponseDto.prototype, "shareToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '权限', enum: SharePermission }),
    __metadata("design:type", String)
], TripShareResponseDto.prototype, "permission", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '过期时间' }),
    __metadata("design:type", Date)
], TripShareResponseDto.prototype, "expiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '分享链接' }),
    __metadata("design:type", String)
], TripShareResponseDto.prototype, "shareUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], TripShareResponseDto.prototype, "createdAt", void 0);
//# sourceMappingURL=trip-share.dto.js.map