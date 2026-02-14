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
var ContactService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const file_storage_service_1 = require("./file-storage.service");
const rate_limit_service_1 = require("./rate-limit.service");
const contact_notification_service_1 = require("./contact-notification.service");
const crypto_1 = require("crypto");
const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 5;
let ContactService = ContactService_1 = class ContactService {
    constructor(prisma, fileStorage, rateLimit, notification) {
        this.prisma = prisma;
        this.fileStorage = fileStorage;
        this.rateLimit = rateLimit;
        this.notification = notification;
        this.logger = new common_1.Logger(ContactService_1.name);
    }
    validateFile(file) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
            throw new common_1.BadRequestException({
                success: false,
                error: {
                    code: 'INVALID_FILE_TYPE',
                    message: '不支持的图片格式，仅支持 jpg, jpeg, png, gif, webp',
                },
            });
        }
        if (file.size > MAX_FILE_SIZE) {
            throw new common_1.BadRequestException({
                success: false,
                error: {
                    code: 'FILE_TOO_LARGE',
                    message: '图片文件过大，单个文件不能超过 5MB',
                },
            });
        }
    }
    async createContactMessage(message, files, userId, ipAddress) {
        if ((!message || message.trim().length === 0) && (!files || files.length === 0)) {
            throw new common_1.BadRequestException({
                success: false,
                error: {
                    code: 'INVALID_REQUEST',
                    message: '消息和图片不能同时为空',
                },
            });
        }
        if (files && files.length > MAX_IMAGE_COUNT) {
            throw new common_1.BadRequestException({
                success: false,
                error: {
                    code: 'TOO_MANY_FILES',
                    message: `最多只能上传 ${MAX_IMAGE_COUNT} 张图片`,
                },
            });
        }
        if (files && files.length > 0) {
            for (const file of files) {
                this.validateFile(file);
            }
        }
        await this.rateLimit.checkRateLimit(userId, ipAddress);
        try {
            const imageRecords = [];
            if (files && files.length > 0) {
                for (const file of files) {
                    const fileInfo = await this.fileStorage.saveFile(file.buffer, file.originalname, file.mimetype);
                    imageRecords.push({
                        filePath: fileInfo.filePath,
                        fileName: fileInfo.fileName,
                        fileSize: BigInt(fileInfo.fileSize),
                        mimeType: fileInfo.mimeType,
                    });
                }
            }
            const contactMessage = await this.prisma.contactMessage.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    userId: userId || null,
                    message: (message === null || message === void 0 ? void 0 : message.trim()) || null,
                    status: 'pending',
                    images: {
                        create: imageRecords,
                    },
                },
                include: {
                    images: true,
                },
            });
            this.logger.log(`联系消息已创建: id=${contactMessage.id}, userId=${userId || 'anonymous'}, imageCount=${imageRecords.length}`);
            const imageUrls = contactMessage.images.map((img) => this.fileStorage.getFileUrl(img.filePath));
            this.notification.sendNotificationEmail(contactMessage.id, contactMessage.message || null, contactMessage.userId || null, contactMessage.images.length, imageUrls).catch(error => {
                this.logger.error(`发送通知邮件失败: ${error.message}`);
            });
            return {
                id: contactMessage.id,
                success: true,
                message: '消息发送成功',
            };
        }
        catch (error) {
            this.logger.error(`创建联系消息失败: ${error.message}`, error.stack);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: '服务器内部错误，请稍后重试',
                },
            });
        }
    }
    async getContactMessages(query) {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;
        const where = {};
        if (query.status) {
            where.status = query.status;
        }
        if (query.userId) {
            where.userId = query.userId;
        }
        if (query.search) {
            where.message = { contains: query.search, mode: 'insensitive' };
        }
        const [messages, total] = await Promise.all([
            this.prisma.contactMessage.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    images: true,
                },
            }),
            this.prisma.contactMessage.count({ where }),
        ]);
        const messagesWithUrls = messages.map(msg => ({
            ...msg,
            images: msg.images.map((img) => ({
                ...img,
                fileSize: img.fileSize.toString(),
                fileUrl: this.fileStorage.getFileUrl(img.filePath),
            })),
        }));
        return {
            messages: messagesWithUrls,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async getContactMessageById(messageId) {
        const message = await this.prisma.contactMessage.findUnique({
            where: { id: messageId },
            include: {
                images: true,
            },
        });
        if (!message) {
            throw new common_1.NotFoundException(`Contact message not found: ${messageId}`);
        }
        const imagesWithUrls = message.images.map((img) => ({
            ...img,
            fileSize: img.fileSize.toString(),
            fileUrl: this.fileStorage.getFileUrl(img.filePath),
        }));
        return {
            ...message,
            images: imagesWithUrls,
        };
    }
    async updateContactMessageStatus(messageId, status) {
        const message = await this.prisma.contactMessage.findUnique({
            where: { id: messageId },
        });
        if (!message) {
            throw new common_1.NotFoundException(`Contact message not found: ${messageId}`);
        }
        const validStatuses = ['pending', 'read', 'replied', 'resolved'];
        if (!validStatuses.includes(status)) {
            throw new common_1.BadRequestException(`Invalid status: ${status}`);
        }
        const updatedMessage = await this.prisma.contactMessage.update({
            where: { id: messageId },
            data: { status },
            include: {
                images: true,
            },
        });
        const imagesWithUrls = updatedMessage.images.map((img) => ({
            ...img,
            fileSize: img.fileSize.toString(),
            fileUrl: this.fileStorage.getFileUrl(img.filePath),
        }));
        return {
            ...updatedMessage,
            images: imagesWithUrls,
        };
    }
};
exports.ContactService = ContactService;
exports.ContactService = ContactService = ContactService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        file_storage_service_1.FileStorageService,
        rate_limit_service_1.RateLimitService,
        contact_notification_service_1.ContactNotificationService])
], ContactService);
//# sourceMappingURL=contact.service.js.map