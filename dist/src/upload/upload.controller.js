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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const upload_service_1 = require("./upload.service");
const prisma_service_1 = require("../prisma/prisma.service");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let UploadController = class UploadController {
    constructor(uploadService, prisma) {
        this.uploadService = uploadService;
        this.prisma = prisma;
    }
    getStatus() {
        return {
            available: this.uploadService.isAvailable(),
            message: this.uploadService.isAvailable()
                ? 'OSS 服务正常'
                : 'OSS 未配置，请设置环境变量',
        };
    }
    async uploadImage(file, folder) {
        if (!file) {
            throw new common_1.BadRequestException('请选择要上传的图片');
        }
        const result = await this.uploadService.uploadImage(file, folder || 'places');
        return {
            success: true,
            data: result,
        };
    }
    async uploadImages(files, folder) {
        if (!files || files.length === 0) {
            throw new common_1.BadRequestException('请选择要上传的图片');
        }
        const results = await this.uploadService.uploadImages(files, folder || 'places');
        return {
            success: true,
            data: results,
            count: results.length,
        };
    }
    async uploadPlaceImages(placeId, files, captions) {
        if (!files || files.length === 0) {
            throw new common_1.BadRequestException('请选择要上传的图片');
        }
        const place = await this.prisma.place.findUnique({
            where: { id: parseInt(placeId) },
        });
        if (!place) {
            throw new common_1.BadRequestException('景点不存在');
        }
        const uploadResults = await this.uploadService.uploadImages(files, `places/${placeId}`);
        let captionList = [];
        if (captions) {
            try {
                captionList = JSON.parse(captions);
            }
            catch {
            }
        }
        const newImages = uploadResults.map((result, index) => ({
            url: result.url,
            key: result.key,
            caption: captionList[index] || '',
            source: 'upload',
            isPrimary: index === 0,
            uploadedAt: new Date().toISOString(),
        }));
        const currentMetadata = place.metadata || {};
        const existingImages = currentMetadata.images || [];
        if (existingImages.length > 0) {
            newImages.forEach(img => img.isPrimary = false);
        }
        const updatedMetadata = {
            ...currentMetadata,
            images: [...existingImages, ...newImages],
        };
        await this.prisma.place.update({
            where: { id: parseInt(placeId) },
            data: { metadata: updatedMetadata },
        });
        return {
            success: true,
            data: {
                placeId: parseInt(placeId),
                placeName: place.nameCN,
                newImages,
                totalImages: updatedMetadata.images.length,
            },
        };
    }
    async getPlaceImages(placeId) {
        const place = await this.prisma.place.findUnique({
            where: { id: parseInt(placeId) },
            select: { id: true, nameCN: true, metadata: true },
        });
        if (!place) {
            throw new common_1.BadRequestException('景点不存在');
        }
        const metadata = place.metadata || {};
        const images = metadata.images || [];
        return {
            success: true,
            data: {
                placeId: place.id,
                placeName: place.nameCN,
                images,
                count: images.length,
            },
        };
    }
    async deleteImage(key) {
        if (!key) {
            throw new common_1.BadRequestException('图片 key 不能为空');
        }
        try {
            await this.uploadService.deleteImage(key);
            return {
                success: true,
                data: {
                    key,
                    message: '图片删除成功',
                },
            };
        }
        catch (error) {
            throw new common_1.BadRequestException(`删除图片失败: ${error.message}`);
        }
    }
    async deletePlaceImage(placeId, key, index) {
        const place = await this.prisma.place.findUnique({
            where: { id: parseInt(placeId) },
        });
        if (!place) {
            throw new common_1.BadRequestException('景点不存在');
        }
        const metadata = place.metadata || {};
        const images = metadata.images || [];
        if (images.length === 0) {
            throw new common_1.BadRequestException('景点没有图片');
        }
        let imageToDelete = null;
        let deleteIndex = -1;
        if (key) {
            deleteIndex = images.findIndex((img) => img.key === key);
            if (deleteIndex === -1) {
                throw new common_1.BadRequestException(`未找到 key 为 "${key}" 的图片`);
            }
            imageToDelete = images[deleteIndex];
        }
        else if (index !== undefined) {
            const idx = parseInt(index, 10);
            if (isNaN(idx) || idx < 0 || idx >= images.length) {
                throw new common_1.BadRequestException(`索引 ${index} 无效，图片列表共有 ${images.length} 张图片`);
            }
            deleteIndex = idx;
            imageToDelete = images[deleteIndex];
        }
        else {
            throw new common_1.BadRequestException('请提供 key 或 index 参数');
        }
        if (imageToDelete.key) {
            try {
                await this.uploadService.deleteImage(imageToDelete.key);
            }
            catch (error) {
                console.warn(`OSS 删除失败（可能图片不存在）: ${error.message}`);
            }
        }
        const updatedImages = images.filter((_, idx) => idx !== deleteIndex);
        if (imageToDelete.isPrimary && updatedImages.length > 0) {
            updatedImages[0].isPrimary = true;
        }
        const updatedMetadata = {
            ...metadata,
            images: updatedImages,
        };
        await this.prisma.place.update({
            where: { id: parseInt(placeId) },
            data: { metadata: updatedMetadata },
        });
        return {
            success: true,
            data: {
                placeId: parseInt(placeId),
                placeName: place.nameCN,
                deletedImage: {
                    url: imageToDelete.url,
                    key: imageToDelete.key,
                    caption: imageToDelete.caption,
                },
                remainingImages: updatedImages.length,
                totalImages: updatedImages.length,
            },
        };
    }
};
exports.UploadController = UploadController;
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({ summary: '检查上传服务状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UploadController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('image'),
    (0, swagger_1.ApiOperation)({ summary: '上传单张图片' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                folder: { type: 'string', default: 'places' },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (!file.mimetype.startsWith('image/')) {
                cb(new common_1.BadRequestException('只允许上传图片文件'), false);
            }
            else {
                cb(null, true);
            }
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)('folder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "uploadImage", null);
__decorate([
    (0, common_1.Post)('images'),
    (0, swagger_1.ApiOperation)({ summary: '批量上传图片（最多10张）' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 10, {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (!file.mimetype.startsWith('image/')) {
                cb(new common_1.BadRequestException('只允许上传图片文件'), false);
            }
            else {
                cb(null, true);
            }
        },
    })),
    __param(0, (0, common_1.UploadedFiles)()),
    __param(1, (0, common_1.Body)('folder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, String]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "uploadImages", null);
__decorate([
    (0, common_1.Post)('place/:placeId/images'),
    (0, swagger_1.ApiOperation)({ summary: '为景点上传图片' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 10, {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (!file.mimetype.startsWith('image/')) {
                cb(new common_1.BadRequestException('只允许上传图片文件'), false);
            }
            else {
                cb(null, true);
            }
        },
    })),
    __param(0, (0, common_1.Param)('placeId')),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Body)('captions')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array, String]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "uploadPlaceImages", null);
__decorate([
    (0, common_1.Get)('place/:placeId/images'),
    (0, swagger_1.ApiOperation)({ summary: '获取景点图片列表' }),
    __param(0, (0, common_1.Param)('placeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "getPlaceImages", null);
__decorate([
    (0, common_1.Delete)('image'),
    (0, swagger_1.ApiOperation)({ summary: '删除单个图片' }),
    (0, swagger_1.ApiQuery)({ name: 'key', description: '图片在 OSS 中的 key（存储路径）', example: 'places/123/abc.jpg', required: true }),
    __param(0, (0, common_1.Query)('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "deleteImage", null);
__decorate([
    (0, common_1.Delete)('place/:placeId/images'),
    (0, swagger_1.ApiOperation)({
        summary: '删除景点图片',
        description: '删除指定景点的图片。可以通过 key 或 index 指定要删除的图片。删除后会自动从景点的 metadata.images 中移除。'
    }),
    (0, swagger_1.ApiParam)({ name: 'placeId', description: '景点 ID', type: Number, example: 381041 }),
    (0, swagger_1.ApiQuery)({ name: 'key', description: '图片的 OSS key（优先使用）', required: false, example: 'places/381041/abc.jpg' }),
    (0, swagger_1.ApiQuery)({ name: 'index', description: '图片在列表中的索引（从 0 开始）', required: false, type: Number, example: 0 }),
    __param(0, (0, common_1.Param)('placeId')),
    __param(1, (0, common_1.Query)('key')),
    __param(2, (0, common_1.Query)('index')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "deletePlaceImage", null);
exports.UploadController = UploadController = __decorate([
    (0, swagger_1.ApiTags)('Upload'),
    (0, common_1.Controller)('upload'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [upload_service_1.UploadService,
        prisma_service_1.PrismaService])
], UploadController);
//# sourceMappingURL=upload.controller.js.map