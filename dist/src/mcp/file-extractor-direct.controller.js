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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FileExtractorDirectController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileExtractorDirectController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const file_extractor_direct_service_1 = require("./file-extractor-direct.service");
const file_extractor_dto_1 = require("./dto/file-extractor.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let FileExtractorDirectController = FileExtractorDirectController_1 = class FileExtractorDirectController {
    constructor(fileExtractorDirectService) {
        this.fileExtractorDirectService = fileExtractorDirectService;
        this.logger = new common_1.Logger(FileExtractorDirectController_1.name);
    }
    health() {
        return (0, standard_response_dto_1.successResponse)({
            available: this.fileExtractorDirectService.isServiceAvailable(),
            service: 'file-extractor-direct',
            features: ['PDF', 'DOCX', 'XLSX', 'CSV'],
            authentication: 'none',
        });
    }
    async extractMetadata(dto) {
        try {
            if (!this.fileExtractorDirectService.isServiceAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'File Extractor Direct service is not available');
            }
            const result = await this.fileExtractorDirectService.extractMetadata(dto.url);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to extract metadata:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '提取元数据失败');
        }
    }
    async extractFileContent(dto) {
        try {
            if (!this.fileExtractorDirectService.isServiceAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'File Extractor Direct service is not available');
            }
            const result = await this.fileExtractorDirectService.extractFileContent(dto.url, {
                page: dto.page,
                limit: dto.limit,
                search: dto.search,
                sheet: dto.sheet,
                caseSensitive: dto.caseSensitive,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to extract file content:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '提取文件内容失败');
        }
    }
};
exports.FileExtractorDirectController = FileExtractorDirectController;
__decorate([
    (0, common_1.Get)('health'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '检查服务状态',
        description: '检查 File Extractor Direct 服务是否可用',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '服务状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FileExtractorDirectController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('extract-metadata'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '提取文件元数据',
        description: '从文件的公开 URL 提取元数据信息（无需认证）',
    }),
    (0, swagger_1.ApiBody)({ type: file_extractor_dto_1.ExtractMetadataDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '元数据提取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [file_extractor_dto_1.ExtractMetadataDto]),
    __metadata("design:returntype", Promise)
], FileExtractorDirectController.prototype, "extractMetadata", null);
__decorate([
    (0, common_1.Post)('extract-content'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '提取文件内容',
        description: '从文件的公开 URL 提取内容，支持分页、搜索等功能（无需认证）',
    }),
    (0, swagger_1.ApiBody)({ type: file_extractor_dto_1.ExtractFileContentDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '内容提取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [file_extractor_dto_1.ExtractFileContentDto]),
    __metadata("design:returntype", Promise)
], FileExtractorDirectController.prototype, "extractFileContent", null);
exports.FileExtractorDirectController = FileExtractorDirectController = FileExtractorDirectController_1 = __decorate([
    (0, swagger_1.ApiTags)('file-extractor-direct'),
    (0, common_1.Controller)('file-extractor-direct'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [file_extractor_direct_service_1.FileExtractorDirectService])
], FileExtractorDirectController);
//# sourceMappingURL=file-extractor-direct.controller.js.map