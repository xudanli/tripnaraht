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
exports.LangGraphQueryResponseDto = exports.LangGraphQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class LangGraphQueryDto {
}
exports.LangGraphQueryDto = LangGraphQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '用户查询（自然语言）',
        example: '我想在7月去冰岛，但我膝盖不好，不想太累',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LangGraphQueryDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '上下文信息（可选）',
        example: { userId: 'user-123', sessionId: 'session-456' },
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], LangGraphQueryDto.prototype, "context", void 0);
class LangGraphQueryResponseDto {
}
exports.LangGraphQueryResponseDto = LangGraphQueryResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '最终响应（可读解释）',
    }),
    __metadata("design:type", String)
], LangGraphQueryResponseDto.prototype, "finalResponse", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '是否允许',
    }),
    __metadata("design:type", Boolean)
], LangGraphQueryResponseDto.prototype, "allowed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '核心工具输出',
    }),
    __metadata("design:type", Object)
], LangGraphQueryResponseDto.prototype, "coreToolOutput", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '提取的参数',
    }),
    __metadata("design:type", Object)
], LangGraphQueryResponseDto.prototype, "extractedParams", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '错误信息',
    }),
    __metadata("design:type", String)
], LangGraphQueryResponseDto.prototype, "error", void 0);
//# sourceMappingURL=langgraph-query.dto.js.map