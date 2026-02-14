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
exports.ReplyContactMessageDto = exports.UpdateContactMessageStatusDto = exports.ContactMessageListResponseDto = exports.ContactMessageResponseDto = exports.ContactMessageImageDto = exports.GetContactMessagesQueryDto = exports.ContactMessageStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var ContactMessageStatus;
(function (ContactMessageStatus) {
    ContactMessageStatus["PENDING"] = "pending";
    ContactMessageStatus["READ"] = "read";
    ContactMessageStatus["REPLIED"] = "replied";
    ContactMessageStatus["RESOLVED"] = "resolved";
})(ContactMessageStatus || (exports.ContactMessageStatus = ContactMessageStatus = {}));
class GetContactMessagesQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
    }
}
exports.GetContactMessagesQueryDto = GetContactMessagesQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '页码', example: 1, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetContactMessagesQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每页数量', example: 20, default: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetContactMessagesQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '状态筛选', enum: ContactMessageStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ContactMessageStatus),
    __metadata("design:type", String)
], GetContactMessagesQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContactMessagesQueryDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '搜索关键词（消息内容）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContactMessagesQueryDto.prototype, "search", void 0);
class ContactMessageImageDto {
}
exports.ContactMessageImageDto = ContactMessageImageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '图片ID' }),
    __metadata("design:type", String)
], ContactMessageImageDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '文件路径' }),
    __metadata("design:type", String)
], ContactMessageImageDto.prototype, "filePath", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '原始文件名' }),
    __metadata("design:type", String)
], ContactMessageImageDto.prototype, "fileName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '文件大小（字节）' }),
    __metadata("design:type", String)
], ContactMessageImageDto.prototype, "fileSize", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'MIME类型' }),
    __metadata("design:type", String)
], ContactMessageImageDto.prototype, "mimeType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], ContactMessageImageDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '文件访问URL' }),
    __metadata("design:type", String)
], ContactMessageImageDto.prototype, "fileUrl", void 0);
class ContactMessageResponseDto {
}
exports.ContactMessageResponseDto = ContactMessageResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息ID' }),
    __metadata("design:type", String)
], ContactMessageResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    __metadata("design:type", String)
], ContactMessageResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '消息内容' }),
    __metadata("design:type", String)
], ContactMessageResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态', enum: ContactMessageStatus }),
    __metadata("design:type", String)
], ContactMessageResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], ContactMessageResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间' }),
    __metadata("design:type", Date)
], ContactMessageResponseDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '图片列表', type: [ContactMessageImageDto] }),
    __metadata("design:type", Array)
], ContactMessageResponseDto.prototype, "images", void 0);
class ContactMessageListResponseDto {
}
exports.ContactMessageListResponseDto = ContactMessageListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息列表', type: [ContactMessageResponseDto] }),
    __metadata("design:type", Array)
], ContactMessageListResponseDto.prototype, "messages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总数' }),
    __metadata("design:type", Number)
], ContactMessageListResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '页码' }),
    __metadata("design:type", Number)
], ContactMessageListResponseDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '每页数量' }),
    __metadata("design:type", Number)
], ContactMessageListResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总页数' }),
    __metadata("design:type", Number)
], ContactMessageListResponseDto.prototype, "totalPages", void 0);
class UpdateContactMessageStatusDto {
}
exports.UpdateContactMessageStatusDto = UpdateContactMessageStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态', enum: ContactMessageStatus }),
    (0, class_validator_1.IsEnum)(ContactMessageStatus),
    __metadata("design:type", String)
], UpdateContactMessageStatusDto.prototype, "status", void 0);
class ReplyContactMessageDto {
}
exports.ReplyContactMessageDto = ReplyContactMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '回复内容' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReplyContactMessageDto.prototype, "reply", void 0);
//# sourceMappingURL=admin-contact.dto.js.map