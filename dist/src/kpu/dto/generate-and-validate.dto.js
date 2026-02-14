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
exports.GenerateAndValidateResponseDto = exports.GenerationMetadataDto = exports.OutputValidationResultDto = exports.ConsistencyCheckDto = exports.FactCheckDto = exports.GenerateAndValidateRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const retrieval_and_validate_dto_1 = require("./retrieval-and-validate.dto");
class GenerateAndValidateRequestDto {
}
exports.GenerateAndValidateRequestDto = GenerateAndValidateRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '查询文本', example: '冰岛F26公路冬天能走吗？' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateAndValidateRequestDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证后的检索结果', type: [retrieval_and_validate_dto_1.ValidatedRetrievalResultDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => retrieval_and_validate_dto_1.ValidatedRetrievalResultDto),
    __metadata("design:type", Array)
], GenerateAndValidateRequestDto.prototype, "validatedResults", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '上下文信息' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], GenerateAndValidateRequestDto.prototype, "context", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '验证失败时是否重试', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GenerateAndValidateRequestDto.prototype, "retryOnFailure", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最大重试次数', default: 2 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], GenerateAndValidateRequestDto.prototype, "maxRetries", void 0);
class FactCheckDto {
}
exports.FactCheckDto = FactCheckDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '检查ID' }),
    __metadata("design:type", String)
], FactCheckDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '检查描述' }),
    __metadata("design:type", String)
], FactCheckDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否通过' }),
    __metadata("design:type", Boolean)
], FactCheckDto.prototype, "passed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '详细信息' }),
    __metadata("design:type", String)
], FactCheckDto.prototype, "details", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '来源列表', type: [String] }),
    __metadata("design:type", Array)
], FactCheckDto.prototype, "sources", void 0);
class ConsistencyCheckDto {
}
exports.ConsistencyCheckDto = ConsistencyCheckDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '检查ID' }),
    __metadata("design:type", String)
], ConsistencyCheckDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '检查类型', enum: ['internal', 'external', 'contextual'] }),
    __metadata("design:type", String)
], ConsistencyCheckDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否通过' }),
    __metadata("design:type", Boolean)
], ConsistencyCheckDto.prototype, "passed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '详细信息' }),
    __metadata("design:type", String)
], ConsistencyCheckDto.prototype, "details", void 0);
class OutputValidationResultDto {
}
exports.OutputValidationResultDto = OutputValidationResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总体结果', enum: ['pass', 'fail', 'warning'] }),
    __metadata("design:type", String)
], OutputValidationResultDto.prototype, "overall", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证得分', example: 85 }),
    __metadata("design:type", Number)
], OutputValidationResultDto.prototype, "score", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '事实检查列表', type: [FactCheckDto] }),
    __metadata("design:type", Array)
], OutputValidationResultDto.prototype, "factChecks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '一致性检查列表', type: [ConsistencyCheckDto] }),
    __metadata("design:type", Array)
], OutputValidationResultDto.prototype, "consistencyChecks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '引用列表', type: [retrieval_and_validate_dto_1.ValidatedRetrievalResultDto] }),
    __metadata("design:type", Array)
], OutputValidationResultDto.prototype, "citations", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '警告列表', type: [String] }),
    __metadata("design:type", Array)
], OutputValidationResultDto.prototype, "warnings", void 0);
class GenerationMetadataDto {
}
exports.GenerationMetadataDto = GenerationMetadataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '生成延迟（毫秒）' }),
    __metadata("design:type", Number)
], GenerationMetadataDto.prototype, "generationLatency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证延迟（毫秒）' }),
    __metadata("design:type", Number)
], GenerationMetadataDto.prototype, "validationLatency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总延迟（毫秒）' }),
    __metadata("design:type", Number)
], GenerationMetadataDto.prototype, "totalLatency", void 0);
class GenerateAndValidateResponseDto {
}
exports.GenerateAndValidateResponseDto = GenerateAndValidateResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '生成的回答' }),
    __metadata("design:type", String)
], GenerateAndValidateResponseDto.prototype, "answer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证结果', type: OutputValidationResultDto }),
    __metadata("design:type", OutputValidationResultDto)
], GenerateAndValidateResponseDto.prototype, "validation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证后的知识源', type: [retrieval_and_validate_dto_1.ValidatedRetrievalResultDto] }),
    __metadata("design:type", Array)
], GenerateAndValidateResponseDto.prototype, "validatedSources", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否重试' }),
    __metadata("design:type", Boolean)
], GenerateAndValidateResponseDto.prototype, "retried", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '元数据', type: GenerationMetadataDto }),
    __metadata("design:type", GenerationMetadataDto)
], GenerateAndValidateResponseDto.prototype, "metadata", void 0);
//# sourceMappingURL=generate-and-validate.dto.js.map