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
exports.RetrievalAndValidateResponseDto = exports.ValidatedRetrievalResultDto = exports.CitationDto = exports.ValidationResultDto = exports.ValidationMetadataDto = exports.RetrievalAndValidateRequestDto = exports.ValidationOptionsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class ValidationOptionsDto {
}
exports.ValidationOptionsDto = ValidationOptionsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '启用事实检查', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ValidationOptionsDto.prototype, "enableFactCheck", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '启用一致性检查', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ValidationOptionsDto.prototype, "enableConsistencyCheck", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '启用引用检查', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ValidationOptionsDto.prototype, "enableCitationCheck", void 0);
class RetrievalAndValidateRequestDto {
}
exports.RetrievalAndValidateRequestDto = RetrievalAndValidateRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '查询文本', example: '冰岛F26公路冬天能走吗？' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RetrievalAndValidateRequestDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '返回数量限制', default: 10 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RetrievalAndValidateRequestDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最小可信度', default: 0.5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RetrievalAndValidateRequestDto.prototype, "credibilityMin", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '文档类型' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RetrievalAndValidateRequestDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '文件分类' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RetrievalAndValidateRequestDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Chunk分类' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RetrievalAndValidateRequestDto.prototype, "chunkCategory", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '文件ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RetrievalAndValidateRequestDto.prototype, "fileId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '使用混合检索', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RetrievalAndValidateRequestDto.prototype, "useHybridSearch", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Dense检索权重', default: 0.6 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RetrievalAndValidateRequestDto.prototype, "denseWeight", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Sparse检索权重', default: 0.4 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RetrievalAndValidateRequestDto.prototype, "sparseWeight", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '使用重排序', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RetrievalAndValidateRequestDto.prototype, "useReranking", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '重排序Top-K数量', default: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RetrievalAndValidateRequestDto.prototype, "rerankTopK", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '使用查询扩展', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RetrievalAndValidateRequestDto.prototype, "useQueryExpansion", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最大查询变体数量', default: 3 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RetrievalAndValidateRequestDto.prototype, "maxQueryVariants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '使用意图分类', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RetrievalAndValidateRequestDto.prototype, "useIntentClassification", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最低验证得分阈值', default: 0.5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RetrievalAndValidateRequestDto.prototype, "minValidationScore", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '启用片段验证', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RetrievalAndValidateRequestDto.prototype, "enableSnippetValidation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '验证选项', type: ValidationOptionsDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ValidationOptionsDto),
    __metadata("design:type", ValidationOptionsDto)
], RetrievalAndValidateRequestDto.prototype, "validationOptions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '上下文信息' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], RetrievalAndValidateRequestDto.prototype, "context", void 0);
class ValidationMetadataDto {
}
exports.ValidationMetadataDto = ValidationMetadataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总候选数' }),
    __metadata("design:type", Number)
], ValidationMetadataDto.prototype, "totalCandidates", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证数量' }),
    __metadata("design:type", Number)
], ValidationMetadataDto.prototype, "validatedCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '过滤后数量' }),
    __metadata("design:type", Number)
], ValidationMetadataDto.prototype, "filteredCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '平均验证得分' }),
    __metadata("design:type", Number)
], ValidationMetadataDto.prototype, "avgValidationScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '延迟（毫秒）' }),
    __metadata("design:type", Number)
], ValidationMetadataDto.prototype, "latency", void 0);
class ValidationResultDto {
}
exports.ValidationResultDto = ValidationResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '事实检查状态', enum: ['pass', 'fail', 'unknown'] }),
    __metadata("design:type", String)
], ValidationResultDto.prototype, "factCheck", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '来源可信度', example: 0.85 }),
    __metadata("design:type", Number)
], ValidationResultDto.prototype, "sourceCredibility", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '新鲜度', example: 0.9 }),
    __metadata("design:type", Number)
], ValidationResultDto.prototype, "freshness", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '完整性', example: 0.8 }),
    __metadata("design:type", Number)
], ValidationResultDto.prototype, "completeness", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '一致性状态', enum: ['consistent', 'inconsistent', 'unknown'] }),
    __metadata("design:type", String)
], ValidationResultDto.prototype, "consistency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '综合得分', example: 0.85 }),
    __metadata("design:type", Number)
], ValidationResultDto.prototype, "overallScore", void 0);
class CitationDto {
}
exports.CitationDto = CitationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '引用ID' }),
    __metadata("design:type", String)
], CitationDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '引用内容' }),
    __metadata("design:type", String)
], CitationDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '来源' }),
    __metadata("design:type", String)
], CitationDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '文档ID' }),
    __metadata("design:type", String)
], CitationDto.prototype, "documentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '置信度', example: 0.9 }),
    __metadata("design:type", Number)
], CitationDto.prototype, "confidence", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '位置信息' }),
    __metadata("design:type", Object)
], CitationDto.prototype, "position", void 0);
class ValidatedRetrievalResultDto {
}
exports.ValidatedRetrievalResultDto = ValidatedRetrievalResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结果ID' }),
    __metadata("design:type", String)
], ValidatedRetrievalResultDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chunk ID' }),
    __metadata("design:type", String)
], ValidatedRetrievalResultDto.prototype, "chunkId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '内容' }),
    __metadata("design:type", String)
], ValidatedRetrievalResultDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '类型' }),
    __metadata("design:type", String)
], ValidatedRetrievalResultDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '可信度得分', example: 0.85 }),
    __metadata("design:type", Number)
], ValidatedRetrievalResultDto.prototype, "credibilityScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '相似度', example: 0.9 }),
    __metadata("design:type", Number)
], ValidatedRetrievalResultDto.prototype, "similarity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '混合得分' }),
    __metadata("design:type", Number)
], ValidatedRetrievalResultDto.prototype, "hybridScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证结果', type: ValidationResultDto }),
    __metadata("design:type", ValidationResultDto)
], ValidatedRetrievalResultDto.prototype, "validation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '引用列表', type: [CitationDto] }),
    __metadata("design:type", Array)
], ValidatedRetrievalResultDto.prototype, "citations", void 0);
class RetrievalAndValidateResponseDto {
}
exports.RetrievalAndValidateResponseDto = RetrievalAndValidateResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '验证后的检索结果', type: [ValidatedRetrievalResultDto] }),
    __metadata("design:type", Array)
], RetrievalAndValidateResponseDto.prototype, "results", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '元数据', type: ValidationMetadataDto }),
    __metadata("design:type", ValidationMetadataDto)
], RetrievalAndValidateResponseDto.prototype, "metadata", void 0);
//# sourceMappingURL=retrieval-and-validate.dto.js.map