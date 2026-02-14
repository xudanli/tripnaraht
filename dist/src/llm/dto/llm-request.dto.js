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
exports.DecisionSupportDto = exports.HumanizeResultDto = exports.TripCreationParams = exports.NaturalLanguageToParamsDto = exports.LlmProvider = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var LlmProvider;
(function (LlmProvider) {
    LlmProvider["OPENAI"] = "openai";
    LlmProvider["GEMINI"] = "gemini";
    LlmProvider["DEEPSEEK"] = "deepseek";
    LlmProvider["ANTHROPIC"] = "anthropic";
    LlmProvider["VLLM"] = "vllm";
})(LlmProvider || (exports.LlmProvider = LlmProvider = {}));
class NaturalLanguageToParamsDto {
}
exports.NaturalLanguageToParamsDto = NaturalLanguageToParamsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '自然语言输入',
        example: '帮我规划带娃去东京5天的行程，预算2万',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], NaturalLanguageToParamsDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'LLM 提供商',
        enum: LlmProvider,
        default: LlmProvider.DEEPSEEK,
    }),
    (0, class_validator_1.IsEnum)(LlmProvider),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], NaturalLanguageToParamsDto.prototype, "provider", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Context Package 块列表（用于增强理解用户意图）',
        type: [Object],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)({ each: true }),
    __metadata("design:type", Array)
], NaturalLanguageToParamsDto.prototype, "contextBlocks", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '目的地代码（用于特化配置）',
        example: 'GL',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], NaturalLanguageToParamsDto.prototype, "destinationCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '目的地特化配置（用于特化 Prompt 构建）',
        type: Object,
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], NaturalLanguageToParamsDto.prototype, "destinationConfig", void 0);
class TripCreationParams {
}
exports.TripCreationParams = TripCreationParams;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地国家代码', example: 'JP' }),
    __metadata("design:type", String)
], TripCreationParams.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '开始日期（ISO 格式）', example: '2024-05-01T00:00:00.000Z' }),
    __metadata("design:type", String)
], TripCreationParams.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结束日期（ISO 格式）', example: '2024-05-05T00:00:00.000Z' }),
    __metadata("design:type", String)
], TripCreationParams.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总预算（元）', example: 20000 }),
    __metadata("design:type", Number)
], TripCreationParams.prototype, "totalBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有小孩', example: true }),
    __metadata("design:type", Boolean)
], TripCreationParams.prototype, "hasChildren", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有老人', example: false }),
    __metadata("design:type", Boolean)
], TripCreationParams.prototype, "hasElderly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '旅行偏好', type: Object }),
    __metadata("design:type", Object)
], TripCreationParams.prototype, "preferences", void 0);
class HumanizeResultDto {
}
exports.HumanizeResultDto = HumanizeResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '结构化数据（如行程优化结果、What-If评估结果等）',
        type: Object,
    }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], HumanizeResultDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '数据类型',
        example: 'itinerary_optimization',
        enum: ['itinerary_optimization', 'what_if_evaluation', 'trip_schedule', 'transport_plan'],
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HumanizeResultDto.prototype, "dataType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'LLM 提供商',
        enum: LlmProvider,
    }),
    (0, class_validator_1.IsEnum)(LlmProvider),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], HumanizeResultDto.prototype, "provider", void 0);
class DecisionSupportDto {
}
exports.DecisionSupportDto = DecisionSupportDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '决策场景描述',
        example: '评估当前行程的稳健度，并提供优化建议',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DecisionSupportDto.prototype, "scenario", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '相关接口数据（如行程Schedule、风险指标等）',
        type: Object,
    }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], DecisionSupportDto.prototype, "contextData", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'LLM 提供商',
        enum: LlmProvider,
    }),
    (0, class_validator_1.IsEnum)(LlmProvider),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], DecisionSupportDto.prototype, "provider", void 0);
//# sourceMappingURL=llm-request.dto.js.map