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
exports.ImageDirectController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const image_direct_service_1 = require("./image-direct.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let ImageDirectController = class ImageDirectController {
    constructor(imageService) {
        this.imageService = imageService;
    }
    async health() {
        return {
            success: true,
            available: this.imageService.isServiceAvailable(),
        };
    }
    async searchImages(body) {
        try {
            const result = await this.imageService.searchImages(body);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'IMAGE_ERROR',
                    message: error.message || 'Failed to search images',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getImageDetails(photoId, source) {
        try {
            const details = await this.imageService.getImageDetails(parseInt(photoId), source || 'pexels');
            if (!details) {
                throw new common_1.HttpException({
                    success: false,
                    error: {
                        code: 'IMAGE_NOT_FOUND',
                        message: 'Image not found',
                    },
                }, common_1.HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                photo: details,
            };
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'IMAGE_ERROR',
                    message: error.message || 'Failed to get image details',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getCuratedPhotos(perPage, page) {
        try {
            const result = await this.imageService.getCuratedPhotos({
                perPage: perPage ? parseInt(perPage.toString()) : undefined,
                page: page ? parseInt(page.toString()) : undefined,
            });
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'IMAGE_ERROR',
                    message: error.message || 'Failed to get curated photos',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getUserImagePreferences(user) {
        try {
            const preferences = await this.imageService.getUserImagePreferences(user.id);
            return {
                success: true,
                preferences: preferences || {
                    preferredStyles: [],
                    preferredColors: [],
                    preferredOrientations: [],
                    favoriteImages: [],
                },
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'IMAGE_ERROR',
                    message: error.message || 'Failed to get user image preferences',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async saveUserImagePreferences(user, body) {
        try {
            await this.imageService.saveUserImagePreferences(user.id, body);
            return {
                success: true,
                message: 'Preferences saved successfully',
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'IMAGE_ERROR',
                    message: error.message || 'Failed to save user image preferences',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async recommendImages(user, body) {
        try {
            const result = await this.imageService.recommendImages(user.id, body);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'IMAGE_ERROR',
                    message: error.message || 'Failed to recommend images',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.ImageDirectController = ImageDirectController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '检查 Image 服务状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '服务状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ImageDirectController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('search'),
    (0, swagger_1.ApiOperation)({ summary: '搜索图片' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '搜索结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImageDirectController.prototype, "searchImages", null);
__decorate([
    (0, common_1.Get)('details/:photoId'),
    (0, swagger_1.ApiOperation)({ summary: '获取图片详情' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '图片详情' }),
    __param(0, (0, common_1.Param)('photoId')),
    __param(1, (0, common_1.Query)('source')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ImageDirectController.prototype, "getImageDetails", null);
__decorate([
    (0, common_1.Get)('curated'),
    (0, swagger_1.ApiOperation)({ summary: '获取推荐图片' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '推荐图片列表' }),
    __param(0, (0, common_1.Query)('perPage')),
    __param(1, (0, common_1.Query)('page')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], ImageDirectController.prototype, "getCuratedPhotos", null);
__decorate([
    (0, common_1.Get)('preferences'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户图片偏好设置' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '用户设置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImageDirectController.prototype, "getUserImagePreferences", null);
__decorate([
    (0, common_1.Post)('preferences'),
    (0, swagger_1.ApiOperation)({ summary: '保存用户图片偏好设置' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '设置保存成功' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ImageDirectController.prototype, "saveUserImagePreferences", null);
__decorate([
    (0, common_1.Post)('recommend'),
    (0, swagger_1.ApiOperation)({ summary: '智能推荐图片（基于用户偏好）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '推荐结果' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ImageDirectController.prototype, "recommendImages", null);
exports.ImageDirectController = ImageDirectController = __decorate([
    (0, swagger_1.ApiTags)('image'),
    (0, common_1.Controller)('api/image'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [image_direct_service_1.ImageDirectService])
], ImageDirectController);
//# sourceMappingURL=image-direct.controller.js.map