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
exports.ExaDeepResearcherCheckDto = exports.ExaDeepResearcherStartDto = exports.ExaCrawlUrlDto = exports.ExaCompanyResearchDto = exports.ExaCodeContextDto = exports.ExaWebSearchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ExaWebSearchDto {
}
exports.ExaWebSearchDto = ExaWebSearchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '搜索查询',
        example: 'latest AI developments',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExaWebSearchDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '返回结果数量',
        example: 10,
        minimum: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ExaWebSearchDto.prototype, "numResults", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否使用自动提示优化查询',
        example: true,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], ExaWebSearchDto.prototype, "useAutoprompt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '内容类别',
        example: 'article',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExaWebSearchDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '开始发布日期（ISO 8601）',
        example: '2024-01-01',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExaWebSearchDto.prototype, "startPublishedDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '结束发布日期（ISO 8601）',
        example: '2024-12-31',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExaWebSearchDto.prototype, "endPublishedDate", void 0);
class ExaCodeContextDto {
}
exports.ExaCodeContextDto = ExaCodeContextDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '代码查询',
        example: 'React hooks useState example',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExaCodeContextDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '返回结果数量',
        example: 5,
        minimum: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ExaCodeContextDto.prototype, "numResults", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '编程语言列表',
        example: ['javascript', 'typescript'],
        type: [String],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], ExaCodeContextDto.prototype, "languages", void 0);
class ExaCompanyResearchDto {
}
exports.ExaCompanyResearchDto = ExaCompanyResearchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '公司名称',
        example: 'OpenAI',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExaCompanyResearchDto.prototype, "companyName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '返回结果数量',
        example: 10,
        minimum: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ExaCompanyResearchDto.prototype, "numResults", void 0);
class ExaCrawlUrlDto {
}
exports.ExaCrawlUrlDto = ExaCrawlUrlDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '要爬取的 URL',
        example: 'https://example.com/article',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExaCrawlUrlDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否返回文本内容',
        example: true,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], ExaCrawlUrlDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否返回 HTML 内容',
        example: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], ExaCrawlUrlDto.prototype, "html", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否返回 Markdown 内容',
        example: true,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], ExaCrawlUrlDto.prototype, "markdown", void 0);
class ExaDeepResearcherStartDto {
}
exports.ExaDeepResearcherStartDto = ExaDeepResearcherStartDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '研究查询',
        example: 'What are the latest developments in quantum computing?',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExaDeepResearcherStartDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '报告类型',
        example: 'research_report',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExaDeepResearcherStartDto.prototype, "reportType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '结果数量',
        example: 20,
        minimum: 1,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ExaDeepResearcherStartDto.prototype, "numResults", void 0);
class ExaDeepResearcherCheckDto {
}
exports.ExaDeepResearcherCheckDto = ExaDeepResearcherCheckDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '任务 ID',
        example: 'task-123',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExaDeepResearcherCheckDto.prototype, "taskId", void 0);
//# sourceMappingURL=exa-search.dto.js.map