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
exports.ContactController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const contact_service_1 = require("./services/contact.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const contact_message_dto_1 = require("./dto/contact-message.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const admin_contact_dto_1 = require("./dto/admin-contact.dto");
const common_2 = require("@nestjs/common");
let ContactController = class ContactController {
    constructor(contactService) {
        this.contactService = contactService;
    }
    async sendMessage(body, files, req) {
        var _a, _b, _c;
        try {
            const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId);
            const ipAddress = req.ip ||
                ((_c = req.headers['x-forwarded-for']) === null || _c === void 0 ? void 0 : _c.toString().split(',')[0]) ||
                req.socket.remoteAddress ||
                'unknown';
            const result = await this.contactService.createContactMessage(body.message, files, userId, ipAddress);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            this.contactService['logger'].error(`发送联系消息失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)('INTERNAL_ERROR', '服务器内部错误，请稍后重试');
        }
    }
    async getContactMessages(query) {
        try {
            const result = await this.contactService.getContactMessages(query);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getContactMessageById(messageId) {
        try {
            const message = await this.contactService.getContactMessageById(messageId);
            return (0, standard_response_dto_1.successResponse)(message);
        }
        catch (error) {
            if (error instanceof common_2.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateContactMessageStatus(messageId, dto) {
        try {
            const message = await this.contactService.updateContactMessageStatus(messageId, dto.status);
            return (0, standard_response_dto_1.successResponse)(message);
        }
        catch (error) {
            if (error instanceof common_2.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async replyContactMessage(messageId, dto) {
        try {
            const message = await this.contactService.updateContactMessageStatus(messageId, 'replied');
            return (0, standard_response_dto_1.successResponse)({
                ...message,
                reply: dto.reply,
                repliedAt: new Date(),
            });
        }
        catch (error) {
            if (error instanceof common_2.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.ContactController = ContactController;
__decorate([
    (0, common_1.Post)('message'),
    (0, public_decorator_1.Public)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('images', 5, {
        limits: { fileSize: 5 * 1024 * 1024 },
    })),
    (0, swagger_1.ApiOperation)({
        summary: '发送联系消息',
        description: `
发送联系消息，支持文本和图片上传。

**功能特性**：
- 支持匿名用户提交（可选认证）
- 支持文本消息和多图片上传
- 消息和图片至少需要提供其中一项
- 图片格式：jpg, jpeg, png, gif, webp
- 单张图片最大 5MB
- 最多上传 5 张图片

**限流策略**：
- 匿名用户：每小时 3 次
- 已认证用户：每小时 10 次

**通知**：提交成功后会自动发送邮件通知到客服邮箱。
    `.trim(),
    }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: '用户输入的文本消息内容',
                    example: '发现了错误或有好的想法要分享......',
                },
                images: {
                    type: 'array',
                    items: {
                        type: 'string',
                        format: 'binary',
                    },
                    description: '图片文件数组，支持多图上传（最多5张）',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '消息发送成功',
        type: contact_message_dto_1.ContactMessageResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数无效',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: false },
                error: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'string',
                            enum: ['INVALID_REQUEST', 'FILE_TOO_LARGE', 'INVALID_FILE_TYPE', 'TOO_MANY_FILES'],
                            example: 'INVALID_REQUEST'
                        },
                        message: { type: 'string', example: '消息和图片不能同时为空' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 413,
        description: '文件过大',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: false },
                error: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', example: 'FILE_TOO_LARGE' },
                        message: { type: 'string', example: '图片文件过大，单个文件不能超过 5MB' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 415,
        description: '不支持的文件类型',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: false },
                error: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', example: 'INVALID_FILE_TYPE' },
                        message: { type: 'string', example: '不支持的图片格式，仅支持 jpg, jpeg, png, gif, webp' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 429,
        description: '请求频率过高',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: false },
                error: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', example: 'RATE_LIMIT_EXCEEDED' },
                        message: { type: 'string', example: '发送消息过于频繁，请稍后再试' },
                        details: {
                            type: 'object',
                            properties: {
                                resetTime: { type: 'string', format: 'date-time' },
                            },
                        },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Array, Object]),
    __metadata("design:returntype", Promise)
], ContactController.prototype, "sendMessage", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/messages'),
    (0, swagger_1.ApiOperation)({
        summary: '获取联系消息列表（管理接口）',
        description: '获取联系消息列表，支持分页、状态筛选、搜索。需要管理员权限。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: '页码', example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '每页数量', example: 20 }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['pending', 'read', 'replied', 'resolved'], description: '状态筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'userId', required: false, type: String, description: '用户ID筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, type: String, description: '搜索关键词（消息内容）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回消息列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_2.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_contact_dto_1.GetContactMessagesQueryDto]),
    __metadata("design:returntype", Promise)
], ContactController.prototype, "getContactMessages", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/messages/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取联系消息详情（管理接口）',
        description: '根据消息ID获取消息详细信息，包括图片。需要管理员权限。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '消息ID', type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回消息详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '消息不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_2.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ContactController.prototype, "getContactMessageById", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_2.Put)('admin/messages/:id/status'),
    (0, swagger_1.ApiOperation)({
        summary: '更新联系消息状态（管理接口）',
        description: '更新联系消息的状态（pending/read/replied/resolved）。需要管理员权限。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '消息ID', type: String }),
    (0, swagger_1.ApiBody)({ type: admin_contact_dto_1.UpdateContactMessageStatusDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新消息状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '消息不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '输入数据验证失败',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, admin_contact_dto_1.UpdateContactMessageStatusDto]),
    __metadata("design:returntype", Promise)
], ContactController.prototype, "updateContactMessageStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('admin/messages/:id/reply'),
    (0, swagger_1.ApiOperation)({
        summary: '回复联系消息（管理接口）',
        description: '回复联系消息，会自动将状态更新为replied。需要管理员权限。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '消息ID', type: String }),
    (0, swagger_1.ApiBody)({ type: admin_contact_dto_1.ReplyContactMessageDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功回复消息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '消息不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, admin_contact_dto_1.ReplyContactMessageDto]),
    __metadata("design:returntype", Promise)
], ContactController.prototype, "replyContactMessage", null);
exports.ContactController = ContactController = __decorate([
    (0, swagger_1.ApiTags)('contact'),
    (0, swagger_1.ApiExtraModels)(api_response_dto_1.ApiSuccessResponseDto, api_response_dto_1.ApiErrorResponseDto, contact_message_dto_1.ContactMessageResponseDto),
    (0, common_1.Controller)('contact'),
    __metadata("design:paramtypes", [contact_service_1.ContactService])
], ContactController);
//# sourceMappingURL=contact.controller.js.map