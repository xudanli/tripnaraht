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
exports.LoginWithEmailDto = exports.RegisterWithEmailDto = exports.SendVerificationCodeDto = exports.AuthResponseDto = exports.GoogleIdTokenDto = exports.GoogleCodeDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class GoogleCodeDto {
}
exports.GoogleCodeDto = GoogleCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Google OAuth authorization code',
        example: '4/0AX4XfWi...',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GoogleCodeDto.prototype, "code", void 0);
class GoogleIdTokenDto {
}
exports.GoogleIdTokenDto = GoogleIdTokenDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Google ID Token (JWT)',
        example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2...',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GoogleIdTokenDto.prototype, "idToken", void 0);
class AuthResponseDto {
}
exports.AuthResponseDto = AuthResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User information' }),
    __metadata("design:type", Object)
], AuthResponseDto.prototype, "user", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Access token (JWT)' }),
    __metadata("design:type", String)
], AuthResponseDto.prototype, "accessToken", void 0);
class SendVerificationCodeDto {
}
exports.SendVerificationCodeDto = SendVerificationCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Email address to send verification code',
        example: 'user@example.com',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SendVerificationCodeDto.prototype, "email", void 0);
class RegisterWithEmailDto {
}
exports.RegisterWithEmailDto = RegisterWithEmailDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Email address',
        example: 'user@example.com',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RegisterWithEmailDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Verification code sent to email',
        example: '123456',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RegisterWithEmailDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Display name (optional)',
        example: 'John Doe',
        required: false,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RegisterWithEmailDto.prototype, "displayName", void 0);
class LoginWithEmailDto {
}
exports.LoginWithEmailDto = LoginWithEmailDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Email address',
        example: 'user@example.com',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsEmail)({}, { message: '无效的邮箱地址' }),
    __metadata("design:type", String)
], LoginWithEmailDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Verification code sent to email',
        example: '123456',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], LoginWithEmailDto.prototype, "code", void 0);
//# sourceMappingURL=google-auth.dto.js.map