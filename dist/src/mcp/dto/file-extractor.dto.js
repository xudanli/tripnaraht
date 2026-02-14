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
exports.ExtractFileContentDto = exports.ExtractMetadataDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ExtractMetadataDto {
}
exports.ExtractMetadataDto = ExtractMetadataDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '文件的公开 URL',
        example: 'https://example.com/document.pdf',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExtractMetadataDto.prototype, "url", void 0);
class ExtractFileContentDto {
}
exports.ExtractFileContentDto = ExtractFileContentDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '文件的公开 URL',
        example: 'https://example.com/document.pdf',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExtractFileContentDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '页码（用于 PDF、PPTX）',
        example: 1,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ExtractFileContentDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '返回结果数量限制',
        example: 10,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ExtractFileContentDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '搜索关键词（用于电子表格）',
        example: '关键词',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExtractFileContentDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '工作表名称（用于 Excel）',
        example: 'Sheet1',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExtractFileContentDto.prototype, "sheet", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '搜索是否区分大小写',
        example: false,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ExtractFileContentDto.prototype, "caseSensitive", void 0);
//# sourceMappingURL=file-extractor.dto.js.map