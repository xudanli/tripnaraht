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
exports.TranslationDirectController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const translation_direct_service_1 = require("./translation-direct.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let TranslationDirectController = class TranslationDirectController {
    constructor(translationService) {
        this.translationService = translationService;
    }
    async health() {
        return {
            success: true,
            available: this.translationService.isServiceAvailable(),
        };
    }
    async translate(body) {
        try {
            const result = await this.translationService.translate(body);
            return {
                success: true,
                result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'TRANSLATION_ERROR',
                    message: error.message || 'Failed to translate text',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async detectLanguage(body) {
        try {
            const result = await this.translationService.detectLanguage(body.text);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'TRANSLATION_ERROR',
                    message: error.message || 'Failed to detect language',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getSupportedLanguages(target) {
        try {
            const languages = await this.translationService.getSupportedLanguages(target);
            return {
                success: true,
                languages,
                count: languages.length,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'TRANSLATION_ERROR',
                    message: error.message || 'Failed to get supported languages',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getUserTranslationSettings(user) {
        try {
            const settings = await this.translationService.getUserTranslationSettings(user.id);
            return {
                success: true,
                settings: settings || {
                    defaultTargetLanguage: 'en',
                    preferredLanguages: [],
                    autoDetect: true,
                },
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'TRANSLATION_ERROR',
                    message: error.message || 'Failed to get user translation settings',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async saveUserTranslationSettings(user, body) {
        try {
            await this.translationService.saveUserTranslationSettings(user.id, body);
            return {
                success: true,
                message: 'Settings saved successfully',
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'TRANSLATION_ERROR',
                    message: error.message || 'Failed to save user translation settings',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async smartTranslate(user, body) {
        try {
            const result = await this.translationService.smartTranslate(user.id, body.text, body.targetLanguage);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'TRANSLATION_ERROR',
                    message: error.message || 'Failed to smart translate',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.TranslationDirectController = TranslationDirectController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '检查 Translation 服务状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '服务状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TranslationDirectController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('translate'),
    (0, swagger_1.ApiOperation)({ summary: '翻译文本' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '翻译结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TranslationDirectController.prototype, "translate", null);
__decorate([
    (0, common_1.Post)('detect'),
    (0, swagger_1.ApiOperation)({ summary: '检测语言' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '语言检测结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TranslationDirectController.prototype, "detectLanguage", null);
__decorate([
    (0, common_1.Get)('languages'),
    (0, swagger_1.ApiOperation)({ summary: '获取支持的语言列表' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '支持的语言列表' }),
    __param(0, (0, common_1.Query)('target')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TranslationDirectController.prototype, "getSupportedLanguages", null);
__decorate([
    (0, common_1.Get)('settings'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户翻译设置' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '用户设置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TranslationDirectController.prototype, "getUserTranslationSettings", null);
__decorate([
    (0, common_1.Post)('settings'),
    (0, swagger_1.ApiOperation)({ summary: '保存用户翻译设置' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '设置保存成功' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TranslationDirectController.prototype, "saveUserTranslationSettings", null);
__decorate([
    (0, common_1.Post)('smart-translate'),
    (0, swagger_1.ApiOperation)({ summary: '智能翻译（基于用户设置）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '翻译结果' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TranslationDirectController.prototype, "smartTranslate", null);
exports.TranslationDirectController = TranslationDirectController = __decorate([
    (0, swagger_1.ApiTags)('translation'),
    (0, common_1.Controller)('api/translation'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [translation_direct_service_1.TranslationDirectService])
], TranslationDirectController);
//# sourceMappingURL=translation-direct.controller.js.map