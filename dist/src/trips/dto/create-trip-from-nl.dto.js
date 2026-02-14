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
exports.CreateTripFromNaturalLanguageDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
class CreateTripFromNaturalLanguageDto {
}
exports.CreateTripFromNaturalLanguageDto = CreateTripFromNaturalLanguageDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '自然语言输入',
        example: '帮我规划带娃去东京5天的行程，预算2万',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTripFromNaturalLanguageDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '会话 ID（用于恢复对话上下文），不提供则创建新会话',
        example: 'nl_user123_abc12345',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripFromNaturalLanguageDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否开始新对话（true时清空旧上下文，创建新会话）',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateTripFromNaturalLanguageDto.prototype, "isNewConversation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'LLM 提供商',
        enum: llm_request_dto_1.LlmProvider,
    }),
    (0, class_validator_1.IsEnum)(llm_request_dto_1.LlmProvider),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTripFromNaturalLanguageDto.prototype, "llmProvider", void 0);
//# sourceMappingURL=create-trip-from-nl.dto.js.map