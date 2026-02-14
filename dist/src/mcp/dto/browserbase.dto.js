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
exports.EvaluateDto = exports.ClickDto = exports.ScreenshotDto = exports.NavigateDto = exports.CreateSessionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class ViewportDto {
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '视口宽度', example: 1920 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ViewportDto.prototype, "width", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '视口高度', example: 1080 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ViewportDto.prototype, "height", void 0);
class CreateSessionDto {
}
exports.CreateSessionDto = CreateSessionDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '初始 URL', example: 'https://example.com' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'User Agent', example: 'Mozilla/5.0...' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "userAgent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '视口设置', type: ViewportDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ViewportDto),
    __metadata("design:type", ViewportDto)
], CreateSessionDto.prototype, "viewport", void 0);
class NavigateDto {
}
exports.NavigateDto = NavigateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '会话 ID', example: 'session-123' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], NavigateDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目标 URL', example: 'https://example.com' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], NavigateDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '等待条件',
        enum: ['load', 'domcontentloaded', 'networkidle'],
        example: 'load'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], NavigateDto.prototype, "waitUntil", void 0);
class ScreenshotDto {
}
exports.ScreenshotDto = ScreenshotDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '会话 ID', example: 'session-123' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ScreenshotDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否全页截图', example: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ScreenshotDto.prototype, "fullPage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '图片质量 (0-100)', example: 90 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ScreenshotDto.prototype, "quality", void 0);
class ClickDto {
}
exports.ClickDto = ClickDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '会话 ID', example: 'session-123' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ClickDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'CSS 选择器', example: 'button#submit' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ClickDto.prototype, "selector", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否等待导航', example: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ClickDto.prototype, "waitForNavigation", void 0);
class EvaluateDto {
}
exports.EvaluateDto = EvaluateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '会话 ID', example: 'session-123' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EvaluateDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'JavaScript 代码', example: 'document.title' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EvaluateDto.prototype, "script", void 0);
//# sourceMappingURL=browserbase.dto.js.map